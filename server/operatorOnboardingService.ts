// Task #35 — Operator onboarding service.
// Wraps Twilio SMS+WhatsApp sends and the storage updates that record results.
// Routes call into this so the HTTP layer stays thin.

import crypto from 'node:crypto';
import { storage } from './storage.js';
import {
  buildOperatorWelcomeMessageBody,
  getTwilioConfigStatus,
  getTwilioWhatsAppConfigStatus,
  sendOperatorWelcome,
  type OperatorWelcomeChannelResult,
} from './twilio-client.js';
import type { Location, OperatorWelcomeChannel } from '../shared/schema.js';

export interface SendWelcomeOptions {
  channel: OperatorWelcomeChannel; // 'sms' | 'whatsapp' | 'both'
  baseUrl: string; // e.g. https://app.example.com (no trailing slash required)
  signOff?: string;
  rememberAsDefault?: boolean;
  /** If set, Twilio will POST per-message delivery updates to this URL. */
  statusCallbackUrl?: string;
}

export interface SendWelcomeResult {
  locationId: number;
  locationName: string;
  channel: OperatorWelcomeChannel;
  sms?: OperatorWelcomeChannelResult;
  whatsapp?: OperatorWelcomeChannelResult;
  /** True iff every requested channel succeeded. */
  ok: boolean;
  /** Reason this location was skipped without an attempt (e.g. inactive). */
  skipped?: string;
  claimUrl?: string;
}

/** Detects the operator's preferred message language from their location row. */
function detectLanguage(loc: Location): 'en' | 'he' {
  // We treat "has Hebrew name fields" as the strongest hint, since the seed
  // data fills nameHe for Israel locations only.
  if (loc.nameHe || loc.addressHe || loc.contactPersonHe) {
    return 'he';
  }
  return 'en';
}

function generateClaimToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}

export function buildClaimUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/$/, '')}/welcome/${encodeURIComponent(token)}`;
}

/**
 * Builds the EN+HE preview text for a location. Useful for the admin's
 * confirm-before-send dialog so they can see exactly what will be sent.
 */
export interface WelcomePreview {
  location: { id: number; name: string; locationCode: string };
  language: 'en' | 'he';
  message: {
    en: { subject: string; body: string };
    he: { subject: string; body: string };
    resolvedLanguage: 'en' | 'he';
  };
  welcomeUrl: string;
}

export async function buildWelcomePreview(loc: Location, baseUrl: string, signOff?: string): Promise<WelcomePreview> {
  // Show the REAL outgoing claim URL in the preview so admins see exactly
  // what each operator will see. Tokens are durable + reusable per spec, so
  // allocating early (before the admin actually clicks Send) is safe — the
  // same token will be reused by sendWelcomeForLocation if/when the admin
  // does send.
  const ensured = loc.claimToken
    ? { token: loc.claimToken }
    : await storage.ensureLocationClaimToken(loc.id, generateClaimToken);
  const claimUrlPreview = buildClaimUrl(baseUrl, ensured.token);
  const language = detectLanguage(loc);
  const enBody = buildOperatorWelcomeMessageBody({
    locationName: loc.name,
    locationCode: loc.locationCode,
    claimUrl: claimUrlPreview,
    language: 'en',
    defaultPin: loc.operatorPin || '1234',
    signOff,
  });
  const heBody = buildOperatorWelcomeMessageBody({
    locationName: loc.nameHe || loc.name,
    locationCode: loc.locationCode,
    claimUrl: claimUrlPreview,
    language: 'he',
    defaultPin: loc.operatorPin || '1234',
    signOff,
  });
  return {
    location: { id: loc.id, name: loc.name, locationCode: loc.locationCode },
    language,
    message: {
      en: { subject: `Welcome to Baby Banz Earmuffs Gemach (${loc.locationCode})`, body: enBody },
      he: { subject: `ברוכים הבאים לגמ״ח אטמי בייבי בנז (${loc.locationCode})`, body: heBody },
      resolvedLanguage: language,
    },
    welcomeUrl: claimUrlPreview,
  };
}

/** Fires the welcome message(s) for a single location and records the outcome. */
export async function sendWelcomeForLocation(
  locationId: number,
  options: SendWelcomeOptions,
): Promise<SendWelcomeResult> {
  const loc = await storage.getLocation(locationId);
  if (!loc) {
    return { locationId, locationName: `#${locationId}`, channel: options.channel, ok: false, skipped: 'not found' };
  }
  if (loc.isActive === false) {
    return { locationId, locationName: loc.name, channel: options.channel, ok: false, skipped: 'inactive' };
  }
  if (!loc.phone) {
    return { locationId, locationName: loc.name, channel: options.channel, ok: false, skipped: 'no phone on file' };
  }
  if (!loc.locationCode) {
    return { locationId, locationName: loc.name, channel: options.channel, ok: false, skipped: 'no location code' };
  }

  const language = detectLanguage(loc);
  // Tokens are durable forever — only regenerate if the row literally has no
  // token yet. This is the spec: re-sends use the same link, and the public
  // endpoints short-circuit "already onboarded" rather than expiring links.
  const ensured = await storage.ensureLocationClaimToken(loc.id, generateClaimToken);
  const claimUrl = buildClaimUrl(options.baseUrl, ensured.token);
  const localizedName = language === 'he' ? (loc.nameHe || loc.name) : loc.name;

  const requested = {
    sms: options.channel === 'sms' || options.channel === 'both',
    whatsapp: options.channel === 'whatsapp' || options.channel === 'both',
  };

  const results = await sendOperatorWelcome(
    {
      toPhone: loc.phone,
      locationName: localizedName,
      locationCode: loc.locationCode,
      claimUrl,
      language,
      defaultPin: loc.operatorPin || '1234',
      signOff: options.signOff,
      statusCallbackUrl: options.statusCallbackUrl,
    },
    requested,
  );

  await storage.recordOperatorWelcomeAttempt(loc.id, {
    sms: requested.sms ? { ok: !!results.sms?.ok, error: results.sms?.error, sid: results.sms?.sid } : undefined,
    whatsapp: requested.whatsapp ? { ok: !!results.whatsapp?.ok, error: results.whatsapp?.error, sid: results.whatsapp?.sid } : undefined,
    defaultWelcomeChannel: options.rememberAsDefault ? options.channel : undefined,
  });

  const ok = (!requested.sms || !!results.sms?.ok) && (!requested.whatsapp || !!results.whatsapp?.ok);
  return {
    locationId: loc.id,
    locationName: loc.name,
    channel: options.channel,
    sms: results.sms,
    whatsapp: results.whatsapp,
    ok,
    claimUrl,
  };
}

/**
 * Server-side serial bulk send with light rate-limiting (default ~5 sends/sec).
 * Twilio enforces account-wide MPS limits; we stay well under the trial cap.
 */
export async function sendWelcomeForLocations(
  ids: number[],
  options: SendWelcomeOptions & { gapMs?: number },
): Promise<SendWelcomeResult[]> {
  const gap = Math.max(0, options.gapMs ?? 200);
  const out: SendWelcomeResult[] = [];
  for (const id of ids) {
    const r = await sendWelcomeForLocation(id, options);
    out.push(r);
    if (gap > 0) await new Promise((res) => setTimeout(res, gap));
  }
  return out;
}

export function summarizeResults(results: SendWelcomeResult[]) {
  const sent = results.filter((r) => r.ok && !r.skipped).length;
  const failed = results.filter((r) => !r.ok && !r.skipped).length;
  const skipped = results.filter((r) => !!r.skipped).length;
  return { sent, failed, skipped, total: results.length };
}

export function getOnboardingTwilioStatus() {
  return {
    sms: getTwilioConfigStatus(),
    whatsapp: getTwilioWhatsAppConfigStatus(),
  };
}

/**
 * Ingest a Twilio status callback (form-encoded) and update the cached
 * delivery state on whichever location row owns the matching SID. Returns
 * a small summary for logging/route response.
 */
export async function ingestTwilioStatusCallback(body: Record<string, any>): Promise<{
  matched: boolean;
  channel?: 'sms' | 'whatsapp';
  status?: string;
}> {
  const sid = String(body?.MessageSid || body?.SmsSid || '').trim();
  const rawStatus = String(body?.MessageStatus || body?.SmsStatus || '').toLowerCase().trim();
  if (!sid || !rawStatus) return { matched: false };
  const errorMessage = body?.ErrorMessage ? String(body.ErrorMessage) : (body?.ErrorCode ? `Twilio error ${body.ErrorCode}` : undefined);
  // Twilio sends `whatsapp:+...` in the From field for WhatsApp messages.
  const channel: 'sms' | 'whatsapp' = String(body?.From || '').startsWith('whatsapp:') ? 'whatsapp' : 'sms';
  // Try the inferred channel first; if no row matches, try the other channel
  // (we only know it for sure once a row matches the sid).
  let updated = await storage.updateWelcomeDeliveryStatus(sid, channel, rawStatus, errorMessage);
  if (!updated) {
    const other: 'sms' | 'whatsapp' = channel === 'sms' ? 'whatsapp' : 'sms';
    updated = await storage.updateWelcomeDeliveryStatus(sid, other, rawStatus, errorMessage);
    if (updated) return { matched: true, channel: other, status: rawStatus };
  }
  return { matched: !!updated, channel, status: rawStatus };
}
