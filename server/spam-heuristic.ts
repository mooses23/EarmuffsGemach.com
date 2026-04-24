/**
 * Lightweight spam heuristic for incoming web-form contact submissions.
 * Conservative on purpose — we'd rather miss a spam than mark a legitimate
 * borrower as spam. Returns true only when multiple strong signals agree.
 */

const SPAM_TOKENS = [
  'crypto', 'bitcoin', 'forex', 'casino', 'viagra', 'cialis',
  'seo service', 'guest post', 'backlink', 'rank your website',
  'investment opportunity', 'loan offer', 'lottery', 'winner!',
  'click here to claim', 'verify your account', 'wire transfer',
  'urgent reply needed', 'business proposal', 'inheritance',
];

const URL_RE = /https?:\/\/[^\s)]+/gi;
// Non-global twin used with `.test()` so we don't get bitten by global-regex
// `lastIndex` statefulness between calls.
const URL_TEST_RE = /https?:\/\/[^\s)]+/i;
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const HEBREW_LATIN_RE = /[A-Za-z\u0590-\u05FF]/;

export interface SpamScoreResult {
  score: number;
  isSpam: boolean;
  reasons: string[];
}

export function scoreContactSpam(input: {
  name?: string;
  email?: string;
  subject?: string;
  message?: string;
}): SpamScoreResult {
  const reasons: string[] = [];
  let score = 0;

  const name = (input.name || '').trim();
  const subject = (input.subject || '').trim();
  const message = (input.message || '').trim();
  const combined = `${subject}\n${message}`;
  const lower = combined.toLowerCase();

  // 1) Many URLs in message body
  const urlCount = (message.match(URL_RE) || []).length;
  if (urlCount >= 3) {
    score += 2;
    reasons.push(`${urlCount} links in message`);
  } else if (urlCount === 2) {
    score += 1;
    reasons.push('multiple links in message');
  }

  // 2) Many extra email addresses pasted into the body
  const emailCount = (message.match(EMAIL_RE) || []).length;
  if (emailCount >= 3) {
    score += 1;
    reasons.push('multiple email addresses in body');
  }

  // 3) Spam tokens
  const matchedTokens = SPAM_TOKENS.filter((tok) => lower.includes(tok));
  if (matchedTokens.length >= 2) {
    score += 2;
    reasons.push(`spam keywords: ${matchedTokens.slice(0, 3).join(', ')}`);
  } else if (matchedTokens.length === 1) {
    score += 1;
    reasons.push(`spam keyword: ${matchedTokens[0]}`);
  }

  // 4) Excessive ALL-CAPS in subject (spam-shouting)
  const subjectLetters = subject.replace(/[^A-Za-z]/g, '');
  if (subjectLetters.length >= 12) {
    const upper = subjectLetters.replace(/[^A-Z]/g, '');
    const ratio = upper.length / subjectLetters.length;
    if (ratio >= 0.7) {
      score += 1;
      reasons.push('subject is mostly ALL CAPS');
    }
  }

  // 4b) Excessive ALL-CAPS in body (spam-shouting in the message itself)
  const bodyLetters = message.replace(/[^A-Za-z]/g, '');
  if (bodyLetters.length >= 30) {
    const upper = bodyLetters.replace(/[^A-Z]/g, '');
    const ratio = upper.length / bodyLetters.length;
    if (ratio >= 0.7) {
      score += 1;
      reasons.push('body is mostly ALL CAPS');
    }
  }

  // 5) Body has no Hebrew or Latin letters at all (rare for real submissions)
  if (message.length >= 20 && !HEBREW_LATIN_RE.test(message)) {
    score += 1;
    reasons.push('no readable letters in body');
  }

  // 6) Name looks like a URL (common spam pattern)
  if (URL_TEST_RE.test(name)) {
    score += 2;
    reasons.push('name field contains a URL');
  }

  // 7) Very short body that's just a link
  const messageNoUrls = message.replace(URL_RE, '').trim();
  if (urlCount >= 1 && messageNoUrls.length < 12) {
    score += 1;
    reasons.push('body is essentially just a link');
  }

  // 8) Suspiciously long single URL (often tracker/payload links pasted by bots)
  const longestUrl = (message.match(URL_RE) || []).reduce(
    (max, u) => Math.max(max, u.length),
    0,
  );
  if (longestUrl >= 120) {
    score += 1;
    reasons.push(`very long URL in body (${longestUrl} chars)`);
  }

  return {
    score,
    isSpam: score >= 3,
    reasons,
  };
}
