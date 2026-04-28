import { getStripeClient } from './stripeClient.js';
import { storage } from './storage.js';
import { randomBytes, createHash } from 'crypto';
import type { Transaction, PayLaterStatus } from '../shared/schema.js';

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

/**
 * Mints a new magic token for the borrower status page on an existing
 * transaction (overwriting any prior hash) and returns the raw token.
 *
 * Used by the return-reminder flow so the SMS/email body can include a
 * working public link even for plain (non-PayLater) transactions that
 * never went through createSetupIntent. The 30-day expiry mirrors the
 * setup-intent flow so a borrower has plenty of time to act on the
 * reminder before the link goes stale.
 */
export async function mintBorrowerStatusToken(transactionId: number): Promise<string> {
  const { raw, hashed } = generateMagicToken();
  await storage.updateTransaction(transactionId, {
    magicToken: hashed,
    magicTokenExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });
  return raw;
}

export class PayLaterService {
  static async createSetupIntent(data: {
    locationId: number;
    borrowerName: string;
    borrowerEmail?: string;
    borrowerPhone?: string;
    amountCents: number;
    currency?: string;
  }): Promise<CreateSetupIntentResult> {
    const stripe = getStripeClient();
    const { raw: rawToken, hashed: hashedToken } = generateMagicToken();
    const tokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const transaction = await storage.createTransaction({
      locationId: data.locationId,
      borrowerName: data.borrowerName,
      borrowerEmail: data.borrowerEmail,
      borrowerPhone: data.borrowerPhone,
      depositAmount: data.amountCents / 100,
      depositPaymentMethod: 'card',
      payLaterStatus: 'CARD_SETUP_PENDING',
      amountPlannedCents: data.amountCents,
      currency: data.currency || 'usd',
      magicToken: hashedToken,
      magicTokenExpiresAt: tokenExpiresAt,
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

    await storage.updateTransactionPayLaterStatus(transaction.id, 'CARD_SETUP_COMPLETE', {
      stripePaymentMethodId: paymentMethodId,
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
    operatorLocationId?: number
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

    const beforeJson = JSON.stringify(transaction);
    const stripe = getStripeClient();

    try {
      await storage.updateTransactionPayLaterStatus(transaction.id, 'CHARGE_ATTEMPTED');

      const paymentIntent = await stripe.paymentIntents.create({
        amount: transaction.amountPlannedCents || Math.round(transaction.depositAmount * 100),
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

    await storage.updateTransactionPayLaterStatus(transaction.id, 'CHARGED');

    await storage.createAuditLog({
      actorType: 'webhook',
      action: 'payment_succeeded',
      entityType: 'transaction',
      entityId: transaction.id,
      beforeJson,
      afterJson: JSON.stringify({ status: 'CHARGED' }),
      metadata: JSON.stringify({ paymentIntentId }),
    });
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
