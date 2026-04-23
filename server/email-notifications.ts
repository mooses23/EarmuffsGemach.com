/**
 * Email Notification Service
 * Sends notifications for deposit confirmations, failures, and refunds
 */

export class EmailNotificationService {
  /**
   * Sends email notification for failed deposit confirmation
   */
  static async notifyFailedDeposit(payment: any, transaction: any): Promise<void> {
    try {
      // Email configuration would require SMTP credentials from user
      const emailData = {
        to: process.env.ADMIN_EMAIL || 'admin@gemach.com',
        subject: `Failed Deposit Confirmation - Transaction #${transaction.id}`,
        html: `
          <h2>Deposit Confirmation Failed</h2>
          <p><strong>Transaction ID:</strong> ${transaction.id}</p>
          <p><strong>Borrower:</strong> ${transaction.borrowerName}</p>
          <p><strong>Amount:</strong> $${payment.totalAmount}</p>
          <p><strong>Payment Method:</strong> ${payment.paymentMethod}</p>
          <p><strong>Error:</strong> Manual confirmation required</p>
          <p><strong>Action Required:</strong> Please review and manually confirm this deposit in the admin panel.</p>
        `
      };

      // Would integrate with email service like SendGrid, AWS SES, or SMTP
      console.log('Email notification queued:', emailData);
      
      // TODO: Implement actual email sending when user provides SMTP/email service credentials
    } catch (error) {
      console.error('Email notification error:', error);
    }
  }

  /**
   * Sends confirmation email for successful deposit
   */
  static async notifyDepositConfirmed(payment: any, transaction: any): Promise<void> {
    try {
      const emailData = {
        to: transaction.borrowerEmail,
        subject: `Deposit Confirmed - Baby Banz Earmuffs Gemach`,
        html: `
          <h2>Deposit Successfully Confirmed</h2>
          <p>Dear ${transaction.borrowerName},</p>
          <p>Your deposit of $${payment.totalAmount} has been confirmed.</p>
          <p><strong>Transaction ID:</strong> ${transaction.id}</p>
          <p><strong>Expected Return:</strong> ${transaction.expectedReturnDate}</p>
          <p>Please return the earmuffs by the expected date to receive your full refund.</p>
          <p>Thank you for using our service!</p>
        `
      };

      console.log('Confirmation email queued:', emailData);
    } catch (error) {
      console.error('Confirmation email error:', error);
    }
  }

  /**
   * Sends refund notification email
   */
  static async notifyRefundProcessed(refundAmount: number, transaction: any): Promise<void> {
    try {
      const emailData = {
        to: transaction.borrowerEmail,
        subject: `Refund Processed - Baby Banz Earmuffs Gemach`,
        html: `
          <h2>Deposit Refund Processed</h2>
          <p>Dear ${transaction.borrowerName},</p>
          <p>Your deposit refund of $${refundAmount} has been processed.</p>
          <p><strong>Transaction ID:</strong> ${transaction.id}</p>
          <p><strong>Return Date:</strong> ${transaction.actualReturnDate}</p>
          <p>Thank you for returning the earmuffs in good condition!</p>
        `
      };

      console.log('Refund email queued:', emailData);
    } catch (error) {
      console.error('Refund email error:', error);
    }
  }
}

import { sendNewEmail } from './gmail-client.js';

export interface OperatorWelcomeContext {
  locationName: string;
  locationCode: string;
  operatorName: string;
  operatorEmail: string;
  dashboardUrl: string;
  defaultPin: string;
  /** Optional personalized opening line; if omitted, a neutral one is used. */
  opener?: string;
}

function buildWelcomeEmail(ctx: OperatorWelcomeContext): { subject: string; body: string } {
  const subject = `Your Baby Banz Gemach dashboard is ready — ${ctx.locationName}`;
  const opener =
    (ctx.opener && ctx.opener.trim()) ||
    `Quick note to confirm the ${ctx.locationName} dashboard is set up and ready whenever you are.`;

  const body = `${opener}

Log in:  ${ctx.dashboardUrl}
Code:    ${ctx.locationCode}
PIN:     ${ctx.defaultPin}  (please change after your first login)

That's it — no action needed today. Reply to this email any time you need a hand.

— Baby Banz Gemach
`;
  return { subject, body };
}

export async function sendOperatorWelcomeEmail(ctx: OperatorWelcomeContext): Promise<void> {
  const { subject, body } = buildWelcomeEmail(ctx);
  await sendNewEmail(ctx.operatorEmail, subject, body);
}

export interface ReturnReminderContext {
  borrowerName: string;
  borrowerEmail: string;
  locationName: string;
  language?: 'en' | 'he';
}

function buildReturnReminderEmail(ctx: ReturnReminderContext): { subject: string; body: string } {
  const firstName = (ctx.borrowerName || '').trim().split(/\s+/)[0] || ctx.borrowerName || '';
  if (ctx.language === 'he') {
    const subject = `תזכורת עדינה — החזרת אוזניות בייבי בנז (${ctx.locationName})`;
    const body = `שלום ${firstName},

זה גמ"ח אוזניות בייבי בנז ${ctx.locationName}. אנחנו רואים שהשאלת מאיתנו אוזניות לאחרונה — כשיהיה לך רגע פנוי, נשמח אם תחזיר אותן כדי שמשפחה נוספת תוכל ליהנות מהן.

אין שום לחץ — רק תזכורת ידידותית. אם כבר החזרת, אפשר להתעלם מההודעה.

תודה רבה על העזרה!

— גמ"ח אוזניות בייבי בנז ${ctx.locationName}
`;
    return { subject, body };
  }
  const subject = `Friendly reminder — please return your Baby Banz earmuffs (${ctx.locationName})`;
  const body = `Hi ${firstName},

This is the ${ctx.locationName} Baby Banz Earmuffs Gemach. We see you recently borrowed earmuffs from us — whenever you have a moment, could you please bring them back so the next family can use them?

No rush at all — just a gentle reminder. If you've already returned them, please ignore this note.

Thank you so much for helping us keep the gemach going!

— ${ctx.locationName} Baby Banz Earmuffs Gemach
`;
  return { subject, body };
}

export async function sendReturnReminderEmail(ctx: ReturnReminderContext): Promise<void> {
  const { subject, body } = buildReturnReminderEmail(ctx);
  await sendNewEmail(ctx.borrowerEmail, subject, body);
}
