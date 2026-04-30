import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "./db.js";
import { payments, transactions } from "../shared/schema.js";

/**
 * One-time backfill: cash deposits used to start in `confirming` and required
 * an admin to manually click "Confirm" before they were considered received.
 * That flow has been removed (cash is now collected in person at borrow time
 * and recorded as `completed` immediately). This backfill flips any leftover
 * pending/confirming cash rows to `completed` so the historical data lines up
 * with the new model.
 *
 * It also fixes the linked transaction rows: the old flow only set
 * `transactions.depositPaymentMethod = 'cash'` after the admin confirmed,
 * so unconfirmed cash transactions were stuck on `'pending'`.
 *
 * Idempotent: subsequent calls find no matching rows.
 */
export async function backfillPendingCashPayments(): Promise<void> {
  try {
    const updatedPayments = await db
      .update(payments)
      .set({
        status: "completed",
        completedAt: sql`COALESCE(${payments.completedAt}, NOW())`,
      })
      .where(
        and(
          eq(payments.paymentMethod, "cash"),
          inArray(payments.status, ["confirming", "pending"]),
        ),
      )
      .returning({ id: payments.id, transactionId: payments.transactionId });

    if (updatedPayments.length > 0) {
      console.log(
        `[backfill] Marked ${updatedPayments.length} legacy cash payment(s) as completed.`,
      );

      const transactionIds = Array.from(
        new Set(updatedPayments.map((p) => p.transactionId)),
      );

      const updatedTransactions = await db
        .update(transactions)
        .set({ depositPaymentMethod: "cash" })
        .where(
          and(
            inArray(transactions.id, transactionIds),
            eq(transactions.depositPaymentMethod, "pending"),
          ),
        )
        .returning({ id: transactions.id });

      if (updatedTransactions.length > 0) {
        console.log(
          `[backfill] Updated ${updatedTransactions.length} transaction(s) from depositPaymentMethod='pending' to 'cash'.`,
        );
      }
    }

    // Separately, repair any transactions that are still depositPaymentMethod='pending'
    // but already have a completed cash payment attached (e.g. confirmed via the
    // older /api/payments/:id/confirm bulk path which never updated the transaction).
    const orphanRepair = await db.execute(sql`
      UPDATE transactions t
      SET deposit_payment_method = 'cash'
      WHERE t.deposit_payment_method = 'pending'
        AND EXISTS (
          SELECT 1 FROM payments p
          WHERE p.transaction_id = t.id
            AND p.payment_method = 'cash'
            AND p.status IN ('completed', 'refunded')
        )
    `);
    const orphanCount =
      typeof (orphanRepair as any).rowCount === "number"
        ? (orphanRepair as any).rowCount
        : 0;
    if (orphanCount > 0) {
      console.log(
        `[backfill] Repaired ${orphanCount} transaction(s) with completed cash payments still marked depositPaymentMethod='pending'.`,
      );
    }
  } catch (err) {
    console.error("[backfill] Failed to backfill cash payments:", err);
  }
}
