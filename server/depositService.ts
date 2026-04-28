import { getUncachableStripeClient, getStripePublishableKey } from './stripeClient.js';
import { storage } from './storage.js';
import { computeFeeForPaymentMethod } from './depositFees.js';
import type { Payment, Transaction, Location } from '../shared/schema.js';

export interface DepositRequest {
  locationId: number;
  borrowerName: string;
  borrowerEmail: string;
  borrowerPhone?: string;
  headbandColor?: string;
  notes?: string;
}

export interface PaymentResult {
  success: boolean;
  paymentId?: number;
  transactionId?: number;
  clientSecret?: string;
  publishableKey?: string;
  error?: string;
}

export interface ConfirmationResult {
  success: boolean;
  payment?: Payment;
  error?: string;
}

export type UserRole = 'borrower' | 'operator' | 'admin';

export class DepositService {
  static async getStripePublishableKey(): Promise<string> {
    return getStripePublishableKey();
  }

  static async createDepositTransaction(request: DepositRequest): Promise<Transaction> {
    const location = await storage.getLocation(request.locationId);
    if (!location) {
      throw new Error('Location not found');
    }

    const depositAmount = location.depositAmount || 20;

    const transaction = await storage.createTransaction({
      locationId: request.locationId,
      borrowerName: request.borrowerName,
      borrowerEmail: request.borrowerEmail,
      borrowerPhone: request.borrowerPhone || '',
      headbandColor: request.headbandColor,
      depositAmount,
      depositPaymentMethod: 'pending',
      notes: request.notes,
    });

    return transaction;
  }

  static async initiateStripePayment(
    transactionId: number,
    locationId: number
  ): Promise<PaymentResult> {
    try {
      const location = await storage.getLocation(locationId);
      if (!location) {
        return { success: false, error: 'Location not found' };
      }

      const depositAmount = location.depositAmount || 20;
      // Task #39: fee hierarchy: Stripe payment-method config > location defaults > hard defaults.
      // Both direct-deposit and pay-later flows use the same source of truth.
      const allPaymentMethods = await storage.getAllPaymentMethods();
      const stripePaymentMethod = allPaymentMethods.find(pm => pm.provider === 'stripe' && pm.isActive);
      const { feeCents: processingFee, totalCents: totalAmount } = computeFeeForPaymentMethod(
        depositAmount * 100,
        stripePaymentMethod,
        location
      );

      const stripe = await getUncachableStripeClient();

      const paymentIntent = await stripe.paymentIntents.create({
        amount: totalAmount,
        currency: 'usd',
        payment_method_types: ['card'],
        metadata: {
          transactionId: transactionId.toString(),
          locationId: locationId.toString(),
          depositAmount: (depositAmount * 100).toString(),
          processingFee: processingFee.toString(),
          type: 'earmuff_deposit'
        },
      });

      const payment = await storage.createPayment({
        transactionId,
        paymentMethod: 'stripe',
        paymentProvider: 'stripe',
        externalPaymentId: paymentIntent.id,
        depositAmount: depositAmount * 100,
        processingFee,
        totalAmount,
        status: 'pending',
        paymentData: JSON.stringify({
          paymentIntentId: paymentIntent.id,
          clientSecret: paymentIntent.client_secret,
          createdAt: new Date().toISOString()
        })
      });

      const publishableKey = await getStripePublishableKey();

      return {
        success: true,
        paymentId: payment.id,
        transactionId,
        clientSecret: paymentIntent.client_secret!,
        publishableKey
      };
    } catch (error: any) {
      console.error('Stripe payment initiation error:', error);
      return { success: false, error: error.message };
    }
  }

  static async initiateCashPayment(
    transactionId: number,
    locationId: number
  ): Promise<PaymentResult> {
    try {
      const location = await storage.getLocation(locationId);
      if (!location) {
        return { success: false, error: 'Location not found' };
      }

      const depositAmount = location.depositAmount || 20;

      const payment = await storage.createPayment({
        transactionId,
        paymentMethod: 'cash',
        paymentProvider: null,
        depositAmount: depositAmount * 100,
        processingFee: 0,
        totalAmount: depositAmount * 100,
        status: 'confirming',
        paymentData: JSON.stringify({
          createdAt: new Date().toISOString(),
          requiresConfirmation: true
        })
      });

      return {
        success: true,
        paymentId: payment.id,
        transactionId
      };
    } catch (error: any) {
      console.error('Cash payment initiation error:', error);
      return { success: false, error: error.message };
    }
  }

  static async confirmPayment(
    paymentId: number,
    userId: number,
    userRole: UserRole,
    confirmed: boolean,
    notes?: string
  ): Promise<ConfirmationResult> {
    if (userRole === 'borrower') {
      return { success: false, error: 'Borrowers cannot confirm payments' };
    }

    const payment = await storage.getPayment(paymentId);
    if (!payment) {
      return { success: false, error: 'Payment not found' };
    }

    if (payment.status !== 'confirming' && payment.status !== 'pending') {
      return { success: false, error: 'Payment cannot be confirmed in current status' };
    }

    if (userRole === 'operator') {
      const transaction = await storage.getTransaction(payment.transactionId);
      if (!transaction) {
        return { success: false, error: 'Transaction not found' };
      }
      
      const user = await storage.getUser(userId);
      if (!user || (user.locationId !== transaction.locationId && !user.isAdmin)) {
        return { success: false, error: 'Operator not authorized for this location' };
      }
    }

    const newStatus = confirmed ? 'completed' : 'failed';
    const paymentData = payment.paymentData ? JSON.parse(payment.paymentData) : {};
    
    const updatedPaymentData = {
      ...paymentData,
      confirmedBy: userId,
      confirmedAt: new Date().toISOString(),
      confirmationNotes: notes,
      confirmationStatus: confirmed ? 'approved' : 'rejected'
    };

    const updatedPayment = await storage.updatePaymentStatus(
      paymentId,
      newStatus,
      updatedPaymentData
    );

    if (confirmed && updatedPayment) {
      await storage.updateTransaction(payment.transactionId, {
        depositPaymentMethod: payment.paymentMethod
      });
    }

    return {
      success: true,
      payment: updatedPayment || undefined
    };
  }

  static async handleStripeWebhook(
    paymentIntentId: string,
    status: 'succeeded' | 'failed',
    metadata: Record<string, any>
  ): Promise<void> {
    const payments = await storage.getAllPayments();
    const payment = payments.find(p => p.externalPaymentId === paymentIntentId);
    
    if (!payment) {
      console.log('Payment not found for payment intent:', paymentIntentId);
      return;
    }

    const newStatus = status === 'succeeded' ? 'completed' : 'failed';
    const paymentData = payment.paymentData ? JSON.parse(payment.paymentData) : {};

    await storage.updatePaymentStatus(payment.id, newStatus, {
      ...paymentData,
      webhookProcessed: true,
      webhookReceivedAt: new Date().toISOString(),
      stripeMetadata: metadata
    });

    if (status === 'succeeded') {
      await storage.updateTransaction(payment.transactionId, {
        depositPaymentMethod: 'stripe'
      });
    }
  }

  static async getPaymentsByLocation(
    locationId: number,
    userRole: UserRole,
    userId?: number
  ): Promise<Payment[]> {
    if (userRole === 'borrower') {
      return [];
    }

    if (userRole === 'admin') {
      const transactions = await storage.getTransactionsByLocation(locationId);
      const transactionIds = transactions.map((t: Transaction) => t.id);
      const allPayments = await storage.getAllPayments();
      return allPayments.filter(p => transactionIds.includes(p.transactionId));
    }

    if (userRole === 'operator' && userId) {
      const user = await storage.getUser(userId);
      if (!user || user.locationId !== locationId) {
        return [];
      }
      const transactions = await storage.getTransactionsByLocation(locationId);
      const transactionIds = transactions.map((t: Transaction) => t.id);
      const allPayments = await storage.getAllPayments();
      return allPayments.filter(p => transactionIds.includes(p.transactionId));
    }

    return [];
  }

  static async getPendingConfirmations(
    userRole: UserRole,
    userId?: number,
    locationId?: number
  ): Promise<Payment[]> {
    if (userRole === 'borrower') {
      return [];
    }

    const allPayments = await storage.getAllPayments();
    let pendingPayments = allPayments.filter(p => 
      p.status === 'confirming' || p.status === 'pending'
    );

    if (userRole === 'operator' && userId) {
      const user = await storage.getUser(userId);
      if (!user || !user.locationId) {
        return [];
      }
      
      const transactions = await storage.getTransactionsByLocation(user.locationId);
      const transactionIds = transactions.map((t: Transaction) => t.id);
      pendingPayments = pendingPayments.filter(p => transactionIds.includes(p.transactionId));
    }

    return pendingPayments;
  }

  static async bulkConfirmPayments(
    paymentIds: number[],
    userId: number,
    userRole: UserRole
  ): Promise<{ success: number; failed: number }> {
    if (userRole === 'borrower') {
      return { success: 0, failed: paymentIds.length };
    }

    let successCount = 0;
    let failedCount = 0;

    for (const paymentId of paymentIds) {
      const result = await this.confirmPayment(paymentId, userId, userRole, true, 'Bulk confirmation');
      if (result.success) {
        successCount++;
      } else {
        failedCount++;
      }
    }

    return { success: successCount, failed: failedCount };
  }

  static async refundDeposit(
    transactionId: number,
    userId: number,
    userRole: UserRole,
    refundAmount?: number,
    operatorLocationId?: number
  ): Promise<{ success: boolean; error?: string }> {
    if (userRole === 'borrower') {
      return { success: false, error: 'Borrowers cannot process refunds' };
    }

    const transaction = await storage.getTransaction(transactionId);
    if (!transaction) {
      return { success: false, error: 'Transaction not found' };
    }

    if (userRole === 'operator') {
      // For PIN-based auth, operatorLocationId is already validated by the route
      if (operatorLocationId !== undefined) {
        if (operatorLocationId !== transaction.locationId) {
          return { success: false, error: 'Operator not authorized for this location' };
        }
      } else {
        // For user-based auth, check user's locationId
        const user = await storage.getUser(userId);
        if (!user || user.locationId !== transaction.locationId) {
          return { success: false, error: 'Operator not authorized for this location' };
        }
      }
    }

    const payments = await storage.getAllPayments();
    const payment = payments.find(p => 
      p.transactionId === transactionId && p.status === 'completed'
    );

    if (!payment) {
      return { success: false, error: 'No completed payment found for this transaction' };
    }

    const amountToRefund = refundAmount ? refundAmount * 100 : payment.depositAmount;

    if (payment.paymentMethod === 'stripe' && payment.externalPaymentId) {
      try {
        const stripe = await getUncachableStripeClient();
        await stripe.refunds.create({
          payment_intent: payment.externalPaymentId,
          amount: amountToRefund,
        });
      } catch (error: any) {
        console.error('Stripe refund error:', error);
        return { success: false, error: 'Stripe refund failed: ' + error.message };
      }
    }

    await storage.updatePaymentStatus(payment.id, 'refunded', {
      refundedBy: userId,
      refundedAt: new Date().toISOString(),
      refundAmount: amountToRefund
    });

    await storage.markTransactionReturned(transactionId, amountToRefund / 100);

    return { success: true };
  }
}
