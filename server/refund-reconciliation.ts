/**
 * Task #55: Refund Reconciliation Job
 *
 * Runs every 5 minutes. Finds transactions stuck in REFUND_PENDING longer
 * than STALE_THRESHOLD_MINUTES (i.e. the server process died after writing
 * REFUND_PENDING but before persisting the Stripe result).
 *
 * For each stale row:
 *  - Asks Stripe for all refunds on the payment_intent.
 *  - If Stripe total > DB total  →  finalize to REFUNDED / PARTIALLY_REFUNDED.
 *  - If Stripe has no un-accounted refund  →  roll back to CHARGED and log.
 */

import { storage } from "./storage.js";
import { getStripeClient } from "./stripeClient.js";
import type { Transaction } from "../shared/schema.js";
import type { PayLaterStatus } from "../shared/schema.js";

const STALE_THRESHOLD_MINUTES = 5;
const POLL_INTERVAL_MS = 5 * 60 * 1000;

export function startRefundReconciliation(): void {
  const run = async () => {
    try {
      await reconcileRefundPending();
    } catch (err) {
      console.error("[refund-reconciliation] Unexpected error during reconciliation run:", err);
    }
  };
  setInterval(run, POLL_INTERVAL_MS);
  console.log(`[refund-reconciliation] Started — polling every ${POLL_INTERVAL_MS / 1000}s.`);
}

export async function reconcileRefundPending(): Promise<void> {
  const stale = await storage.getStaleRefundPendingTransactions(STALE_THRESHOLD_MINUTES);
  if (stale.length === 0) return;

  console.log(`[refund-reconciliation] Found ${stale.length} stale REFUND_PENDING transaction(s).`);

  for (const tx of stale) {
    try {
      await reconcileOne(tx);
    } catch (err) {
      console.error(`[refund-reconciliation] Error reconciling tx ${tx.id}:`, err);
    }
  }
}

async function reconcileOne(tx: Transaction): Promise<void> {
  const txId = tx.id;

  if (!tx.stripePaymentIntentId) {
    console.warn(`[refund-reconciliation] tx ${txId} has no stripePaymentIntentId — rolling back.`);
    await rollBack(tx, "no_payment_intent");
    return;
  }

  let stripe: ReturnType<typeof getStripeClient>;
  try {
    stripe = getStripeClient();
  } catch {
    console.warn("[refund-reconciliation] Stripe not configured — skipping reconciliation.");
    return;
  }

  // Paginate through ALL refunds for this payment_intent so we don't miss
  // any on transactions with more than 100 refund objects (rare, but safe).
  const allRefunds: Array<{ id: string; amount: number; status: string }> = [];
  for await (const refund of stripe.refunds.list({
    payment_intent: tx.stripePaymentIntentId,
    limit: 100,
  })) {
    allRefunds.push({ id: refund.id, amount: refund.amount, status: refund.status ?? "" });
  }

  // Sum only succeeded refunds.
  const totalStripeRefundedCents = allRefunds
    .filter(r => r.status === "succeeded")
    .reduce((sum, r) => sum + r.amount, 0);

  const existingDbRefundedCents = Math.round(((tx.refundAmount ?? 0) as number) * 100);

  if (totalStripeRefundedCents > existingDbRefundedCents) {
    // Stripe has more than DB knows about — finalize.
    const depositCents = Math.round((tx.depositAmount || 0) * 100);
    const feeCents = tx.depositFeeCents ?? 0;
    const maxRefundCents = Math.max(depositCents + feeCents, tx.amountPlannedCents ?? 0);
    const newCumulativeCents = Math.min(maxRefundCents, totalStripeRefundedCents);
    const newStatus: PayLaterStatus =
      newCumulativeCents >= maxRefundCents ? "REFUNDED" : "PARTIALLY_REFUNDED";

    // Latest succeeded refund id (sorted by created desc by Stripe).
    const latestRefundId = allRefunds.find(r => r.status === "succeeded")!.id;

    const updated = await storage.recordTransactionRefund({
      id: txId,
      expectedPriorStatus: "REFUND_PENDING",
      expectedPriorRefundAmount: (tx.refundAmount ?? null) as number | null,
      newStatus,
      newRefundAmount: newCumulativeCents / 100,
      stripeRefundId: latestRefundId,
    });

    if (updated) {
      console.log(
        `[refund-reconciliation] tx ${txId} finalized → ${newStatus} ($${(newCumulativeCents / 100).toFixed(2)} refunded).`
      );
      await storage.createAuditLog({
        actorType: "system",
        action: "refund_reconciled_finalized",
        entityType: "transaction",
        entityId: txId,
        metadata: JSON.stringify({
          newStatus,
          newRefundAmount: newCumulativeCents / 100,
          stripeRefundId: latestRefundId,
          totalStripeRefundedCents,
          existingDbRefundedCents,
        }),
      });
    } else {
      // Another process beat us (race); that's fine — the row is now resolved.
      console.log(`[refund-reconciliation] tx ${txId} CAS missed (already resolved by another process).`);
    }
  } else {
    // No un-accounted Stripe refund — roll back to CHARGED.
    await rollBack(tx, "no_unaccounted_stripe_refund");
  }
}

async function rollBack(tx: Transaction, reason: string): Promise<void> {
  const txId = tx.id;
  // Determine the status to roll back to: if there was a prior partial refund,
  // go back to PARTIALLY_REFUNDED; otherwise go back to CHARGED.
  const rollbackTo: PayLaterStatus =
    (tx.refundAmount ?? 0) > 0 ? "PARTIALLY_REFUNDED" : "CHARGED";

  const rolled = await storage.transitionTransactionPayLaterStatus(
    txId,
    "REFUND_PENDING",
    rollbackTo,
    { refundAttemptedAt: null },
  );

  if (rolled) {
    // console.error so this surfaces as an error-level event in production
    // monitoring/logging (e.g. Vercel logs, Datadog) and acts as an admin alert.
    console.error(
      `[refund-reconciliation] ADMIN ACTION REQUIRED: tx ${txId} rolled back to ${rollbackTo} ` +
      `(reason: ${reason}). The operator should verify the borrower status and re-issue the refund if needed.`
    );
    await storage.createAuditLog({
      actorType: "system",
      action: "refund_reconciled_rolled_back",
      entityType: "transaction",
      entityId: txId,
      metadata: JSON.stringify({ reason, rolledBackTo: rollbackTo }),
    });
  } else {
    console.log(`[refund-reconciliation] tx ${txId} rollback CAS missed (already resolved).`);
  }
}
