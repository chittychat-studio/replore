# Replore Pro paid-beta verification

Date: 2026-11-12 (Asia/Calcutta). Base: `d44f556` (merged homepage PR #130). Branch: `feat/pro-paid-beta`.
Brief: `REPLORE_SOL_HOMEPAGE_REDESIGN_EXECUTION.md` inside the owner's `Replore_SOL_Implementation_Package.zip`, including Section 12. Sections 0-11 remain implemented in the merged homepage; this change completes the safe Pro presentation and local verification work.

## Decision: PAID BETA NO-GO

Do not activate a paid beta or deploy this change as a verified paid launch. The advertised yearly discount fails at the actual Stripe checkout. Production Google sign-in is disabled. Real payment-to-entitlement activation, subscription lifecycle changes, account recovery, positive paid-playbook access and webhook behavior have not been verified in the running production environment. Local integration success is not real Stripe verification.

No purchase, charge, refund, cancellation, Stripe configuration change, production environment change, production deployment or payment activation was performed. The existing monthly payment link and prices are unchanged. A new client-side guard removes the yearly card's navigable purchase URL and explains why the offer is pending; the underlying Stripe Payment Link is unchanged. Keep that guard off until the discount is fixed, verified and approved for release.

## Implemented changes

- Replaced the ambiguous Leo purchase heading with **Replore Pro**, **Find the code. Ship the project.**, and the approved supporting sentence.
- Reduced six equally weighted tiles to three benefits, with priority, conditional cross-device account access and email support in secondary copy. No unlimited-compute or response-time guarantee.
- Preserved USD 8/month and configured USD 36 first-year / USD 72 yearly renewal amounts. The renewal amount has its own semantic setting and a conspicuous disclosure beside the yearly offer. The invalid yearly offer is visibly pending and not a working purchase link in the updated UI; monthly checkout is unchanged.
- Kept the compact cyan/navy design and readable mobile pricing. Both plan choices remain visible and keyboard accessible. Added billing/tax review, cancellation contact, privacy links and explicit subscription-refresh timing without inventing a refund entitlement or merchant policy.
- Added a preview link to the actual existing **free Leo checklist**, clearly labeled free. It opens the real planner. It is not a fake preview of a paid playbook. Actual paid playbooks remain server-gated on `/pro`.
- Fixed the playbooks UI not refreshing after a claimed/saved key or account state change; added failure/empty/retry guidance and generation guards so a late response cannot restore paid UI after credentials change. Saved key presentation no longer asserts that a merely shape-valid key is an active subscription. Browser progress storage and server authorization contracts are unchanged.
- No backend API, authentication rule, Stripe resource, webhook architecture, price, provider quota, payment destination, production dependency or data schema was changed. Templates remain a separate existing route, not a new Pro promise. No separate SEO product was verified or added to the offer.

## Prices: configured versus observed

| Item | Source of truth / observation | Result |
| --- | --- | --- |
| Monthly offer | `web/pro-core.js` `PRO_PRICE`; current public monthly Stripe Payment Link | App displays **8 USD a month**; actual hosted checkout displays **$8.00 per month**, merchant Cardzo Entertainment LLP; no payment submitted |
| Year-one offer | Existing `PRO_PRICE_YEAR` and `PRO_URL_YEAR` with prefilled `YEAR50` | Configured **36 USD for your first year**, but actual hosted checkout rejects the code with **This code is invalid.** and shows **$72.00 due today**. The updated app blocks yearly navigation and labels it pending |
| Yearly renewal | Explicit `PRO_RENEWAL_YEAR="72 USD a year"`; actual hosted yearly checkout's undiscounted recurring price | App prominently displays **Then 72 USD a year. Renews until canceled.** Actual checkout shows **$72.00 per year** / $6 per month billed annually. A discounted first-year subscription and subsequent actual renewal were not created or verified |
| Checkout policies | Actual checkout Terms and Privacy links inspected without payment | Links point to Stripe end-user terms and Stripe privacy. A Replore/Cardzo-specific approved refund/subscription policy was not established by this audit |

Read-only checkout screenshots: `.qa/stripe-monthly-readonly.png`, `.qa/stripe-yearly-readonly.png`; filtered public evidence: `.qa/stripe-readonly-evidence.json`. No customer details, API secrets, real Pro keys or real Checkout Session IDs are in this report.
Reproduce that public, non-purchasing check with `node ops/audit_pro_checkout.mjs` (QA-only Playwright and installed Chrome required). It reads the existing payment URLs from `web/pro-core.js`, never fills or submits a payment form, and stores only public checkout evidence in ignored `.qa/`.

## All twelve paid-launch checks

**PASS** is scoped to the stated evidence. **NOT TESTED** means real billing/account behavior remains unverified even when local fixtures pass.

| # | Mandatory check | Status | Method and evidence |
| --- | --- | --- | --- |
| 1 | Authorized live-mode monthly checkout completes | **NOT TESTED** | Public checkout loads at $8/month. No live charge was authorized or submitted; no Stripe test-account connection is available either |
| 2 | Yearly intro and renewal amounts are correct | **FAIL** | Actual public yearly checkout: `YEAR50` invalid, $72 due today instead of advertised $36. Undiscounted yearly rate is $72; no renewal invoice tested |
| 3 | Renewal disclosed before purchase | **PASS (local UI)** | Updated modal and `/pro` display first-year configuration and the explicit $72 annual renewal next to the yearly plan, on desktop/mobile. Guard explains that the introductory offer is not verified. This updated UI is not yet deployed to production |
| 4 | Successful payment activates correct entitlements | **NOT TESTED** | Actual local claim -> signed key -> actual local entitlement checker -> actual playbook handler -> browser flow passed with synthetic Stripe/KV fixtures. No real payment/session was used |
| 5 | Free users cannot bypass paid access | **PASS (scoped)** | Current production `/api/pro/playbook` returned 403 `pro_required` anonymously and with a forged shape-valid key. Local actual handlers rejected forged signatures without a Stripe lookup. Existing product/signature and free/pro router tests passed; no positive production entitlement tested |
| 6 | Cancellation, expiry, downgrade revoke at correct time | **NOT TESTED** | Local canceled-subscription denial after the existing 10-minute key cache passed; unit fixtures cover denied statuses/product changes. Production subscription changes were not made. Signed-in claims can remain fresh up to 26 hours, with recheck at most daily; the owner must validate the intended revocation window |
| 7 | Webhook signatures, idempotency, retries, duplicate delivery | **FAIL (coverage missing)** | No Stripe webhook endpoint/configuration exists in the repository. Entitlements currently pull subscription state from Stripe. Deterministic duplicate claim handling passes offline, but it does not verify webhook signatures or delivery. No new webhook resource was invented or registered |
| 8 | AI quotas/fair-use enforced server-side and accurately disclosed | **NOT TESTED (production)** | Router policy config is 5 anonymous / 20 signed-in daily; Pro skips that credit bucket but remains subject to provider limits and budgets. Offline router/function tests and simulated 25,000-check days passed. Production router binding/budget settings are not publicly inspectable; no billable quota-exhaustion test run. Existing fallback without a router does not enforce daily credit buckets |
| 9 | Real paid playbooks reachable, useful, state retained | **NOT TESTED (production)** | Anonymous production access denied. Paid KV inventory cannot be inspected without a legitimate Pro account/key. Real local renderer/handlers with explicitly synthetic steps passed loading and progress persistence; actual free Leo checklist preview passed in the browser. Synthetic steps are not production content |
| 10 | Claude Code/MCP key activation, authorization, revocation, recovery | **NOT TESTED (live)** | Existing key format/header path retained; local valid/forged/canceled key and cache-expiry cases passed. No real subscriber key, real agent activation or lost-key recovery was exercised |
| 11 | Accurate privacy, subscription/refund/cancellation terms, support | **FAIL (policy incomplete)** | Privacy and hello@cardzo.co.in contact exist. New UI provides billing/cancellation/refund-request guidance without promising a refund policy. Checkout linked Stripe's policies; approved merchant subscription/refund terms were not established. `PRO_PORTAL_URL` is unset, so there is no configured in-app customer-portal link |
| 12 | Failed payment, checkout return, account recovery, refresh | **FAIL / partly unverified** | Production `/api/auth/config` returned `on:false`, so advertised cross-device sign-in/recovery is not live. Malformed production claims returned 400 `bad_session`. Local unpaid return, ID removal from URL, activation refresh, removal/revocation and stale-reply suppression passed with fixtures. Real failed-charge recovery, sign-in and entitlement refresh remain unverified |

## Existing versus verified paid features

| Feature | Existing implementation | Verified now |
| --- | --- | --- |
| Monthly/yearly subscriptions | Existing Stripe Payment Links | Monthly public price observed; yearly intro discount failed; no purchase |
| Priority and no daily Pro credit cap | Server router tiers/credits/budgets | Offline tests/simulation; not production paid-provider usage |
| Pro keys and server checks | HMAC key, price/product allowlist, Stripe subscription lookup, 10-minute cache | Live invalid-key denial; actual local handlers and controlled fixtures; real subscriber recovery not verified |
| Playbooks | Paid KV endpoint and browser progress renderer | Live free-user denial; local fixture integration/progress/races; paid production inventory not verified |
| Cross-device Google account | Firebase/Google code and periodic Stripe refresh | Source/offline tests; production public configuration is OFF |
| Cancellation management | Stripe receipt link/support; optional portal URL | UI guidance/source only; portal URL currently empty; no cancellation performed |
| Templates / SEO | Existing templates pass-through; no distinct verified Pro SEO product | Production templates returned HTTP 200; not advertised as a Pro entitlement |
| Email support | Existing hello@cardzo.co.in contact | Link/contact existence only; no email sent and no SLA claimed |

## Test evidence and screenshots

- `py -m pytest -q`: 287 passed after updated presentation expectations and current asset stamps.
- Existing Node CI commands cover web logic, auth, claims, relevance, trust, playbooks, templates, router and simulation. All passed; synthetic providers incur no charges.
- `node tests/test_pro_beta_browser.mjs`: passed in installed Chrome, widths 390/768/1440. Uses actual local claim, signature/subscription and playbook handlers with synthetic Stripe/KV. Checks the guarded yearly link, renewal disclosure, actual Leo preview, successful/unpaid return, paid-book refresh, retained progress, canceled/forged key denial, key removal and late-response suppression. **No real payment or provider call.**
- `node tests/test_homepage_browser.mjs`: real public GitHub search returned 42 cards; existing coverflow, selection/planning, filters and dialogs passed after a selector was scoped for the added Pro preview button. Zero browser runtime errors.
- `npm exec --yes --package wrangler -- wrangler pages functions build --outdir .qa/functions`: compiled successfully locally; not deployment.
- First-party JavaScript syntax and `git diff --check` checked. No dedicated TypeScript or lint runner is configured.
- Pro screenshots: `.qa/pro-modal-desktop.png`, `.qa/pro-modal-mobile.png`, `.qa/pro-page-desktop.png`, `.qa/pro-page-mobile.png`. They show the actual local redesigned UI, not mockups. `.qa/` is ignored and remains local; no private playbook or credential data is included.

Stripe's documentation explains [subscription lifecycle states](https://docs.stripe.com/billing/subscriptions/overview) and [webhook signature/delivery handling](https://docs.stripe.com/webhooks). Those documents informed the audit; they do not prove this Stripe account's configuration or this application's production readiness.

## Before reconsidering GO

1. Connect an authorized Stripe account for read-only inspection/test-mode verification. Do not paste secret keys into chat or commit them.
2. Fix and verify the existing yearly promotion in Stripe, including the introductory invoice, renewal and taxes. Only then update the UI readiness guard through an explicitly approved release; no prices were silently changed here.
3. Establish the intended entitlement lifecycle and revocation timing, and satisfy the mandatory webhook check or explicitly approve a verified alternative architecture. Verify subscription cancellation, failed renewal, downgrade, duplicate delivery and key recovery in a controlled environment.
4. Configure and verify Google sign-in if cross-device access is part of the offer. Verify actual paid playbook inventory/usability and agent activation with legitimate test entitlements.
5. Publish approved merchant subscription/refund terms and verify cancellation access. Approve a controlled live-mode monthly test separately; none was performed by this task.
6. Only after blockers are resolved: explicitly approve production deployment/payment activation, merge through the existing pipeline, then verify the deployed commit and live journeys. A passing CI build or feature preview is not paid-beta approval.

The feature branch may safely be pushed for code review and automatic preview. Production `main`, Stripe settings, live subscriptions and production bindings remain unchanged. Rollback is the previous Cloudflare deployment or a revert through the protected-branch process; no data migration is involved.
