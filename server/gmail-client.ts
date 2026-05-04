import { google, type gmail_v1 } from 'googleapis';
import iconv from 'iconv-lite';
import { convert as htmlToText } from 'html-to-text';

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

async function checkReplitGmailConnection(): Promise<boolean> {
  try {
    const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
    const xReplitToken = process.env.REPL_IDENTITY
      ? 'repl ' + process.env.REPL_IDENTITY
      : process.env.WEB_REPL_RENEWAL
      ? 'depl ' + process.env.WEB_REPL_RENEWAL
      : null;

    if (!hostname || !xReplitToken) return false;

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
    const item = data.items?.[0];
    return !!(item?.settings?.access_token || item?.settings?.oauth?.credentials?.access_token);
  } catch {
    return false;
  }
}

export async function getGmailConfigStatus(): Promise<{ configured: boolean; environment: string; message: string }> {
  if (isReplitEnvironment()) {
    const connected = await checkReplitGmailConnection();
    if (connected) {
      return { 
        configured: true, 
        environment: 'replit', 
        message: 'Using Replit Gmail connector' 
      };
    } else {
      return {
        configured: false,
        environment: 'replit',
        message: 'Gmail is not connected. Please connect Gmail in the Integrations panel (puzzle piece icon) on the left sidebar.'
      };
    }
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

function getHeader(headers: { name?: string | null; value?: string | null }[], name: string): string {
  const header = headers?.find(h => h.name?.toLowerCase() === name.toLowerCase());
  const raw = header?.value || '';
  // Decode RFC 2047 encoded-words (`=?charset?B|Q?...?=`) so user-visible
  // headers — Subject, From display name, To display name — render correctly
  // for non-ASCII senders. The decoder is a no-op when no encoded-word is
  // present, so Content-Type / Date / Content-Disposition are unaffected.
  return decodeRfc2047Header(raw);
}

// Pull the charset off a Content-Type header value. e.g. 'text/plain; charset="windows-1252"' -> 'windows-1252'.
// Returns null when no charset attribute is present.
function parseCharset(contentType: string | null | undefined): string | null {
  if (!contentType) return null;
  const m = contentType.match(/charset\s*=\s*"?([^";\s]+)"?/i);
  return m ? m[1].trim().toLowerCase() : null;
}

// True UTF-8 validity check using the strict, throw-on-error TextDecoder.
// We can't trust iconv-lite's UTF-8 decoder for this — it silently inserts
// U+FFFD for invalid sequences, so a follow-up "does this contain U+FFFD?"
// check would also fire on perfectly-valid UTF-8 that happens to contain
// a literal replacement character.
const STRICT_UTF8 = new TextDecoder('utf-8', { fatal: true });
function isValidUtf8(buf: Buffer): boolean {
  try {
    STRICT_UTF8.decode(buf);
    return true;
  } catch {
    return false;
  }
}

// Decode a base64url-encoded MIME part to a string, honouring the part's
// declared charset. Falls back through UTF-8 (strict-validated) → windows-1252
// → a lossy decode, so that whatever happens we always return *something*.
//
// The previous implementation called `Buffer.from(...).toString('utf-8')`
// unconditionally, which is exactly how mojibake like `Ã¢â‚¬â„¢` ends up in
// the inbox: a windows-1252 / iso-8859-1 part gets re-interpreted as UTF-8,
// invalid sequences are replaced with `\uFFFD`, and the curly quote /
// em-dash / accented character is permanently lost.
//
// `iso-8859-1` / `latin1` are treated as windows-1252 because real-world
// mailers often label windows-1252 bytes as iso-8859-1 (HTML5 does the same
// substitution), and the windows-1252 superset has the curly quotes and
// dashes that would otherwise come out as control characters.
export function decodeMimePartBytes(rawBase64Url: string, declaredCharset: string | null): string {
  const base64 = rawBase64Url.replace(/-/g, '+').replace(/_/g, '/');
  let buf: Buffer;
  try {
    buf = Buffer.from(base64, 'base64');
  } catch {
    return '';
  }

  const normalize = (enc: string | null): string | null => {
    if (!enc) return null;
    const n = enc.toLowerCase();
    if (n === 'iso-8859-1' || n === 'latin1') return 'windows-1252';
    return n;
  };

  const declared = normalize(declaredCharset);
  if (declared && iconv.encodingExists(declared)) {
    // Trust the sender's declared charset. Decoding errors just fall through
    // to the catch and we drop into the heuristic fallback below.
    try {
      return iconv.decode(buf, declared);
    } catch {
      // fall through
    }
  }

  // No declared charset (or it failed): prefer UTF-8 if the bytes are valid
  // UTF-8, otherwise treat as windows-1252 — the de-facto default for
  // single-byte Western European mail.
  if (isValidUtf8(buf)) return buf.toString('utf-8');
  try {
    return iconv.decode(buf, 'windows-1252');
  } catch {
    return buf.toString('utf-8');
  }
}

// Convert an HTML email body to readable plain text. Strips <script>,
// <style>, <head>, decodes HTML entities, collapses whitespace, and keeps
// links as `text (url)` so the URL is still discoverable.
export function htmlBodyToText(html: string): string {
  return htmlToText(html, {
    wordwrap: false,
    selectors: [
      { selector: 'a', options: { hideLinkHrefIfSameAsText: true } },
      { selector: 'img', format: 'skip' },
    ],
  });
}

interface ExtractedBody {
  body: string;
  mime: 'text/plain' | 'text/html' | 'other';
}

// True if a MIME part is an attachment (or any part with a filename) and
// therefore should not be treated as the message body. The current
// `Buffer.from(data, 'base64')` body field on attachments is rare (Gmail
// usually only sets `attachmentId`), but a sender attaching a small `.txt`
// file inline would otherwise overshadow the real HTML body in a
// multipart/mixed message.
function isAttachmentPart(part: any): boolean {
  const disp = getHeader(part?.headers || [], 'Content-Disposition').toLowerCase();
  if (disp.startsWith('attachment')) return true;
  if (part?.filename) return true;
  // Some clients emit `inline; filename=...` for inline attachments — those
  // are also not the body of the message.
  if (disp.includes('filename=')) return true;
  return false;
}

// Recursively walk the MIME tree and pick the best body part. Honours
// MIME semantics:
//   * `multipart/alternative` — pick the text/plain alternative if present,
//     otherwise text/html. (These are equivalent renderings of the same
//     content; plain is the canonical one for our purposes.)
//   * `multipart/mixed` / `multipart/related` / unknown multipart — pick
//     the *first* non-attachment body part in document order. Don't cross
//     subtrees to swap an HTML body for a `.txt` attachment.
function findBestBodyPart(payload: any): ExtractedBody | null {
  if (!payload) return null;
  if (isAttachmentPart(payload)) return null;

  const mime = String(payload.mimeType || '').toLowerCase();

  // Leaf part with body data attached directly.
  if (payload.body?.data && (mime === 'text/plain' || mime === 'text/html')) {
    const charset = parseCharset(getHeader(payload.headers || [], 'Content-Type'));
    return {
      body: decodeMimePartBytes(payload.body.data, charset),
      mime: mime as 'text/plain' | 'text/html',
    };
  }

  if (payload.parts && payload.parts.length) {
    if (mime === 'multipart/alternative') {
      // Plain wins over HTML, but only within this alternative grouping.
      let plain: ExtractedBody | null = null;
      let html: ExtractedBody | null = null;
      for (const part of payload.parts) {
        const found = findBestBodyPart(part);
        if (!found) continue;
        if (found.mime === 'text/plain' && !plain) plain = found;
        else if (found.mime === 'text/html' && !html) html = found;
        if (plain && html) break;
      }
      return plain || html || null;
    }
    // multipart/mixed, multipart/related, or anything else: take the first
    // body-bearing sub-part in document order.
    for (const part of payload.parts) {
      const found = findBestBodyPart(part);
      if (found) return found;
    }
  }

  // Fallback: a single non-multipart part with body data we don't recognize.
  // (Rare — most senders set text/plain or text/html.)
  if (payload.body?.data) {
    const charset = parseCharset(getHeader(payload.headers || [], 'Content-Type'));
    return { body: decodeMimePartBytes(payload.body.data, charset), mime: 'other' };
  }

  return null;
}

// Public extractor used by every Gmail-reading code path (single-message
// fetch, thread list, thread search-text, getThreadMessages). One source
// of truth means inbox display, AI draft input, forward-to-operator body,
// and the search index all agree on the cleaned body text.
export function extractBody(payload: any): string {
  const found = findBestBodyPart(payload);
  if (!found) return '';
  if (found.mime === 'text/html') return htmlBodyToText(found.body);
  return found.body;
}

// RFC 2047 encoded-word decoder for header values like Subject and the
// display-name portion of From/To. An encoded-word looks like
// `=?charset?encoding?encoded-text?=` where encoding is `B` (base64) or
// `Q` (quoted-printable, with `_` standing in for space). Multiple
// adjacent encoded-words separated only by whitespace must be concatenated
// without that whitespace — that's how senders break long subjects across
// folded header lines.
//
// Without this, a Hebrew/French/emoji subject lands in the inbox UI as
// literal `=?UTF-8?B?...?=` text, which is functionally indistinguishable
// from the body-mojibake bug from the user's perspective.
const ENCODED_WORD_RE = /=\?([^?\s]+)\?([BbQq])\?([^?\s]*)\?=/g;
export function decodeRfc2047Header(value: string): string {
  if (!value) return value;
  if (!value.includes('=?')) return value;

  // Drop whitespace between adjacent encoded-words (per RFC 2047 §6.2).
  // Loop until stable because each `replace` pass only collapses the first
  // gap of each match; a 3+ encoded-word folded header would otherwise keep
  // whitespace between EW2 and EW3.
  let collapsed = value;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const next = collapsed.replace(
      /(=\?[^?\s]+\?[BbQq]\?[^?\s]*\?=)\s+(=\?[^?\s]+\?[BbQq]\?[^?\s]*\?=)/g,
      '$1$2',
    );
    if (next === collapsed) break;
    collapsed = next;
  }

  return collapsed.replace(ENCODED_WORD_RE, (_match, charset, encoding, text) => {
    try {
      let bytes: Buffer;
      if (encoding.toUpperCase() === 'B') {
        bytes = Buffer.from(text, 'base64');
      } else {
        // Quoted-printable variant for headers: `_` means space; `=XX` is hex.
        const qpReady = text
          .replace(/_/g, ' ')
          .replace(/=([0-9A-Fa-f]{2})/g, (_m: string, hex: string) =>
            String.fromCharCode(parseInt(hex, 16)),
          );
        bytes = Buffer.from(qpReady, 'binary');
      }
      return decodeMimePartBytes(
        bytes.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
        charset,
      );
    } catch {
      return _match;
    }
  });
}

export interface ListEmailsResult {
  emails: EmailMessage[];
  nextPageToken?: string;
}

export type GmailListMode = 'inbox' | 'spam' | 'trash' | 'archive' | 'all' | 'sent';

function labelsForMode(mode: GmailListMode): string[] | undefined {
  switch (mode) {
    case 'inbox': return ['INBOX'];
    case 'spam': return ['SPAM'];
    case 'trash': return ['TRASH'];
    case 'sent': return ['SENT'];
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
  const listParams: gmail_v1.Params$Resource$Users$Messages$List = {
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

// One entry per Gmail conversation, with full-thread message/unread counts.
// Server-side Gmail search is performed via the Gmail `q` parameter on
// `users.threads.list`, so a thread surfaces when ANY message in the thread
// matches the search term — not just the latest one we render. Only the
// latest message's headers/body are returned in the parent fields, since
// the list view only renders that one.
export interface EmailThreadSummary extends EmailMessage {
  messageCount: number;
  unreadCount: number;
}

export interface ListEmailThreadsResult {
  threads: EmailThreadSummary[];
  nextPageToken?: string;
}

export async function listEmailThreads(
  maxResults: number = 25,
  pageToken?: string,
  mode: GmailListMode = 'inbox',
  search?: string,
): Promise<ListEmailThreadsResult> {
  const gmail = await getUncachableGmailClient();
  const labelIds = labelsForMode(mode);
  const params: gmail_v1.Params$Resource$Users$Threads$List = {
    userId: 'me',
    maxResults,
    pageToken: pageToken || undefined,
  };
  if (labelIds) params.labelIds = labelIds;
  // Combine the mode's implicit "archive" query with any user-supplied
  // search term so server-side search still respects the active folder.
  // Gmail's `q` parameter accepts free-form search syntax — we just AND
  // the trimmed user input onto whatever the mode requires.
  const qParts: string[] = [];
  if (mode === 'archive') qParts.push('-in:inbox -in:spam -in:trash');
  const trimmedSearch = (search || '').trim();
  if (trimmedSearch) qParts.push(trimmedSearch);
  if (qParts.length) params.q = qParts.join(' ');

  const resp = await gmail.users.threads.list(params);
  const threadStubs = resp.data.threads || [];
  const summaries: EmailThreadSummary[] = [];
  await Promise.all(
    threadStubs.map(async (stub) => {
      if (!stub.id) return;
      try {
        const detail = await gmail.users.threads.get({
          userId: 'me',
          id: stub.id,
          format: 'full',
        });
        const messages = detail.data.messages || [];
        if (!messages.length) return;
        const messageCount = messages.length;
        // Outbound (SENT) messages are never "unread" from the operator's perspective.
        // Exclude them from the unread tally so replied threads don't carry a stale badge.
        const rawUnreadCount = messages.filter((m) => {
          const lids = m.labelIds || [];
          return lids.includes('UNREAD') && !lids.includes('SENT');
        }).length;
        const latest = messages[messages.length - 1];
        const latestLabels = latest.labelIds || [];
        // If the latest message in the thread is outbound (SENT by the operator),
        // the conversation is fully handled — clear the unread badge even if an
        // older inbound message was left UNREAD by Gmail before the reply arrived.
        const latestIsSent = latestLabels.includes('SENT');
        const unreadCount = latestIsSent ? 0 : rawUnreadCount;

        // When listing the Sent folder, a thread may have received a reply after
        // the operator sent it. Using the absolute latest message would show the
        // inbound reply's headers and "From:" the external sender — confusing in
        // a Sent view. Instead, find the most recent SENT-labelled message and
        // use its headers/body as the representative, then use the absolute latest
        // for the date (to preserve sort order by most recent activity).
        let representative = latest;
        if (mode === 'sent') {
          for (let i = messages.length - 1; i >= 0; i--) {
            if ((messages[i].labelIds || []).includes('SENT')) {
              representative = messages[i];
              break;
            }
          }
        }

        const headers = representative.payload?.headers || [];
        const representativeLabels = representative.labelIds || [];
        summaries.push({
          id: representative.id || '',
          threadId: stub.id,
          from: getHeader(headers, 'From'),
          to: getHeader(headers, 'To'),
          subject: getHeader(headers, 'Subject'),
          snippet: representative.snippet || '',
          body: extractBody(representative.payload),
          date: getHeader(latest.payload?.headers || [], 'Date'),
          isRead: latestIsSent || !latestLabels.includes('UNREAD'),
          labels: representativeLabels,
          messageCount,
          unreadCount,
        });
      } catch (e) {
        console.warn('listEmailThreads: failed to load thread', stub.id, (e as Error)?.message);
      }
    })
  );
  summaries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return {
    threads: summaries,
    nextPageToken: resp.data.nextPageToken || undefined,
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

// Returns the IDs of all Gmail threads that contain at least one message
// sent by us (label SENT). Used to mark inbox rows as "Replied" even when
// the reply was composed directly in Gmail (not via this app). Capped to
// `maxThreads` most-recent threads to keep the call cheap; this is more
// than enough for a typical inbox view since unanswered older threads are
// rare and the badge is informational.
export async function listSentThreadIds(maxThreads: number = 500): Promise<string[]> {
  const gmail = await getUncachableGmailClient();
  const ids = new Set<string>();
  let pageToken: string | undefined;
  let safety = 5; // hard ceiling: 5 pages * 100 = 500 threads
  while (safety-- > 0) {
    const resp = await gmail.users.threads.list({
      userId: 'me',
      q: 'in:sent',
      maxResults: Math.min(100, maxThreads - ids.size),
      pageToken,
    });
    for (const t of resp.data.threads || []) {
      if (t.id) ids.add(t.id);
      if (ids.size >= maxThreads) return Array.from(ids);
    }
    pageToken = resp.data.nextPageToken || undefined;
    if (!pageToken) break;
  }
  return Array.from(ids);
}

export async function getThreadMessages(threadId: string, max?: number): Promise<EmailMessage[]> {
  const gmail = await getUncachableGmailClient();
  try {
    const thread = await gmail.users.threads.get({ userId: 'me', id: threadId, format: 'full' });
    const messages = thread.data.messages || [];
    // No cap by default; callers must opt in via `max` to truncate.
    const sliced = typeof max === 'number' && max > 0 ? messages.slice(-max) : messages;
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

export async function unarchiveEmail(messageId: string): Promise<void> {
  // Re-add INBOX label so a previously-archived message reappears in the inbox.
  const gmail = await getUncachableGmailClient();
  await gmail.users.messages.modify({
    userId: 'me',
    id: messageId,
    requestBody: {
      addLabelIds: ['INBOX']
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
  inbox: number;
  sent: number;
  spam: number;
  trash: number;
}

// Returns total messages per Gmail label (not unread). Used as a stable
// "backlog at a glance" metric for inbox folder chips.
export async function getLabelCounts(): Promise<LabelCounts> {
  const gmail = await getUncachableGmailClient();
  const ids = ['INBOX', 'SENT', 'SPAM', 'TRASH'] as const;
  const settled = await Promise.all(
    ids.map((id) =>
      gmail.users.labels
        .get({ userId: 'me', id })
        .then((r) => r.data?.messagesTotal ?? 0)
        .catch(() => 0)
    )
  );
  return { inbox: settled[0], sent: settled[1], spam: settled[2], trash: settled[3] };
}

// Returns UNREAD thread counts per Gmail label. Used by the unified
// inbox folder chips so the badge shows actionable work (unread items
// only) instead of total backlog. Threads-based so multi-message
// conversations count once, matching the inbox UI's threading model.
export async function getLabelUnreadCounts(): Promise<LabelCounts> {
  const gmail = await getUncachableGmailClient();
  const ids = ['INBOX', 'SENT', 'SPAM', 'TRASH'] as const;
  const settled = await Promise.all(
    ids.map((id) =>
      gmail.users.labels
        .get({ userId: 'me', id })
        .then((r) => r.data?.threadsUnread ?? 0)
        .catch(() => 0)
    )
  );
  return { inbox: settled[0], sent: settled[1], spam: settled[2], trash: settled[3] };
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

// Thread-level mutations: wrap users.threads.* so all messages move atomically.

export async function markThreadAsRead(threadId: string): Promise<void> {
  const gmail = await getUncachableGmailClient();
  await gmail.users.threads.modify({
    userId: 'me',
    id: threadId,
    requestBody: { removeLabelIds: ['UNREAD'] },
  });
}

export async function markThreadAsUnread(threadId: string): Promise<void> {
  const gmail = await getUncachableGmailClient();
  await gmail.users.threads.modify({
    userId: 'me',
    id: threadId,
    requestBody: { addLabelIds: ['UNREAD'] },
  });
}

export async function archiveThread(threadId: string): Promise<void> {
  const gmail = await getUncachableGmailClient();
  await gmail.users.threads.modify({
    userId: 'me',
    id: threadId,
    requestBody: { removeLabelIds: ['INBOX'] },
  });
}

export async function unarchiveThread(threadId: string): Promise<void> {
  const gmail = await getUncachableGmailClient();
  await gmail.users.threads.modify({
    userId: 'me',
    id: threadId,
    requestBody: { addLabelIds: ['INBOX'] },
  });
}

export async function trashThread(threadId: string): Promise<void> {
  const gmail = await getUncachableGmailClient();
  await gmail.users.threads.trash({ userId: 'me', id: threadId });
}

export async function untrashThread(threadId: string): Promise<void> {
  const gmail = await getUncachableGmailClient();
  await gmail.users.threads.untrash({ userId: 'me', id: threadId });
}

export async function markThreadAsSpam(threadId: string): Promise<void> {
  const gmail = await getUncachableGmailClient();
  await gmail.users.threads.modify({
    userId: 'me',
    id: threadId,
    requestBody: { addLabelIds: ['SPAM'], removeLabelIds: ['INBOX'] },
  });
}

export async function unmarkThreadSpam(threadId: string): Promise<void> {
  const gmail = await getUncachableGmailClient();
  await gmail.users.threads.modify({
    userId: 'me',
    id: threadId,
    requestBody: { addLabelIds: ['INBOX'], removeLabelIds: ['SPAM'] },
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

export async function sendNewHtmlEmail(toEmail: string, subject: string, htmlBody: string): Promise<void> {
  const recipient = extractEmailAddress(toEmail);
  assertValidEmail(recipient);
  const safeTo = sanitizeHeaderValue(recipient);
  const safeSubject = sanitizeHeaderValue(subject);
  const gmail = await getUncachableGmailClient();

  const rawMessage = [
    `To: ${safeTo}`,
    `Subject: ${safeSubject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    htmlBody
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
