/**
 * Real-time Deposit Synchronization Service
 * Ensures all deposit-related changes propagate across the entire system
 */
import { storage } from "./storage.js";

export class DepositSyncService {
  /**
   * Synchronizes deposit confirmation across all related systems
   */
  static async syncDepositConfirmation(paymentId: number, status: string, confirmationData: any): Promise<void> {
    try {
      const payment = await storage.getPayment(paymentId);
      if (!payment) return;

      const transaction = await storage.getTransaction(payment.transactionId);
      if (!transaction) return;

      // Update transaction status based on payment confirmation
      if (status === "completed") {
        await storage.updateTransaction(transaction.id, {
          notes: `${transaction.notes || ""}\nDeposit confirmed: ${new Date().toISOString()}`
        });
      }

      // Sync location statistics
      await this.updateLocationDepositStats(transaction.locationId);

      // Trigger admin notifications for failed payments
      if (status === "failed") {
        await this.notifyAdminOfFailedDeposit(payment, transaction);
      }

      console.log(`Deposit sync completed for payment ${paymentId}: ${status}`);
    } catch (error) {
      console.error("Deposit sync error:", error);
    }
  }

  /**
   * Updates real-time location deposit statistics
   */
  static async updateLocationDepositStats(locationId: number): Promise<void> {
    try {
      const location = await storage.getLocation(locationId);
      if (!location) return;

      const transactions = await storage.getTransactionsByLocation(locationId);
      const payments = await storage.getAllPayments();
      
      const locationPayments = payments.filter(p => 
        transactions.some(t => t.id === p.transactionId)
      );

      const completedDeposits = locationPayments.filter(p => p.status === "completed");
      const pendingDeposits = locationPayments.filter(p => p.status === "confirming" || p.status === "pending");

      // Store aggregated stats (in a real system, this would go to a stats table)
      console.log(`Location ${location.name} deposit stats:`, {
        completedDeposits: completedDeposits.length,
        pendingDeposits: pendingDeposits.length,
        totalValue: completedDeposits.reduce((sum, p) => sum + p.totalAmount, 0)
      });
    } catch (error) {
      console.error("Location stats update error:", error);
    }
  }

  /**
   * Handles bulk deposit confirmations for operators
   */
  static async bulkConfirmDeposits(paymentIds: number[], operatorId: number): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const paymentId of paymentIds) {
      try {
        const payment = await storage.getPayment(paymentId);
        if (!payment) {
          failed++;
          continue;
        }

        const confirmationData = {
          bulkConfirmation: true,
          confirmedBy: operatorId,
          confirmedAt: new Date().toISOString(),
          notes: "Bulk confirmation by operator"
        };

        await storage.updatePaymentStatus(paymentId, "completed", confirmationData);
        await this.syncDepositConfirmation(paymentId, "completed", confirmationData);
        success++;
      } catch (error) {
        console.error(`Bulk confirmation failed for payment ${paymentId}:`, error);
        failed++;
      }
    }

    return { success, failed };
  }

  /**
   * Synchronizes deposit amount changes across all active transactions
   */
  static async syncDepositAmountChanges(locationId: number, newDepositAmount: number): Promise<void> {
    try {
      const transactions = await storage.getTransactionsByLocation(locationId);
      const activeTransactions = transactions.filter(t => !t.isReturned);

      for (const transaction of activeTransactions) {
        if (transaction.depositAmount !== newDepositAmount) {
          await storage.updateTransaction(transaction.id, {
            depositAmount: newDepositAmount,
            notes: `${transaction.notes || ""}\nDeposit amount updated: ${new Date().toISOString()}`
          });
        }
      }

      console.log(`Synced deposit amount changes for ${activeTransactions.length} active transactions at location ${locationId}`);
    } catch (error) {
      console.error("Deposit amount sync error:", error);
    }
  }

  /**
   * Handles deposit refund processing when items are returned
   */
  static async processDepositRefund(transactionId: number): Promise<boolean> {
    try {
      const transaction = await storage.getTransaction(transactionId);
      if (!transaction) return false;

      const payments = await storage.getPaymentsByTransaction(transactionId);
      const completedPayments = payments.filter(p => p.status === "completed");

      for (const payment of completedPayments) {
        const refundData = {
          refundProcessed: true,
          refundedAt: new Date().toISOString(),
          originalPaymentId: payment.id
        };

        // Create refund record (in a real system, this would integrate with payment processors)
        await storage.createPayment({
          transactionId: transaction.id,
          paymentMethod: payment.paymentMethod,
          paymentProvider: payment.paymentProvider,
          depositAmount: -payment.depositAmount, // Negative amount for refund
          totalAmount: -payment.totalAmount,
          status: "completed",
          paymentData: JSON.stringify(refundData)
        });
      }

      await this.syncDepositConfirmation(transactionId, "refunded", { refund: true });
      return true;
    } catch (error) {
      console.error("Deposit refund error:", error);
      return false;
    }
  }

  /**
   * Notifies administrators of failed deposits requiring attention
   */
  private static async notifyAdminOfFailedDeposit(payment: any, transaction: any): Promise<void> {
    try {
      // In a real system, this would send notifications/emails
      console.log(`ADMIN ALERT: Failed deposit for transaction ${transaction.id}`, {
        borrower: transaction.borrowerName,
        amount: payment.totalAmount,
        method: payment.paymentMethod,
        failedAt: new Date().toISOString()
      });
    } catch (error) {
      console.error("Admin notification error:", error);
    }
  }

  /**
   * Generates real-time deposit analytics
   */
  static async generateDepositAnalytics(locationId?: number): Promise<any> {
    try {
      const payments = await storage.getAllPayments();
      const transactions = await storage.getAllTransactions();
      
      let relevantTransactions = transactions;
      if (locationId) {
        relevantTransactions = transactions.filter(t => t.locationId === locationId);
      }

      const relevantPayments = payments.filter(p => 
        relevantTransactions.some(t => t.id === p.transactionId)
      );

      const analytics = {
        totalDeposits: relevantPayments.length,
        completedDeposits: relevantPayments.filter(p => p.status === "completed").length,
        pendingConfirmations: relevantPayments.filter(p => p.status === "confirming").length,
        failedDeposits: relevantPayments.filter(p => p.status === "failed").length,
        totalValue: relevantPayments.reduce((sum, p) => sum + p.totalAmount, 0),
        averageDepositAmount: relevantPayments.length > 0 ? 
          relevantPayments.reduce((sum, p) => sum + p.depositAmount, 0) / relevantPayments.length : 0,
        paymentMethodBreakdown: {
          cash: relevantPayments.filter(p => p.paymentMethod === "cash").length,
          stripe: relevantPayments.filter(p => p.paymentMethod === "stripe").length,
          paypal: relevantPayments.filter(p => p.paymentMethod === "paypal").length,
        },
        successRate: relevantPayments.length > 0 ? 
          (relevantPayments.filter(p => p.status === "completed").length / relevantPayments.length) * 100 : 0
      };

      return analytics;
    } catch (error) {
      console.error("Analytics generation error:", error);
      return null;
    }
  }
}