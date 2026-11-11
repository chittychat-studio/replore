# Homepage redesign verification

Date: 2026-11-12. Base: `5ea58ff72e0626306dbfc303f78252206deb6e53`.
Branch: `redesign/discovery-homepage`.

## Audit and implementation

The supplied workspace was a linked worktree whose Git directory pointed through an unavailable junction. A fresh clone of `https://github.com/chittychat-studio/replore.git` was created in the workspace's `replore/` subdirectory. No original workspace files were overwritten.

The app is static HTML/CSS/JavaScript with Cloudflare Pages Functions, not a framework app. The main routes are `/`, `/pro`, `/evals`, and `/templates/` (the existing templates pass-through). Search uses the public GitHub API, client ranking/filtering, and optional server relevance/hybrid services. Authentication uses the existing Google/Firebase flow; Pro uses the existing Stripe settings. Selection creates a prompt for the user's own AI rather than generating a PRD on Replore's server. Leo's launch planner is local. These contracts, provider configuration, authentication, payment settings and deployment settings were preserved.

Before: animated Leo/video and a moving placeholder dominated the hero; example clicks immediately searched; result matching terms required opening Details. After: the project idea and explicit search action lead; prompts fill without submitting; matching terms and source links are visible on the cards; the homepage explains discovery, evaluation and hand-off through a manual walkthrough, comparison, integration setup, launch, pricing and FAQ sections.

Browser testing also found and fixed a pre-existing duplicate `.pro-split` wrapper that nested subsequent dialogs inside the hidden Pro dialog. The regression suite verifies that the integration dialog is a direct child of the body and can open independently.

## Verification matrix

| Requirement | Files | Evidence | Status |
| --- | --- | --- | --- |
| R-01 navigation | `web/index.html`, `web/redesign.css` | Browser widths 390/768/1440; tablet overflow fixed; existing menu handlers retained | Verified locally |
| R-02 hero/search | `web/index.html`, `web/app.js`, `web/redesign.css` | Real GitHub search returned 42 cards; keyboard submit handler retained; no example-click search | Verified locally |
| R-03 real discovery | `web/app.js` | Browser used real GitHub API, not fixture success data; rate-limit error and usable retry button checked | Verified locally |
| R-04 differentiation | `web/index.html` | Source-reviewed workflow comparison with qualified claims | Implemented; reviewed |
| R-05 discovery-to-plan | `web/homepage.js`, `web/index.html` | Manual walkthrough tabs; mobile selection and prompt contains actual selected repository; reload recovery | Verified locally |
| R-06 agents | `web/homepage.js`, `web/index.html` | Existing plugin/MCP/AGENTS.md instructions reused; integration dialog opens | Verified locally; agent installation not performed |
| R-07 Leo | `web/index.html` | Existing launch dialog opens from new homepage action | Verified locally |
| R-08 pricing/FAQ/CTA | `web/homepage.js`, `web/index.html` | Prices read from existing `proConfig()`/`proButtons()`; checkout remains on `/pro`; no payment made | Implemented; billing covered by offline tests |
| R-09 cards | `web/app.js`, `web/redesign.css` | Real metadata, direct GitHub link, activity unknown state, existing license states | Verified locally; offline card tests |
| R-10 source-aware explanations | `web/app.js` | Keyword matches labeled as keyword fit; trending reasons labeled listing context; no invented scores | Implemented; reviewed |
| R-11 failures/missing data | `web/app.js` | Rate-limit browser test; visible trending error/retry; existing missing license logic preserved | Verified locally plus offline tests |
| R-12 examples | `web/app.js` | Click fills correct prompt; GitHub search request count does not increase | Verified locally |
| R-13 filters | Existing contracts retained | Filters dialog opens; offline search/filter/sort logic tests pass | Verified locally and offline; full live filter matrix not exercised |
| R-14 trending | `web/app.js`, `web/redesign.css` | Real API data; existing Rising definition is created in last 30 days sorted by stars; most-stars/forks definitions retained | Verified locally plus offline tests |
| R-15 side-by-side repo comparison | None | Proposed feature; no existing comparison workflow confirmed; no new feature invented | Deferred per spec |
| R-16 selection/planning | `tests/test_homepage_browser.mjs` | Real result selected on mobile; Generate plan contains repo; reload retains usable results; provider disabled | Verified locally; downstream AI writing a PRD not invoked |
| R-17 manual walkthrough | `web/homepage.js`, `web/index.html` | Mouse and Arrow/Home navigation; no API usage from walkthrough | Verified locally |
| R-18 integration commands | `web/homepage.js`, `web/index.html` | Commands match repository instructions; copy control has visible error fallback | Implemented; clipboard success not exercised |
| Accessibility/motion | `web/redesign.css`, `web/homepage.js` | Focus styles, semantic tabs, reduced-motion viewport tests, default-motion startup, no browser runtime errors | Verified locally; no formal WCAG audit |

## Checks run

- `py -m pytest -q`: **287 passed** after final changes.
- `py evals/run.py`: **7/7 fit cases and 14/14 hybrid cases passed**.
- All 12 Node commands from `.github/workflows/ci.yml` passed, including web logic, auth, relevance, trust, Pro, playbooks, templates, router and router simulation. The simulation used fake providers and incurred no charges.
- `node --check` for the web JavaScript files and `git diff --check`: passed. No dedicated lint or TypeScript configuration exists; the application uses plain JavaScript.
- `npm exec --yes --package wrangler -- wrangler pages functions build --outdir .qa/functions`: **Compiled Worker successfully**, Wrangler 4.160.1. This is a local build, not deployment. Static assets are served directly; there is no frontend compilation step.
- `node tests/test_homepage_browser.mjs`: **passed** in installed headless Chrome; 42 real GitHub search cards, mobile selection and prompt creation, reload recovery, rate-limit error, integration/launch/filter dialogs, three viewport widths, and motion settings; **zero page errors and zero provider calls**. Local `/api/` requests were answered with HTTP 503 to prevent paid provider access; one relevance request was handled by this disabled local endpoint.
- QA tooling is isolated in ignored `.qa/`, with no production dependency changes. To rerun: `npm install --prefix .qa --no-save --package-lock=false playwright`, then `node tests/test_homepage_browser.mjs`. Set `CHROME_PATH` if Chrome is elsewhere.
- Screenshots: `.qa/homepage-desktop.png`, `.qa/homepage-mobile.png`, `.qa/search-results.png` (local artifacts, not committed).

## Live baseline and deployment gate

Read-only pre-deployment checks returned HTTP **200** for `https://replore.cardzo.co.in/`, `/pro`, `/evals`, `/templates/`, `/api/auth/config`, and GET `/api/relevance`. The old homepage was also inspected. These are baseline checks, not live verification of the redesign.

The documented existing pipeline automatically deploys Cloudflare Pages on pushes to `main`. The redesign is prepared on a separate branch to keep the user's explicit production approval gate. No production deployment has been triggered by this work. Do not merge to `main` until the user explicitly approves production deployment and required CI checks pass.

After approval: merge the reviewed redesign PR through the existing repository process, observe the existing Cloudflare Pages deployment, verify the deployed commit/asset hashes, then smoke-test production at desktop/mobile sizes, public search, selection, plan prompt, filters, integrations, and `/pro`. Do not perform a real purchase or submit a paid AI generation as a smoke test without authorization.

Rollback: use Cloudflare Pages' rollback to the previous production deployment, or revert the redesign merge through the protected-branch process. No schema or data migration is involved.

Remaining verification limits: authenticated Google sign-in, real Stripe purchase/claim, paid AI ranking and Pro playbooks were not exercised against live accounts. Their existing offline contract suites passed. Browser plan verification covers prompt assembly and hand-off controls, not a third-party AI writing the final PRD. Production redesign verification awaits approval and deployment.
