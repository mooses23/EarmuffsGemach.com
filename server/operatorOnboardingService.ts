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
  channel: OperatorWelcomeChannel; // 'sms' | 'email' | 'both' | 'whatsapp'
  baseUrl: string; // e.g. https://app.example.com (no trailing slash required)
  signOff?: string;
  rememberAsDefault?: boolean;
  /** If set, Twilio will POST per-message delivery updates to this URL. */
  statusCallbackUrl?: string;
  /**
   * Optional admin-edited message body (template string with {{name}}, {{code}}, {{pin}}, {{url}} tokens).
   * Only used when customMessage === true. Ignored otherwise — the service builds the body from its own template.
   */
  messageBody?: string;
  /**
   * When true, use messageBody (with per-recipient token substitution) instead of the built-in template.
   * When false or omitted, the service generates the message body from its own template.
   */
  customMessage?: boolean;
  /** UUID shared by all sends in a single bulk operation (used for grouping in the log). */
  batchId?: string;
  /** Admin user id who triggered the send. */
  sentByUserId?: number;
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

/**
 * Detects the operator's preferred message language.
 * Returns 'he' only when the location belongs to an Israel region;
 * defaults to English for every other region.
 */
async function detectLanguage(loc: Location): Promise<'en' | 'he'> {
  try {
    const region = await storage.getRegion(loc.regionId);
    if (region && /israel/i.test(region.name + ' ' + (region.slug ?? ''))) {
      return 'he';
    }
  } catch {
    // Fall through to English on any storage error
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
  const loginUrlPreview = `${baseUrl.replace(/\/$/, '')}/auth`;
  const language = await detectLanguage(loc);
  const enBody = buildOperatorWelcomeMessageBody({
    locationName: loc.name,
    locationCode: loc.locationCode,
    locationId: loc.id,
    operatorName: loc.contactPerson || '',
    claimUrl: claimUrlPreview,
    loginUrl: loginUrlPreview,
    language: 'en',
    defaultPin: loc.operatorPin || '1234',
    signOff,
  });
  const heBody = buildOperatorWelcomeMessageBody({
    locationName: loc.nameHe || loc.name,
    locationCode: loc.locationCode,
    locationId: loc.id,
    operatorName: loc.contactPersonHe || loc.contactPerson || '',
    claimUrl: claimUrlPreview,
    loginUrl: loginUrlPreview,
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
    language: 'en',
  });
  const heEmailBody = buildWelcomeEmailBody({
    locationName: loc.nameHe || loc.name,
    locationCode: loc.locationCode,
    operatorName: loc.contactPersonHe || loc.contactPerson || '',
    operatorEmail: loc.email || '',
    dashboardUrl: claimUrlPreview,
    defaultPin: loc.operatorPin || '1234',
    language: 'he',
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

  // Helper: log a skipped entry without throwing
  const logSkipped = async (reason: string) => {
    try {
      await storage.createMessageSendLog({
        locationId: loc.id,
        locationName: loc.name,
        locationCode: loc.locationCode,
        channel: options.channel === 'both' ? 'sms' : options.channel,
        status: 'skipped',
        error: reason,
        sentByUserId: options.sentByUserId ?? null,
        batchId: options.batchId ?? null,
      });
    } catch { /* non-fatal */ }
  };

  // For 'both', skip if neither channel has the required contact info.
  if (options.channel === 'both' && !loc.phone && !loc.email) {
    await logSkipped('no phone or email on file');
    return { locationId, locationName: loc.name, channel: options.channel, ok: false, skipped: 'no phone or email on file' };
  }
  if (options.channel === 'sms' && !loc.phone) {
    await logSkipped('no phone on file');
    return { locationId, locationName: loc.name, channel: options.channel, ok: false, skipped: 'no phone on file' };
  }
  if (options.channel === 'email' && !loc.email) {
    await logSkipped('no email on file');
    return { locationId, locationName: loc.name, channel: options.channel, ok: false, skipped: 'no email on file' };
  }
  if (options.channel === 'whatsapp' && !loc.phone) {
    await logSkipped('no phone on file');
    return { locationId, locationName: loc.name, channel: options.channel, ok: false, skipped: 'no phone on file' };
  }

  const language = await detectLanguage(loc);
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

  // Only use the admin-supplied body when it was explicitly marked as custom.
  // For template (unedited) sends the service builds the body itself.
  const resolvedCustomBody =
    options.customMessage && options.messageBody
      ? applyMessageTemplate(options.messageBody, templateValues)
      : undefined;

  const loginUrl = `${options.baseUrl.replace(/\/$/, '')}/auth`;

  const operatorName = language === 'he'
    ? (loc.contactPersonHe || loc.contactPerson || '')
    : (loc.contactPerson || '');

  const sharedCtx = {
    toPhone: loc.phone!,
    locationName: localizedName,
    locationCode: loc.locationCode,
    locationId: loc.id,
    operatorName,
    claimUrl,
    loginUrl,
    language,
    defaultPin: loc.operatorPin || '1234',
    signOff: options.signOff,
    statusCallbackUrl: options.statusCallbackUrl,
    customBody: resolvedCustomBody,
  };

  if (wantsSms && loc.phone) {
    // Send Hebrew first (primary — its result is tracked). When there is no
    // custom body, follow up immediately with an English version so every
    // operator receives both languages regardless of their location settings.
    const heCtx = {
      ...sharedCtx,
      locationName: loc.nameHe || loc.name,
      operatorName: loc.contactPersonHe || loc.contactPerson || '',
      language: 'he' as const,
    };
    const smsResults = await sendOperatorWelcome(heCtx, { sms: true });
    smsResult = smsResults.sms;
    // Task #307: mirror outbound welcome SMS into the conversation thread.
    if (smsResult?.ok && loc.phone) {
      try {
        const { normalizePhoneForSms, buildOperatorWelcomeMessageBody } = await import('./twilio-client.js');
        const normalized = normalizePhoneForSms(loc.phone) || loc.phone;
        const body = resolvedCustomBody || buildOperatorWelcomeMessageBody(heCtx);
        await storage.recordSmsMessage({
          phone: normalized,
          channel: 'sms',
          direction: 'outbound',
          body,
          twilioSid: smsResult.sid || null,
          locationId: loc.id,
          sentByUserId: options.sentByUserId ?? null,
          deliveryStatus: 'queued',
        });
      } catch (e: any) {
        console.error('[onboarding] failed to mirror outbound SMS into conversation:', e?.message);
      }
    }

    if (!resolvedCustomBody) {
      const enCtx = {
        ...sharedCtx,
        locationName: loc.name,
        operatorName: loc.contactPerson || '',
        language: 'en' as const,
        // Don't attach the status callback to the secondary message to avoid
        // double-counting delivery events.
        statusCallbackUrl: undefined,
      };
      sendOperatorWelcome(enCtx, { sms: true })
        .then(async (results) => {
          // Task #307: mirror the EN follow-up into the conversation thread too,
          // so admins see the full bilingual pair the operator actually received.
          if (results.sms?.ok && loc.phone) {
            try {
              const { normalizePhoneForSms, buildOperatorWelcomeMessageBody } = await import('./twilio-client.js');
              const normalized = normalizePhoneForSms(loc.phone) || loc.phone;
              await storage.recordSmsMessage({
                phone: normalized,
                channel: 'sms',
                direction: 'outbound',
                body: buildOperatorWelcomeMessageBody(enCtx),
                twilioSid: results.sms.sid || null,
                locationId: loc.id,
                sentByUserId: options.sentByUserId ?? null,
                deliveryStatus: 'queued',
              });
            } catch (e: any) {
              console.error('[onboarding] failed to mirror EN SMS follow-up into conversation:', e?.message);
            }
          }
        })
        .catch((e: any) =>
          console.error('[onboarding] EN SMS follow-up failed:', e?.message),
        );
    }
  }

  if (wantsWhatsapp && loc.phone) {
    whatsappResult = await sendOperatorWelcomeWhatsApp(sharedCtx);
    // Task #307: mirror outbound welcome WhatsApp into the conversation thread.
    if (whatsappResult?.ok) {
      try {
        const { normalizePhoneForSms, buildOperatorWelcomeWhatsAppBody } = await import('./twilio-client.js');
        const normalized = normalizePhoneForSms(loc.phone) || loc.phone;
        const body = resolvedCustomBody || buildOperatorWelcomeWhatsAppBody(sharedCtx);
        await storage.recordSmsMessage({
          phone: normalized,
          channel: 'whatsapp',
          direction: 'outbound',
          body,
          twilioSid: whatsappResult.sid || null,
          locationId: loc.id,
          sentByUserId: options.sentByUserId ?? null,
          deliveryStatus: 'queued',
        });
      } catch (e: any) {
        console.error('[onboarding] failed to mirror outbound WhatsApp into conversation:', e?.message);
      }
    }
  }

  if (wantsEmail && loc.email) {
    try {
      // resolvedCustomBody is set only when customMessage === true (honors the same flag as SMS/WhatsApp)
      await sendOperatorWelcomeEmail({
        locationName: localizedName,
        locationCode: loc.locationCode,
        operatorName: language === 'he' ? (loc.contactPersonHe || loc.contactPerson || '') : (loc.contactPerson || ''),
        operatorEmail: loc.email,
        dashboardUrl: claimUrl,
        defaultPin: loc.operatorPin || '1234',
        language,
        customBody: resolvedCustomBody,
      });
      emailResult = { ok: true };
    } catch (e: any) {
      emailResult = { ok: false, error: e?.message || 'Email send failed' };
    }
  }

  // Record the attempt in storage — wrapped so a DB hiccup never aborts the
  // caller's batch loop; message sends have already completed at this point.
  try {
    await storage.recordOperatorWelcomeAttempt(loc.id, {
      sms: wantsSms && !!smsResult ? { ok: !!smsResult.ok, error: smsResult.error, sid: smsResult.sid } : undefined,
      whatsapp: wantsWhatsapp && !!whatsappResult ? { ok: !!whatsappResult.ok, error: whatsappResult.error, sid: whatsappResult.sid } : undefined,
      email: wantsEmail && !!emailResult ? { ok: !!emailResult.ok, error: emailResult.error } : undefined,
      defaultWelcomeChannel: options.rememberAsDefault ? options.channel : undefined,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[onboarding] failed to record attempt for location', loc.id, ':', message);
  }

  // Write a persistent send log entry for every channel attempted.
  const logChannel = options.channel === 'both' ? 'sms' : options.channel;
  const channelResult = options.channel === 'email' ? emailResult
    : options.channel === 'whatsapp' ? whatsappResult
    : smsResult;
  try {
    const okFlag = options.channel === 'both'
      ? (!!smsResult?.ok || !!emailResult?.ok)
      : !!channelResult?.ok;
    const errorMsg = options.channel === 'both'
      ? (!smsResult?.ok ? smsResult?.error : undefined) || (!emailResult?.ok ? emailResult?.error : undefined)
      : channelResult?.error;
    // Store the Twilio SID so the status-callback webhook can update this row
    // with the real async delivery outcome (delivered / undelivered / failed).
    const twilioSid = logChannel === 'whatsapp'
      ? (whatsappResult?.sid ?? null)
      : (smsResult?.sid ?? null);
    await storage.createMessageSendLog({
      locationId: loc.id,
      locationName: loc.name,
      locationCode: loc.locationCode,
      channel: logChannel,
      status: okFlag ? 'sent' : 'failed',
      error: okFlag ? null : (errorMsg || 'Send failed'),
      sentByUserId: options.sentByUserId ?? null,
      batchId: options.batchId ?? null,
      twilioSid: twilioSid ?? null,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[onboarding] failed to write message send log for location', loc.id, ':', message);
  }

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

export async function getOnboardingTwilioStatus() {
  const gmailStatus = await getGmailConfigStatus();
  const waStatus = getTwilioWhatsAppConfigStatus();
  return {
    sms: getTwilioConfigStatus(),
    email: { configured: gmailStatus.configured, reason: gmailStatus.configured ? undefined : gmailStatus.message },
    whatsapp: { configured: waStatus.configured, reason: waStatus.configured ? undefined : waStatus.reason },
  };
}

/**
 * Maps common Twilio error codes to short human-readable messages so admins
 * see "A2P campaign not approved" instead of the raw numeric code. The list
 * focuses on codes that arise in practice with A2P 10DLC / carrier filtering.
 */
function translateTwilioErrorCode(code: string): string {
  const map: Record<string, string> = {
    '21211': 'Invalid phone number',
    '21408': 'Region/country blocked on this account',
    '21610': 'Recipient has opted out (STOP)',
    '21614': 'Landline — cannot receive SMS',
    '30001': 'Message queue overflow',
    '30002': 'Account suspended',
    '30003': 'Handset unreachable',
    '30004': 'Message blocked by carrier',
    '30005': 'Unknown destination handset',
    '30006': 'Landline or carrier with no SMS support',
    '30007': 'Carrier violation — A2P registration may be required',
    '30008': 'Unknown carrier error',
    '30034': 'A2P 10DLC campaign not yet approved — message blocked until campaign is registered',
    '30035': 'A2P 10DLC brand not registered',
    '30036': 'A2P 10DLC daily send cap exceeded',
  };
  return map[code] ?? `Twilio error ${code}`;
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
  const errorCode = body?.ErrorCode ? String(body.ErrorCode) : undefined;
  const rawErrorMessage = body?.ErrorMessage ? String(body.ErrorMessage) : undefined;
  const errorMessage = rawErrorMessage || (errorCode ? translateTwilioErrorCode(errorCode) : undefined);
  const channel: 'sms' | 'whatsapp' = String(body?.From || '').startsWith('whatsapp:') ? 'whatsapp' : 'sms';
  // Update the location-level delivery status (used for location card badge).
  let updated = await storage.updateWelcomeDeliveryStatus(sid, channel, rawStatus, errorMessage);
  if (!updated) {
    const other: 'sms' | 'whatsapp' = channel === 'sms' ? 'whatsapp' : 'sms';
    updated = await storage.updateWelcomeDeliveryStatus(sid, other, rawStatus, errorMessage);
    if (updated) {
      // Also update the send log row if one carries this SID.
      await storage.updateMessageSendLogByTwilioSid(sid, rawStatus, errorMessage).catch(() => {});
      return { matched: true, channel: other, status: rawStatus };
    }
  }
  // Update the send log row regardless of whether the location row matched,
  // so standalone message sends (not part of onboarding) are also reflected.
  await storage.updateMessageSendLogByTwilioSid(sid, rawStatus, errorMessage).catch(() => {});
  return { matched: !!updated, channel, status: rawStatus };
}
