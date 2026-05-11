/**
 * Payment Method Performance Analytics Engine
 * Analyzes payment method effectiveness and generates insights
 */

import { storage } from "./storage.js";

export class PaymentAnalyticsEngine {
  // Task #217: generatePaymentMethodAnalytics + generateRecommendations retired
  // alongside the payment_methods table. Only generateDepositReconciliation remains.


  /**
   * Generates deposit reconciliation report
   */
  static async generateDepositReconciliation(
    locationId?: number,
    dateRange?: { start: Date; end: Date }
  ): Promise<any> {
    try {
      const transactions = await storage.getAllTransactions();
      const payments = await storage.getAllPayments();

      let filteredTransactions = transactions;
      if (locationId) {
        filteredTransactions = transactions.filter(tx => tx.locationId === locationId);
      }

      if (dateRange) {
        filteredTransactions = filteredTransactions.filter(tx => 
          tx.borrowDate >= dateRange.start && tx.borrowDate <= dateRange.end
        );
      }

      const transactionIds = new Set(filteredTransactions.map(tx => tx.id));
      const relatedPayments = payments.filter(p => transactionIds.has(p.transactionId));

      // Reconciliation analysis
      const expectedDeposits = filteredTransactions.reduce((sum, tx) => sum + tx.depositAmount, 0);
      const actualDeposits = relatedPayments
        .filter(p => p.status === 'completed')
        .reduce((sum, p) => sum + p.totalAmount, 0);
      
      const pendingDeposits = relatedPayments
        .filter(p => p.status === 'confirming' || p.status === 'pending')
        .reduce((sum, p) => sum + p.totalAmount, 0);

      const refundedDeposits = relatedPayments
        .filter(p => p.status.includes('refund'))
        .reduce((sum, p) => sum + p.totalAmount, 0);

      return {
        summary: {
          totalTransactions: filteredTransactions.length,
          expectedDeposits,
          actualDeposits,
          pendingDeposits,
          refundedDeposits,
          variance: actualDeposits - expectedDeposits,
          reconciliationRate: expectedDeposits > 0 ? (actualDeposits / expectedDeposits) * 100 : 0
        },
        details: {
          completedTransactions: filteredTransactions.filter(tx => {
            const payment = relatedPayments.find(p => 
              p.transactionId === tx.id && p.status === 'completed'
            );
            return payment !== undefined;
          }).length,
          pendingTransactions: filteredTransactions.filter(tx => {
            const payment = relatedPayments.find(p => 
              p.transactionId === tx.id && (p.status === 'confirming' || p.status === 'pending')
            );
            return payment !== undefined;
          }).length,
          returnedItems: filteredTransactions.filter(tx => tx.isReturned).length
        },
        dateRange,
        locationId
      };
    } catch (error) {
      console.error('Reconciliation report error:', error);
      throw error;
    }
  }
}
