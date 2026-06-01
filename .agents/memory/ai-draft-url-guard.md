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
- Keep `PUBLIC_ROUTE_SEGMENTS` in lockstep with `client/src/App.tsx`; the guard
  preserves any path whose first segment is a real public route (plus subpaths
  /tokens like `/status/:id`, `/welcome/:token`) and remaps everything else.
- Guard the regex against false positives/negatives: leading lookbehind so the
  host can't match inside an email or superstring domain
  (`support@host`, `nothost.com`), trailing lookahead so a bare host can't
  swallow a longer domain (`host.com.evil.com`), and accept an optional
  `:port` so `host:443/api/...` is still sanitized.
- A per-boot "Rewrote N" (N>0) from the KB scrub that never drops to 0 means a
  canonical seed body itself trips the guard — fix the seed, not the scrub.
