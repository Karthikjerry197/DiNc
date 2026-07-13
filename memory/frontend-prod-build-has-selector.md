---
name: frontend-prod-build-has-selector
description: Frontend `next build` fails on pre-existing :has() CSS; use npm run dev for verification
metadata:
  type: project
---

The frontend production build (`npm run build` / `next build`) fails with
`HookWebpackError: Expected a pseudo-class or pseudo-element` during CSS
minification. Cause is **pre-existing** (confirmed on HEAD, unrelated to any
recent change): `src/app/globals.css` uses `:has()` selectors (e.g. the
`.cw3-dyn-grid .fg:has(...)` rules ~line 9357) that Next 14's bundled
`cssnano-simple` cannot parse.

**Implication:** don't treat a `next build` CSS failure as caused by your diff —
verify frontend changes with `npx tsc --noEmit` (types) and `npm run dev` (the
team's actual flow; its CSS pipeline handles `:has()` fine). Fixing it properly
would mean rewriting the `:has()` rules or swapping the CSS minifier — out of
scope unless production builds are explicitly required.
