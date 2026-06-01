/**
 * Email Notification Service
 * Sends notifications for deposit confirmations, failures, and refunds
 */

import { DEFAULT_ADMIN_EMAIL } from './config-defaults.js';

export class EmailNotificationService {
  /**
   * Sends email notification for failed deposit confirmation
   */
  static async notifyFailedDeposit(payment: any, transaction: any, adminEmail?: string): Promise<void> {
    try {
      // Email configuration would require SMTP credentials from user
      const emailData = {
        to: adminEmail || process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL,
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
  /** Message language. Defaults to English when omitted. */
  language?: 'en' | 'he';
  /** Optional personalized opening line; if omitted, a neutral one is used. */
  opener?: string;
  /** Optional fully-custom body (admin-edited). Overrides template when set. */
  customBody?: string;
}

export function buildWelcomeEmailBody(ctx: Omit<OperatorWelcomeContext, 'customBody' | 'opener'>): string {
  if (ctx.language === 'he') {
    return `ברוכים הבאים לדשבורד מנהלי גמ"ח בייבי בנז, ${ctx.locationName}!

המיקום שלך פעיל ומוכן לניהול. כך מתחילים ב-4 שלבים מהירים:

שלב 1 — פתח את הדשבורד
  ${ctx.dashboardUrl}

שלב 2 — התחבר עם פרטי המיקום שלך
  קוד מיקום:  ${ctx.locationCode}
  קוד כניסה זמני:  ${ctx.defaultPin}

שלב 3 — שנה את קוד הכניסה
  לאחר ההתחברות, עבור להגדרות ← שינוי קוד כניסה והגדר קוד פרטי שרק אתה מכיר.

שלב 4 — השלם את הפרופיל שלך
  הוסף מספר טלפון, שעות פתיחה והערות למשאילים כדי שמשפחות יוכלו ליצור איתך קשר בקלות.

זהו — הכל מוכן! השב למייל הזה בכל עת שתצטרך עזרה.

התחבר כדי לחדש מלאי, לעדכן את הפרופיל שלך ולקבל פיקדונות בכרטיס אשראי.

— גמ"ח בייבי בנז
`;
  }
  return `Welcome to the Baby Banz Gemach operator dashboard, ${ctx.locationName}!

Your location is now live and ready to manage. Here's how to get started in 4 quick steps:

Step 1 — Open your dashboard
  ${ctx.dashboardUrl}

Step 2 — Sign in with your location credentials
  Location code:  ${ctx.locationCode}
  Temporary PIN:  ${ctx.defaultPin}

Step 3 — Change your PIN
  After signing in, go to Settings → Change PIN and set a private PIN that only you know.

Step 4 — Complete your profile
  Add your phone number, opening hours, and any notes for borrowers so families can reach you easily.

That's it — you're all set! Reply to this email any time you need help.

LOG IN TO RESTOCK HEADBANDS, UPDATE YOUR PROFILE, AND ACCEPT CREDIT-CARD DEPOSITS.

— Baby Banz Gemach
`;
}

function buildWelcomeEmail(ctx: OperatorWelcomeContext): { subject: string; body: string } {
  const subject = `Your Baby Banz Gemach dashboard is ready — ${ctx.locationName}`;
  const body = ctx.customBody
    ? ctx.customBody
    : buildWelcomeEmailBody(ctx);
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

export interface ApplicationConfirmationContext {
  firstName: string;
  lastName: string;
  email: string;
  city: string;
  state: string;
  country: string;
  community?: string | null;
}

export async function sendApplicationConfirmationEmail(ctx: ApplicationConfirmationContext): Promise<void> {
  const subject = `${ctx.firstName}, we got your Gemach application — here's what happens next`;
  const locationStr = [ctx.city, ctx.state, ctx.country && ctx.country !== ctx.state ? ctx.country : null].filter(Boolean).join(", ");
  const communityStr = ctx.community ? ` in the ${ctx.community} community` : "";
  const body = `Hi ${ctx.firstName},

Thank you so much for reaching out — we're genuinely excited that you're interested in bringing a Baby Banz Earmuffs Gemach to ${locationStr}${communityStr}!

We've received your application and here's what to expect next:

1. Review (usually within a few days)
   Our team will look over your application and check whether the location is a good fit for the network.

2. We'll reach out
   If everything looks good, we'll contact you to discuss next steps, answer any questions, and get you set up with your own gemach dashboard.

3. Go live!
   Once approved, you'll receive a private link to activate your dashboard, set your PIN, and start lending earmuffs to families in your area.

In the meantime, feel free to reply directly to this email if you have any questions — we're happy to help.

Thanks again for wanting to be part of this. It really makes a difference for families!

Warmly,
The Baby Banz Gemach Network
`;
  await sendNewEmail(ctx.email, subject, body);
}

export interface AdminNewApplicationAlertContext {
  adminEmail: string;
  applicantFirstName: string;
  applicantLastName: string;
  applicantEmail: string;
  applicantPhone: string;
  city: string;
  state: string;
  country: string;
  community?: string | null;
  message?: string | null;
  applicationsUrl: string;
}

export async function sendAdminNewApplicationAlert(ctx: AdminNewApplicationAlertContext): Promise<void> {
  const subject = `New Gemach application — ${ctx.applicantFirstName} ${ctx.applicantLastName} (${ctx.city}, ${ctx.state})`;
  const communityLine = ctx.community ? `Community:  ${ctx.community}\n` : "";
  const messageLine = ctx.message ? `\nMessage from applicant:\n${ctx.message}\n` : "";
  const body = `A new application has been submitted. Details below:

Name:       ${ctx.applicantFirstName} ${ctx.applicantLastName}
Email:      ${ctx.applicantEmail}
Phone:      ${ctx.applicantPhone}
Location:   ${ctx.city}, ${ctx.state}, ${ctx.country}
${communityLine}${messageLine}
Review and approve or reject at:
${ctx.applicationsUrl}
`;
  await sendNewEmail(ctx.adminEmail, subject, body);
}
