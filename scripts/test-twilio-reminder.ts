#!/usr/bin/env tsx
/**
 * Unit tests for the Twilio return-reminder helpers.
 *
 * Run with: npx tsx scripts/test-twilio-reminder.ts
 *
 * Locks in:
 *  - Config detection (missing/partial/malformed env -> not configured).
 *  - Phone normalization (rejects garbage, keeps valid +country numbers).
 *  - Bilingual SMS body (short, includes location name + first name + URL).
 *
 * No network calls. Exits non-zero on failure.
 */

import {
  getTwilioConfigStatus,
  normalizePhoneForSms,
  buildReturnReminderSmsBody,
} from "../server/twilio-client.js";

let failures = 0;
function check(cond: any, label: string) {
  if (!cond) {
    console.error(`FAIL: ${label}`);
    failures++;
  } else {
    console.log(`ok:   ${label}`);
  }
}

function withEnv(env: Record<string, string | undefined>, fn: () => void) {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) {
    prev[k] = process.env[k];
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  try { fn(); } finally {
    for (const k of Object.keys(prev)) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  }
}

// --- Config status ----------------------------------------------------------
withEnv({ TWILIO_ACCOUNT_SID: undefined, TWILIO_AUTH_TOKEN: undefined, TWILIO_FROM_NUMBER: undefined }, () => {
  const s = getTwilioConfigStatus();
  check(!s.configured, "missing all secrets -> not configured");
  check(typeof s.reason === "string" && s.reason.includes("TWILIO"), "missing secrets -> reason mentions env vars");
});

withEnv({ TWILIO_ACCOUNT_SID: "AC123", TWILIO_AUTH_TOKEN: "secret", TWILIO_FROM_NUMBER: "" }, () => {
  check(!getTwilioConfigStatus().configured, "missing TWILIO_FROM_NUMBER -> not configured");
});

withEnv({ TWILIO_ACCOUNT_SID: "not-an-ac", TWILIO_AUTH_TOKEN: "secret", TWILIO_FROM_NUMBER: "+15551234567" }, () => {
  const s = getTwilioConfigStatus();
  check(!s.configured, "non-AC SID is rejected");
  check(s.reason?.includes('AC'), 'non-AC SID -> reason explains "AC" prefix');
});

withEnv({ TWILIO_ACCOUNT_SID: "AC1234567890abcdef", TWILIO_AUTH_TOKEN: "secret", TWILIO_FROM_NUMBER: "+15551234567" }, () => {
  check(getTwilioConfigStatus().configured, "valid env -> configured");
});

// --- Phone normalization ----------------------------------------------------
check(normalizePhoneForSms(null) === null, "null phone -> null");
check(normalizePhoneForSms("") === null, "empty phone -> null");
check(normalizePhoneForSms("123") === null, "very short phone -> null (won't reach Twilio)");
check(normalizePhoneForSms("(555) 123-4567") === "+15551234567", "10-digit bare US number auto-prefixed to +1 E.164");
check(normalizePhoneForSms("1-555-123-4567") === "+15551234567", "11-digit US with leading 1 normalized to E.164");
check(normalizePhoneForSms("+1 (555) 123-4567") === "+15551234567", "+country preserved");
check(normalizePhoneForSms("+972-50-123-4567") === "+972501234567", "Israeli +country preserved");
check(normalizePhoneForSms("0501234567") === null, "ambiguous local Israeli format rejected (operator must add +972)");
check(normalizePhoneForSms("+1") === null, "+ followed by too few digits rejected");
check(normalizePhoneForSms("+1234567890123456") === null, "more than 15 digits rejected (E.164 max)");

// --- SMS body ---------------------------------------------------------------
const dueDate = new Date(2026, 3, 28); // Apr 28, 2026 (month is 0-indexed)
const enBody = buildReturnReminderSmsBody({
  borrowerName: "Sara Goldberg",
  borrowerPhone: "+15551234567",
  locationName: "Lakewood",
  language: "en",
  dueDate,
  statusUrl: "https://example.com/status/42?token=abc",
});
check(enBody.startsWith("Hi Sara,"), "EN body uses first name only");
check(enBody.includes("Lakewood"), "EN body includes location name");
check(enBody.toLowerCase().includes("earmuffs"), "EN body names the borrowed item");
check(/Apr\s*28/.test(enBody), "EN body includes the formatted due date");
check(enBody.includes("https://example.com/status/42?token=abc"), "EN body includes status URL when provided");
check(enBody.length < 320, "EN body stays under ~2 SMS segments");

const heBody = buildReturnReminderSmsBody({
  borrowerName: "שרה גולדברג",
  borrowerPhone: "+972501234567",
  locationName: "לייקווד",
  language: "he",
  dueDate,
});
check(heBody.startsWith("שלום שרה"), "HE body uses Hebrew greeting + first name");
check(heBody.includes("לייקווד"), "HE body includes Hebrew location name");
check(heBody.includes("האוזניות"), "HE body names the borrowed item");
check(heBody.includes("28"), "HE body includes the day-of-month from the due date");
check(!heBody.includes("https://"), "HE body without statusUrl omits the URL line");
check(heBody.length < 320, "HE body stays under ~2 SMS segments");

// Body without due date stays valid (older transactions / missing data).
const enBodyNoDate = buildReturnReminderSmsBody({
  borrowerName: "Anon",
  borrowerPhone: "+15551112222",
  locationName: "Brooklyn",
  language: "en",
});
check(enBodyNoDate.includes("earmuffs"), "EN body still mentions item when due date is missing");
check(!/\(due/.test(enBodyNoDate), "EN body omits '(due …)' phrase when due date is missing");

if (failures > 0) {
  console.error(`\n${failures} test(s) failed.`);
  process.exit(1);
}
console.log(`\nAll twilio-reminder tests passed.`);
