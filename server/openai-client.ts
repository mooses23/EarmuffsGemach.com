import OpenAI from 'openai';
import { storage } from './storage.js';
import { getThreadMessages } from './gmail-client.js';
import { normalizeSubject } from './inbox-threading.js';
import type {
  Location, FaqEntry, PlaybookFact, KnowledgeDoc, ReplyExample,
  KbEmbedding, KbSourceKind, Region, CityCategory, Transaction, Contact,
  GemachApplication,
} from '../shared/schema.js';
import { siblingsForSeed, type FormItemForGrouping } from '../shared/form-thread-grouping.js';
import { buildRulesSeedBody } from '../shared/rules-content.js';
import { buildScenariosSeedBody } from '../shared/scenarios-content.js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ===================== OpenAI test seam =====================
// In production, drafting and embedding go straight through the openai SDK.
// For tests we need deterministic responses (no network, no flakiness, no
// real API key). The two indirection variables below let
// scripts/test-ai-drafting.ts swap in a stub via __setOpenAIClientForTests
// without touching production behavior — passing null restores the real
// SDK call. Keep this seam minimal: it only exists so generateEmailResponse
// and embedText can be exercised end-to-end in tests.
type ChatCreate = typeof openai.chat.completions.create;
type EmbedCreate = typeof openai.embeddings.create;
const realChatCreate: ChatCreate = openai.chat.completions.create.bind(openai.chat.completions);
const realEmbedCreate: EmbedCreate = openai.embeddings.create.bind(openai.embeddings);
let chatCreate: ChatCreate = realChatCreate;
let embedCreate: EmbedCreate = realEmbedCreate;
export function __setOpenAIClientForTests(stubs: {
  chat?: ChatCreate | null;
  embed?: EmbedCreate | null;
}): void {
  if (stubs.chat !== undefined) chatCreate = stubs.chat ?? realChatCreate;
  if (stubs.embed !== undefined) embedCreate = stubs.embed ?? realEmbedCreate;
}

const SITE_URL = process.env.SITE_URL || 'https://earmuffsgemach.com';
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
    const r = await embedCreate({ model: EMBED_MODEL, input: cleaned });
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
// the same title doesn't already exist (per language).
//
// Both EN and HE versions are seeded so Hebrew-speaking senders pull Hebrew
// retrieval context and English senders pull English context. The body copy
// is generated from shared/rules-content.ts — the same module the /rules page
// imports — so editing the rules text in one place keeps the AI seed in sync.
// seedOnly: true  → create if missing, but do NOT overwrite edits admins make via the UI.
// seedOnly: false → always sync body with the canonical source (used for /rules-derived docs).
const SEED_DOCS: Array<{ title: string; category: string; language: 'en' | 'he'; body: string; seedOnly?: boolean }> = [
  {
    title: 'Borrowing Rules (from /rules page)',
    category: 'borrowing',
    language: 'en',
    // Body is generated from shared/rules-content.ts — the same source the /rules page uses.
    body: buildRulesSeedBody('en', SITE_URL),
    seedOnly: false,
  },
  {
    title: 'Borrowing Rules (Hebrew — מהדף /rules)',
    category: 'borrowing',
    language: 'he',
    // Body is generated from shared/rules-content.ts — the same source the /rules page uses.
    body: buildRulesSeedBody('he', SITE_URL),
    seedOnly: false,
  },
  {
    title: 'Common Scenarios (FAQ playbook)',
    category: 'general',
    language: 'en',
    // Body is generated from shared/scenarios-content.ts so admins can read the defaults there.
    // seedOnly: true means this doc is seeded once and then editable from the admin Docs tab —
    // running "Sync /rules docs" will NOT overwrite admin edits.
    body: buildScenariosSeedBody('en', SITE_URL),
    seedOnly: true,
  },
  {
    title: 'Common Scenarios (Hebrew — תרחישים נפוצים)',
    category: 'general',
    language: 'he',
    // Body is generated from shared/scenarios-content.ts so admins can read the defaults there.
    // seedOnly: true means this doc is seeded once and then editable from the admin Docs tab —
    // running "Sync /rules docs" will NOT overwrite admin edits.
    body: buildScenariosSeedBody('he', SITE_URL),
    seedOnly: true,
  },
];

// SEED_DOC_IDENTITY is the dedup key the seeder uses so EN and HE seeds with
// the same logical title don't collide, and so a re-seed after rename of the
// EN-only legacy seed doesn't create duplicates.
function seedKey(s: { title: string; language: string }): string {
  return `${s.language}::${s.title.trim().toLowerCase()}`;
}

export async function seedKnowledgeDocs(): Promise<{ created: number; skipped: number; updated: number }> {
  let created = 0;
  let skipped = 0;
  let updated = 0;
  try {
    const existing = await storage.getAllKnowledgeDocs().catch(() => [] as KnowledgeDoc[]);
    const byKey = new Map(
      existing.map(d => [seedKey({ title: d.title, language: d.language || 'en' }), d]),
    );
    // Backwards-compat: the original seed only inserted EN docs without the
    // language qualifier in the title. Treat any existing doc with a matching
    // title (regardless of language) as already-present for the EN seed so we
    // don't re-create it.
    const byTitleAnyLang = new Map(existing.map(d => [d.title.trim().toLowerCase(), d]));

    for (const seed of SEED_DOCS) {
      const k = seedKey(seed);
      const existing_en_compat =
        seed.language === 'en' ? byTitleAnyLang.get(seed.title.trim().toLowerCase()) : undefined;
      const existingDoc = byKey.get(k) ?? existing_en_compat;

      if (!existingDoc) {
        const d = await storage.createKnowledgeDoc({
          title: seed.title,
          body: seed.body,
          category: seed.category,
          language: seed.language,
          isActive: true,
        });
        // Best-effort indexing; don't block startup on embedding latency.
        reindexDoc(d).catch(() => {});
        created++;
      } else if (!seed.seedOnly && existingDoc.body.trim() !== seed.body.trim()) {
        // Body has drifted from the canonical source — update it to stay in sync.
        // seedOnly docs (e.g. Common Scenarios) are intentionally skipped here so
        // admins can freely edit them from the Docs tab without re-seed overwriting them.
        const d = await storage.updateKnowledgeDoc(existingDoc.id, { body: seed.body });
        if (d) reindexDoc(d).catch(() => {});
        updated++;
      } else {
        skipped++;
      }
    }
  } catch (err) {
    console.warn('seedKnowledgeDocs failed:', err instanceof Error ? err.message : String(err));
  }
  return { created, skipped, updated };
}

const OLD_DOMAIN = 'babybanzgemach.com';
const NEW_DOMAIN = 'earmuffsgemach.com';

// Idempotent one-time migration: replace all occurrences of the old domain
// with the new domain across every row in the AI knowledge base (knowledge docs,
// playbook facts, and FAQ entries) and re-index their embeddings so the vector
// store also reflects the corrected text. Safe to run on every startup.
export async function migrateDomainInKnowledgeBase(): Promise<{ updated: number }> {
  let updated = 0;
  const reindexPromises: Promise<void>[] = [];
  try {
    const docs = await storage.getAllKnowledgeDocs().catch(() => [] as KnowledgeDoc[]);
    for (const d of docs) {
      if (!d.body.includes(OLD_DOMAIN)) continue;
      const newBody = d.body.split(OLD_DOMAIN).join(NEW_DOMAIN);
      const patched = await storage.updateKnowledgeDoc(d.id, { body: newBody });
      if (patched) reindexPromises.push(reindexDoc(patched));
      updated++;
    }

    const facts = await storage.getAllPlaybookFacts().catch(() => []);
    for (const f of facts) {
      if (!f.factValue.includes(OLD_DOMAIN)) continue;
      const newValue = f.factValue.split(OLD_DOMAIN).join(NEW_DOMAIN);
      const patched = await storage.updatePlaybookFact(f.id, { factValue: newValue });
      if (patched) reindexPromises.push(reindexFact(patched));
      updated++;
    }

    const faqs = await storage.getAllFaqEntries().catch(() => [] as FaqEntry[]);
    for (const faq of faqs) {
      const answerHit = faq.answer.includes(OLD_DOMAIN);
      const questionHit = faq.question.includes(OLD_DOMAIN);
      if (!answerHit && !questionHit) continue;
      const newAnswer = answerHit ? faq.answer.split(OLD_DOMAIN).join(NEW_DOMAIN) : faq.answer;
      const newQuestion = questionHit ? faq.question.split(OLD_DOMAIN).join(NEW_DOMAIN) : faq.question;
      const patched = await storage.updateFaqEntry(faq.id, { answer: newAnswer, question: newQuestion });
      if (patched) reindexPromises.push(reindexFaq(patched));
      updated++;
    }

    if (reindexPromises.length > 0) {
      const results = await Promise.allSettled(reindexPromises);
      const failures = results.filter(r => r.status === 'rejected').length;
      if (failures > 0) {
        console.warn(`[domain-migration] ${failures} reindex operation(s) failed — embeddings may be stale.`);
      }
    }
  } catch (err) {
    console.warn('migrateDomainInKnowledgeBase failed:', err instanceof Error ? err.message : String(err));
  }
  if (updated > 0) {
    console.log(`[domain-migration] Updated ${updated} knowledge base record(s): ${OLD_DOMAIN} → ${NEW_DOMAIN}`);
  }
  return { updated };
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

  // 5. Thread / conversation history.
  //    Gmail: pull full thread via threadId.
  //    Form: build virtual thread from sibling contacts (same sender + normalized subject) + saved replies.
  //    Then compress: keep recent turns verbatim, summarize older ones.
  let threadHistoryCount = 0;
  try {
    type ThreadEvent = {
      ts: number;
      direction: 'inbound' | 'outbound';
      from?: string;
      subject?: string;
      body: string;
    };
    let events: ThreadEvent[] = [];
    let headerLabel = 'PRIOR MESSAGES IN THIS THREAD';

    if (threadId) {
      const msgs = await getThreadMessages(threadId);
      const prior = msgs.filter(m => m.id !== currentMessageId);
      events = prior.map((m) => {
        const isSent = (m.labels || []).includes('SENT');
        const ts = m.date ? new Date(m.date).getTime() || 0 : 0;
        return {
          ts,
          direction: isSent ? 'outbound' : 'inbound',
          from: isSent ? undefined : m.from,
          subject: m.subject,
          body: m.body || m.snippet || '',
        };
      });
    } else if (senderEmail) {
      const allContacts = await storage.getContactsByEmail(senderEmail).catch(() => [] as Contact[]);
      const currentId = currentMessageId ? Number(currentMessageId) : NaN;
      // Project Contact rows down to the minimal shape the grouping
      // helper needs. Doing this once up front means the seed and pool
      // share a single concrete type and nothing downstream needs casts.
      const contactToFormItem = (c: Contact): FormItemForGrouping => ({
        id: c.id,
        email: c.email,
        subject: c.subject,
        date: c.submittedAt,
      });
      // Pick a "seed" contact representing the current message so the
      // grouping helper can find every sibling (same loose conversation)
      // even when the borrower changed the subject between submissions.
      // Falls back to a synthetic seed (id -1) when the current message
      // isn't a form contact (e.g. Gmail with no threadId on a fresh
      // inquiry) — that synthetic seed gets prepended to the pool so the
      // helper still computes the cluster relative to it.
      const seedFromContacts = !Number.isNaN(currentId)
        ? allContacts.find(c => c.id === currentId)
        : undefined;
      const SYNTHETIC_SEED_ID = -1;
      const seedItem: FormItemForGrouping = seedFromContacts
        ? contactToFormItem(seedFromContacts)
        : { id: SYNTHETIC_SEED_ID, email: senderEmail, subject: emailSubject || '', date: new Date() };
      const pool: FormItemForGrouping[] = seedFromContacts
        ? allContacts.map(contactToFormItem)
        : [seedItem, ...allContacts.map(contactToFormItem)];
      const inGroup = siblingsForSeed(seedItem, pool);
      const inGroupIds = new Set(inGroup.map(g => String(g.id)));
      const siblings = allContacts.filter(c =>
        c.id !== currentId && inGroupIds.has(String(c.id))
      );
      if (siblings.length) {
        const repliesPerSibling = await Promise.all(
          siblings.map(s => storage.getReplyExamplesByRef('form', String(s.id)).catch(() => [] as ReplyExample[]))
        );
        siblings.forEach((s, i) => {
          const ts = (s.submittedAt instanceof Date ? s.submittedAt : new Date(s.submittedAt)).getTime() || 0;
          events.push({
            ts,
            direction: 'inbound',
            from: `${s.name} <${s.email}>`,
            subject: s.subject,
            body: s.message || '',
          });
          for (const r of repliesPerSibling[i] || []) {
            const rts = (r.createdAt instanceof Date ? r.createdAt : new Date(r.createdAt)).getTime() || 0;
            events.push({
              ts: rts,
              direction: 'outbound',
              body: r.sentReply || '',
            });
          }
        });
        headerLabel = 'PRIOR MESSAGES IN THIS CONVERSATION (same sender, related submissions)';
      }
    }

    events.sort((a, b) => a.ts - b.ts);
    threadHistoryCount = events.length;

    if (events.length) {
      // Keep the most recent KEEP_VERBATIM turns in full; summarize the rest.
      const KEEP_VERBATIM = 10;
      const VERBATIM_BODY_CHARS = 4000;
      const SUMMARY_BODY_CHARS = 240;

      const olderCount = Math.max(0, events.length - KEEP_VERBATIM);
      const olderEvents = olderCount > 0 ? events.slice(0, olderCount) : [];
      const recentEvents = olderCount > 0 ? events.slice(olderCount) : events;

      const fmtVerbatim = (e: ThreadEvent) => {
        const dir = e.direction === 'outbound'
          ? 'OUR REPLY (sent)'
          : `INBOUND${e.from ? ` from ${e.from}` : ''}`;
        const subj = e.subject ? `Subject: ${e.subject}\n` : '';
        const body = e.body.length > VERBATIM_BODY_CHARS
          ? e.body.slice(0, VERBATIM_BODY_CHARS) + ' …[truncated]'
          : e.body;
        const date = e.ts ? new Date(e.ts).toISOString() : 'unknown date';
        return `[${date}] ${dir}\n${subj}${body}`;
      };

      const fmtSummary = (e: ThreadEvent) => {
        const dir = e.direction === 'outbound'
          ? 'we replied'
          : `inbound${e.from ? ` from ${e.from}` : ''}`;
        const date = e.ts ? new Date(e.ts).toISOString().slice(0, 10) : 'unknown';
        const oneLine = e.body.replace(/\s+/g, ' ').trim().slice(0, SUMMARY_BODY_CHARS);
        return `- [${date}] ${dir}: ${oneLine}`;
      };

      const parts: string[] = [];
      if (olderEvents.length) {
        parts.push(
          `EARLIER IN THIS CONVERSATION (${olderEvents.length} older message${olderEvents.length === 1 ? '' : 's'}, summarized — oldest first):\n` +
          olderEvents.map(fmtSummary).join('\n')
        );
      }
      parts.push(
        `${headerLabel} — last ${recentEvents.length} message${recentEvents.length === 1 ? '' : 's'} verbatim, oldest first (use this so you do not repeat info or contradict yourself):\n` +
        recentEvents.map(fmtVerbatim).join('\n---\n')
      );
      sections.push(parts.join('\n\n'));
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
    const response = await chatCreate({
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
