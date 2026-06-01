/**
 * Deposit Refund Processing Service
 * Handles comprehensive refund workflow when items are returned
 */

import { storage } from "./storage.js";
import type { UserRole } from "./depositService.js";

export class DepositRefundService {
  /**
   * Processes complete deposit refund when item is returned
   */
  static async processItemReturn(
    transactionId: number,
    returnData: {
      actualReturnDate: Date;
      returnNotes?: string;
      condition?: 'good' | 'damaged' | 'missing';
      refundAmount?: number;
    },
    userRole: UserRole,
    userId: number,
    operatorLocationId?: number
  ): Promise<{ transaction: any; refundStatus: string; refundAmount: number }> {
    try {
      if (userRole === 'borrower') {
        throw new Error('Borrowers cannot process refunds');
      }

      const transaction = await storage.getTransaction(transactionId);
      if (!transaction) {
        throw new Error(`Transaction ${transactionId} not found`);
      }

      if (userRole === 'operator') {
        if (operatorLocationId !== undefined && operatorLocationId !== transaction.locationId) {
          throw new Error('Operator not authorized for this location');
        }
      }

      if (transaction.isReturned) {
        throw new Error(`Transaction ${transactionId} already marked as returned`);
      }

      // Calculate refund amount based on condition
      let refundAmount = returnData.refundAmount || transaction.depositAmount;
      
      if (returnData.condition === 'damaged') {
        refundAmount = transaction.depositAmount * 0.5; // 50% for damaged items
      } else if (returnData.condition === 'missing') {
        refundAmount = 0; // No refund for missing items
      }

      // Mark transaction as returned
      const updatedTransaction = await storage.markTransactionReturned(transactionId);

      // Process refund payment
      const payments = await storage.getPaymentsByTransaction(transactionId);
      const completedPayment = payments.find(p => p.status === 'completed');

      let refundStatus = 'pending';
      if (completedPayment) {
        // Update the original payment row to 'refunded' — do NOT create a second
        // payment row, which would produce two contradictory records in the admin
        // transaction view and could trigger a double-refund if both paths run.
        await storage.updatePaymentStatus(completedPayment.id, 'refunded', {
          refundedAt: new Date().toISOString(),
          refundAmount,
          returnNotes: returnData.returnNotes,
          condition: returnData.condition,
        });
        refundStatus = 'refund_initiated';
      }

      return {
        transaction: updatedTransaction,
        refundStatus,
        refundAmount
      };
    } catch (error) {
      console.error('Refund processing error:', error);
      throw error;
    }
  }

  /**
   * Generates refund reconciliation report
   */
  static async generateRefundReport(dateRange?: { start: Date; end: Date }): Promise<any> {
    try {
      const transactions = await storage.getAllTransactions();
      const payments = await storage.getAllPayments();

      const refundTransactions = transactions.filter(tx => 
        tx.isReturned && 
        (!dateRange || (
          tx.actualReturnDate && 
          tx.actualReturnDate >= dateRange.start && 
          tx.actualReturnDate <= dateRange.end
        ))
      );

      const refundPayments = payments.filter(p => 
        p.status.includes('refund') &&
        refundTransactions.some(tx => tx.id === p.transactionId)
      );

      const totalRefunded = refundPayments
        .filter(p => p.status === 'refund_completed')
        .reduce((sum, p) => sum + p.totalAmount, 0);

      const pendingRefunds = refundPayments
        .filter(p => p.status === 'refund_pending')
        .reduce((sum, p) => sum + p.totalAmount, 0);

      return {
        totalReturns: refundTransactions.length,
        totalRefunded,
        pendingRefunds,
        refundTransactions: refundTransactions.map(tx => ({
          id: tx.id,
          borrowerName: tx.borrowerName,
          depositAmount: tx.depositAmount,
          returnDate: tx.actualReturnDate,
          refundStatus: refundPayments.find(p => p.transactionId === tx.id)?.status || 'no_refund'
        }))
      };
    } catch (error) {
      console.error('Refund report generation error:', error);
      throw error;
    }
  }

  /**
   * Processes bulk refunds for multiple returns (admin only)
   */
  static async processBulkRefunds(
    transactionIds: number[],
    userRole: UserRole,
    userId: number
  ): Promise<{
    successful: number;
    failed: number;
    details: Array<{ transactionId: number; status: string; error?: string }>
  }> {
    if (userRole !== 'admin') {
      return { successful: 0, failed: transactionIds.length, details: transactionIds.map(id => ({ transactionId: id, status: 'failed', error: 'Only admins can process bulk refunds' })) };
    }

    const results = [];
    let successful = 0;
    let failed = 0;

    for (const transactionId of transactionIds) {
      try {
        await this.processItemReturn(transactionId, {
          actualReturnDate: new Date(),
          returnNotes: 'Bulk return processing'
        }, userRole, userId);
        results.push({ transactionId, status: 'success' });
        successful++;
      } catch (error: any) {
        results.push({ 
          transactionId, 
          status: 'failed', 
          error: error.message 
        });
        failed++;
      }
    }

    return { successful, failed, details: results };
  }
}