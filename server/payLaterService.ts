import { getStripeClient } from './stripeClient.js';
import { storage } from './storage.js';
import { randomBytes, createHash } from 'crypto';
import type { Transaction, PayLaterStatus } from '../shared/schema.js';
import { computeFeeForPaymentMethod } from './depositFees.js';
import { buildCanonicalConsentText } from './consentHelper.js';
import { notifyBorrowerBeforeCharge, notifyBorrowerAfterCharge } from './chargeNotifications.js';

// Stale-card guardrail: refuse off-session charges on cards older than this.
// Configurable via global_settings('stripe.maxCardAgeDays').
const DEFAULT_MAX_CARD_AGE_DAYS = 90;
const MAX_CARD_AGE_SETTING_KEY = 'stripe.maxCardAgeDays';

// Pre-charge notification gate: when true (default), blocks charges if the
// borrower cannot be notified. Configurable via global_settings.
const REQUIRE_NOTIFY_SETTING_KEY = 'stripe.requirePreChargeNotification';

export async function getMaxCardAgeDays(): Promise<number> {
  const row = await storage.getGlobalSetting(MAX_CARD_AGE_SETTING_KEY);
  if (!row?.value) return DEFAULT_MAX_CARD_AGE_DAYS;
  const n = parseInt(row.value, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_CARD_AGE_DAYS;
}

export async function setMaxCardAgeDays(days: number): Promise<void> {
  if (!Number.isFinite(days) || days <= 0) throw new Error('maxCardAgeDays must be a positive number');
  await storage.setGlobalSetting(MAX_CARD_AGE_SETTING_KEY, String(Math.floor(days)));
}

export async function getRequirePreChargeNotification(): Promise<boolean> {
  const row = await storage.getGlobalSetting(REQUIRE_NOTIFY_SETTING_KEY);
  // Default is TRUE: every off-session charge must be preceded by a successful
  // borrower notification. Operators can disable via admin settings if their
  // borrowers reliably lack contact details.
  if (row?.value === undefined || row?.value === null) return true;
  return row.value !== 'false';
}

export async function setRequirePreChargeNotification(required: boolean): Promise<void> {
  await storage.setGlobalSetting(REQUIRE_NOTIFY_SETTING_KEY, required ? 'true' : 'false');
}

interface CreateSetupIntentResult {
  transactionId: number;
  clientSecret: string;
  publicStatusUrl: string;
  rawToken: string;
}

interface ChargeResult {
  success: boolean;
  status: PayLaterStatus;
  paymentIntentId?: string;
  errorCode?: string;
  errorMessage?: string;
  requiresAction?: boolean;
  clientSecret?: string;
}

function generateMagicToken(): { raw: string; hashed: string } {
  const raw = randomBytes(32).toString('hex');
  const hashed = createHash('sha256').update(raw).digest('hex');
  return { raw, hashed };
}

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export interface PreparedBorrowerStatusToken {
  raw: string;
  hashed: string;
  expiresAt: Date;
}

// Generates a token in memory without touching the DB. Pair with
// commitBorrowerStatusToken so a failed downstream send (e.g. Twilio)
// doesn't invalidate a previously-working borrower link.
export function prepareBorrowerStatusToken(): PreparedBorrowerStatusToken {
  const { raw, hashed } = generateMagicToken();
  return { raw, hashed, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) };
}

export async function commitBorrowerStatusToken(transactionId: number, prepared: PreparedBorrowerStatusToken): Promise<void> {
  await storage.updateTransaction(transactionId, {
    magicToken: prepared.hashed,
    magicTokenExpiresAt: prepared.expiresAt,
  });
}

export class PayLaterService {
  static async createSetupIntent(data: {
    locationId: number;
    borrowerName: string;
    borrowerEmail?: string;
    borrowerPhone?: string;
    amountCents: number;
    currency?: string;
    /** Task #39: exact consent text the borrower agreed to. Persisted verbatim. */
    consentText?: string;
    /** Task #39: max amount disclosed at consent (deposit + fee, in cents). */
    consentMaxChargeCents?: number;
  }): Promise<CreateSetupIntentResult> {
    const stripe = getStripeClient();
    const { raw: rawToken, hashed: hashedToken } = generateMagicToken();
    const tokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // Compute deposit + Stripe fee (disclosed as consent max and charged at settle time).
    // Fee priority: payment_methods row (provider='stripe') > location defaults > hard defaults.
    const location = await storage.getLocation(data.locationId);
    const allPaymentMethods = await storage.getAllPaymentMethods();
    const stripePaymentMethod = allPaymentMethods.find(pm => pm.provider === 'stripe' && pm.isActive);
    const { feeCents, totalCents } = computeFeeForPaymentMethod(data.amountCents, stripePaymentMethod, location);
    const consentMax = data.consentMaxChargeCents ?? totalCents;

    // Server-computed canonical consent text — ignore any client-supplied text
    // so the audit trail is always byte-identical to what the server shows.
    const serverConsentText = buildCanonicalConsentText(location?.name ?? 'this gemach', consentMax);

    const transaction = await storage.createTransaction({
      locationId: data.locationId,
      borrowerName: data.borrowerName,
      borrowerEmail: data.borrowerEmail,
      borrowerPhone: data.borrowerPhone,
      depositAmount: data.amountCents / 100,
      depositPaymentMethod: 'card',
      payLaterStatus: 'CARD_SETUP_PENDING',
      amountPlannedCents: totalCents,
      currency: data.currency || 'usd',
      magicToken: hashedToken,
      magicTokenExpiresAt: tokenExpiresAt,
      consentText: serverConsentText,
      consentAcceptedAt: new Date(),
      consentMaxChargeCents: consentMax,
      depositFeeCents: feeCents,
    });

    const customer = await stripe.customers.create({
      email: data.borrowerEmail || undefined,
      phone: data.borrowerPhone || undefined,
      name: data.borrowerName,
      metadata: {
        transaction_id: transaction.id.toString(),
        location_id: data.locationId.toString(),
      },
    });

    const setupIntent = await stripe.setupIntents.create({
      customer: customer.id,
      usage: 'off_session',
      payment_method_types: ['card'],
      metadata: {
        transaction_id: transaction.id.toString(),
        location_id: data.locationId.toString(),
      },
    });

    await storage.updateTransaction(transaction.id, {
      stripeCustomerId: customer.id,
      stripeSetupIntentId: setupIntent.id,
    });

    await storage.createAuditLog({
      actorType: 'system',
      action: 'setup_intent_created',
      entityType: 'transaction',
      entityId: transaction.id,
      afterJson: JSON.stringify({
        stripeCustomerId: customer.id,
        stripeSetupIntentId: setupIntent.id,
        status: 'CARD_SETUP_PENDING',
      }),
    });

    return {
      transactionId: transaction.id,
      clientSecret: setupIntent.client_secret!,
      publicStatusUrl: `/status/${transaction.id}?token=${rawToken}`,
      rawToken,
    };
  }

  static async getTransactionByToken(transactionId: number, rawToken: string): Promise<Transaction | null> {
    const transaction = await storage.getTransaction(transactionId);
    if (!transaction) return null;

    const hashedToken = hashToken(rawToken);
    if (transaction.magicToken !== hashedToken) return null;

    if (transaction.magicTokenExpiresAt && new Date() > transaction.magicTokenExpiresAt) {
      return null;
    }

    return transaction;
  }

  static async handleSetupIntentSucceeded(setupIntentId: string, paymentMethodId: string): Promise<void> {
    const transaction = await storage.getTransactionBySetupIntentId(setupIntentId);
    if (!transaction) {
      console.log(`No transaction found for SetupIntent: ${setupIntentId}`);
      return;
    }

    const beforeJson = JSON.stringify(transaction);

    // Task #39: stamp cardSavedAt so the stale-card guardrail can age it.
    await storage.updateTransactionPayLaterStatus(transaction.id, 'CARD_SETUP_COMPLETE', {
      stripePaymentMethodId: paymentMethodId,
      cardSavedAt: new Date(),
    });

    const stripe = getStripeClient();
    if (transaction.stripeCustomerId) {
      await stripe.customers.update(transaction.stripeCustomerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });
    }

    await storage.createAuditLog({
      actorType: 'webhook',
      action: 'card_setup_complete',
      entityType: 'transaction',
      entityId: transaction.id,
      beforeJson,
      afterJson: JSON.stringify({
        status: 'CARD_SETUP_COMPLETE',
        stripePaymentMethodId: paymentMethodId,
      }),
      metadata: JSON.stringify({ setupIntentId }),
    });
  }

  static async chargeTransaction(
    transactionId: number,
    operatorUserId?: number,
    operatorLocationId?: number,
    operatorNote?: string,
  ): Promise<ChargeResult> {
    const transaction = await storage.getTransaction(transactionId);
    if (!transaction) {
      return { success: false, status: 'CHARGE_FAILED', errorMessage: 'Transaction not found' };
    }

    if (operatorLocationId && transaction.locationId !== operatorLocationId) {
      return { success: false, status: 'CHARGE_FAILED', errorMessage: 'Unauthorized: wrong location' };
    }

    const chargeableStatuses = ['CARD_SETUP_COMPLETE', 'APPROVED'];
    if (!chargeableStatuses.includes(transaction.payLaterStatus || '')) {
      return { 
        success: false, 
        status: transaction.payLaterStatus as PayLaterStatus || 'CHARGE_FAILED', 
        errorMessage: `Cannot charge transaction in status: ${transaction.payLaterStatus}` 
      };
    }

    if (!transaction.stripeCustomerId || !transaction.stripePaymentMethodId) {
      return { success: false, status: 'CHARGE_FAILED', errorMessage: 'Missing Stripe payment details' };
    }

    // Task #39: refuse to charge a card that has no recorded borrower consent.
    // The borrower UI on /status/<id> requires checking the consent box before
    // confirmCardSetup runs and POSTs the consent text to /confirm-setup, so a
    // missing consent_text by charge time means an off-session charge with no
    // documented authorization — exactly the dispute risk we're trying to
    // avoid. Better to fail loudly here than to argue with Stripe later.
    if (!transaction.consentText || !transaction.consentAcceptedAt) {
      await storage.createAuditLog({
        actorUserId: operatorUserId,
        actorType: operatorUserId ? 'operator' : 'system',
        action: 'charge_blocked_no_consent',
        entityType: 'transaction',
        entityId: transaction.id,
        afterJson: JSON.stringify({ reason: 'consent_text or consent_accepted_at missing' }),
      });
      return {
        success: false,
        status: transaction.payLaterStatus as PayLaterStatus,
        errorCode: 'consent_missing',
        errorMessage: 'No borrower consent recorded for this card. Ask the borrower to re-enter their card via the status link.',
      };
    }

    // Stale-card guardrail: refuse charges on cards older than maxCardAgeDays.
    const maxCardAgeDays = await getMaxCardAgeDays();
    const cardSavedAt = transaction.cardSavedAt ? new Date(transaction.cardSavedAt) : null;
    if (cardSavedAt) {
      const ageDays = (Date.now() - cardSavedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (ageDays > maxCardAgeDays) {
        await storage.createAuditLog({
          actorUserId: operatorUserId,
          actorType: operatorUserId ? 'operator' : 'system',
          action: 'charge_blocked_card_too_old',
          entityType: 'transaction',
          entityId: transaction.id,
          afterJson: JSON.stringify({ cardAgeDays: Math.round(ageDays), maxCardAgeDays }),
        });
        return {
          success: false,
          status: transaction.payLaterStatus as PayLaterStatus,
          errorCode: 'card_too_old',
          errorMessage: `Saved card is ${Math.round(ageDays)} days old (max ${maxCardAgeDays}). Ask the borrower to re-enter their card before charging.`,
        };
      }
    }

    // Consent cap guard: the charge must not exceed the amount the borrower agreed to.
    const amountToChargeCents = transaction.amountPlannedCents || Math.round(transaction.depositAmount * 100);
    if (transaction.consentMaxChargeCents && amountToChargeCents > transaction.consentMaxChargeCents) {
      await storage.createAuditLog({
        actorUserId: operatorUserId,
        actorType: operatorUserId ? 'operator' : 'system',
        action: 'charge_blocked_exceeds_consent',
        entityType: 'transaction',
        entityId: transaction.id,
        afterJson: JSON.stringify({ amountToChargeCents, consentMaxChargeCents: transaction.consentMaxChargeCents }),
      });
      return {
        success: false,
        status: transaction.payLaterStatus as PayLaterStatus,
        errorCode: 'exceeds_consent_cap',
        errorMessage: `Charge amount (${amountToChargeCents}¢) exceeds consented maximum (${transaction.consentMaxChargeCents}¢). Re-obtain consent before charging.`,
      };
    }

    const beforeJson = JSON.stringify(transaction);
    const stripe = getStripeClient();

    // Send pre-charge notification. When requirePreChargeNotification=true,
    // the charge is blocked if notification fails.
    const location = await storage.getLocation(transaction.locationId);
    const requireNotification = await getRequirePreChargeNotification();

    if (location) {
      const notice = await notifyBorrowerBeforeCharge(transaction, location, amountToChargeCents, operatorNote);

      await storage.updateTransaction(transaction.id, {
        chargeNotificationSentAt: notice.sent ? new Date() : undefined,
        chargeNotificationChannel: notice.channel,
      });
      await storage.createAuditLog({
        actorUserId: operatorUserId,
        actorType: operatorUserId ? 'operator' : 'system',
        action: 'pre_charge_notification',
        entityType: 'transaction',
        entityId: transaction.id,
        afterJson: JSON.stringify(notice),
      });

      // Enforce notification gate if policy requires it.
      if (requireNotification && !notice.sent) {
        await storage.createAuditLog({
          actorUserId: operatorUserId,
          actorType: operatorUserId ? 'operator' : 'system',
          action: 'charge_blocked_notification_required',
          entityType: 'transaction',
          entityId: transaction.id,
          afterJson: JSON.stringify({ reason: notice.error }),
        });
        return {
          success: false,
          status: 'CHARGE_FAILED',
          errorMessage: `Charge blocked: pre-charge notification could not be sent (${notice.error || 'no channel available'}). Add a phone or email for this borrower, or disable the notification requirement in admin settings.`,
        };
      }
    } else if (requireNotification) {
      // No location means we cannot determine a channel — block.
      return {
        success: false,
        status: 'CHARGE_FAILED',
        errorMessage: 'Charge blocked: pre-charge notification required but location not found.',
      };
    }

    try {
      await storage.updateTransactionPayLaterStatus(transaction.id, 'CHARGE_ATTEMPTED');

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountToChargeCents,
        currency: transaction.currency || 'usd',
        customer: transaction.stripeCustomerId,
        payment_method: transaction.stripePaymentMethodId,
        off_session: true,
        confirm: true,
        metadata: {
          transaction_id: transaction.id.toString(),
          location_id: transaction.locationId.toString(),
        },
      }, {
        idempotencyKey: `${transaction.id}_charge_1`,
      });

      if (paymentIntent.status === 'succeeded') {
        await storage.updateTransactionPayLaterStatus(transaction.id, 'CHARGED', {
          stripePaymentIntentId: paymentIntent.id,
          chargedAt: new Date(), // Task #39: accurate dispute-rate denominator
        });

        await storage.createAuditLog({
          actorUserId: operatorUserId,
          actorType: operatorUserId ? 'operator' : 'system',
          action: 'charge_succeeded',
          entityType: 'transaction',
          entityId: transaction.id,
          beforeJson,
          afterJson: JSON.stringify({ status: 'CHARGED', stripePaymentIntentId: paymentIntent.id }),
        });

        // Task #39: post-charge receipt — let borrower know the charge landed.
        // Include the same operatorNote used in the pre-charge notification so the
        // borrower can see the reason in both messages.
        try {
          if (location) {
            await notifyBorrowerAfterCharge(transaction, location, amountToChargeCents, operatorNote);
          }
        } catch (err) {
          console.error('Post-charge receipt notification failed (non-fatal):', err);
        }

        return { success: true, status: 'CHARGED', paymentIntentId: paymentIntent.id };
      }

      if (paymentIntent.status === 'requires_action' || paymentIntent.status === 'requires_confirmation') {
        await storage.updateTransactionPayLaterStatus(transaction.id, 'CHARGE_REQUIRES_ACTION', {
          stripePaymentIntentId: paymentIntent.id,
        });

        await storage.createAuditLog({
          actorUserId: operatorUserId,
          actorType: operatorUserId ? 'operator' : 'system',
          action: 'charge_requires_action',
          entityType: 'transaction',
          entityId: transaction.id,
          beforeJson,
          afterJson: JSON.stringify({ status: 'CHARGE_REQUIRES_ACTION', stripePaymentIntentId: paymentIntent.id }),
        });

        await this.notifyClientForSCA(transaction);

        return { 
          success: false, 
          status: 'CHARGE_REQUIRES_ACTION', 
          paymentIntentId: paymentIntent.id,
          requiresAction: true,
          clientSecret: paymentIntent.client_secret || undefined,
        };
      }

      await storage.updateTransactionPayLaterStatus(transaction.id, 'CHARGE_FAILED', {
        stripePaymentIntentId: paymentIntent.id,
        chargeErrorMessage: `Unexpected payment status: ${paymentIntent.status}`,
      });

      return { 
        success: false, 
        status: 'CHARGE_FAILED', 
        paymentIntentId: paymentIntent.id,
        errorMessage: `Unexpected payment status: ${paymentIntent.status}`,
      };

    } catch (error: any) {
      const errorCode = error.code || 'unknown_error';
      const errorMessage = error.message || 'Payment failed';

      await storage.updateTransactionPayLaterStatus(transaction.id, 'CHARGE_FAILED', {
        chargeErrorCode: errorCode,
        chargeErrorMessage: errorMessage,
      });

      await storage.createAuditLog({
        actorUserId: operatorUserId,
        actorType: operatorUserId ? 'operator' : 'system',
        action: 'charge_failed',
        entityType: 'transaction',
        entityId: transaction.id,
        beforeJson,
        afterJson: JSON.stringify({ status: 'CHARGE_FAILED', errorCode, errorMessage }),
        metadata: JSON.stringify({ stripeError: error }),
      });

      return { 
        success: false, 
        status: 'CHARGE_FAILED', 
        errorCode, 
        errorMessage 
      };
    }
  }

  static async acceptTransaction(
    transactionId: number,
    operatorUserId?: number,
    operatorLocationId?: number
  ): Promise<{ success: boolean; errorMessage?: string }> {
    const transaction = await storage.getTransaction(transactionId);
    if (!transaction) {
      return { success: false, errorMessage: 'Transaction not found' };
    }

    if (operatorLocationId && transaction.locationId !== operatorLocationId) {
      return { success: false, errorMessage: 'Unauthorized: wrong location' };
    }

    if (transaction.payLaterStatus !== 'CARD_SETUP_COMPLETE') {
      return { success: false, errorMessage: `Cannot accept transaction in status: ${transaction.payLaterStatus}. Card setup must be complete.` };
    }

    const beforeJson = JSON.stringify(transaction);

    await storage.updateTransactionPayLaterStatus(transaction.id, 'APPROVED', {
      notes: 'Self-deposit accepted by operator - item lent',
    });

    await storage.createAuditLog({
      actorUserId: operatorUserId,
      actorType: operatorUserId ? 'operator' : 'system',
      action: 'accepted',
      entityType: 'transaction',
      entityId: transaction.id,
      beforeJson,
      afterJson: JSON.stringify({ status: 'APPROVED' }),
    });

    return { success: true };
  }

  static async declineTransaction(
    transactionId: number,
    operatorUserId?: number,
    operatorLocationId?: number,
    reason?: string
  ): Promise<{ success: boolean; errorMessage?: string }> {
    const transaction = await storage.getTransaction(transactionId);
    if (!transaction) {
      return { success: false, errorMessage: 'Transaction not found' };
    }

    if (operatorLocationId && transaction.locationId !== operatorLocationId) {
      return { success: false, errorMessage: 'Unauthorized: wrong location' };
    }

    const validStatuses = ['CARD_SETUP_PENDING', 'CARD_SETUP_COMPLETE'];
    if (!validStatuses.includes(transaction.payLaterStatus || '')) {
      return { success: false, errorMessage: `Cannot decline transaction in status: ${transaction.payLaterStatus}` };
    }

    const beforeJson = JSON.stringify(transaction);

    await storage.updateTransactionPayLaterStatus(transaction.id, 'DECLINED', {
      notes: reason ? `Declined: ${reason}` : 'Declined by operator',
    });

    await storage.createAuditLog({
      actorUserId: operatorUserId,
      actorType: operatorUserId ? 'operator' : 'system',
      action: 'declined',
      entityType: 'transaction',
      entityId: transaction.id,
      beforeJson,
      afterJson: JSON.stringify({ status: 'DECLINED', reason }),
    });

    return { success: true };
  }

  static async getPaymentIntentClientSecret(transactionId: number): Promise<string | null> {
    const transaction = await storage.getTransaction(transactionId);
    if (!transaction || !transaction.stripePaymentIntentId) return null;

    if (transaction.payLaterStatus !== 'CHARGE_REQUIRES_ACTION') return null;

    const stripe = getStripeClient();
    const paymentIntent = await stripe.paymentIntents.retrieve(transaction.stripePaymentIntentId);
    return paymentIntent.client_secret;
  }

  static async handlePaymentIntentSucceeded(paymentIntentId: string): Promise<void> {
    const transaction = await storage.getTransactionByPaymentIntentId(paymentIntentId);
    if (!transaction) {
      console.log(`No transaction found for PaymentIntent: ${paymentIntentId}`);
      return;
    }

    if (transaction.payLaterStatus === 'CHARGED') {
      console.log(`Transaction ${transaction.id} already marked as CHARGED`);
      return;
    }

    const beforeJson = JSON.stringify(transaction);
    const chargedAt = new Date(); // Task #39: stamp for dispute-rate denominator

    await storage.updateTransactionPayLaterStatus(transaction.id, 'CHARGED', {
      chargedAt,
    });

    await storage.createAuditLog({
      actorType: 'webhook',
      action: 'payment_succeeded',
      entityType: 'transaction',
      entityId: transaction.id,
      beforeJson,
      afterJson: JSON.stringify({ status: 'CHARGED', chargedAt }),
      metadata: JSON.stringify({ paymentIntentId }),
    });

    // Task #39: post-charge receipt — notify borrower that the charge landed.
    try {
      const location = await storage.getLocation(transaction.locationId);
      if (location) {
        const amountCents = transaction.amountPlannedCents
          ?? Math.round(transaction.depositAmount * 100);
        await notifyBorrowerAfterCharge(transaction, location, amountCents);
      }
    } catch (err) {
      console.error('Post-charge receipt notification failed (non-fatal):', err);
    }
  }

  static async handlePaymentIntentFailed(paymentIntentId: string, errorMessage?: string): Promise<void> {
    const transaction = await storage.getTransactionByPaymentIntentId(paymentIntentId);
    if (!transaction) {
      console.log(`No transaction found for PaymentIntent: ${paymentIntentId}`);
      return;
    }

    const beforeJson = JSON.stringify(transaction);

    await storage.updateTransactionPayLaterStatus(transaction.id, 'CHARGE_FAILED', {
      chargeErrorMessage: errorMessage || 'Payment failed',
    });

    await storage.createAuditLog({
      actorType: 'webhook',
      action: 'payment_failed',
      entityType: 'transaction',
      entityId: transaction.id,
      beforeJson,
      afterJson: JSON.stringify({ status: 'CHARGE_FAILED', errorMessage }),
      metadata: JSON.stringify({ paymentIntentId }),
    });
  }

  static async handlePaymentIntentRequiresAction(paymentIntentId: string): Promise<void> {
    const transaction = await storage.getTransactionByPaymentIntentId(paymentIntentId);
    if (!transaction) {
      console.log(`No transaction found for PaymentIntent: ${paymentIntentId}`);
      return;
    }

    const terminalStatuses = ['CHARGED', 'CHARGE_FAILED', 'DECLINED', 'CHARGE_REQUIRES_ACTION'];
    if (terminalStatuses.includes(transaction.payLaterStatus || '')) {
      console.log(`Skipping requires_action for transaction ${transaction.id} already in status: ${transaction.payLaterStatus}`);
      return;
    }

    const beforeJson = JSON.stringify(transaction);

    await storage.updateTransactionPayLaterStatus(transaction.id, 'CHARGE_REQUIRES_ACTION');

    await storage.createAuditLog({
      actorType: 'webhook',
      action: 'payment_requires_action',
      entityType: 'transaction',
      entityId: transaction.id,
      beforeJson,
      afterJson: JSON.stringify({ status: 'CHARGE_REQUIRES_ACTION' }),
      metadata: JSON.stringify({ paymentIntentId }),
    });

    await this.notifyClientForSCA(transaction);
  }

  private static async notifyClientForSCA(transaction: Transaction): Promise<void> {
    console.log(`[NOTIFICATION STUB] Client needs to complete SCA for transaction ${transaction.id}`);
    console.log(`Email: ${transaction.borrowerEmail}, Phone: ${transaction.borrowerPhone}`);
    console.log(`Status URL would be sent with magic token`);
  }
}
