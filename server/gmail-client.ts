import { google } from 'googleapis';

let connectionSettings: any;
let vercelOAuth2Client: any = null;

function isReplitEnvironment(): boolean {
  return !!(process.env.REPLIT_CONNECTORS_HOSTNAME && 
    (process.env.REPL_IDENTITY || process.env.WEB_REPL_RENEWAL));
}

function hasVercelGmailCredentials(): boolean {
  return !!(process.env.GMAIL_CLIENT_ID && 
    process.env.GMAIL_CLIENT_SECRET && 
    process.env.GMAIL_REFRESH_TOKEN);
}

async function getReplitAccessToken() {
  if (connectionSettings?.settings?.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  const response = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-mail',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  );
  
  const data = await response.json();
  connectionSettings = data.items?.[0];

  if (!connectionSettings) {
    throw new Error('Gmail not connected. Please connect Gmail in the Integrations panel (puzzle piece icon) on the left sidebar.');
  }

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings?.settings?.oauth?.credentials?.access_token;

  if (!accessToken) {
    throw new Error('Gmail connected but no access token found. Try disconnecting and reconnecting Gmail in the Integrations panel.');
  }
  
  return accessToken;
}

async function getVercelGmailClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.GMAIL_REFRESH_TOKEN
  });

  return google.gmail({ version: 'v1', auth: oauth2Client });
}

async function getReplitGmailClient() {
  const accessToken = await getReplitAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.gmail({ version: 'v1', auth: oauth2Client });
}

export async function getUncachableGmailClient() {
  if (isReplitEnvironment()) {
    return getReplitGmailClient();
  } else if (hasVercelGmailCredentials()) {
    return getVercelGmailClient();
  } else {
    throw new Error(
      'Gmail not configured. For Replit: Connect Gmail integration. ' +
      'For Vercel: Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN environment variables.'
    );
  }
}

export function getGmailConfigStatus(): { configured: boolean; environment: string; message: string } {
  if (isReplitEnvironment()) {
    return { 
      configured: true, 
      environment: 'replit', 
      message: 'Using Replit Gmail connector' 
    };
  } else if (hasVercelGmailCredentials()) {
    return { 
      configured: true, 
      environment: 'vercel', 
      message: 'Using Vercel OAuth credentials' 
    };
  } else {
    return { 
      configured: false, 
      environment: 'unknown', 
      message: 'Gmail not configured. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN for Vercel deployment.' 
    };
  }
}

export interface EmailMessage {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  snippet: string;
  body: string;
  date: string;
  isRead: boolean;
  labels: string[];
}

export interface EmailThread {
  id: string;
  messages: EmailMessage[];
  snippet: string;
  historyId: string;
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  try {
    return Buffer.from(base64, 'base64').toString('utf-8');
  } catch {
    return '';
  }
}

function getHeader(headers: { name?: string | null; value?: string | null }[], name: string): string {
  const header = headers?.find(h => h.name?.toLowerCase() === name.toLowerCase());
  return header?.value || '';
}

function extractBody(payload: any): string {
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }
  
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
    }
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
      if (part.parts) {
        const nested = extractBody(part);
        if (nested) return nested;
      }
    }
  }
  
  return '';
}

export interface ListEmailsResult {
  emails: EmailMessage[];
  nextPageToken?: string;
}

export type GmailListMode = 'inbox' | 'spam' | 'trash' | 'archive' | 'all';

function labelsForMode(mode: GmailListMode): string[] | undefined {
  switch (mode) {
    case 'inbox': return ['INBOX'];
    case 'spam': return ['SPAM'];
    case 'trash': return ['TRASH'];
    // 'archive' = mail without INBOX label, no SPAM/TRASH; Gmail has no
    // single "archive" label, so we just list everything and let the caller
    // filter. We expose it as undefined (= all mail) to the API.
    case 'archive': return undefined;
    case 'all': return undefined;
  }
}

export async function listEmails(
  maxResults: number = 25,
  pageToken?: string,
  mode: GmailListMode = 'inbox',
): Promise<ListEmailsResult> {
  const gmail = await getUncachableGmailClient();

  const labelIds = labelsForMode(mode);
  const listParams: any = {
    userId: 'me',
    maxResults,
    pageToken: pageToken || undefined,
  };
  if (labelIds) listParams.labelIds = labelIds;
  // For 'archive' mode, exclude inbox/spam/trash via search query
  if (mode === 'archive') {
    listParams.q = '-in:inbox -in:spam -in:trash';
  }

  const response = await gmail.users.messages.list(listParams);

  const messages = response.data.messages || [];
  const emails: EmailMessage[] = [];

  await Promise.all(
    messages.map(async (msg) => {
      const detail = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id!,
        format: 'full',
      });

      const headers = detail.data.payload?.headers || [];
      const body = extractBody(detail.data.payload);

      emails.push({
        id: detail.data.id!,
        threadId: detail.data.threadId!,
        from: getHeader(headers, 'From'),
        to: getHeader(headers, 'To'),
        subject: getHeader(headers, 'Subject'),
        snippet: detail.data.snippet || '',
        body,
        date: getHeader(headers, 'Date'),
        isRead: !detail.data.labelIds?.includes('UNREAD'),
        labels: detail.data.labelIds || [],
      });
    })
  );

  emails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return {
    emails,
    nextPageToken: response.data.nextPageToken || undefined,
  };
}

export async function getEmail(messageId: string): Promise<EmailMessage | null> {
  const gmail = await getUncachableGmailClient();
  
  try {
    const detail = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full'
    });

    const headers = detail.data.payload?.headers || [];
    const body = extractBody(detail.data.payload);

    return {
      id: detail.data.id!,
      threadId: detail.data.threadId!,
      from: getHeader(headers, 'From'),
      to: getHeader(headers, 'To'),
      subject: getHeader(headers, 'Subject'),
      snippet: detail.data.snippet || '',
      body,
      date: getHeader(headers, 'Date'),
      isRead: !detail.data.labelIds?.includes('UNREAD'),
      labels: detail.data.labelIds || []
    };
  } catch (error) {
    console.error('Error fetching email:', error);
    return null;
  }
}

export async function getThreadMessages(threadId: string, max: number = 6): Promise<EmailMessage[]> {
  const gmail = await getUncachableGmailClient();
  try {
    const thread = await gmail.users.threads.get({ userId: 'me', id: threadId, format: 'full' });
    const messages = thread.data.messages || [];
    const sliced = messages.slice(-max);
    return sliced.map((m: any) => {
      const headers = m.payload?.headers || [];
      return {
        id: m.id || '',
        threadId: m.threadId || threadId,
        from: getHeader(headers, 'From'),
        to: getHeader(headers, 'To'),
        subject: getHeader(headers, 'Subject'),
        snippet: m.snippet || '',
        body: extractBody(m.payload),
        date: getHeader(headers, 'Date'),
        isRead: !(m.labelIds || []).includes('UNREAD'),
        labels: m.labelIds || [],
      };
    });
  } catch (error) {
    console.error('Error fetching thread:', error);
    return [];
  }
}

export async function markAsRead(messageId: string): Promise<void> {
  const gmail = await getUncachableGmailClient();
  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: {
      removeLabelIds: ['UNREAD']
    }
  });
}

export async function markAsUnread(messageId: string): Promise<void> {
  const gmail = await getUncachableGmailClient();
  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: {
      addLabelIds: ['UNREAD']
    }
  });
}

export async function archiveEmail(messageId: string): Promise<void> {
  const gmail = await getUncachableGmailClient();
  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: {
      removeLabelIds: ['INBOX']
    }
  });
}

export async function trashEmail(messageId: string): Promise<void> {
  const gmail = await getUncachableGmailClient();
  await gmail.users.messages.trash({
    userId: 'me',
    id: messageId,
  });
}

export async function untrashEmail(messageId: string): Promise<void> {
  const gmail = await getUncachableGmailClient();
  await gmail.users.messages.untrash({
    userId: 'me',
    id: messageId,
  });
}

export async function markAsSpam(messageId: string): Promise<void> {
  const gmail = await getUncachableGmailClient();
  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: {
      addLabelIds: ['SPAM'],
      removeLabelIds: ['INBOX'],
    },
  });
}

export interface LabelCounts {
  unread: number;
  spam: number;
  trash: number;
}

export async function getLabelCounts(): Promise<LabelCounts> {
  const gmail = await getUncachableGmailClient();
  const ids = ['UNREAD', 'SPAM', 'TRASH'] as const;
  const settled = await Promise.all(
    ids.map((id) =>
      gmail.users.labels
        .get({ userId: 'me', id })
        .then((r) => r.data?.messagesTotal ?? 0)
        .catch(() => 0)
    )
  );
  return { unread: settled[0], spam: settled[1], trash: settled[2] };
}

export async function unmarkSpam(messageId: string): Promise<void> {
  const gmail = await getUncachableGmailClient();
  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: {
      addLabelIds: ['INBOX'],
      removeLabelIds: ['SPAM'],
    },
  });
}

function sanitizeHeaderValue(v: string): string {
  return String(v ?? '').replace(/[\r\n]+/g, ' ').trim();
}
function assertValidEmail(email: string): void {
  const cleaned = sanitizeHeaderValue(email);
  if (!/^[^\s<>"]+@[^\s<>"]+\.[^\s<>"]+$/.test(cleaned)) {
    throw new Error(`Invalid recipient email: ${email}`);
  }
}
function extractEmailAddress(value: string): string {
  const cleaned = sanitizeHeaderValue(value);
  const angle = cleaned.match(/<([^>]+)>/);
  if (angle && angle[1]) return angle[1].trim();
  return cleaned;
}

export async function sendNewEmail(toEmail: string, subject: string, body: string): Promise<void> {
  const recipient = extractEmailAddress(toEmail);
  assertValidEmail(recipient);
  const safeTo = sanitizeHeaderValue(recipient);
  const safeSubject = sanitizeHeaderValue(subject);
  const gmail = await getUncachableGmailClient();
  
  const rawMessage = [
    `To: ${safeTo}`,
    `Subject: ${safeSubject}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    body
  ].join('\r\n');

  const encodedMessage = Buffer.from(rawMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: encodedMessage
    }
  });
}

export async function sendReply(messageId: string, threadId: string, replyText: string, toEmail: string, subject: string): Promise<void> {
  const gmail = await getUncachableGmailClient();
  
  const recipient = extractEmailAddress(toEmail);
  assertValidEmail(recipient);
  const safeTo = sanitizeHeaderValue(recipient);
  const baseSubject = sanitizeHeaderValue(subject);
  const replySubject = baseSubject.startsWith('Re:') ? baseSubject : `Re: ${baseSubject}`;
  const safeMessageId = sanitizeHeaderValue(messageId);
  
  const rawMessage = [
    `To: ${safeTo}`,
    `Subject: ${replySubject}`,
    `In-Reply-To: ${safeMessageId}`,
    `References: ${safeMessageId}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    replyText
  ].join('\r\n');

  const encodedMessage = Buffer.from(rawMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: encodedMessage,
      threadId
    }
  });
}
