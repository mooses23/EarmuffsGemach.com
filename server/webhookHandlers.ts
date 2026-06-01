import { getStripeClient, getStripeWebhookSecret } from './stripeClient.js';
import { storage } from './storage.js';
import { PayLaterService } from './payLaterService.js';

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'This usually means express.json() parsed the body before reaching this handler. ' +
        'FIX: Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    const stripe = getStripeClient();
    const webhookSecret = getStripeWebhookSecret();
    
    let event;
    try {
      event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message);
      throw new Error(`Webhook signature verification failed: ${err.message}`);
    }

    console.log(`Processing Stripe webhook event: ${event.type}`);

    const existingEvent = await storage.getWebhookEvent(event.id);
    if (existingEvent) {
      console.log(`Webhook event ${event.id} already processed, skipping`);
      return;
    }

    await storage.createWebhookEvent({
      eventId: event.id,
      eventType: event.type,
    });

    switch (event.type) {
      case 'setup_intent.succeeded':
        await this.handleSetupIntentSucceeded(event.data.object);
        break;
      case 'payment_intent.succeeded':
        await this.handlePaymentIntentSucceeded(event.data.object);
        break;
      case 'payment_intent.payment_failed':
        await this.handlePaymentIntentFailed(event.data.object);
        break;
      case 'payment_intent.requires_action':
        await this.handlePaymentIntentRequiresAction(event.data.object);
        break;
      case 'charge.refunded':
        await this.handleChargeRefunded(event.data.object);
        break;
      case 'charge.dispute.created':
        // Task #39: persist disputes so the admin dispute-rate widget can flag
        // gemachs that are at risk of breaching Stripe's 0.7% threshold.
        await this.handleChargeDisputeCreated(event.data.object);
        break;
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
  }

  private static async handleSetupIntentSucceeded(setupIntent: any): Promise<void> {
    console.log(`SetupIntent succeeded: ${setupIntent.id}`);
    
    try {
      const paymentMethodId = setupIntent.payment_method;
      if (paymentMethodId) {
        await PayLaterService.handleSetupIntentSucceeded(setupIntent.id, paymentMethodId);
      }
    } catch (error) {
      console.error('Error handling setup_intent.succeeded:', error);
      throw error;
    }
  }

  private static async handlePaymentIntentRequiresAction(paymentIntent: any): Promise<void> {
    console.log(`PaymentIntent requires action: ${paymentIntent.id}`);
    
    try {
      await PayLaterService.handlePaymentIntentRequiresAction(paymentIntent.id);
    } catch (error) {
      console.error('Error handling payment_intent.requires_action:', error);
      throw error;
    }
  }

  private static async handlePaymentIntentSucceeded(paymentIntent: any): Promise<void> {
    console.log(`PaymentIntent succeeded: ${paymentIntent.id}`);
    
    try {
      await PayLaterService.handlePaymentIntentSucceeded(paymentIntent.id);

      const payments = await storage.getAllPayments();
      const payment = payments.find(p => p.externalPaymentId === paymentIntent.id);
      
      if (payment) {
        await storage.updatePaymentStatus(payment.id, 'completed', {
          notes: `Payment confirmed via webhook at ${new Date().toISOString()}`
        });
        console.log(`Updated payment ${payment.id} to completed`);
      }
    } catch (error) {
      console.error('Error handling payment_intent.succeeded:', error);
      throw error;
    }
  }

  private static async handlePaymentIntentFailed(paymentIntent: any): Promise<void> {
    console.log(`PaymentIntent failed: ${paymentIntent.id}`);
    
    try {
      const failureMessage = paymentIntent.last_payment_error?.message || 'Payment failed';
      await PayLaterService.handlePaymentIntentFailed(paymentIntent.id, failureMessage);

      const payments = await storage.getAllPayments();
      const payment = payments.find(p => p.externalPaymentId === paymentIntent.id);
      
      if (payment) {
        await storage.updatePaymentStatus(payment.id, 'failed', {
          notes: `Payment failed: ${failureMessage}`
        });
        console.log(`Updated payment ${payment.id} to failed`);
      }
    } catch (error) {
      console.error('Error handling payment_intent.payment_failed:', error);
      throw error;
    }
  }

  private static async handleChargeRefunded(charge: any): Promise<void> {
    console.log(`Charge refunded: ${charge.id}`);
    
    try {
      const payments = await storage.getAllPayments();
      const payment = payments.find(p => 
        p.externalPaymentId === charge.payment_intent
      );
      
      if (payment) {
        const refundAmountDollars = charge.amount_refunded / 100;
        await storage.updatePaymentStatus(payment.id, 'refunded', {
          notes: `Refunded $${refundAmountDollars} via webhook at ${new Date().toISOString()}`
        });
        console.log(`Updated payment ${payment.id} to refunded`);

        // Sync transaction state and restock inventory.
        // markPhysicallyReturnedForRefund is CAS-guarded on isReturned=false so
        // duplicate webhook deliveries cannot double-restock or double-set the flag.
        const returned = await storage.markPhysicallyReturnedForRefund(payment.transactionId, true);
        if (returned) {
          // markPhysicallyReturnedForRefund does not set refundAmount. Use
          // markTransactionReturned to set it (idempotently re-asserts isReturned=true).
          await storage.markTransactionReturned(payment.transactionId, refundAmountDollars);
          console.log(`Synced transaction ${payment.transactionId}: isReturned=true, refundAmount=$${refundAmountDollars}, inventory restocked`);
        } else {
          console.log(`Transaction ${payment.transactionId} was already marked returned (duplicate webhook or prior manual return)`);
        }
      }
    } catch (error) {
      console.error('Error handling charge.refunded:', error);
      throw error;
    }
  }

  /**
   * Persist a Stripe dispute row for the admin dispute-rate widget.
   * Idempotent on stripe_dispute_id. Back-links to the originating transaction
   * via payment_intent → stripePaymentIntentId, with fallbacks via stripeChargeId
   * and Stripe charge metadata. Drops with a log if truly unmatched.
   */
  private static async handleChargeDisputeCreated(dispute: any): Promise<void> {
    console.log(`Charge dispute created: ${dispute.id} (charge: ${dispute.charge})`);

    try {
      // Idempotency: skip if we've already inserted this dispute.
      const existing = await storage.getDisputeByStripeId(dispute.id);
      if (existing) {
        console.log(`Dispute ${dispute.id} already recorded, skipping.`);
        return;
      }

      // Look up originating transaction via stripePaymentIntentId.
      // If unmatched, retrieve the Stripe charge to extract PI/metadata.
      // Disputes are always persisted — if we cannot link to a transaction,
      // we still record with whatever locationId we can find from charge metadata.
      const paymentIntentId: string | undefined = dispute.payment_intent;
      const chargeId: string | undefined = dispute.charge;
      let txLocationId: number | null = null;
      let txId: number | null = null;

      const txs = await storage.getAllTransactions();

      // Primary: match by persisted stripePaymentIntentId (set on both flows).
      if (paymentIntentId) {
        const tx = txs.find((t: any) => t.stripePaymentIntentId === paymentIntentId);
        if (tx) { txLocationId = tx.locationId; txId = tx.id; }
      }

      // Fallback: retrieve the Stripe charge to find payment_intent or metadata.
      if (!txLocationId && chargeId) {
        try {
          const stripe = getStripeClient();
          const charge = await stripe.charges.retrieve(chargeId);
          const piId = charge.payment_intent as string | null;
          if (piId && !paymentIntentId) {
            const tx = txs.find((t: any) => t.stripePaymentIntentId === piId);
            if (tx) { txLocationId = tx.locationId; txId = tx.id; }
          }
          // Last resort: read locationId from charge metadata.
          // Pay Later uses snake_case 'location_id'; Direct Deposit uses camelCase 'locationId'.
          if (!txLocationId) {
            const metaLocId = charge.metadata?.location_id ?? charge.metadata?.locationId;
            if (metaLocId) txLocationId = parseInt(metaLocId, 10) || null;
          }
        } catch (lookupErr) {
          console.error('[webhook] dispute: charge lookup failed:', lookupErr);
        }
      }

      // If we still cannot resolve a locationId, persist with locationId=null.
      // disputes.location_id is nullable for exactly this case — the dispute is
      // preserved for audit/count purposes but not attributed to any gemach.
      if (!txLocationId) {
        console.error(
          `[webhook] charge.dispute.created: cannot resolve location for dispute ${dispute.id} ` +
          `(payment_intent=${paymentIntentId}, charge=${chargeId}). Persisting unlinked.`
        );
      }

      await storage.createDispute({
        locationId: txLocationId,
        transactionId: txId,
        stripeDisputeId: dispute.id,
        stripeChargeId: dispute.charge,
        stripePaymentIntentId: paymentIntentId,
        amountCents: dispute.amount,
        currency: dispute.currency || 'usd',
        status: dispute.status,
        reason: dispute.reason,
        evidenceDueBy: dispute.evidence_details?.due_by
          ? new Date(dispute.evidence_details.due_by * 1000)
          : undefined,
        rawPayloadJson: JSON.stringify(dispute),
      });

      // Surface in audit log so admins notice during their normal review.
      await storage.createAuditLog({
        actorType: 'system',
        action: 'stripe_dispute_received',
        entityType: 'transaction',
        entityId: txId ?? 0,
        afterJson: JSON.stringify({
          locationId: txLocationId,
          stripeDisputeId: dispute.id,
          amountCents: dispute.amount,
          reason: dispute.reason,
        }),
      });
    } catch (error) {
      console.error('Error handling charge.dispute.created:', error);
      throw error;
    }
  }
}
