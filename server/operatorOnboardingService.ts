// Task #35 — Operator onboarding service.
// Wraps Twilio SMS + Email sends and the storage updates that record results.
// Routes call into this so the HTTP layer stays thin.

import crypto from 'node:crypto';
import { storage } from './storage.js';
import {
  buildOperatorWelcomeMessageBody,
  getTwilioConfigStatus,
  getTwilioWhatsAppConfigStatus,
  sendOperatorWelcome,
  sendOperatorWelcomeWhatsApp,
  type OperatorWelcomeChannelResult,
} from './twilio-client.js';
import { sendOperatorWelcomeEmail, buildWelcomeEmailBody } from './email-notifications.js';
import { getGmailConfigStatus } from './gmail-client.js';
import type { Location, OperatorWelcomeChannel } from '../shared/schema.js';

export interface SendWelcomeOptions {
  channel: OperatorWelcomeChannel; // 'sms' | 'email' | 'both'
  baseUrl: string; // e.g. https://app.example.com (no trailing slash required)
  signOff?: string;
  rememberAsDefault?: boolean;
  /** If set, Twilio will POST per-message delivery updates to this URL. */
  statusCallbackUrl?: string;
  /** Optional admin-edited message body. If provided, overrides the template for single sends. */
  messageBody?: string;
}

export interface SendWelcomeResult {
  locationId: number;
  locationName: string;
  channel: OperatorWelcomeChannel;
  sms?: OperatorWelcomeChannelResult;
  whatsapp?: OperatorWelcomeChannelResult;
  email?: OperatorWelcomeChannelResult;
  /** True iff every requested channel succeeded. */
  ok: boolean;
  /** Reason this location was skipped without an attempt (e.g. inactive). */
  skipped?: string;
  claimUrl?: string;
}

/**
 * Applies per-location token substitution to a message template string.
 * Supports: {{name}}, {{code}}, {{pin}}, {{url}}
 * If the template contains none of these tokens, it is returned verbatim
 * (single-send case where the admin typed fully custom text).
 */
function applyMessageTemplate(
  template: string,
  values: { name: string; code: string; pin: string; url: string },
): string {
  return template
    .replace(/\{\{name\}\}/gi, values.name)
    .replace(/\{\{code\}\}/gi, values.code)
    .replace(/\{\{pin\}\}/gi, values.pin)
    .replace(/\{\{url\}\}/gi, values.url);
}

/** Detects the operator's preferred message language from their location row. */
function detectLanguage(loc: Location): 'en' | 'he' {
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
    en: { subject: string; body: string; emailBody: string };
    he: { subject: string; body: string; emailBody: string };
    resolvedLanguage: 'en' | 'he';
  };
  welcomeUrl: string;
}

export async function buildWelcomePreview(loc: Location, baseUrl: string, signOff?: string): Promise<WelcomePreview> {
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
  const enEmailBody = buildWelcomeEmailBody({
    locationName: loc.name,
    locationCode: loc.locationCode,
    operatorName: loc.contactPerson || '',
    operatorEmail: loc.email || '',
    dashboardUrl: claimUrlPreview,
    defaultPin: loc.operatorPin || '1234',
  });
  const heEmailBody = buildWelcomeEmailBody({
    locationName: loc.nameHe || loc.name,
    locationCode: loc.locationCode,
    operatorName: loc.contactPersonHe || loc.contactPerson || '',
    operatorEmail: loc.email || '',
    dashboardUrl: claimUrlPreview,
    defaultPin: loc.operatorPin || '1234',
  });
  return {
    location: { id: loc.id, name: loc.name, locationCode: loc.locationCode },
    language,
    message: {
      en: {
        subject: `Welcome to Baby Banz Earmuffs Gemach (${loc.locationCode})`,
        body: enBody,
        emailBody: enEmailBody,
      },
      he: {
        subject: `ברוכים הבאים לגמ״ח אטמי בייבי בנז (${loc.locationCode})`,
        body: heBody,
        emailBody: heEmailBody,
      },
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
  if (!loc.locationCode) {
    return { locationId, locationName: loc.name, channel: options.channel, ok: false, skipped: 'no location code' };
  }

  const wantsSms = options.channel === 'sms' || options.channel === 'both';
  const wantsEmail = options.channel === 'email' || options.channel === 'both';
  const wantsWhatsapp = options.channel === 'whatsapp';

  // For 'both', skip if neither channel has the required contact info.
  if (options.channel === 'both' && !loc.phone && !loc.email) {
    return { locationId, locationName: loc.name, channel: options.channel, ok: false, skipped: 'no phone or email on file' };
  }
  if (options.channel === 'sms' && !loc.phone) {
    return { locationId, locationName: loc.name, channel: options.channel, ok: false, skipped: 'no phone on file' };
  }
  if (options.channel === 'email' && !loc.email) {
    return { locationId, locationName: loc.name, channel: options.channel, ok: false, skipped: 'no email on file' };
  }
  if (options.channel === 'whatsapp' && !loc.phone) {
    return { locationId, locationName: loc.name, channel: options.channel, ok: false, skipped: 'no phone on file' };
  }

  const language = detectLanguage(loc);
  const ensured = await storage.ensureLocationClaimToken(loc.id, generateClaimToken);
  const claimUrl = buildClaimUrl(options.baseUrl, ensured.token);
  const localizedName = language === 'he' ? (loc.nameHe || loc.name) : loc.name;

  let smsResult: OperatorWelcomeChannelResult | undefined;
  let whatsappResult: OperatorWelcomeChannelResult | undefined;
  let emailResult: OperatorWelcomeChannelResult | undefined;

  // Per-location substitution values — used when admin provides a {{placeholder}} template
  const templateValues = {
    name: localizedName,
    code: loc.locationCode,
    pin: loc.operatorPin || '1234',
    url: claimUrl,
  };

  const sharedCtx = {
    toPhone: loc.phone!,
    locationName: localizedName,
    locationCode: loc.locationCode,
    claimUrl,
    language,
    defaultPin: loc.operatorPin || '1234',
    signOff: options.signOff,
    statusCallbackUrl: options.statusCallbackUrl,
    customBody: options.messageBody
      ? applyMessageTemplate(options.messageBody, templateValues)
      : undefined,
  };

  if (wantsSms && loc.phone) {
    const smsResults = await sendOperatorWelcome(sharedCtx, { sms: true });
    smsResult = smsResults.sms;
  }

  if (wantsWhatsapp && loc.phone) {
    whatsappResult = await sendOperatorWelcomeWhatsApp(sharedCtx);
  }

  if (wantsEmail && loc.email) {
    try {
      const emailBody = options.messageBody
        ? applyMessageTemplate(options.messageBody, templateValues)
        : buildWelcomeEmailBody({
            locationName: localizedName,
            locationCode: loc.locationCode,
            operatorName: language === 'he' ? (loc.contactPersonHe || loc.contactPerson || '') : (loc.contactPerson || ''),
            operatorEmail: loc.email,
            dashboardUrl: claimUrl,
            defaultPin: loc.operatorPin || '1234',
          });
      await sendOperatorWelcomeEmail({
        locationName: localizedName,
        locationCode: loc.locationCode,
        operatorName: language === 'he' ? (loc.contactPersonHe || loc.contactPerson || '') : (loc.contactPerson || ''),
        operatorEmail: loc.email,
        dashboardUrl: claimUrl,
        defaultPin: loc.operatorPin || '1234',
        customBody: emailBody,
      });
      emailResult = { ok: true };
    } catch (e: any) {
      emailResult = { ok: false, error: e?.message || 'Email send failed' };
    }
  }

  // Record the attempt in storage
  await storage.recordOperatorWelcomeAttempt(loc.id, {
    sms: wantsSms && !!smsResult ? { ok: !!smsResult.ok, error: smsResult.error, sid: smsResult.sid } : undefined,
    whatsapp: wantsWhatsapp && !!whatsappResult ? { ok: !!whatsappResult.ok, error: whatsappResult.error, sid: whatsappResult.sid } : undefined,
    email: wantsEmail && !!emailResult ? { ok: !!emailResult.ok, error: emailResult.error } : undefined,
    defaultWelcomeChannel: options.rememberAsDefault ? options.channel : undefined,
  });

  const ok =
    (!wantsSms || !loc.phone || !!smsResult?.ok) &&
    (!wantsWhatsapp || !loc.phone || !!whatsappResult?.ok) &&
    (!wantsEmail || !loc.email || !!emailResult?.ok);

  return {
    locationId: loc.id,
    locationName: loc.name,
    channel: options.channel,
    sms: smsResult,
    whatsapp: whatsappResult,
    email: emailResult,
    ok,
    claimUrl,
  };
}

/**
 * Server-side serial bulk send with light rate-limiting (default ~5 sends/sec).
 * Twilio enforces account-wide MPS limits; we stay well under the trial cap.
 * messageBody (from options) is applied to every location in the batch.
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
  const gmailStatus = getGmailConfigStatus();
  const waStatus = getTwilioWhatsAppConfigStatus();
  return {
    sms: getTwilioConfigStatus(),
    email: { configured: gmailStatus.configured, reason: gmailStatus.configured ? undefined : gmailStatus.message },
    whatsapp: { configured: waStatus.configured, reason: waStatus.configured ? undefined : waStatus.reason },
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
  const channel: 'sms' | 'whatsapp' = String(body?.From || '').startsWith('whatsapp:') ? 'whatsapp' : 'sms';
  let updated = await storage.updateWelcomeDeliveryStatus(sid, channel, rawStatus, errorMessage);
  if (!updated) {
    const other: 'sms' | 'whatsapp' = channel === 'sms' ? 'whatsapp' : 'sms';
    updated = await storage.updateWelcomeDeliveryStatus(sid, other, rawStatus, errorMessage);
    if (updated) return { matched: true, channel: other, status: rawStatus };
  }
  return { matched: !!updated, channel, status: rawStatus };
}
