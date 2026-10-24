# Replore

<!-- mcp-name: io.github.chittychat-studio/replore -->

![Replore: the repo scout for vibe coders. Find it before you build it.](docs/banner.png)

**The repo scout for vibe coders. Find it before you build it.**

A repo finder for your AI coding agent — a one-command plugin for **Claude Code**, and an MCP server for
**Codex, Cursor, Gemini CLI, Copilot, Windsurf, Cline or any other agent** ([setup](#use-in-any-other-ai-agent)). Describe your project in plain words and get the open-source GitHub repos that
**best fit** it — ranked by relevance, popularity, and how freely you can use the license — as a comparison
table: stars, what it does, relevance, license, whether you can use it in a paid product, whether it's
completely free, and how to start.

```
/replore:find a portfolio website with smooth scroll animations and good design taste
```

## Example prompts

Type `/replore:find` followed by what you're building. Plain English is fine.

- **Website:** `/replore:find a portfolio website with smooth scroll animations, starting from scratch`
- **Website:** `/replore:find landing page for my SaaS in Next.js, I'll sell it`
- **Mobile app:** `/replore:find my first iPhone app, a habit tracker, no coding experience`
- **Mobile app:** `/replore:find diet app for Android and iPhone`
- **AI agent:** `/replore:find a chatbot that answers questions from my PDFs, Python`
- **AI agent:** `/replore:find generate PowerPoint decks from my notes`
- **Data:** `/replore:find dashboard to show my sales spreadsheet as charts`
- **Games:** `/replore:find a simple 2D browser game engine for beginners`
- **Learning:** `/replore:find learn web security by hacking a practice app`
- **Learning:** `/replore:find offline maps for my trip planner app`

## Prompt template

Copy, fill in what you know, delete the rest. Only the first line is needed.

```
/replore:find
What I'm building: <one sentence>
Platform: <web / iPhone / Android / desktop / not sure>
Stack: <React, Python, Swift... or not sure>
Selling it?: <yes / no>
Starting from scratch?: <yes / no>
```

The plugin answers with a comparison table of up to 20 repos. Ask for "as a sheet" to get CSV for Excel or Google Sheets.

**Got a PRD or spec?** Attach it (or paste it) and the plugin reads every feature, searches per feature, and
returns **all** the suitable open-source repos grouped by need — not just the top 20. "All suitable" means every
open-source match that passes the filters, not every repo on GitHub.

## Web page (no install)

**Try it live: [replore.cardzo.co.in](https://replore.cardzo.co.in)** — type a project and see the top repos in your
browser, no Claude and no Python needed.

What you can do there:

- **Search in plain words.** Describe what you're building; filters (tech stack, minimum stars) are optional.
  Repos an AI check thinks don't fit move to the end, under "Less likely to fit".
- **Read each result at a glance.** Results come three to a row (SPEC RS63, RS67). Each card shows the owner, the repo
  name and its rank, when it was last updated, what the repo does, one license verdict ("Free for commercial use",
  "Must open-source your app", …), a Starter tag for ready-made templates, its main language and its stars. A
  bookmark (or a tap on the card) adds it to your plan; **Details** opens the rest in a side panel.
- **Narrow and sort what you got.** The filter panel on the left has **Licence** (free for commercial use), **Type**
  (starters and templates), **Language** (the languages found in your results), **Stars** (any, 1k+, 10k+) and
  **Updated** (any time, past year, past month). The sort menu offers best fit (the default), most stars and recently
  updated. Filters and sorting only rearrange the cards already fetched; the ranking itself never changes.
- **Look inside a repo before you pick it.** In a card's **Details**: a "Matches:" line with the words it matched,
  **Open on GitHub**, and three tools under "Look inside", each opening a free site in a new tab (SPEC RS51, RS63):
  - **Diagram** ([GitDiagram](https://gitdiagram.com)): see the structure as an architecture diagram.
  - **Wiki** ([DeepWiki](https://deepwiki.com)): AI-written docs for the repo that you can ask questions.
  - **Code** ([GitHub1s](https://github1s.com)): read the files in a VS Code-style viewer.
  - Also: **Digest** ([Gitingest](https://gitingest.com)), all the code as one text file for an AI chat, and
    **Edit** ([github.dev](https://github.dev)), GitHub's web editor.
- **Selling it?** Switch on **I'll sell it (closed source)** in the filter panel and every GPL- or AGPL-style repo
  says plainly that building on it would make you open-source your app; the build-plan prompt names the picks that
  conflict. Nothing is hidden or re-ordered (SPEC RS83). The plugin does the same with `--selling` (or "Selling it?: yes").
- **Sort by trust, if you want.** Pick **Trust (top 5)** in the sort menu to re-order the top five by their safety
  check: Scorecard score + half the Maintained score + 2 when no known vulnerabilities (SPEC RS82). Best fit stays
  the default; the plugin's `--rank trust` and the MCP tool's `rank: "trust"` do the same.
- **Check it's safe to build on.** Open **Is it safe to build on?** in a card's Details (SPEC RS53) to see its security health
  score ([OpenSSF Scorecard](https://scorecard.dev)), known vulnerabilities in its latest published package
  ([OSV.dev](https://osv.dev), via [deps.dev](https://deps.dev)), a copy-paste install command (`npm install`,
  `pip install`, `go get`, …), whether it has a README, contributing guide and good first issues, and its latest
  release. Nothing is fetched until you open it, and it never changes the ranking.
- **Find similar repos.** Paste a repo you like (`owner/repo` or its GitHub link) and get others like it.
- **Match a whole plan.** Upload a plan or PRD; it's read in your browser (never uploaded) and searched feature by
  feature.
- **Turn picks into a build plan.** Tick **Add to plan** on the repos you want (or **Select all shown**), then
  **Copy prompt**, **Open in Claude**, **Open in ChatGPT** or **Open in Gemini** to have your own AI write the plan.
  The page itself calls no AI and holds no key for this. Tip: give your agent the free
  [Context7](https://github.com/upstash/context7) MCP server so it reads each repo's current docs (SPEC RS53e).
- **Browse what's popular.** The **Trending** view lists Rising, Most stars and Most forks repos without a search.
- **Pick up where you left off.** A refresh brings your last results back; repeat searches within an hour come from
  your browser instead of GitHub. The search bar's clear button or the logo clears them.
- Light and dark themes, keyboard and screen-reader friendly, and a **Feedback** form for bugs and ideas.

A static page at `web/index.html` powers it. It auto-deploys (Cloudflare Pages) to [replore.cardzo.co.in](https://replore.cardzo.co.in)
(Cloudflare Pages) on every push to `main`. To self-host it, serve the `web/` folder from any static host; only the
relevance check and the trust check (`functions/api/`, Cloudflare Pages Functions) need Cloudflare.

The page's code is in `web/app.js` (plus `web/theme.js`); its security headers and Content-Security-Policy are in
`web/_headers` (SPEC RS49), so a new third-party script or API must be added there or the browser blocks it.
`web/robots.txt`, `web/sitemap.xml`, the canonical link and `web/404.html` are the SEO basics (SPEC RS80).
`web/evals.html` publishes the ranking evals (SPEC RS84); after editing `evals/*.json`, run
`python3 ops/build_evals_page.py` to refresh `web/evals.json`, and after editing a script run
`python3 ops/stamp_assets.py` (a test fails until both are done). Pages'
`_redirects` can't redirect a whole domain, so the 301 from `replore.pages.dev` to `replore.cardzo.co.in` is a
Cloudflare **Bulk Redirect** rule (dashboard: Rules, Redirect Rules, Bulk Redirects; source `replore.pages.dev`,
target `https://replore.cardzo.co.in`, 301, preserve path suffix and query string, include subpaths). Leave preview
hosts (`*.replore.pages.dev`) out of it.

It calls the public GitHub search API from the browser (about 10 searches a minute, no login, no key) and runs
the same filters, ranking and license labels as the plugin. The searches are keyword-based; then a small server-side
**relevance check** (`functions/api/relevance.js`, SPEC RS34) asks an AI which of the top 30 repos don't fit what you
described, and moves them to the end under a "Less likely to fit" divider. If the check is unavailable or over its free limit, you get the plain keyword
results. The page shows no note either way; the outcome is in the results' `data-gate` attribute for debugging.
Failed checks are logged as codes and timings only (SPEC RS34d) to the Cloudflare log (Pages → your project → the
deployment → Functions → Real-time logs; live only, not stored). To keep them, enable Workers Analytics Engine on the
account, then uncomment the `[[analytics_engine_datasets]]` block in `wrangler.toml`. The plugin goes further: your AI writes the searches, and its PRD mode returns every suitable repo per feature.

**How the relevance check runs (maintainer, SPEC RS34a):** `wrangler.toml` binds Cloudflare Workers AI as `AI`, so
the check works on deploy with no key (optional variable `WORKERS_AI_MODEL`, comma-separated; default `@cf/mistralai/mistral-small-3.1-24b-instruct`, then `@cf/meta/llama-3.3-70b-instruct-fp8-fast` if the first is retired, missing or busy; SPEC RS34e).
Keep the account on the Workers **Free** plan if you want it to stop at the daily free allocation rather than bill.
**Optional fallback** for when Workers AI is over its allocation or failing: in Cloudflare → your Pages project →
Settings → Variables and Secrets, add a **secret** `LLM_API_KEY` (e.g. a free Groq API key from console.groq.com) and
redeploy; optional `LLM_BASE_URL` (any OpenAI-compatible endpoint; default Groq) and `LLM_MODEL` (default
`llama-3.1-8b-instant`). With neither the binding nor the key, the page shows plain keyword results with no note.
**Bot check (SPEC RS34c, recommended):** in Cloudflare → Turnstile, add a widget for your site's hostname
(Invisible or Managed), then in the Pages project add the variable `TURNSTILE_SITE_KEY` (public) and the **secret**
`TURNSTILE_SECRET`, and redeploy. Every AI check then needs a fresh Turnstile token. **Without `TURNSTILE_SECRET` the
function refuses every AI check (SPEC RS34g, fail closed).** For local `wrangler pages dev` or a Preview deployment
without Turnstile, set the variable `ALLOW_NO_TURNSTILE` = `1` on that environment only — never on Production. The
function also limits each IP to 10 checks per 10 seconds in memory (best effort; the WAF rule below is the real limit).
Two optional **secrets** (16+ random characters each) let callers that can't run Turnstile in, and skip the per-IP limit:
`EVAL_KEY` opens the paid AI check and the meaning route, for the live eval and `ops/rag_smoke.py` only — keep it in CI
(repository secret `REPLORE_EVAL_KEY` for the `relevance-eval-live` workflow) or on your machine as `REPLORE_EVAL_KEY`, and
never hand it out. `PLUGIN_KEY` opens only the cheap meaning route (`mode:"semantic"`), so it is the one you may give to
plugin users, who set it as `REPLORE_PLUGIN_KEY`. **Replore Pro keys (SPEC RS87, RS90):** sold with a Stripe Payment
Link; set three things in Pages, then redeploy: the **secret** `STRIPE_SECRET_KEY`, which must be a Stripe **restricted
key** (Developers, API keys, Create restricted key) with **Read** on Checkout Sessions and Subscriptions and nothing else;
the **secret** `PRO_SIGNING_SECRET`, 32 or more random characters (for example `python -c "import secrets;
print(secrets.token_urlsafe(32))"`), which signs every key, so changing it invalidates every key already issued; and the
plain variable `PRO_PRICE_IDS`, the monthly and yearly Pro price ids comma-separated (copy them from the Replore Pro
product page in Stripe; `PRO_PRODUCT_ID`, the product id, works instead). The price list matters because the same Stripe
account sells other things (tips): only a subscription carrying a Pro price gets or keeps a key. Without all three the
Pro route answers `pro_off`. Set each Payment Link's success URL (After payment, "Don't show confirmation page",
redirect) to exactly `https://replore.cardzo.co.in/pro?session_id={CHECKOUT_SESSION_ID}`, switch on **Stripe Tax** on
the links (you are the seller of record), then paste the links into `PRO_URL` and `PRO_URL_YEAR` in
`web/pro-core.js`. A buyer's key, `rp.<subscription id>.<signature>`, gets the same rights as `PLUGIN_KEY` while the
subscription is active or trialing, checked with Stripe and cached 10 minutes, never stored. **Plugin `--semantic` without a key:** the server answers 403 and
the plugin silently keeps its keyword + BM25 order (no error, no meaning scores, no indexed repos). Also add a rate-limiting rule
(Security → WAF → Rate limiting rules) on the path `/api/relevance`, per IP. On the Free plan, the worst that
abuse can do is use up the day's allowance, never bill you.
**Page-view counts (maintainer, SPEC RS33):** Cloudflare Web Analytics is switched on for the Pages project, so
Cloudflare injects its cookieless beacon (`static.cloudflareinsights.com`) into every page; `PRIVACY.md` and the page's
privacy window say so. To turn it off: Cloudflare dashboard → Workers & Pages → the Replore project → **Web Analytics**
→ disable; then remove the Web Analytics wording from `PRIVACY.md`, the privacy window and this README, and drop the two
`cloudflareinsights.com` hosts from `web/_headers`.
Before adding or switching a provider, check its data-use terms (free tiers intended for prototyping, such as GitHub
Models, don't qualify) and update `PRIVACY.md`.
**Trust check (maintainer, SPEC RS53):** `functions/api/trust.js` (`GET /api/trust?repo=owner/repo&lang=…`) needs no
key, binding or setting. It asks OpenSSF Scorecard and deps.dev server-side (public repo names only, never search words
or visitor IPs) and keeps each answer in Cloudflare's edge cache for 24 hours. It accepts a package only when the
package itself names the repo as its source, because deps.dev's repo→package list includes spoofed claims. A per-IP
limit of 10 requests per 10 seconds runs in memory; for a hard limit, add a WAF rate-limiting rule on `/api/trust`.

## Install (Claude Code)

```
/plugin marketplace add chittychat-studio/replore
/plugin install replore@replore
```

Needs Python 3.11+ (the plugin tells you how to install it if it's missing). Once installed, it is available in every project.

The install also registers Replore's MCP server (`mcpServers` in `.claude-plugin/plugin.json`, SPEC RS32a), so Claude Code gets two tools,
`find_repos` and `check_repos`, besides `/replore:find`. **Windows:** the server starts with `python3`. If `python3`
isn't on your PATH (or opens the Microsoft Store), edit the installed plugin's `.claude-plugin/plugin.json` (under
`~/.claude/plugins/`) and change `"command": "python3"` to `"command": "python"`, then restart Claude Code. `/mcp`
shows whether `replore` is connected. The `/replore:find` skill doesn't need this: it finds a working Python itself.

**Optional safety log (off by default).** The plugin also declares a `UserPromptSubmit` hook,
`python3 ${CLAUDE_PLUGIN_ROOT}/hooks/security_log.py` (SPEC RS25). It is a no-op unless you set the environment
variable `REPLORE_SECURITY_LOG`: unset, it exits at once without reading your prompt or writing anything. Set it to `1`
(or a file path) to keep a local log of prompt-injection or harmful-request attempts; see [`PRIVACY.md`](PRIVACY.md).
On Windows without `python3`, the hook simply fails to start (Claude Code carries on); to use the log there, edit the
installed plugin's `hooks/hooks.json` and change `"command": "python3"` to `"command": "python"`.

After the comparison table, ask *"which of these are safe to build on?"* and the plugin runs the same check as the web
page's **Is it safe to build on?**: security health, known vulnerabilities, an install command, beginner-friendliness and
the latest release (SPEC RS56). The web page and the plugin share one set of test cases, so they give the same answer.

## Use in any other AI agent

Replore is model-agnostic. The `/plugin install` command above is Claude Code-only; every other agent loads the
same engine through **MCP** (Model Context Protocol), the open tool-connection standard Codex, Cursor, Gemini CLI,
VS Code Copilot, Windsurf and Cline all support — whatever model they run. No API key.

**1. Get Replore.** Needs Python 3.11+ and git (no git? on GitHub click **Code → Download ZIP** and unzip). On
Windows, type `python` wherever this says `python3`.

```
git clone https://github.com/chittychat-studio/replore
cd replore
pwd          # Windows: cd     — prints the full path; use it in place of /path/to/replore below
```

**2. Add the `replore` entry to your agent's MCP config.** If the file already exists, add only the `"replore": {…}`
entry inside its existing `mcpServers` block (VS Code: `servers`) — don't paste a second `{…}` or replace the file.
Then restart the agent.

| Agent | File | Entry |
|---|---|---|
| Codex CLI | `~/.codex/config.toml` | `[mcp_servers.replore]`<br>`command = "python3"`<br>`args = ["/path/to/replore/scripts/mcp_server.py"]` |
| Cursor | `~/.cursor/mcp.json` | `"mcpServers": {"replore": {"command": "python3", "args": ["/path/to/replore/scripts/mcp_server.py"]}}` |
| Gemini CLI | `~/.gemini/settings.json` | same `mcpServers` entry as Cursor |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` | same `mcpServers` entry as Cursor |
| Cline | Cline panel → **MCP Servers** → **Configure** (opens `cline_mcp_settings.json`) | same `mcpServers` entry as Cursor |
| VS Code (Copilot) | `.vscode/mcp.json` in each project (or **MCP: Add Server** in the command palette) | `"servers": {"replore": {"type": "stdio", "command": "python3", "args": ["/path/to/replore/scripts/mcp_server.py"]}}` |
| Claude Code (MCP instead of the plugin) | terminal | `claude mcp add --scope user replore -- python3 /path/to/replore/scripts/mcp_server.py` |

These are each agent's documented MCP locations at the time of writing; if one has moved, check that agent's MCP
docs — the command and argument stay the same.

**3. Ask your agent** — *"find repos for a diet app for iPhone"*. It calls Replore's `find_repos` tool and shows the
comparison table. Then *"which of these are safe to build on?"* calls `check_repos`, the same check as the web page's
**Is it safe to build on?** (SPEC RS56). Your AI writes the searches and judges which results fit; the feature-by-feature PRD mode is in the
Claude Code plugin.

**No MCP support?** Open the cloned folder in your agent. Codex, Cursor, Copilot, Cline and Windsurf read
[`AGENTS.md`](AGENTS.md) automatically; with any other agent, say *"follow AGENTS.md"*. It then runs
`scripts/scout.py` itself. Or run it by hand:

```
python3 scripts/scout.py "diet tracker app" "calorie counter" --markdown
python3 scripts/trust.py expressjs/express psf/requests      # is it safe to build on? (1-5 repos, SPEC RS56)
```

Same filters, ranking and license labels in every path. Browser-only chats with no local tools can't run it — use
the [web page](https://replore.cardzo.co.in) there.

## Replore Pro

Replore stays free: search, the comparison table, the licence check and "Safe to build on?" need no key. A **Replore
Pro** key (SPEC RS87) unlocks, today:

- **Meaning ranking** for the plugin, script and MCP server (`--semantic`, or `semantic: true` in `find_repos`): repos
  are ranked by what they do as well as by your words, on Replore's server. It works once the owner switches the
  meaning route on (see Hybrid search below).
- **No per-address queue** on Replore's server: your requests skip its per-IP burst limit.

**How to get one:** buy Pro on Stripe from the Pro button on the site (monthly or yearly). After paying, Stripe sends
you back to [replore.cardzo.co.in/pro](https://replore.cardzo.co.in/pro), which shows your key (`rp.sub_...`), saves it
in the browser you bought from (it asks first if that browser already has another key) and shows it again any time you
open `/pro` there. Lost it? Open `/pro` in the browser where you saved
it. Paste it into "I have a key" on the site in another browser, or set it as an environment variable, `REPLORE_KEY`
(the older `REPLORE_PLUGIN_KEY` still works), before you start Claude Code or your agent; in an MCP config, add it as an
`env` entry. It is sent only to Replore's own server (`replore.cardzo.co.in`), which checks its signature and asks
Stripe whether the subscription is still active; it is never printed, stored or logged. To cancel, use the link to
manage your subscription in Stripe's emails, or write to hello@cardzo.co.in; the key stops working within 10 minutes of
the subscription ending. **On sale:** once the
owner pastes the Stripe links; until then `/pro` says keys are not on sale yet.

**Optional Google sign-in (SPEC RS94):** a Pro buyer can sign in with Google on `/pro` or in the Pro window and link
their key once ("Link my Pro key to this account"); after that, signing in on any browser turns Pro on there, with no
key to paste. It is optional and only for Pro: search and everything free work signed out, and the plugin and MCP
server keep using `REPLORE_KEY`. It uses Firebase Authentication (the `firebase-app` and `firebase-auth` browser builds
of the Firebase JS SDK 12.19.0, vendored in `web/vendor/firebase-12.19.0/`, Apache-2.0). It stays switched off, with no
button and no Firebase file loaded, until the owner does these steps:

1. Create a Firebase project in the [Firebase console](https://console.firebase.google.com/) (leave Google Analytics off for it). Add a
   **Web app** to it and note its `apiKey` and `projectId` (the `authDomain` is not used: sign-in goes through Google
   Identity Services, never a Firebase popup or redirect).
2. **Authentication, Sign-in method:** enable **Google** only. Open the Google provider's **Web SDK configuration** and
   copy the **Web client ID** (the same id is in Google Cloud console, APIs and Services, Credentials, OAuth 2.0 Client
   IDs, "Web client (auto created by Google Service)"). In that Web client, set **Authorized JavaScript origins** to
   `https://replore.cardzo.co.in` and `https://replore.pages.dev` only.
3. **Authentication, Settings, Authorized domains:** keep only `replore.cardzo.co.in` and `replore.pages.dev` (remove
   `localhost`).
4. **Google Cloud console, APIs and Services, Credentials:** edit the browser API key Firebase made, set **Application
   restrictions** to **Websites** with `https://replore.cardzo.co.in/*` and `https://replore.pages.dev/*`, and **API
   restrictions** to the Identity Toolkit API and the Token Service API.
5. **Google Cloud console, IAM, Service accounts:** create a service account with only the **Firebase Authentication
   Admin** role and download one JSON key. In Cloudflare (Workers and Pages, the Replore project, Settings, Variables
   and Secrets, Production) add it as the **secret** `FIREBASE_SERVICE_ACCOUNT` (paste the whole JSON). Never commit
   it; delete the downloaded file.
6. In the same place add the plain **variables** `FIREBASE_API_KEY` and `FIREBASE_PROJECT_ID` from step 1 and
   `FIREBASE_GOOGLE_CLIENT_ID` (the Web client ID from step 2, `<digits>-<id>.apps.googleusercontent.com`). The Pro secrets above (`STRIPE_SECRET_KEY`, `PRO_SIGNING_SECRET`, `PRO_PRICE_IDS`) must be set too.
7. Optional: in Stripe, turn on the **customer portal** (Settings, Billing, Customer portal) and paste its login link
   (`https://billing.stripe.com/p/login/...`) into `PRO_PORTAL_URL` in `web/pro-core.js`, so "Delete my account" can
   point to it; then run `python ops/stamp_assets.py`.
8. Redeploy. `GET /api/auth/config` answers `{"on": true, ...}` once all of this is set, and the sign-in box appears.

`web/_headers` already allows the sign-in sources, path-scoped as Google's Identity Services guidance says
(`https://accounts.google.com/gsi/client`, `/gsi/` frames and calls, `/gsi/style`) plus `identitytoolkit.googleapis.com`
and `securetoken.googleapis.com`; `apis.google.com` and `firebaseapp.com` are never allowed. Accounts are deleted with "Delete my account"; deleting
does not cancel Stripe.

Planned, not built yet: searches on your own GitHub token, PRD batches over 20 repos, saved shortlists and a
licence-policy mode.

## Hybrid search (RAG): built, switched off

Replore can rank repos by meaning as well as by your words, and pull in repos from its own index that GitHub's
keyword search misses. Every indexed repo is checked live on GitHub before it is shown. The web page and the plugin
work the same way (plugin: `--rank hybrid`, opt-in `--semantic`). It stays off until tests show it beats the current
results, and the site only mentions it while it is on. Details: [`docs/RAG.md`](docs/RAG.md).

## How it works (rules in `SPEC.md`)

1. Claude turns your description into 1–4 GitHub search queries (RS1).
2. `scripts/scout.py` runs them against the GitHub search API in best-match (relevance) order, no forks, no
   archived repos (RS2).
3. It keeps only repos with an open-source license (RS3) that were pushed in the last 24 months (RS4).
4. Ranking is by **fit** (RS5): a composite of relevance, popularity (stars) and license-freedom, so the top
   repo is relevant *and* popular *and* free to use — not just the most-starred. Starting a new project?
   Starter templates get a boost (RS15). (`--rank stars` or `--rank balanced` change it.)
5. Claude may drop off-topic repos from the shortlist, giving a reason, but never reorders the list or adds repos (RS6).
6. Every result says in plain words whether you can use it in a paid product (RS14) and how to start (RS15).

## Run it on GitHub (no install)

Repo → Actions → **find** → Run workflow. Type searches separated by `;`. Results appear on the run's summary
page. This version has no relevance check: Claude only runs inside Claude Code.

## Limits

- Repos under 50 stars are skipped by default (`--min-stars 0` keeps them).
- Vague asks ("diet app") get a search plus an offer to narrow; "hacking" asks get one question about the purpose,
  and the plugin won't find tools for getting into other people's accounts, spying, cheats or cracks (SPEC RS18).

- This is GitHub search, not a scan of every repository. Stars measure popularity, not quality.
- Repos with no license file are excluded by default. `--license any` keeps them, flagged "all rights reserved".
- Without a token GitHub allows 10 searches a minute. Set `GITHUB_TOKEN` to raise it; the token is never printed.

## Direct use

```
python3 scripts/scout.py "animation library" "topic:css-framework" [--json | --markdown | --csv] [--license any]
    [--max-age-months 12] [--rank balanced|stars] [--prefer-starters]
```

Exit codes: 0 results, 1 no match after filtering, 2 error (network, rate limit, bad query). When every search finds
nothing, the script retries up to two broader searches (without version-like words, then the two strongest words)
and says so in a note (`note` in `--json`; SPEC RS78a).

## Development

```
pip install -r requirements-dev.txt
python3 -m pytest
node tests/test_web_logic.js        # web page logic (no network)
node tests/test_relevance_fn.mjs    # relevance check function (fake AI)
node tests/test_trust_fn.mjs        # trust check function (fake Scorecard/deps.dev)
node tests/test_pro_fn.mjs          # Pro key claim function (fake Stripe)
# tests/fixtures/trust_cases.json is run by the web tests above and by pytest (tests/test_trust.py): one behaviour, two ports
python3 evals/run.py                # fit-ranking evals
```

**Cutting a release (SPEC RS81).** One version everywhere (RS50):

1. Bump the version in `.claude-plugin/plugin.json` (`"version"`) and in `scripts/mcp_server.py` (`SERVER_INFO`), and in
   `pyproject.toml` and both places in `server.json` (the PyPI package and MCP registry entry, SPEC RS86).
2. In `CHANGELOG.md`, rename `## [Unreleased]` to `## [X.Y.Z] - YYYY-MM-DD`, start a new empty `## [Unreleased]`
   above it, and update the compare links at the bottom.
3. Merge that to `main`, then tag it and push the tag: `git tag vX.Y.Z` and `git push origin vX.Y.Z`.

The `release` workflow then checks that the tag matches both versions and that the changelog has the section, and
publishes the section as the GitHub release notes. If anything disagrees it fails and creates nothing.

## Privacy

Optional Google sign-in for Pro users, no database, nothing you type is stored: the makers of Replore never keep your ideas or searches. Signing in is never needed for search; the complete list of what sign-in stores is the "What we store about you" table in `PRIVACY.md`, and payment details are held only by Stripe. The web
page's host counts page views with Cloudflare Web Analytics (cookieless, script from `static.cloudflareinsights.com`;
it never sees your searches).
Search words go to GitHub to run the search; on the web page they also pass through a small relevance check to an AI
provider (Cloudflare Workers AI, with Groq as fallback) that moves off-topic repos to the end of the list. Fonts and scripts are served from the site itself. The plugin never uses
the relevance check. Opening **Is it safe to build on?** sends only the repo's public name and language to our trust check,
which asks OpenSSF Scorecard and Google's deps.dev without your IP or searches. In the plugin the same check runs
only when you ask for it, straight from your computer to GitHub, Scorecard and deps.dev (repo names only). Details — including what the web page keeps in your browser and the plugin's optional,
off-by-default local safety log — are in [`PRIVACY.md`](PRIVACY.md).

## Credits

Repository data from the GitHub API. Security scores from [OpenSSF Scorecard](https://scorecard.dev); package and
vulnerability data from [deps.dev](https://deps.dev) and [OSV.dev](https://osv.dev). Replore is not affiliated with or endorsed by GitHub. GitHub® is a trademark of GitHub, Inc.

Find Replore useful? The web page has a Tip button next to Star, and a QR code in the plan window (both Stripe). Tips are optional, unlock nothing, and help us keep Replore free and fund more open-source projects.

## License

MIT. See `LICENSE`.
