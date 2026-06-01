#!/usr/bin/env tsx
/**
 * Regression tests for the draft URL guard.
 *
 * Run with: npx tsx scripts/test-draft-url-guard.ts
 *
 * Locks in the behavior that protects outgoing AI drafts from fabricated
 * internal/webhook links. Pure function — no external services contacted.
 * Exits non-zero on failure.
 */
import { sanitizeDraftUrls, mapToAllowedPath, containsBadSiteUrl } from '../server/draft-url-guard.js';

const SITE = 'https://earmuffsgemach.com';

type Result = { name: string; ok: boolean; err?: string };
const results: Result[] = [];

function test(name: string, fn: () => void): void {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (e) {
    results.push({ name, ok: false, err: e instanceof Error ? e.message : String(e) });
  }
}

function assertEq(actual: unknown, expected: unknown, msg?: string): void {
  if (actual !== expected) {
    throw new Error(`${msg ? msg + ': ' : ''}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

// ---- mapToAllowedPath ----
test('mapToAllowedPath keeps allowlisted paths', () => {
  assertEq(mapToAllowedPath('/apply'), '/apply');
  assertEq(mapToAllowedPath('/locations'), '/locations');
  assertEq(mapToAllowedPath('/operator/login'), '/operator/login');
  assertEq(mapToAllowedPath('/'), '/');
});

test('mapToAllowedPath remaps internal/webhook apply path to /apply', () => {
  assertEq(mapToAllowedPath('/api/webhooks/twilio/apply'), '/apply');
});

test('mapToAllowedPath falls back to home for unknown/internal paths', () => {
  assertEq(mapToAllowedPath('/api/webhooks/twilio/inbound'), '/');
  assertEq(mapToAllowedPath('/n/twilio/inbound'), '/');
});

test('mapToAllowedPath strips trailing punctuation and query', () => {
  assertEq(mapToAllowedPath('/apply.'), '/apply');
  assertEq(mapToAllowedPath('/apply?ref=email'), '/apply');
  assertEq(mapToAllowedPath('/locations/'), '/locations');
});

test('mapToAllowedPath corrects non-KEY-URL pages to homepage', () => {
  // Real routes exist, but the AI is only allowed to link the KEY URLs, so
  // anything else is corrected/removed.
  assertEq(mapToAllowedPath('/privacy-policy'), '/');
  assertEq(mapToAllowedPath('/terms'), '/');
  assertEq(mapToAllowedPath('/sms-policy'), '/');
  assertEq(mapToAllowedPath('/welcome/abc-token'), '/');
});

test('mapToAllowedPath preserves the /status transaction sub-path/token', () => {
  assertEq(mapToAllowedPath('/status'), '/status');
  assertEq(mapToAllowedPath('/status/12345'), '/status/12345');
});

test('mapToAllowedPath collapses any operator path to /operator/login', () => {
  assertEq(mapToAllowedPath('/operator/login'), '/operator/login');
  assertEq(mapToAllowedPath('/operator/dashboard'), '/operator/login');
  assertEq(mapToAllowedPath('/operator'), '/operator/login');
});

// ---- sanitizeDraftUrls ----
test('rewrites the exact reported bad link to /apply', () => {
  const draft = 'Please apply here: https://earmuffsgemach.com/api/webhooks/twilio/apply thanks!';
  const out = sanitizeDraftUrls(draft, SITE);
  assertEq(out, 'Please apply here: https://earmuffsgemach.com/apply thanks!');
});

test('remaps a URL with a %0A (percent-encoded newline) spliced into the path', () => {
  const draft = 'Apply: https://earmuffsgemach.com/ap%0Ai/webhooks/twilio/apply';
  const out = sanitizeDraftUrls(draft, SITE);
  assertEq(out, 'Apply: https://earmuffsgemach.com/apply');
});

test('preserves paragraph breaks immediately after a URL', () => {
  const draft = 'Rules here: https://earmuffsgemach.com/rules\n\nABOUT THE DEPOSIT\n- A small $20 deposit.';
  assertEq(sanitizeDraftUrls(draft, SITE), draft);
});

test('preserves a single newline after a URL', () => {
  const draft = 'See https://earmuffsgemach.com/contact.\nThanks!';
  assertEq(sanitizeDraftUrls(draft, SITE), draft);
});

test('does not clobber our domain inside an email address', () => {
  const draft = 'Email support@earmuffsgemach.com please.';
  assertEq(sanitizeDraftUrls(draft, SITE), draft);
});

test('does not match our host inside a superstring domain', () => {
  const draft = 'Beware of https://notearmuffsgemach.com/path scams.';
  assertEq(sanitizeDraftUrls(draft, SITE), draft);
});

test('does not swallow a longer domain that starts with our host', () => {
  const draft = 'Phishing site earmuffsgemach.com.evil.com is fake.';
  assertEq(sanitizeDraftUrls(draft, SITE), draft);
});

test('sanitizes an internal URL that carries an explicit port', () => {
  const draft = 'Apply: https://earmuffsgemach.com:443/api/webhooks/twilio/apply';
  assertEq(sanitizeDraftUrls(draft, SITE), 'Apply: https://earmuffsgemach.com/apply');
});

test('leaves a correct public link untouched', () => {
  const draft = 'Find a gemach at https://earmuffsgemach.com/locations near you.';
  assertEq(sanitizeDraftUrls(draft, SITE), draft);
});

test('preserves trailing sentence punctuation on a good link', () => {
  const draft = 'See https://earmuffsgemach.com/rules.';
  assertEq(sanitizeDraftUrls(draft, SITE), 'See https://earmuffsgemach.com/rules.');
});

test('does not swallow prose after a bare domain mention', () => {
  const draft = 'You can visit earmuffsgemach.com to learn more.';
  assertEq(sanitizeDraftUrls(draft, SITE), 'You can visit https://earmuffsgemach.com to learn more.');
});

test('normalizes www and missing scheme', () => {
  const draft = 'Apply at www.earmuffsgemach.com/apply';
  assertEq(sanitizeDraftUrls(draft, SITE), 'Apply at https://earmuffsgemach.com/apply');
});

test('rewrites unknown internal path to homepage', () => {
  const draft = 'Webhook: https://earmuffsgemach.com/api/webhooks/twilio/inbound';
  assertEq(sanitizeDraftUrls(draft, SITE), 'Webhook: https://earmuffsgemach.com');
});

test('leaves other domains (manufacturer) untouched', () => {
  const draft = 'Brand info: https://babybanz.com/products';
  assertEq(sanitizeDraftUrls(draft, SITE), draft);
});

test('rewrites a host-less bare internal path to the correct public route', () => {
  const draft = 'Please use /api/webhooks/twilio/apply here.';
  assertEq(sanitizeDraftUrls(draft, SITE), 'Please use /apply here.');
});

test('drops a host-less bare webhook path to homepage', () => {
  const draft = 'Webhook lives at /n/twilio/inbound now.';
  assertEq(sanitizeDraftUrls(draft, SITE), 'Webhook lives at / now.');
});

test('leaves a legitimate bare public path in prose untouched', () => {
  const draft = 'Just go to /apply and fill the form.';
  assertEq(sanitizeDraftUrls(draft, SITE), draft);
});

test('does not touch incidental slashes (dates, and/or, words like /news)', () => {
  const draft = 'Meeting 12/25 and/or later; read the /news section.';
  assertEq(sanitizeDraftUrls(draft, SITE), draft);
});

test('does not match a bare internal prefix inside a larger word path', () => {
  const draft = 'See /administrator-guide and /apixyz pages.';
  assertEq(sanitizeDraftUrls(draft, SITE), draft);
});

test('does not match a bare internal prefix split by _ or - boundary', () => {
  const draft = 'Endpoints /api_v2 and /api-v2 are separate.';
  assertEq(sanitizeDraftUrls(draft, SITE), draft);
});

test('handles multiple links in one draft', () => {
  const draft = 'Find: https://earmuffsgemach.com/locations and apply: https://earmuffsgemach.com/api/webhooks/twilio/apply';
  assertEq(
    sanitizeDraftUrls(draft, SITE),
    'Find: https://earmuffsgemach.com/locations and apply: https://earmuffsgemach.com/apply',
  );
});

// ---- containsBadSiteUrl ----
test('containsBadSiteUrl detects internal link', () => {
  assert(containsBadSiteUrl('see https://earmuffsgemach.com/api/webhooks/twilio/apply', SITE), 'should detect bad link');
});

test('containsBadSiteUrl is false for clean text and clean links', () => {
  assert(!containsBadSiteUrl('Apply at https://earmuffsgemach.com/apply', SITE), 'clean link should pass');
  assert(!containsBadSiteUrl('No links here at all.', SITE), 'no-link text should pass');
});

// ---- report ----
let failed = 0;
for (const r of results) {
  if (r.ok) {
    console.log(`  \u2713 ${r.name}`);
  } else {
    failed++;
    console.error(`  \u2717 ${r.name}\n      ${r.err}`);
  }
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed > 0 ? 1 : 0);
