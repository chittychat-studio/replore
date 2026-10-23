# Replore monetisation plan (SPEC RS88)

The owner's plan, in the owner's order, with the state of each step on 2026-10-23. Prices here are the owner's
**planned** prices: they appear only in this file, never in `SPEC.md` or on the site until the owner publishes them.
Statuses: **done** (live), **built** (in the code, waiting for an owner switch or account), **owner step** (needs the
owner, no code), **not started**. "Not verified" marks a number or fact I could not confirm from a primary source.

## 1. Distribution first

| Step | Status | Where |
|---|---|---|
| Plugin manifest ready for Anthropic's directory (listing links, icon, category, tags, scoped skill tools) | built | RS85, `.claude-plugin/` |
| Hook in exec form (directory checklist, Windows) | built | RS25, `hooks/hooks.json` |
| Submission pack: directory copy and data-handling answers, MCP registry (`pyproject.toml`, `server.json`), PulseMCP, Glama | built | RS86, `docs/LISTING.md` |
| Submit to the Anthropic directory | owner step | `docs/LISTING.md` section 1 |
| Publish `replore-mcp` to PyPI, then `mcp-publisher publish` | owner step | `docs/LISTING.md` section 2 |
| PulseMCP (closed to submissions on 2026-10-23; picks up the MCP registry) and Glama | owner step | `docs/LISTING.md` section 3 |
| Move `video/` to its own repository before the directory scan | owner step (decision) | `docs/LISTING.md` section 0 |

## 2. Replore Pro: hosted key

- **Price (planned):** 8 USD a month or 72 USD a year.
- **Merchant of record:** Polar (polar.sh). The owner's plan says 4% + 40c a transaction. **Not verified, and it
  differs from Polar's pricing page on 2026-10-23:** Starter 5% + 50c, Pro 3.8% + 40c, Growth 3.6% + 35c,
  Scale 3.4% + 30c, plus 1.5% for non-US cards. At 8 USD on Starter that is about 0.90 USD a sale (11%); check the
  plan you sign up for.
- **Delivery:** Polar issues a license key as a "License key" benefit on the product. Replore validates it with
  Polar on each new key (cached 10 minutes), never stores it.

| Step | Status | Where |
|---|---|---|
| Rule: what a Pro key is, how it is checked, what it unlocks | done (written) | RS87 |
| Server: Polar validation, fail closed, cache, codes-only logs, `pro_off` switch | built | `functions/api/relevance.js` |
| Plugin, script, MCP server: `REPLORE_KEY`, sent only to Replore's hosts | built | `scripts/hybrid.py`, `scripts/mcp_server.py` |
| Web: sends a stored `replore.key` on relevance checks | built (no visible UI) | `web/app.js` |
| Pro window on the web ("Leo, Pro": buy link, key field) | built, hidden until `PRO_URL` is set | RS89, `web/index.html`, `web/app.js` |
| Polar organisation, product, license-key benefit; set `POLAR_ORG_ID` (and `POLAR_BENEFIT_ID`) in Pages | owner step | checklist below |
| Switch the meaning route on (`RAG_PLUGIN=1` plus `RAG_RERANK=1` or the index) so Pro has something to unlock | owner step | RS42, `docs/RAG.md` |

**What Pro unlocks today:** the meaning route (`mode: "semantic"`) and skipping the per-IP limiter, exactly what
`PLUGIN_KEY` unlocks. **Planned, not built:** searches on the user's own GitHub token, PRD batch over 20 repos, saved
shortlists, licence-policy mode.

## 3. Sponsored starter slots

- **Plan:** 99 USD a month per intent category (for example "SaaS starter"), one clearly labelled "Sponsored" slot
  shown beside the results, **never inside the ranking** (RS9, RX3: sponsorship can't move a repo, and repo text stays
  data). Needs its own SPEC rule, a label design picked by the owner, and a disclosure in PRIVACY before it ships.
- **Status:** not started.

## 4. Affiliate "how to start" links

- **Plan:** where a result's "how to start" points at a paid service (hosting, a database), an affiliate link may be
  used, disclosed in PRIVACY and next to the link. Never changes ranking or which repos show (RX3).
- **Status:** not started (needs a SPEC rule and the PRIVACY disclosure first).

## 5. Team tier

- **Plan:** 25 USD a seat a month: Pro for every seat, shared shortlists. Shared shortlists need storage the product
  does not have today (RS33 says no database), so this needs a rule and a privacy change first.
- **Status:** not started.

## 6. API

- **Plan:** only on request, and only running on the customer's own GitHub token (so Replore never pools GitHub quota
  or resells GitHub data).
- **Status:** not started.

## 7. Workers AI unit economics

Cloudflare Workers AI pricing, checked on 2026-10-23 (developers.cloudflare.com/workers-ai/platform/pricing):
10,000 neurons a day free, then 0.011 USD per 1,000 neurons on Workers Paid (the Free plan stops at the allowance
instead of billing, RS34a).

| Call | Neurons (Cloudflare's table) | Rough cost per call past the free allowance |
|---|---|---|
| Relevance judge, Mistral Small 3.1 24B, about 2,500 input and 30 output tokens | 31,876 per million input, 50,488 per million output: about 81 | about 0.0009 USD |
| Meaning scores, bge-m3, about 31 short texts, about 1,500 tokens | 1,075 per million input: about 2 | about 0.00002 USD |

So the free allowance covers roughly 120 judge calls a day, and the meaning route is close to free; a Pro user's
meaning ranking costs Replore well under a cent a search. The token counts per call are my estimates from the
request caps (30 repos, 100-character descriptions), **not measured**.

## Owner checklist (accounts and switches)

- [ ] **Polar:** create the organisation; a product "Replore Pro" with monthly and yearly prices; add a **License
      key** benefit to it (optionally a key prefix such as `REPLORE`); copy the organisation id and the benefit id.
- [ ] **Cloudflare Pages** (Settings, Variables): `POLAR_ORG_ID` = the organisation id (plain variable);
      `POLAR_BENEFIT_ID` = the benefit id (optional). Redeploy. Until then the Pro route answers `pro_off`.
- [ ] Turn the meaning route on (`RAG_PLUGIN=1` and `RAG_RERANK=1`), or Pro unlocks only the rate-limit skip.
- [ ] Paste the Polar checkout link into the web Pro window when it ships (RS89).
- [ ] **PyPI** account with 2FA, then publish `replore-mcp` (docs/LISTING.md).
- [ ] **MCP registry:** `mcp-publisher login github`, `mcp-publisher publish`.
- [ ] **PulseMCP** (when it reopens) and **Glama** Add Server.
- [ ] **Anthropic paid plan** on the submitting account, then submit the plugin bundle.
