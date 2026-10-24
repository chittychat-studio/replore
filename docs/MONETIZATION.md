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
- **Launch offer (owner's copy, shipped as the default in `web/pro-core.js`, changed 2026-10-24):** "Launch offer: pay
  yearly and your first year is half price, 36 USD instead of 72. Cancel any time." The monthly button reads "Get a
  key, 8 USD a month"; the yearly button reads "Yearly," with 72 USD struck through and "36 USD for your first year".
  In Stripe this is a **coupon "50% off", duration **once**** (a percentage coupon was the only kind the owner's
  dashboard offered), restricted to the Replore Pro product, with a **promotion code** (owner's choice of name)
  prefilled on the **yearly** Payment Link by appending `?prefilled_promo_code=CODE` to it. The monthly link carries
  no code and has "Allow promotion codes" **off**, which is the only thing keeping the 50% off the monthly price
  (a coupon applies to a product, not to one of its prices). "Once" on a yearly subscription means the first year
  only; the renewal is 72 USD.
- **Seller:** Stripe Payment Links on Cardzo's existing Stripe account (the same account as the tip link). **Stripe
  replaces the earlier merchant-of-record plan** (named in `CHANGELOG.md`): its payouts need an Indian bank account
  Cardzo does not have, so that route is dropped entirely.
- **Seller of record: the owner.** Unlike a merchant of record, Stripe does not take on sales tax. EU and UK VAT on
  digital services sold to consumers is the owner's responsibility: registering (for example the EU OSS scheme and UK
  VAT, once the thresholds that apply to a non-EU seller are met), charging and filing. **Stripe Tax** calculates and
  collects the tax on each Payment Link; it does not register or file for you. Thresholds and whether OSS applies from
  India: **not verified**, check with an accountant.
- **Fees:** per Stripe's pricing page for the country of Cardzo's Stripe account (for India, Stripe lists a percentage
  per card payment that is higher for international cards, plus currency conversion), plus Stripe Tax's own fee per
  transaction where it calculates tax, plus Stripe Billing's fee on subscription volume. Exact figures: **not verified**;
  read stripe.com/pricing for the account's country before launch.
- **Delivery:** no key store. After checkout Stripe sends the buyer to `/pro?session_id=...`; the page asks
  `/api/pro/claim`, which checks the Checkout Session with Stripe and returns a signed key `rp.<subscription id>.<sig>`.
  Replore validates a key by its signature and then the subscription's status with Stripe (cached 10 minutes), and only
  while the subscription carries a Pro price (`PRO_PRICE_IDS`), never stores it.

| Step | Status | Where |
|---|---|---|
| Rule: what a Pro key is, how it is checked, what it unlocks | done (written) | RS87, RS90 |
| Server: Stripe validation, signature first, fail closed, cache, codes-only logs, Pro price check, `pro_off` switch | built | `functions/api/relevance.js` |
| Server: claim function for a paid Checkout Session | built | `functions/api/pro/claim.js`, RS90 |
| Plugin, script, MCP server: `REPLORE_KEY`, sent only to Replore's hosts | built | `scripts/hybrid.py`, `scripts/mcp_server.py` |
| Web: sends a stored `replore.key` on relevance checks | built | `web/pro-core.js`, `web/app.js` |
| Pro window on the web ("Leo, Pro": offer line, monthly and yearly links, key field, key shown back) | built, hidden until `PRO_URL` is set | RS89, `web/index.html`, `web/pro-core.js` |
| `/pro` page (claim after checkout, key shown, copy for the plugin) | built; says "not on sale yet" until `PRO_URL` is set | RS90, `web/pro.html`, `web/pro.js` |
| Stripe product, prices, coupon, promotion code, Payment Links, Stripe Tax, restricted key; Pages secrets and variables | owner step | checklist below |
| Switch the meaning route on (`RAG_PLUGIN=1` plus `RAG_RERANK=1` or the index) so Pro has something to unlock | owner step | RS42, `docs/RAG.md` |

**What Pro unlocks today:** the meaning route (`mode: "semantic"`) and skipping the per-IP limiter, exactly what
`PLUGIN_KEY` unlocks. **Planned, not built:** searches on the user's own GitHub token, PRD batch over 20 repos, saved
shortlists, licence-policy mode.

**Planned for Pro only (owner 2026-10-24): a launch package of hosting plus a complete SEO template.** Pro's selling
point is templates and hands-on support, not the AI ranking. A Pro user picks a starter and gets it as a launch-ready
package: hosting set up for them, and a complete SEO template already wired in (titles and descriptions, Open Graph
and social cards, structured data, sitemap, robots.txt, canonical URLs, performance and accessibility basics). Free
users keep the Launch plan in the web app (what to host on and what to do after going live), but not the package.
**Status:** idea only, not started. It needs its own SPEC rule first, covering what "hosting" means (who owns the
account and the bill, where it runs, what happens when Pro lapses), the template's licence (it ships to buyers, so it
must allow resale), and a PRIVACY.md change if Replore ever holds a customer's site or domain details.

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

- [ ] **Stripe, product:** Product catalogue, Add product "Replore Pro" with two recurring prices: 8 USD monthly and
      72 USD yearly. Copy both **price ids** (`price_...`) from the product page.
- [ ] **Stripe, offer:** Coupons, New: 50% off, duration **once**, applies to the Replore Pro product only; add a
      **promotion code** (any name, letters and digits).
- [ ] **Stripe, Payment Links:** one for the monthly price and one for the yearly price. Allow promotion codes on the
      **yearly** link only (off on the monthly one, or the 50% applies there too). On each: After payment, "Don't show confirmation page", redirect to exactly
      `https://replore.cardzo.co.in/pro?session_id={CHECKOUT_SESSION_ID}`; collect tax automatically (**Stripe Tax**).
- [ ] **Stripe Tax:** Settings, Tax: add the head office address, the product tax code for software/SaaS, and the
      registrations you hold; Stripe Tax only collects where a registration is added (you are the seller of record).
- [ ] **Stripe, customer emails:** Settings, Emails: send receipts and the link to manage subscriptions, so buyers can
      cancel (customer portal on). Exact menu names: **not verified**.
- [ ] **Stripe, restricted key:** Developers, API keys, Create restricted key "replore-pages": **Read** on Checkout
      Sessions and Subscriptions, everything else None. Copy it (`rk_live_...`).
- [ ] **Cloudflare Pages** (Settings, Variables and Secrets, Production): secret `STRIPE_SECRET_KEY` = the restricted
      key; secret `PRO_SIGNING_SECRET` = 32+ random characters (`python -c "import secrets; print(secrets.token_urlsafe(32))"`),
      never rotated once keys are sold; plain variable `PRO_PRICE_IDS` = the two price ids, comma-separated. Redeploy.
      Until all three are set the Pro route answers `pro_off`.
- [ ] **Test end to end** with Stripe test mode first: a test restricted key and test links on a Preview deployment
      (`test_` links are refused on the live hosts).
- [ ] **`web/pro-core.js`:** paste the monthly link into `PRO_URL` and the yearly link with `?prefilled_promo_code=CODE`
      into `PRO_URL_YEAR`; run `python ops/stamp_assets.py`; ship. The Pro button and window appear, and `/pro` shows
      the buy buttons.
- [ ] Turn the meaning route on (`RAG_PLUGIN=1` and `RAG_RERANK=1`), or Pro unlocks only the rate-limit skip.
- [ ] **PyPI** account with 2FA, then publish `replore-mcp` (docs/LISTING.md).
- [ ] **MCP registry:** `mcp-publisher login github`, `mcp-publisher publish`.
- [ ] **PulseMCP** (when it reopens) and **Glama** Add Server.
- [ ] **Anthropic paid plan** on the submitting account, then submit the plugin bundle.
