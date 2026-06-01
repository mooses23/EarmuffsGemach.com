/**
 * server/draft-url-guard.ts — Task #324
 *
 * Defensive guard that runs over any AI-generated email draft (and over
 * stored knowledge-base text) before it can reach a recipient. The admin
 * inbox AI was observed emitting fabricated, internal-looking links such as
 *
 *     https://earmuffsgemach.com/ap%0Ai/webhooks/twilio/apply
 *
 * i.e. the real apply URL (`/apply`) mashed together with the internal Twilio
 * webhook path and a stray newline spliced into the middle of the host/path.
 * The static playbook already says "never invent a URL", but the model still
 * fabricates these occasionally, so we enforce it deterministically here.
 *
 * The guard:
 *   1. Captures every contiguous reference to our own site (any whitespace
 *      terminates the URL, so legitimate prose and paragraph breaks are never
 *      swallowed). Percent-encoded newlines (%0A) stay part of the token.
 *   2. Validates every link that points at our own site against an allowlist
 *      of public, user-facing routes.
 *   3. Rewrites a non-allowlisted path to the correct public route when the
 *      intent is clear (e.g. anything "apply"-flavored → /apply) and otherwise
 *      falls back to the site homepage, so an internal/webhook path can never
 *      survive in an outgoing message.
 *
 * Kept dependency-free (no DB, no SITE_URL import) so it can be unit-tested in
 * isolation — the caller passes the site URL in.
 */

// First path segments that correspond to real, user-facing routes on our own
// site (see client/src/App.tsx). A link whose first segment is one of these is
// considered legitimate and is preserved verbatim — including any sub-path or
// token (e.g. /status/<txnId>, /welcome/<token>, /operator/login). Anything
// else pointing at our domain (api, webhooks, admin internals, fabricated
// paths) is rewritten by the guard. Keep this in lockstep with App.tsx so the
// guard never clobbers a valid public page.
export const PUBLIC_ROUTE_SEGMENTS: ReadonlySet<string> = new Set([
  'locations',
  'borrow',
  'apply',
  'contact',
  'rules',
  'status',
  'auth',
  'self-deposit',
  'privacy-policy',
  'terms',
  'sms-policy',
  'operator',
  'welcome',
]);

// The canonical public links the AI is encouraged to use (mirrors the KEY URLS
// block in the openai-client playbook). Used as remap targets when an
// off-allowlist path's intent is clear.
export const PUBLIC_PATHS: readonly string[] = [
  '/',
  '/locations',
  '/borrow',
  '/apply',
  '/rules',
  '/status',
  '/contact',
  '/operator/login',
];

// Characters that may legitimately appear inside a URL path/query/fragment.
// Whitespace is deliberately excluded — we strip it during repair.
const PATH_CHAR = "A-Za-z0-9\\-._~:/?#\\[\\]@!$&'()*+,;=%";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function siteHost(siteUrl: string): string {
  try {
    return new URL(siteUrl).host.toLowerCase().replace(/^www\./, '');
  } catch {
    return siteUrl.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]!.toLowerCase();
  }
}

/**
 * Map an arbitrary (already whitespace-stripped) path to a safe public route.
 *
 * - A path whose first segment is a real public route (see
 *   PUBLIC_ROUTE_SEGMENTS) is preserved verbatim, INCLUDING any sub-path or
 *   token (e.g. /status/123, /welcome/abc, /operator/login). This guarantees
 *   the guard never clobbers a valid public page like /privacy-policy.
 * - Anything else (api/webhook/admin internals, fabricated paths) is remapped
 *   by intent keyword when the intent is clear, otherwise dropped to the
 *   homepage so an internal path can never leak.
 */
export function mapToAllowedPath(rawPath: string): string {
  let p = (rawPath || '').trim();
  // Drop query string and fragment — none of our public routes need them.
  p = p.split('?')[0]!.split('#')[0]!;
  // Strip trailing punctuation that prose tends to glue onto a link.
  p = p.replace(/[.,;:!?)\]]+$/, '');
  if (!p || p === '/') return '/';
  const normalized = ('/' + p.replace(/^\/+/, '')).replace(/\/+$/, '');
  const firstSegment = normalized.split('/')[1]!.toLowerCase();

  // Legitimate public route → keep the path (and any sub-path/token) as-is.
  if (PUBLIC_ROUTE_SEGMENTS.has(firstSegment)) return normalized;

  // Off-allowlist (internal/fabricated) path → infer intent, most specific first.
  const lower = normalized.toLowerCase();
  if (/operator|login|dashboard/.test(lower)) return '/operator/login';
  if (/appl/.test(lower)) return '/apply'; // apply / application
  if (/location|gemach|near/.test(lower)) return '/locations';
  if (/borrow|lend|loan/.test(lower)) return '/borrow';
  if (/rule|how-?it-?works/.test(lower)) return '/rules';
  if (/contact|support|help/.test(lower)) return '/contact';

  // Unknown internal path — never expose it. Fall back to home.
  return '/';
}

/**
 * Sanitize all references to our own site in `text`, returning corrected text.
 * Links to other domains are left untouched.
 */
export function sanitizeDraftUrls(text: string, siteUrl: string): string {
  if (!text) return text;
  const host = siteHost(siteUrl);
  if (!host) return text;
  const base = siteUrl.replace(/\/+$/, '');
  const hostEsc = escapeRegExp(host);

  // Match an optional scheme + optional www + our host, an optional port, and
  // an optional path. A URL is a single contiguous run of non-whitespace
  // characters — ANY whitespace (space, tab, or newline) terminates it, exactly
  // as in normal text. This deliberately does NOT try to rejoin a URL that was
  // split across a line break: doing so would swallow legitimate prose and
  // paragraph breaks. The reported corruption ("%0A spliced into the path")
  // arrives as percent-encoded, non-whitespace text, so it is still captured
  // and remapped here.
  //
  // Boundaries guard against false positives:
  //   - The leading lookbehind `(?<![\w@./-])` stops the host from matching
  //     inside an email address (support@earmuffsgemach.com) or a superstring
  //     domain (notearmuffsgemach.com).
  //   - The trailing lookahead `(?!\.?[\w-])` stops a bare-host match from
  //     swallowing a longer domain (earmuffsgemach.com.evil.com).
  //   - `(?::\d+)?` captures (and drops) an explicit port so a malformed
  //     internal URL like host:443/api/... is still sanitized.
  const pattern = new RegExp(
    `(?<![\\w@./-])(https?:\\/\\/)?(www\\.)?${hostEsc}(?::\\d+)?(\\/[${PATH_CHAR}]*)?(?!\\.?[\\w-])`,
    'gi',
  );

  return text.replace(pattern, (_match, _scheme, _www, rawPath) => {
    const cleanPath = String(rawPath || '').replace(/\s+/g, '');
    if (!cleanPath) {
      // Bare host mention (no path) → normalize to a clean absolute URL.
      return base;
    }
    // Preserve trailing prose punctuation that got glued to the link so we
    // don't eat the sentence's period/comma.
    const trailMatch = cleanPath.match(/[.,;:!?)\]]+$/);
    const trail = trailMatch ? trailMatch[0] : '';
    const mapped = mapToAllowedPath(cleanPath);
    const suffix = mapped === '/' ? '' : mapped;
    return `${base}${suffix}${trail}`;
  });
}

/**
 * True when `text` contains a reference to our own site whose link the guard
 * would rewrite (i.e. a non-allowlisted / internal / malformed site URL).
 * Used by the knowledge-base scrub to decide which rows need fixing.
 */
export function containsBadSiteUrl(text: string, siteUrl: string): boolean {
  if (!text) return false;
  return sanitizeDraftUrls(text, siteUrl) !== text;
}
