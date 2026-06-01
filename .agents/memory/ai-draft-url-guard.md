---
name: AI draft URL guard
description: How to sanitize AI-generated same-site links to an allowlist, including the bounded rule for rejoining whitespace-split URLs without swallowing prose.
---

# Sanitizing AI-generated same-site URLs

The admin-inbox AI sometimes fabricates internal/webhook links pointing at our
own domain (e.g. an `/api/webhooks/...` path, occasionally with a `%0A`). A
deterministic guard rewrites these before they leave the building, and a
startup scrub cleans the same poison out of the knowledge base so RAG context
can't reinforce it.

**Rule: rejoin a whitespace/newline-split same-site URL ONLY when the trailing
partial segment is an INCOMPLETE prefix that the next token completes into a
known segment (e.g. `ap`+`ply`→`apply`). Never rejoin across a paragraph break,
and never rejoin after an already-complete segment.**

**Why:** A naive "join vertical whitespace when followed by a path char"
heuristic swallows prose, because *every* word starts with a path char — a seed
doc `.../rules\n\nABOUT THE DEPOSIT` became `.../rules THE DEPOSIT`, and since
canonical bodies re-seed each boot the scrub "rewrote 1 record" on *every* boot
in a silent corruption loop. But refusing to rejoin at all leaves a genuine
line-wrapped link broken (`.../ap\nply` → `.../com\nply`). The completes-a-
known-segment test threads both: a complete segment like `rules` or `apply` is
never extended (so prose/next-word survives), while a true mid-word break is
repaired. The `%0A` corruption is percent-encoded (non-whitespace) so the main
contiguous-token pass catches it regardless.

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
