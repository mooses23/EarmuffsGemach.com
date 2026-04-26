import OpenAI from 'openai';
import { storage } from './storage.js';
import { getThreadMessages } from './gmail-client.js';
import type {
  Location, FaqEntry, PlaybookFact, KnowledgeDoc, ReplyExample,
  KbEmbedding, KbSourceKind, Region, CityCategory, Transaction, Contact,
  GemachApplication,
} from '../shared/schema.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const SITE_URL = process.env.SITE_URL || 'https://babybanzgemach.com';
const DRAFT_MODEL = process.env.OPENAI_DRAFT_MODEL || 'gpt-4o';
const EMBED_MODEL = process.env.OPENAI_EMBED_MODEL || 'text-embedding-3-small';
const CONFIDENCE_THRESHOLD = 0.6;

const STATIC_PLAYBOOK = `
ABOUT BABY BANZ GEMACH
- A global Jewish community network of free-loan organizations (gemachs) that lend baby noise-cancelling earmuffs (Banz) for use at simchas, weddings, bar/bat mitzvahs, kiddushim, fireworks, concerts, and other loud events.
- Service is offered in English and Hebrew. Many locations have Yiddish-speaking volunteers.

KEY URLS (use the matching URL in replies, never invent a URL)
- Find a gemach near you: ${SITE_URL}/locations
- Borrow a pair (find your local gemach + reach out): ${SITE_URL}/borrow
- Open a NEW gemach location (the application form): ${SITE_URL}/apply
- Rules / how it works: ${SITE_URL}/rules
- Check application or loan status: ${SITE_URL}/status
- Contact us: ${SITE_URL}/contact

OPENING A NEW LOCATION
- Anyone wishing to start a Baby Banz Gemach in their community fills out the application at ${SITE_URL}/apply.
- An admin reviews the application; once approved, we email the new operator their location code, dashboard login link, and starting PIN.
- We do NOT instruct people to "fill out the contact form" for new-location requests — direct them to /apply.

OPERATOR DASHBOARD
- Each location has a dashboard at ${SITE_URL}/operator/login
- Operators sign in with their location code + PIN.
- New operators get the temporary PIN 1234, which they should change after their first login.

ESCALATION TRIGGERS — when ANY of these are present, do not pretend the issue is resolved. Draft a careful reply but FLAG for human review:
- Anger, frustration, threats, legal language, or formal complaints
- Money disputes (lost deposit, double-charge, refund not received)
- Lost / damaged / stolen items
- Privacy or safety concerns
- Press, partnership, or fundraising inquiries
- Any request for a refund or chargeback
`.trim();

type Classification =
  | 'new_location'
  | 'borrow_request'
  | 'return_or_deposit'
  | 'application_status'
  | 'general_question'
  | 'complaint'
  | 'other';

// ====================== Embeddings + similarity ======================

export async function embedText(text: string): Promise<number[] | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  const cleaned = String(text || '').slice(0, 8000).trim();
  if (!cleaned) return null;
  try {
    const r = await openai.embeddings.create({ model: EMBED_MODEL, input: cleaned });
    return r.data[0].embedding as unknown as number[];
  } catch (err) {
    console.warn('embedText failed:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

function cosine(a: number[], b: number[]): number {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

// Strip leading "Re:" / "Fwd:" / "Aw:" / "Tr:" prefixes and collapse
// whitespace so two messages with the same underlying subject group together.
// Used for both the AI's form-side thread context and the inbox UI's grouping.
function normalizeSubject(s: string): string {
  return String(s || '')
    .replace(/^\s*((re|fw|fwd|aw|tr)\s*:\s*)+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function chunkText(text: string, chunkSize = 900, overlap = 150): string[] {
  const t = String(text || '').trim();
  if (!t) return [];
  if (t.length <= chunkSize) return [t];
  const chunks: string[] = [];
  let i = 0;
  while (i < t.length) {
    chunks.push(t.slice(i, i + chunkSize));
    i += chunkSize - overlap;
  }
  return chunks;
}

// ====================== KB write hooks ======================

function buildContentForFact(f: PlaybookFact): string {
  return `Fact (${f.category}) ${f.factKey.replace(/_/g, ' ')}: ${f.factValue}`;
}
function buildContentForFaq(f: FaqEntry): string {
  return `FAQ Q: ${f.question}\nA: ${f.answer}`;
}
function buildContentForDoc(d: KnowledgeDoc): string {
  return `${d.title}\n\n${d.body}`;
}
function buildContentForReply(r: ReplyExample): string {
  return `Past inbound: ${r.incomingSubject}\n${r.incomingBody.slice(0, 800)}\n\nApproved reply: ${r.sentReply.slice(0, 800)}`;
}

export async function reindexFact(f: PlaybookFact): Promise<void> {
  const content = buildContentForFact(f);
  const emb = await embedText(content);
  if (!emb) return;
  await storage.upsertKbEmbedding({
    sourceKind: 'fact', sourceId: f.id, chunkIdx: 0,
    content, embedding: emb, language: 'en',
  });
}
export async function reindexFaq(f: FaqEntry): Promise<void> {
  // Inactive FAQs must not appear in retrieval — wipe any prior index rows.
  if (f.isActive === false) {
    await storage.deleteKbEmbedding('faq', f.id);
    return;
  }
  const content = buildContentForFaq(f);
  const emb = await embedText(content);
  if (!emb) return;
  await storage.upsertKbEmbedding({
    sourceKind: 'faq', sourceId: f.id, chunkIdx: 0,
    content, embedding: emb, language: f.language || 'en',
  });
}
export async function reindexDoc(d: KnowledgeDoc): Promise<void> {
  // Inactive docs must not appear in retrieval — wipe any prior index rows.
  if (d.isActive === false) {
    await storage.deleteKbEmbedding('doc', d.id);
    return;
  }
  // Long-form docs: split into overlapping chunks and embed each separately so
  // retrieval can return the most relevant section instead of the whole doc.
  const chunks = chunkText(d.body, 900, 150);
  if (chunks.length === 0) {
    await storage.deleteKbEmbedding('doc', d.id);
    return;
  }
  // Wipe prior chunks for this doc so a shrunk body doesn't leave orphans.
  await storage.deleteKbEmbedding('doc', d.id);
  for (let i = 0; i < chunks.length; i++) {
    const chunkBody = chunks[i];
    const content = `${d.title}${chunks.length > 1 ? ` — part ${i + 1}/${chunks.length}` : ''}\n\n${chunkBody}`;
    const emb = await embedText(content);
    if (!emb) continue;
    await storage.upsertKbEmbedding({
      sourceKind: 'doc', sourceId: d.id, chunkIdx: i,
      content, embedding: emb, language: d.language || 'en',
    });
  }
}
export async function reindexReplyExample(r: ReplyExample): Promise<void> {
  const content = buildContentForReply(r);
  const emb = await embedText(`${r.incomingSubject}\n${r.incomingBody}`);
  if (!emb) return;
  await storage.upsertKbEmbedding({
    sourceKind: 'reply_example', sourceId: r.id, chunkIdx: 0,
    content, embedding: emb, language: r.language || 'en',
  });
}

// Seeded long-form docs that mirror the public /rules page and the most common
// scenarios admins answer over and over. Idempotent: only inserts if a doc with
// the same title doesn't already exist.
const SEED_DOCS: Array<{ title: string; category: string; body: string }> = [
  {
    title: 'Borrowing Rules (from /rules page)',
    category: 'borrowing',
    body: `These are the standing rules for borrowing Baby Banz earmuffs from any gemach in our network.

DEPOSIT
- A small refundable deposit of $20 is required at pickup.
- The full deposit is returned when the earmuffs come back in good condition.
- Some locations accept "pay later" via a saved card; if the earmuffs are not returned on time, the operator may charge the deposit.

GENTLE HANDLING
- Earmuffs are for babies and young children. Please handle them gently and keep them away from food, drinks, sticky hands, and pets.
- Do not stretch, bend, or pull the headband apart.

CLEAN RETURN
- Wipe the earmuffs with a soft, slightly damp cloth before returning. Do not submerge them or use harsh cleaners.
- If a pair gets damaged or stained, tell the operator — we'd rather know than be surprised.

ON-TIME RETURN
- Please return on or before the agreed-upon date so the next family can use them.
- If you need extra time, message the operator first — most are flexible if you ask.

SHARING THE GEMACH
- Borrow only what you need. If you need multiple pairs (siblings, twins, family event), say so up front so the operator can plan.
- The gemach is a free-loan service. Please don't sublend or pass the earmuffs to a third party — direct the next family to the operator instead.`,
  },
  {
    title: 'Common Scenarios (FAQ playbook)',
    category: 'general',
    body: `Quick reference for the email scenarios that come up most often. Use these as the basis for replies; never invent details that contradict them.

1. "How do I borrow a pair?"
   - Direct the family to ${SITE_URL}/locations to find the closest gemach, then to ${SITE_URL}/borrow to start the borrow flow. The local operator will confirm pickup details.

2. "I'm late returning — what do I do?"
   - Reassure them, ask them to message the operator directly to arrange a return time. Mention that the deposit is held until return.

3. "I lost / damaged a pair."
   - Thank them for letting us know, ask them to contact the local operator. The operator will decide on a deposit deduction or replacement on a case-by-case basis.

4. "Can I open a gemach in my city?"
   - Point them to the application at ${SITE_URL}/apply. We typically follow up within a week. Don't promise approval.

5. "How can I donate?"
   - Donations help us send earmuffs to new gemachs. Direct them to ${SITE_URL}/donate or ask if they'd like to be connected to a coordinator.

6. "What ages / how many decibels?"
   - Earmuffs are sized for babies up to ~2 years old; older toddlers may also fit. They reduce loud event noise (weddings, concerts, fireworks). Don't quote a specific dB rating unless it's in the FAQ.

7. "Operator complaint or hand-off."
   - Acknowledge, do NOT share operator contact info publicly. Tell the writer the admin will follow up directly with the operator. Flag for human review.`,
  },
];

export async function seedKnowledgeDocs(): Promise<{ created: number }> {
  let created = 0;
  try {
    const existing = await storage.getAllKnowledgeDocs().catch(() => [] as KnowledgeDoc[]);
    const haveTitles = new Set(existing.map(d => d.title.trim().toLowerCase()));
    for (const seed of SEED_DOCS) {
      if (haveTitles.has(seed.title.trim().toLowerCase())) continue;
      const d = await storage.createKnowledgeDoc({
        title: seed.title,
        body: seed.body,
        category: seed.category,
        language: 'en',
        isActive: true,
      });
      // Best-effort indexing; don't block startup on embedding latency.
      reindexDoc(d).catch(() => {});
      created++;
    }
  } catch (err) {
    console.warn('seedKnowledgeDocs failed:', err instanceof Error ? err.message : String(err));
  }
  return { created };
}

export async function backfillEmbeddings(): Promise<{ scanned: number; created: number }> {
  let scanned = 0, created = 0;
  try {
    const existing = await storage.getAllKbEmbeddings();
    const have = new Set(existing.map(e => `${e.sourceKind}:${e.sourceId}`));

    const facts = await storage.getAllPlaybookFacts().catch(() => []);
    for (const f of facts) {
      scanned++;
      if (!have.has(`fact:${f.id}`)) { await reindexFact(f); created++; }
    }
    const faqs = await storage.getAllFaqEntries().catch(() => [] as FaqEntry[]);
    for (const f of faqs) {
      scanned++;
      if (f.isActive === false) continue;
      if (!have.has(`faq:${f.id}`)) { await reindexFaq(f); created++; }
    }
    const docs = await storage.getAllKnowledgeDocs().catch(() => [] as KnowledgeDoc[]);
    for (const d of docs) {
      scanned++;
      if (d.isActive === false) continue;
      if (!have.has(`doc:${d.id}`)) { await reindexDoc(d); created++; }
    }
    const replies = await storage.getRecentReplyExamples(200).catch(() => []);
    for (const r of replies) {
      scanned++;
      if (!have.has(`reply_example:${r.id}`)) { await reindexReplyExample(r); created++; }
    }
  } catch (err) {
    console.warn('backfillEmbeddings failed:', err instanceof Error ? err.message : String(err));
  }
  return { scanned, created };
}

// ====================== Helpers ======================

function detectLanguage(text: string): 'en' | 'he' {
  return /[\u0590-\u05FF]/.test(text) ? 'he' : 'en';
}

function findMatchingLocation(emailBody: string, allLocations: Location[]): Location | null {
  const lower = emailBody.toLowerCase();
  let best: { loc: Location; score: number } | null = null;
  for (const loc of allLocations) {
    const name = (loc.name || '').toLowerCase().trim();
    const address = (loc.address || '').toLowerCase().trim();
    let score = 0;
    if (name.length > 3 && lower.includes(name)) score += name.length;
    const cityCandidates = address.split(/[,;]/).map(s => s.trim()).filter(s => s.length > 3);
    for (const c of cityCandidates) {
      if (lower.includes(c)) score = Math.max(score, c.length);
    }
    if (score > 0 && (!best || score > best.score)) best = { loc, score };
  }
  return best?.loc || null;
}

interface RetrievedItem {
  kind: KbSourceKind;
  id: number;
  content: string;
  score: number;
}

async function getActiveSourceFilter(): Promise<(kind: KbSourceKind, id: number) => boolean> {
  // Fetch current active state for FAQ/doc sources so retrieval can filter out
  // any stale embedding rows whose source has since been disabled.
  const [faqs, docs] = await Promise.all([
    storage.getAllFaqEntries().catch(() => [] as FaqEntry[]),
    storage.getAllKnowledgeDocs().catch(() => [] as KnowledgeDoc[]),
  ]);
  const activeFaqIds = new Set(faqs.filter(f => f.isActive !== false).map(f => f.id));
  const activeDocIds = new Set(docs.filter(d => d.isActive !== false).map(d => d.id));
  return (kind, id) => {
    if (kind === 'faq') return activeFaqIds.has(id);
    if (kind === 'doc') return activeDocIds.has(id);
    return true; // facts and reply_examples have no isActive
  };
}

async function semanticRetrieve(query: string, topK: number = 6): Promise<RetrievedItem[]> {
  const qEmb = await embedText(query);
  if (!qEmb) return [];
  const [all, isActive] = await Promise.all([
    storage.getAllKbEmbeddings().catch(() => [] as KbEmbedding[]),
    getActiveSourceFilter(),
  ]);
  const scored = all
    .filter(e => isActive(e.sourceKind as KbSourceKind, e.sourceId))
    .map(e => ({
      kind: e.sourceKind as KbSourceKind,
      id: e.sourceId,
      content: e.content,
      score: cosine(qEmb, (e.embedding as unknown as number[]) || []),
    }));
  scored.sort((a, b) => b.score - a.score);
  return scored.filter(s => s.score > 0.2).slice(0, topK);
}

// Pre-embedding-era keyword retrieval. Used when embeddings are unavailable
// (no OPENAI_API_KEY, network failure, or empty index) so drafting still has
// some FAQ/fact context to work with — matching the prior behavior.
async function keywordRetrieveFallback(query: string, topK: number = 6): Promise<RetrievedItem[]> {
  const tokens = String(query || '')
    .toLowerCase()
    .split(/[^a-z0-9\u0590-\u05ff]+/i)
    .filter(t => t.length >= 3);
  if (!tokens.length) return [];

  const score = (text: string): number => {
    const lower = text.toLowerCase();
    let s = 0;
    for (const tok of tokens) {
      if (lower.includes(tok)) s += 1;
    }
    return s;
  };

  const [faqs, facts] = await Promise.all([
    storage.getAllFaqEntries().catch(() => [] as FaqEntry[]),
    storage.getAllPlaybookFacts().catch(() => [] as PlaybookFact[]),
  ]);

  const items: RetrievedItem[] = [];
  for (const f of faqs) {
    if (f.isActive === false) continue;
    const s = score(`${f.question} ${f.answer} ${f.category}`);
    if (s > 0) items.push({ kind: 'faq', id: f.id, content: buildContentForFaq(f), score: s });
  }
  for (const f of facts) {
    const s = score(`${f.factKey} ${f.factValue} ${f.category}`);
    if (s > 0) items.push({ kind: 'fact', id: f.id, content: buildContentForFact(f), score: s });
  }
  items.sort((a, b) => b.score - a.score);
  return items.slice(0, topK);
}

function summarizeContact(c: Contact): string {
  const when = c.submittedAt ? new Date(c.submittedAt).toISOString().slice(0, 10) : '';
  const snippet = String(c.message || '').replace(/\s+/g, ' ').slice(0, 160);
  return `[${when}] form: "${c.subject}" — ${snippet}`;
}
function summarizeTransaction(t: Transaction): string {
  const when = t.borrowDate ? new Date(t.borrowDate).toISOString().slice(0, 10) : '';
  const status = t.isReturned ? 'returned' : (t.payLaterStatus || 'active');
  return `[${when}] tx#${t.id} status=${status} loc=${t.locationId ?? '?'} color=${t.headbandColor ?? '?'}`;
}
function summarizeReplyExample(r: ReplyExample): string {
  const when = r.createdAt ? new Date(r.createdAt).toISOString().slice(0, 10) : '';
  return `[${when}] prior reply (${r.classification || 'other'}) to "${r.incomingSubject}"`;
}

export interface DraftSourceRef {
  kind: 'fact' | 'faq' | 'doc' | 'reply_example';
  id: number;
  label: string;
  score?: number;
}

interface AssembledContext {
  contextBlock: string;
  matchedLocation: Location | null;
  language: 'en' | 'he';
  todayIso: string;
  sources: DraftSourceRef[];
  senderHistoryCount: number;
  threadHistoryCount: number;
}

async function gatherContext(
  emailSubject: string,
  emailBody: string,
  senderEmail: string | undefined,
  threadId: string | undefined,
  currentMessageId: string | undefined,
  language: 'en' | 'he',
): Promise<AssembledContext> {
  const sections: string[] = [];
  const sources: DraftSourceRef[] = [];
  const todayIso = new Date().toISOString().slice(0, 10);

  // 1. Today's date is always in the prompt
  sections.push(`TODAY'S DATE: ${todayIso}`);
  sections.push(`SENDER LANGUAGE (detected): ${language === 'he' ? 'Hebrew' : 'English'} — write your reply in this language.`);

  // 2. Sender history (form messages, prior reply examples, transactions)
  let senderHistoryCount = 0;
  if (senderEmail) {
    try {
      const [contacts, replies, txns] = await Promise.all([
        storage.getContactsByEmail(senderEmail).catch(() => []),
        storage.getReplyExamplesBySender(senderEmail, 5).catch(() => []),
        storage.getTransactionsByEmail(senderEmail).catch(() => []),
      ]);
      const lines: string[] = [];
      contacts.slice(0, 5).forEach(c => lines.push(summarizeContact(c)));
      replies.forEach(r => lines.push(summarizeReplyExample(r)));
      txns.slice(0, 8).forEach(t => lines.push(summarizeTransaction(t)));
      senderHistoryCount = lines.length;
      if (lines.length) {
        sections.push(`SENDER HISTORY for ${senderEmail} (most recent first; reference these only if directly relevant):\n${lines.join('\n')}`);
      }
      // application
      const apps = await storage.getAllApplications().catch(() => [] as GemachApplication[]);
      const senderEmailLc = senderEmail.toLowerCase();
      const appMatch = apps.find(a =>
        !!a.email && a.email.toLowerCase() === senderEmailLc
      );
      if (appMatch) {
        const addr = [appMatch.streetAddress, appMatch.city, appMatch.country].filter(Boolean).join(' ');
        sections.push(
          `SENDER HAS AN EXISTING APPLICATION:\n- Status: "${appMatch.status}"\n- Address: "${addr}"`
        );
      }
    } catch {}
  }

  // 3. Match location & augment with region / city-category / operator name
  let matchedLocation: Location | null = null;
  try {
    const allLocations = await storage.getAllLocations();
    matchedLocation = findMatchingLocation(`${emailSubject} ${emailBody}`, allLocations);
    if (matchedLocation) {
      const depositAmount = matchedLocation.depositAmount ?? 20;
      let region: Region | undefined;
      let cityCat: CityCategory | undefined;
      try { region = await storage.getRegion(matchedLocation.regionId); } catch {}
      const ccId = matchedLocation.cityCategoryId;
      if (ccId) { try { cityCat = await storage.getCityCategory(ccId); } catch {} }
      const operatorName = matchedLocation.contactPerson || '';
      sections.push(
        `MATCHED LOCATION (the sender appears to be asking about this gemach — use these REAL facts, not generic ones).\n` +
        `IMPORTANT: do NOT include the operator's email, phone, or any internal location code in your reply — those are admin-only. The admin will forward to the operator if needed.\n` +
        `- Name: ${matchedLocation.name}\n` +
        `- Region: ${region?.name || '(unknown)'}\n` +
        `- City / area: ${cityCat?.name || '(none)'}\n` +
        `- Public address: ${matchedLocation.address || '(not provided)'}\n` +
        `- Operator (first-name reference only): ${operatorName.split(/\s+/)[0] || '(unknown)'}\n` +
        `- Refundable deposit at this location: $${depositAmount}`
      );
    }
  } catch {}

  // 4. Retrieval — try semantic first, fall back to keyword matching over
  // FAQs/facts (the pre-embedding behavior) so drafting still has context if
  // OpenAI embeddings are unavailable or the index is empty.
  try {
    let top: RetrievedItem[] = [];
    let usedFallback = false;
    try {
      top = await semanticRetrieve(`${emailSubject}\n${emailBody}`, 6);
    } catch (err) {
      console.warn('semanticRetrieve failed, will use keyword fallback:', (err as Error)?.message);
    }
    if (top.length === 0) {
      top = await keywordRetrieveFallback(`${emailSubject}\n${emailBody}`, 6);
      usedFallback = top.length > 0;
    }
    if (top.length) {
      const grouped: Record<string, string[]> = {};
      for (const item of top) {
        const key = item.kind;
        const scoreLabel = usedFallback ? `kw ${item.score}` : `sim ${item.score.toFixed(2)}`;
        (grouped[key] ||= []).push(`#${item.kind}-${item.id} (${scoreLabel}):\n${item.content}`);
        sources.push({
          kind: item.kind,
          id: item.id,
          label: item.content.split('\n')[0].slice(0, 120),
          score: item.score,
        });
      }
      const labelled = (k: string) => k === 'fact' ? 'GEMACH FACTS'
        : k === 'faq' ? 'FAQ ANSWERS'
        : k === 'doc' ? 'KNOWLEDGE DOCUMENTS'
        : 'PAST APPROVED REPLIES (few-shot — match this style/voice when appropriate)';
      for (const k of Object.keys(grouped)) {
        sections.push(`${labelled(k)}:\n${grouped[k].join('\n---\n')}`);
      }
    } else {
      // Last-resort: include all facts so model never goes empty-handed
      const facts = await storage.getAllPlaybookFacts().catch(() => [] as PlaybookFact[]);
      if (facts.length) {
        sections.push(
          'GEMACH FACTS (admin-curated):\n' +
          facts.map((f: PlaybookFact) => `- [${f.category}] ${f.factKey.replace(/_/g, ' ')}: ${f.factValue}`).join('\n')
        );
      }
    }
  } catch (err) {
    console.warn('retrieval block failed:', (err as Error)?.message);
  }

  // 5. Thread / conversation history. Two cases:
  //    a) Gmail email with a threadId — pull the full Gmail thread (up to 50
  //       messages) so the AI sees every prior turn, not just a 6-message
  //       window. This was the cause of replies that contradicted earlier
  //       answers in long threads.
  //    b) Contact-form message (no threadId) — build a virtual thread from
  //       sibling contacts on the same normalized subject from the same
  //       sender, plus any saved replies, so the AI also has context for
  //       repeat senders who wrote in via the website form.
  let threadHistoryCount = 0;
  try {
    if (threadId) {
      const msgs = await getThreadMessages(threadId, 50);
      const prior = msgs.filter(m => m.id !== currentMessageId);
      threadHistoryCount = prior.length;
      if (prior.length) {
        sections.push(
          'PRIOR MESSAGES IN THIS THREAD (oldest first — use this so you do not repeat info or contradict yourself):\n' +
          prior.map(m => {
            const dir = (m.labels || []).includes('SENT') ? 'OUR REPLY (sent)' : `INBOUND from ${m.from}`;
            return `[${m.date}] ${dir}\nSubject: ${m.subject}\n${(m.body || m.snippet || '').slice(0, 1500)}`;
          }).join('\n---\n')
        );
      }
    } else if (senderEmail) {
      const normSubj = normalizeSubject(emailSubject);
      const allContacts = await storage.getContactsByEmail(senderEmail).catch(() => [] as Contact[]);
      const currentId = currentMessageId ? Number(currentMessageId) : NaN;
      const siblings = allContacts.filter(c =>
        normalizeSubject(c.subject) === normSubj && c.id !== currentId
      );
      if (siblings.length) {
        const repliesPerSibling = await Promise.all(
          siblings.map(s => storage.getReplyExamplesByRef('form', String(s.id)).catch(() => [] as ReplyExample[]))
        );
        const events: { ts: number; line: string }[] = [];
        siblings.forEach((s, i) => {
          const ts = (s.submittedAt instanceof Date ? s.submittedAt : new Date(s.submittedAt)).getTime() || 0;
          events.push({
            ts,
            line: `[${new Date(ts).toISOString()}] INBOUND from ${s.name} <${s.email}>\nSubject: ${s.subject}\n${(s.message || '').slice(0, 1500)}`,
          });
          for (const r of repliesPerSibling[i] || []) {
            const rts = (r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt)).getTime() || 0;
            events.push({
              ts: rts,
              line: `[${new Date(rts).toISOString()}] OUR PRIOR REPLY (sent)\n${(r.sentReply || '').slice(0, 1500)}`,
            });
          }
        });
        events.sort((a, b) => a.ts - b.ts);
        threadHistoryCount = events.length;
        if (events.length) {
          sections.push(
            'PRIOR MESSAGES IN THIS CONVERSATION (oldest first — same sender + subject; use to avoid repeating info or contradicting yourself):\n' +
            events.map(e => e.line).join('\n---\n')
          );
        }
      }
    }
  } catch {}

  return {
    contextBlock: sections.join('\n\n'),
    matchedLocation,
    language,
    todayIso,
    sources,
    senderHistoryCount,
    threadHistoryCount,
  };
}

// ====================== Drafting ======================

export interface GeneratedEmailResponse {
  draft: string;
  classification: Classification;
  needsHumanReview: boolean;
  reviewReason?: string;
  matchedLocationId?: number;
  matchedLocationName?: string;
  language: 'en' | 'he';
  confidence: number;
  sources: DraftSourceRef[];
  citedSourceIds: string[];
  todayIso: string;
  senderHistoryCount: number;
  threadHistoryCount: number;
}

export async function generateEmailResponse(
  emailSubject: string,
  emailBody: string,
  senderName: string,
  senderEmail?: string,
  threadId?: string,
  currentMessageId?: string,
): Promise<GeneratedEmailResponse> {
  const language = detectLanguage(`${emailSubject} ${emailBody}`);
  const ctx = await gatherContext(
    emailSubject, emailBody, senderEmail, threadId, currentMessageId, language
  );

  const systemPrompt = `You are a warm, knowledgeable representative of Baby Banz Gemach drafting an email reply on behalf of the gemach team.

${STATIC_PLAYBOOK}

WRITING STYLE
- Friendly, respectful, concise (4-10 sentences). No corporate jargon.
- Match the language the sender wrote in (English or Hebrew). If Hebrew, write in fluent, natural Hebrew.
- Use the right URL from KEY URLS above for the action you are recommending. Never invent URLs.
- When the context block lists MATCHED LOCATION facts (deposit amount, operator, etc.), USE THOSE REAL FACTS instead of any generic playbook value.
- When the context block lists PAST APPROVED REPLIES, treat them as authoritative few-shot examples for tone, structure, and recurring phrasing — adapt, don't copy verbatim.
- When the context block lists PRIOR MESSAGES in the thread, do NOT repeat information already shared, and acknowledge what was previously discussed.
- Sign off as "Baby Banz Gemach" (or the Hebrew equivalent if writing in Hebrew).
- The human admin will review and edit before sending — your draft should be ready-to-send, not a template with placeholders.

YOUR JOB
1. Classify the inquiry into one of: new_location, borrow_request, return_or_deposit, application_status, general_question, complaint, other.
2. Decide if it needs human review (any escalation trigger above, missing info you cannot reasonably guess, or low confidence).
3. Draft the reply.
4. Estimate your confidence (0.0 - 1.0) that the draft is accurate, on-policy, and sendable with at most a one-line tweak.
5. List the IDs of context items you actually relied on, formatted as "kind-id" (e.g. "faq-12", "fact-3", "doc-1", "reply_example-7"). Use only IDs that appeared in the context block above.

OUTPUT FORMAT — return STRICT JSON only, no markdown fences:
{
  "classification": "new_location" | "borrow_request" | "return_or_deposit" | "application_status" | "general_question" | "complaint" | "other",
  "needsHumanReview": true | false,
  "reviewReason": "short reason if needsHumanReview is true, otherwise empty string",
  "draft": "the full email body text, including greeting and sign-off",
  "confidence": 0.0,
  "citedSourceIds": ["faq-1", "fact-2"],
  "language": "en" | "he"
}`;

  const userPrompt = `${ctx.contextBlock}

INCOMING EMAIL
From: ${senderName}${senderEmail ? ` <${senderEmail}>` : ''}
Subject: ${emailSubject}

${emailBody}`;

  type DraftJson = {
    draft?: unknown;
    classification?: unknown;
    needsHumanReview?: unknown;
    reviewReason?: unknown;
    confidence?: unknown;
    language?: unknown;
    citedSourceIds?: unknown;
  };
  let parsed: DraftJson = {};
  let rawErr: string | null = null;
  try {
    const response = await openai.chat.completions.create({
      model: DRAFT_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 1600,
      temperature: 0.4,
      response_format: { type: 'json_object' },
    });
    const raw = response.choices[0]?.message?.content || '{}';
    try { parsed = JSON.parse(raw); }
    catch { rawErr = 'parse'; parsed = { draft: raw }; }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    // Best-effort: surface error rather than crash the route
    return {
      draft: '',
      classification: 'other',
      needsHumanReview: true,
      reviewReason: `AI drafting failed: ${msg}`,
      matchedLocationId: ctx.matchedLocation?.id,
      matchedLocationName: ctx.matchedLocation?.name,
      language: ctx.language,
      confidence: 0,
      sources: ctx.sources,
      citedSourceIds: [],
      todayIso: ctx.todayIso,
      senderHistoryCount: ctx.senderHistoryCount,
      threadHistoryCount: ctx.threadHistoryCount,
    };
  }

  const confidence = typeof parsed.confidence === 'number'
    ? Math.max(0, Math.min(1, parsed.confidence as number))
    : 0.5;
  const lowConfidence = confidence < CONFIDENCE_THRESHOLD;
  const modelFlag = !!parsed.needsHumanReview;
  const needsReview = modelFlag || lowConfidence || !!rawErr;
  let reviewReason: string | undefined;
  if (needsReview) {
    if (rawErr) reviewReason = 'AI returned malformed JSON; please review.';
    else if (lowConfidence && !modelFlag) reviewReason = `Low AI confidence (${confidence.toFixed(2)}). Please verify before sending.`;
    else reviewReason = String(parsed.reviewReason || 'Flagged for review.');
  }

  const citedSourceIds: string[] = Array.isArray(parsed.citedSourceIds)
    ? (parsed.citedSourceIds as unknown[]).map(s => String(s)).slice(0, 12)
    : [];

  return {
    draft: String(parsed.draft || ''),
    classification: (parsed.classification as Classification) || 'other',
    needsHumanReview: needsReview,
    reviewReason,
    matchedLocationId: ctx.matchedLocation?.id,
    matchedLocationName: ctx.matchedLocation?.name,
    language: parsed.language === 'he' || parsed.language === 'en' ? parsed.language : ctx.language,
    confidence,
    sources: ctx.sources,
    citedSourceIds,
    todayIso: ctx.todayIso,
    senderHistoryCount: ctx.senderHistoryCount,
    threadHistoryCount: ctx.threadHistoryCount,
  };
}

// ====================== Welcome opener (unchanged) ======================

export async function generateWelcomeOpener(input: {
  locationName: string;
  operatorName?: string;
  city?: string;
  country?: string;
}): Promise<string> {
  const safeName = (input.operatorName || '').trim();
  const place = [input.city, input.country].filter(Boolean).join(', ');
  const fallback = safeName
    ? `Hi ${safeName.split(/\s+/)[0]} — quick note to confirm the ${input.locationName} dashboard is set up and ready whenever you are.`
    : `Quick note to confirm the ${input.locationName} dashboard is set up and ready whenever you are.`;

  if (!process.env.OPENAI_API_KEY) return fallback;

  try {
    const sys = `You write ONE warm, low-key opening sentence for a transactional "your dashboard is ready" email to a volunteer who runs a free-loan baby-earmuff gemach.
Rules:
- Exactly one sentence, max 25 words.
- Address the operator by first name only if a name is given; otherwise no name.
- Mention the gemach/location naturally; mention the city only if it adds warmth.
- Sound like a friendly confirmation, NOT a sales pitch or a broadcast. No "welcome!", no exclamation, no emojis, no marketing language.
- Plain text only. No quotes around the sentence.`;
    const user = `Location name: ${input.locationName}
Operator name: ${safeName || '(unknown)'}
City/area: ${place || '(unknown)'}`;

    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: user },
      ],
      max_tokens: 80,
      temperature: 0.7,
    });
    const line = (resp.choices[0]?.message?.content || '').trim().replace(/^["']|["']$/g, '');
    if (!line || line.length > 240) return fallback;
    return line;
  } catch (err) {
    console.warn('generateWelcomeOpener failed, using fallback:', err instanceof Error ? err.message : String(err));
    return fallback;
  }
}

export async function translateText(
  text: string,
  targetLanguage: 'en' | 'he'
): Promise<string> {
  const targetName = targetLanguage === 'he' ? 'Hebrew' : 'English';
  const systemPrompt = `You are a faithful translator. Translate the user's message into ${targetName}.
Preserve formatting, line breaks, names, and email-style structure (greetings, signatures, paragraphs).
Do not add commentary, do not summarize, do not include the source text — output only the translation.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text },
    ],
    max_tokens: 1500,
    temperature: 0.2,
  });

  return response.choices[0]?.message?.content?.trim() || text;
}
