# Compact homepage and coverflow verification

Date: 2026-11-12. Base: merged PR #129 (`33325fb`). Branch: `fix/neon-accents`.
Authoritative brief: the owner's newly downloaded `REPLORE_SOL_HOMEPAGE_REDESIGN_EXECUTION.md`, confirmed in the conversation after the earlier similarly named specification. Explicit owner requests for neon cyan, compact spacing and coverflow are incorporated.

## Before and after

The former homepage stacked long explanatory sections below a violet-accented hero and a vertically stacked card deck. The new homepage uses the approved shorter hero and three explicit-submit example prompts, a horizontal glass coverflow with a readable center and adjacent repository summaries, a short interactive journey, agent integration strip, small Leo teaser and concise configuration-backed pricing.

The long GitHub comparison and FAQ are retained in the `#homepage-help` disclosure. Installation commands are in a smaller disclosure and the existing full agent dialog remains available. The duplicate closing CTA is removed. Existing templates, ranking evaluations, privacy, feedback, Pro and other help links remain accessible. No new routes were introduced.

The repository remains static HTML/CSS/JavaScript with Cloudflare Pages Functions. No React migration, production dependencies, auth/payment changes, provider configuration changes, data migrations or repository-cache invalidations were introduced. Dark-only behavior is retained; existing fallback theme tokens were recolored as well.

## Requirement matrix

| Brief section | Implementation | Running-system evidence / limit |
| --- | --- | --- |
| 2-3: navigation and hero | `web/index.html`, `web/app.js`, `web/redesign.css`: approved headline, supporting sentence, placeholder, Find repos, three prompts, real filters | Local Chrome: examples fill without submitting; real search returned 42 cards; widths 390/768/1440 checked |
| 4: remove purple | `web/index.html`, `web/page.css`, `web/redesign.css`, `web/app.js`: semantic colors, RGBA gradients, badges, launch colors, canvas fallback and generated avatar hues use cyan/mint | Source scan found no remaining saturated purple hex colors or purple/violet references in first-party web sources; desktop/mobile screenshots inspected. Historical raster/video assets were not recolored |
| 5: coverflow | `web/app.js`, `web/redesign.css`: active center, .87-.88 side scale, maximum 8-degree rotation, 400ms transform transitions, navy glass with 14px blur | Local Chrome: arrows, dots, side clicks, desktop pointer drag, emulated touch swipe, Home/End/Arrow keys; card nodes remain connected and unchanged; height unchanged during navigation; zero GitHub requests from navigation |
| 5: metadata/actions | Existing owner/name, description, language/topics, stars/forks, activity and license renderer retained; unknown activity explicitly labeled; Diagram/Wiki/Code and GitHub links preserved; Explore invokes existing similar-repository search | Real GitHub metadata and action URLs checked. Explore query and API failure path checked. External Diagram/Wiki/Code services were not audited or installed |
| 5: sort semantics and caching | New & popular = created within 30 days, sorted by total stars; Most stars and Most forks unchanged | All three real sort lists loaded in Chrome; returning to a cached list did not refetch |
| 5: autoplay/accessibility | Defaults off; optional six-second advance; pauses on hover, focus, manual navigation, drag, hidden document and offscreen state; immediate reduced-motion suppression | Controlled-clock browser tests passed for opt-in advance, hover, focus, offscreen and reduced motion. Only active slide links are keyboard-focusable; labeled side overlays and 44px Previous/Next controls preserved |
| 5: loading/empty/error | Explicit loading status, empty-list guidance, rate-limit/error guidance; empty controls disabled | Empty GitHub responses and HTTP 403 were intercepted only in failure tests, never used as fabricated successful repository data |
| 6-7: compact story and layout | Short Describe/Discover/Build tabs, integration strip, Leo teaser, Free/Pro cards, smaller spacing; deep content collapsed | Desktop/mobile screenshots inspected; no horizontal page overflow; keyboard journey tabs and agent/Leo/filter dialogs passed |
| 8: existing flows | Existing auth, Pro settings, checkout, templates proxy, relevance/trust APIs, ranking, selection and handoff contracts retained | Local real search, mobile selection, prompt generation with selected repo and reload recovery passed; auth/Pro/backend contracts tested offline |
| 9: release gate | Feature branch only; main remains the production trigger | Push may create an automatic Cloudflare branch preview. Production deployment requires explicit owner approval before merge to main |

## Verification commands

- `py -m pytest -q`: 287 passed.
- `py evals/run.py`: 7/7 fit and 14/14 hybrid cases passed.
- Node CI commands: web logic, auth web/functions, relevance, trust, Pro, playbooks web/functions, templates, router/functions and simulation. These tests use fake providers and incur no provider charges.
- `node --check` for first-party web scripts and `git diff --check`.
- `npm exec --yes --package wrangler -- wrangler pages functions build --outdir .qa/functions`: compiled successfully with Wrangler 4.160.1; local packaging only.
- `node tests/test_homepage_browser.mjs`: local Chrome uses real public GitHub data, no fabricated successful results. Local backend calls return a disabled response to prevent provider charges. Screenshots in ignored `.qa/`: `homepage-desktop.png`, `homepage-mobile.png`, `coverflow-desktop.png`, `coverflow-mobile.png`, `search-results.png`.
- No separate lint or TypeScript configuration exists; JavaScript syntax and existing contract checks are used. QA-only Playwright remains in ignored `.qa/`.

## Release status and limits

Production must not be inferred from a passing local build or a branch preview. The existing Cloudflare Pages pipeline deploys pushes to `main`; this work is prepared on `fix/neon-accents`. After owner approval, merge through the existing repository process once required CI passes, observe the Cloudflare deployment, verify the deployed asset hashes and smoke-test `https://replore.cardzo.co.in/` on desktop/mobile, search, selection, plan handoff, carousel controls/sorts, Pro and templates.

Live Google sign-in, Stripe purchase/claim, paid AI ranking and paid playbooks were not executed against live accounts. Existing offline contract suites cover them. The Explore test verifies its real search handler and failure recovery, not a paid AI result. Pointer drag and Chrome touch-input emulation passed, including a fix for bubbling implicit-capture loss; physical iOS/Android devices remain unverified. The app is dark-only; no light-mode switch was added. No API-provider charges were incurred by QA.

Rollback: use Cloudflare Pages' previous production deployment, or revert the merge through the protected-branch process. No data migration is involved.
