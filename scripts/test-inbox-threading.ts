#!/usr/bin/env tsx
/**
 * Inbox threading regression test.
 *
 * Run with: npx tsx scripts/test-inbox-threading.ts
 *
 * Locks in the behavior that powers the threaded admin inbox:
 * 1. Helper-level: subject normalization + list collapsing + memberIds.
 * 2. Integration: the real generateEmailResponse() — with storage and the
 *    OpenAI client stubbed in-process — pulls the FULL form-side thread
 *    into the AI context (threadHistoryCount === N siblings).
 *
 * No external services are contacted. Exits non-zero on failure.
 */
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || "sk-test-stub-key";

import { normalizeSubject, groupContactsByThread } from "../server/inbox-threading.js";
import { storage } from "../server/storage.js";
import { generateEmailResponse } from "../server/openai-client.js";
import { buildThreadSearchText } from "../server/gmail-client.js";
import type { Contact, ReplyExample, Transaction, GemachApplication, Location, PlaybookFact } from "../shared/schema.js";

// Build a fake Gmail Schema$Message with given headers + plaintext body.
function fakeGmailMessage(over: { from: string; subject: string; body: string }) {
  const bodyB64 = Buffer.from(over.body, "utf-8").toString("base64");
  return {
    payload: {
      headers: [
        { name: "From", value: over.from },
        { name: "Subject", value: over.subject },
      ],
      body: { data: bodyB64 },
    },
  } as Parameters<typeof buildThreadSearchText>[0][number];
}

type Result = { name: string; ok: boolean; err?: string };
const results: Result[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (e) {
    results.push({ name, ok: false, err: e instanceof Error ? e.message : String(e) });
  }
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function eq<T>(actual: T, expected: T, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label}\n  expected: ${e}\n  actual:   ${a}`);
}

function makeContact(over: Partial<Contact> & Pick<Contact, "id" | "email" | "subject">): Contact {
  return {
    id: over.id,
    name: over.name ?? "Sender",
    email: over.email,
    subject: over.subject,
    message: over.message ?? "body",
    submittedAt: (over.submittedAt as Date) ?? new Date("2026-01-01T00:00:00Z"),
    isRead: over.isRead ?? false,
    isArchived: over.isArchived ?? false,
    isSpam: over.isSpam ?? false,
  } as Contact;
}

// ---------- normalizeSubject ----------

test("normalizeSubject: strips Re: / Fwd: / Aw: / Tr: prefixes", () => {
  eq(normalizeSubject("Re: Need stroller"), "need stroller", "single Re:");
  eq(normalizeSubject("RE: Re: re: Need stroller"), "need stroller", "stacked Re:");
  eq(normalizeSubject("Fwd: Need stroller"), "need stroller", "Fwd:");
  eq(normalizeSubject("FWD: Re: Need stroller"), "need stroller", "Fwd: Re:");
  eq(normalizeSubject("Aw: Need stroller"), "need stroller", "Aw: (German)");
  eq(normalizeSubject("Tr: Need stroller"), "need stroller", "Tr: (French)");
});

test("normalizeSubject: collapses whitespace and lowercases", () => {
  eq(normalizeSubject("  Need   a   STROLLER  "), "need a stroller", "whitespace+case");
});

test("normalizeSubject: handles empty / nullish input", () => {
  eq(normalizeSubject(""), "", "empty");
  eq(normalizeSubject(null as unknown as string), "", "null");
  eq(normalizeSubject(undefined as unknown as string), "", "undefined");
});

test("normalizeSubject: leaves bare prefix-like words alone", () => {
  eq(normalizeSubject("Reading Group"), "reading group", "bare 'Reading'");
  eq(normalizeSubject("Awesome donation"), "awesome donation", "bare 'Awesome'");
});

// ---------- groupContactsByThread ----------

test("groupContactsByThread: collapses 3 messages into 1 row with full counts", () => {
  const contacts: Contact[] = [
    makeContact({
      id: 1,
      email: "user@example.com",
      subject: "Need stroller",
      submittedAt: new Date("2026-01-01T10:00:00Z"),
      isRead: true,
    }),
    makeContact({
      id: 2,
      email: "user@example.com",
      subject: "Re: Need stroller",
      submittedAt: new Date("2026-01-02T10:00:00Z"),
      isRead: false,
    }),
    makeContact({
      id: 3,
      email: "user@example.com",
      subject: "Fwd: Re: Need stroller",
      submittedAt: new Date("2026-01-03T10:00:00Z"),
      isRead: false,
    }),
  ];

  const groups = groupContactsByThread(contacts);

  assert(groups.length === 1, `expected 1 group, got ${groups.length}`);
  const g = groups[0];
  eq(g.messageCount, 3, "messageCount counts every sibling (full thread)");
  eq(g.unreadCount, 2, "unreadCount counts every unread sibling");
  eq(g.memberIds.sort(), [1, 2, 3], "memberIds includes every sibling so per-thread mutations are atomic");
  eq(g.latest.id, 3, "latest is the newest message");
  eq(g.key, "form::user@example.com::need stroller", "group key normalizes both email and subject");
});

test("groupContactsByThread: case-insensitive email comparison", () => {
  const contacts: Contact[] = [
    makeContact({
      id: 10,
      email: "User@Example.com",
      subject: "Borrow request",
      submittedAt: new Date("2026-02-01T10:00:00Z"),
    }),
    makeContact({
      id: 11,
      email: "user@example.COM",
      subject: "Re: Borrow request",
      submittedAt: new Date("2026-02-02T10:00:00Z"),
    }),
  ];
  const groups = groupContactsByThread(contacts);
  assert(groups.length === 1, `expected 1 group across mixed-case emails, got ${groups.length}`);
  eq(groups[0].messageCount, 2, "mixed-case sender still groups together");
});

test("groupContactsByThread: keeps DIFFERENT senders as separate threads", () => {
  const contacts: Contact[] = [
    makeContact({ id: 20, email: "alice@example.com", subject: "Stroller" }),
    makeContact({ id: 21, email: "bob@example.com", subject: "Stroller" }),
  ];
  const groups = groupContactsByThread(contacts);
  assert(groups.length === 2, `expected 2 groups for 2 senders, got ${groups.length}`);
});

test("groupContactsByThread: keeps DIFFERENT subjects as separate threads", () => {
  const contacts: Contact[] = [
    makeContact({ id: 30, email: "u@example.com", subject: "Need stroller" }),
    makeContact({ id: 31, email: "u@example.com", subject: "Need car seat" }),
  ];
  const groups = groupContactsByThread(contacts);
  assert(groups.length === 2, `expected 2 groups for 2 subjects, got ${groups.length}`);
});

test("groupContactsByThread: sorts groups newest-first by latest message", () => {
  const contacts: Contact[] = [
    makeContact({
      id: 40, email: "old@example.com", subject: "Old thread",
      submittedAt: new Date("2026-01-01T00:00:00Z"),
    }),
    makeContact({
      id: 41, email: "new@example.com", subject: "New thread",
      submittedAt: new Date("2026-03-01T00:00:00Z"),
    }),
  ];
  const groups = groupContactsByThread(contacts);
  eq(groups.map((g) => g.latest.id), [41, 40], "newest thread first");
});

test("groupContactsByThread: empty input → empty output", () => {
  eq(groupContactsByThread([]), [], "empty");
});

// ---------- buildThreadSearchText (Gmail thread search) ----------
// Mirrors the requirement for Task #31: the inbox search must surface a thread
// when a token only appears in an OLDER message of the conversation, not just
// the latest message rendered in the row. listEmailThreads concatenates every
// message's From+Subject+Body into a lowercased searchText blob the client
// uses for substring matching.

test("buildThreadSearchText: matches token from the OLDEST message in the thread", () => {
  const messages = [
    fakeGmailMessage({ from: "alice@example.com", subject: "Lulav order", body: "Hi, my deepneedle-token is here." }),
    fakeGmailMessage({ from: "admin@gemach.org", subject: "Re: Lulav order", body: "Reply 1" }),
    fakeGmailMessage({ from: "alice@example.com", subject: "Re: Lulav order", body: "thanks" }),
  ];
  const text = buildThreadSearchText(messages);
  assert(text.includes("deepneedle-token"), "token in oldest message must be searchable");
  assert(text.includes("alice@example.com"), "older sender header must be searchable");
});

test("buildThreadSearchText: lowercases everything for case-insensitive substring match", () => {
  const messages = [
    fakeGmailMessage({ from: "Bob <bob@x.com>", subject: "URGENT QUESTION", body: "MIXED Case Body" }),
  ];
  const text = buildThreadSearchText(messages);
  eq(text, text.toLowerCase(), "result must be all-lowercase");
  assert(text.includes("urgent question"), "lowercased subject must be in result");
  assert(text.includes("mixed case body"), "lowercased body must be in result");
});

test("buildThreadSearchText: empty input → empty string (safe for client substring check)", () => {
  eq(buildThreadSearchText([]), "", "no messages → empty string");
});

// ---------- AI form-thread sibling selection ----------
// Mirrors the gatherContext form branch in server/openai-client.ts: given
// the sender's contacts and the current message id, the AI must receive the
// other siblings (same normalized subject) so the prompt has full context.

function selectFormThreadSiblings(
  contacts: Contact[],
  currentMessageId: string | undefined,
  emailSubject: string,
): Contact[] {
  const normSubj = normalizeSubject(emailSubject);
  const currentId = currentMessageId ? Number(currentMessageId) : NaN;
  return contacts.filter((c) => normalizeSubject(c.subject) === normSubj && c.id !== currentId);
}

test("AI form-thread: selects siblings with normalized subject and excludes the current message", () => {
  const contacts: Contact[] = [
    makeContact({ id: 100, email: "u@example.com", subject: "Need stroller" }),
    makeContact({ id: 101, email: "u@example.com", subject: "Re: Need stroller" }),
    makeContact({ id: 102, email: "u@example.com", subject: "Fwd: Need stroller" }),
    makeContact({ id: 103, email: "u@example.com", subject: "Different topic" }),
  ];
  const siblings = selectFormThreadSiblings(contacts, "102", "Fwd: Need stroller");
  eq(siblings.map((c) => c.id).sort(), [100, 101], "AI sees prior siblings, not the current msg or unrelated subject");
});

// ---------- Integration: generateEmailResponse pulls the full form thread ----------
// Stubs storage + Location matching + retrieval so the test runs without a
// database or any network. The OpenAI call itself fails fast (fake key) and
// gatherContext returns its assembled context anyway — including
// `threadHistoryCount`, which is what we assert.

type StorageOverride = Partial<Record<keyof typeof storage, unknown>>;

function patchStorage(over: StorageOverride): () => void {
  const target = storage as unknown as Record<string, unknown>;
  const originals: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(over)) {
    originals[k] = target[k];
    target[k] = v;
  }
  return () => {
    for (const [k, v] of Object.entries(originals)) {
      target[k] = v;
    }
  };
}

async function runIntegration(): Promise<void> {
  const senderEmail = "borrower@example.com";
  const senderName = "Borrower";
  const seedSubject = "Re: Borrow request";
  const currentMessageId = "100";

  const siblings: Contact[] = [
    {
      id: 101, name: senderName, email: senderEmail,
      subject: "Borrow request",
      message: "Hi, can I borrow a stroller for next Tuesday?",
      submittedAt: new Date("2026-01-01T10:00:00Z"),
      isRead: true, isArchived: false, isSpam: false,
    },
    {
      id: 102, name: senderName, email: senderEmail,
      subject: "Re: Borrow request",
      message: "Adding: I also need a car seat if possible.",
      submittedAt: new Date("2026-01-02T10:00:00Z"),
      isRead: true, isArchived: false, isSpam: false,
    },
    // The current incoming message — must be excluded from prior thread.
    {
      id: Number(currentMessageId), name: senderName, email: senderEmail,
      subject: seedSubject,
      message: "Just checking in — any update on availability?",
      submittedAt: new Date("2026-01-03T10:00:00Z"),
      isRead: false, isArchived: false, isSpam: false,
    },
  ];

  const restore = patchStorage({
    getContactsByEmail: async (e: string) =>
      e.toLowerCase() === senderEmail ? siblings : [],
    getReplyExamplesBySender: async (): Promise<ReplyExample[]> => [],
    getReplyExamplesByRef: async (): Promise<ReplyExample[]> => [],
    getTransactionsByEmail: async (): Promise<Transaction[]> => [],
    getAllApplications: async (): Promise<GemachApplication[]> => [],
    getAllLocations: async (): Promise<Location[]> => [],
    getAllPlaybookFacts: async (): Promise<PlaybookFact[]> => [],
  } as StorageOverride);

  try {
    const result = await generateEmailResponse(
      seedSubject,
      "Just checking in — any update on availability?",
      senderName,
      senderEmail,
      undefined,           // no Gmail threadId — exercises the form-thread branch
      currentMessageId,
    );

    test("generateEmailResponse: form-thread context includes both prior siblings", () => {
      assert(
        result.threadHistoryCount === 2,
        `expected threadHistoryCount=2 (the two prior siblings), got ${result.threadHistoryCount}`,
      );
    });
  } finally {
    restore();
  }

  // Same fixtures, but now mark the current message as the only one — the
  // AI must NOT find a thread to pull from (count goes to 0).
  const restore2 = patchStorage({
    getContactsByEmail: async (e: string) =>
      e.toLowerCase() === senderEmail ? [siblings[2]] : [],
    getReplyExamplesBySender: async (): Promise<ReplyExample[]> => [],
    getReplyExamplesByRef: async (): Promise<ReplyExample[]> => [],
    getTransactionsByEmail: async (): Promise<Transaction[]> => [],
    getAllApplications: async (): Promise<GemachApplication[]> => [],
    getAllLocations: async (): Promise<Location[]> => [],
    getAllPlaybookFacts: async (): Promise<PlaybookFact[]> => [],
  } as StorageOverride);

  try {
    const lone = await generateEmailResponse(
      seedSubject,
      "Just checking in.",
      senderName,
      senderEmail,
      undefined,
      currentMessageId,
    );
    test("generateEmailResponse: zero prior siblings → threadHistoryCount=0", () => {
      assert(
        lone.threadHistoryCount === 0,
        `expected threadHistoryCount=0 with no siblings, got ${lone.threadHistoryCount}`,
      );
    });
  } finally {
    restore2();
  }
}

await runIntegration();

// ---------- Print results ----------

let failed = 0;
for (const r of results) {
  if (r.ok) console.log(`  PASS  ${r.name}`);
  else {
    failed += 1;
    console.log(`  FAIL  ${r.name}`);
    if (r.err) console.log(`        ${r.err.split("\n").join("\n        ")}`);
  }
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
