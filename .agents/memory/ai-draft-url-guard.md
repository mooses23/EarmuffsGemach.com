---
name: AI draft URL guard
description: Why same-site link sanitization must use contiguous-token matching with boundaries, not newline-rejoining.
---

# Sanitizing AI-generated same-site URLs

The admin-inbox AI sometimes fabricates internal/webhook links pointing at our
own domain (e.g. an `/api/webhooks/...` path, occasionally with a `%0A`). A
deterministic guard (`server/draft-url-guard.ts`) rewrites these before they
leave the building, and a startup scrub cleans the same poison out of the
knowledge base so RAG context can't reinforce it.

**Rule: match a same-site URL as a single contiguous run of non-whitespace,
with explicit boundaries. Do NOT try to rejoin a URL split across a newline.**

**Why:** An early version tried to repair newline-split paths by joining
vertical whitespace when followed by a path char. But *every* word starts with
a path char, so it swallowed legitimate paragraph breaks — a seed doc
`.../rules\n\nABOUT THE DEPOSIT` became `.../rules THE DEPOSIT`. Because
`seedKnowledgeDocs` re-seeds canonical bodies each boot, the scrub then
"rewrote 1 record" on *every* boot in a silent corruption loop. The reported
`%0A` corruption is percent-encoded (non-whitespace), so contiguous matching
still catches it without any rejoin heuristic.

**How to apply:**
- `PUBLIC_ROUTE_SEGMENTS` is intentionally the APPROVED key-URL set only
  (`locations,borrow,apply,contact,rules,status,operator`), NOT every real
  frontend route. The AI playbook tells the model to use only the key URLs, so
  the guard corrects/drops anything else (even real pages like `/privacy-policy`
  or `/welcome/:token` → homepage). `/operator*` collapses to `/operator/login`;
  `/status/:id` keeps its token. Do not "lockstep with App.tsx" — that would
  re-broaden the allowlist.
- Sanitize host-less bare internal paths too (model sometimes emits
  `/api/webhooks/...` with no host). Only rewrite bare paths whose first segment
  is a known internal prefix (api/webhooks/admin/n/…) with a word-boundary
  lookahead `(?![A-Za-z0-9_-])` so `/news`, `/administrator`, `/api_v2`, dates
  (`12/25`) and `and/or` are left alone.
- Guard the host regex against false positives/negatives: leading lookbehind so
  the host can't match inside an email or superstring domain
  (`support@host`, `nothost.com`), trailing lookahead so a bare host can't
  swallow a longer domain (`host.com.evil.com`), and accept an optional `:port`
  so `host:443/api/...` is still sanitized.
- A per-boot "Rewrote N" (N>0) from the KB scrub that never drops to 0 means a
  canonical seed body itself trips the guard — fix the seed, not the scrub.
