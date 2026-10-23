// SPEC RS90 (keys of RS87): the claim function (functions/api/pro/claim.js). No network: Stripe is a fake fetch.
import assert from "node:assert";
import { createHmac } from "node:crypto";
import * as fn from "../functions/api/pro/claim.js";

const SECRET = "test-signing-secret-0123456789abcdef", STRIPE = "rk_test_RESTRICTEDsecret123";
const env = { PRO_SIGNING_SECRET: SECRET, STRIPE_SECRET_KEY: STRIPE };
const SID = "cs_test_a1B2c3D4e5F6g7H8i9J0", SUB = "sub_1QabcDEF234ghiJKL";
const session = (extra = {}, sub = {}) => ({ id: SID, object: "checkout.session", payment_status: "paid", mode: "subscription",
  subscription: { id: SUB, object: "subscription", status: "active", current_period_end: 1795392000, ...sub }, ...extra });
const stripe = (status, json) => { const f = async (url, init) => { f.calls.push({ url, init });
  if (status === "down") throw new TypeError("fetch failed");
  return new Response(typeof json === "string" ? json : JSON.stringify(json), { status }); }; f.calls = []; return f; };
const req = (body, headers = {}) => new Request("https://replore.cardzo.co.in/api/pro/claim", { method: "POST",
  headers: { "Content-Type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
const post = (body, f, e = env, headers) => fn.onRequestPost({ request: req(body, headers), env: e }, f);

const lines = [], real = console.log;
console.log = (...a) => lines.push(a.join(" "));
let keyIssued;
try {
  // signing: HMAC-SHA256 hex, first 16 chars, same as Node's own HMAC (WebCrypto in Workers)
  const want = createHmac("sha256", SECRET).update(SUB).digest("hex").slice(0, 16);
  assert.strictEqual(await fn.proSig(SUB, SECRET), want);
  assert.strictEqual(await fn.makeProKey(SUB, SECRET), `rp.${SUB}.${want}`);
  assert.ok(fn.looksLikeProKey(`rp.${SUB}.${want}`));
  for (const bad of ["", null, `rp.${SUB}.${want.toUpperCase()}`, `rp.${SUB}.${want}0`, `rp.cus_123456789.${want}`, `rp.sub_short.${want}`, `xx.${SUB}.${want}`])
    assert.ok(!fn.looksLikeProKey(bad), String(bad));
  assert.ok(await fn.proSigOk(`rp.${SUB}.${want}`, SECRET) && !(await fn.proSigOk(`rp.${SUB}.${"0".repeat(16)}`, SECRET)));
  assert.ok(!(await fn.proSigOk(`rp.${SUB}.${want}`, "short")), "a short secret never verifies");

  // paid + active issues a deterministic key, one Stripe GET with the restricted key, no redirects, a deadline
  fn.resetClaim();
  let f = stripe(200, session()), r = await post({ session_id: SID }, f);
  assert.strictEqual(r.status, 200); assert.strictEqual(r.headers.get("Cache-Control"), "no-store");
  const j = await r.json(); keyIssued = j.key;
  assert.deepStrictEqual(j, { key: `rp.${SUB}.${want}`, renews: "2026-11-23" });
  assert.strictEqual(f.calls.length, 1);
  assert.strictEqual(f.calls[0].url, `https://api.stripe.com/v1/checkout/sessions/${SID}?expand[]=subscription`);
  assert.strictEqual(f.calls[0].init.method, "GET"); assert.strictEqual(f.calls[0].init.redirect, "error"); assert.ok(f.calls[0].init.signal);
  assert.strictEqual(f.calls[0].init.headers.Authorization, `Bearer ${STRIPE}`);
  r = await post({ session_id: SID }, stripe(200, session())); assert.strictEqual((await r.json()).key, keyIssued, "same session, same key");
  // trialing also issues; newer API versions keep current_period_end on the item
  fn.resetClaim();
  r = await post({ session_id: SID }, stripe(200, session({}, { status: "trialing", current_period_end: undefined, items: { data: [{ current_period_end: 1795392000 }] } })));
  assert.strictEqual(r.status, 200); assert.strictEqual((await r.json()).renews, "2026-11-23");
  r = await post({ session_id: SID }, stripe(200, session({}, { current_period_end: undefined })));
  assert.strictEqual((await r.json()).renews, null);

  // unpaid / canceled / incomplete refused: 403 not_paid
  for (const s of [session({ payment_status: "unpaid" }), session({ payment_status: "no_payment_required" }),
                   session({}, { status: "canceled" }), session({}, { status: "incomplete" }), session({}, { status: "past_due" })]) {
    fn.resetClaim(); r = await post({ session_id: SID }, stripe(200, s));
    assert.strictEqual(r.status, 403); assert.deepStrictEqual(await r.json(), { error: "not_paid" });
  }
  // unknown session: 404 unknown_session
  fn.resetClaim(); r = await post({ session_id: SID }, stripe(404, { error: { type: "invalid_request_error", message: "No such checkout.session" } }));
  assert.strictEqual(r.status, 404); assert.deepStrictEqual(await r.json(), { error: "unknown_session" });
  // Stripe down, 500, 401, unreadable body, subscription not expanded, redirect refused -> 503 stripe_error (fail closed)
  for (const f2 of [stripe("down"), stripe(500, {}), stripe(401, {}), stripe(200, "not json"), stripe(200, session({ subscription: SUB })),
      (() => { const g = async (u, init) => { assert.strictEqual(init.redirect, "error"); throw new TypeError("unexpected redirect"); }; return g; })()]) {
    fn.resetClaim(); r = await post({ session_id: SID }, f2);
    assert.strictEqual(r.status, 503); assert.deepStrictEqual(await r.json(), { error: "stripe_error" });
  }
  // a stalled Stripe call ends at the deadline
  { const g = async (u, init) => new Promise((_, rej) => init.signal.addEventListener("abort", () => rej(Object.assign(new Error("a"), { name: "AbortError" }))));
    const t0 = Date.now(); const c = await fn.claim(SID, env, g); assert.strictEqual(c.error, "stripe_error");
    assert.ok(Date.now() - t0 >= fn.CLAIM_TIMEOUT_MS - 50 && Date.now() - t0 < fn.CLAIM_TIMEOUT_MS + 1500); }

  // malformed session id rejected before any fetch
  for (const bad of [{ session_id: "cs_live_short" }, { session_id: "cs_prod_a1B2c3D4e5F6g7H8i9J0" }, { session_id: SID + "/../../v1/customers" },
                     { session_id: SID + "?expand[]=x" }, { session_id: 7 }, {}, [], "not json", { session_id: "sub_123456789012" }]) {
    fn.resetClaim(); f = stripe(200, session()); r = await post(bad, f);
    assert.strictEqual(r.status, 400, JSON.stringify(bad)); assert.deepStrictEqual(await r.json(), { error: "bad_session" });
    assert.strictEqual(f.calls.length, 0, JSON.stringify(bad));
  }
  // JSON only, small bodies, same origin
  fn.resetClaim(); f = stripe(200, session());
  r = await fn.onRequestPost({ request: new Request("https://replore.cardzo.co.in/api/pro/claim", { method: "POST", headers: { "Content-Type": "text/plain" }, body: "x" }), env }, f);
  assert.strictEqual(r.status, 415);
  r = await post({ session_id: SID, pad: "x".repeat(2000) }, f); assert.strictEqual(r.status, 413);
  r = await post({ session_id: SID }, f, env, { Origin: "https://evil.example" }); assert.strictEqual(r.status, 403);
  assert.deepStrictEqual(await r.json(), { error: "bad_origin" });
  r = await post({ session_id: SID }, f, env, { Origin: "https://replore.cardzo.co.in" }); assert.strictEqual(r.status, 200);
  assert.strictEqual(f.calls.length, 1, "refused requests never reach Stripe");

  // pro_off without either secret (or a short signing secret); Stripe never called
  for (const e of [{}, { STRIPE_SECRET_KEY: STRIPE }, { PRO_SIGNING_SECRET: SECRET }, { STRIPE_SECRET_KEY: STRIPE, PRO_SIGNING_SECRET: "too-short" }]) {
    fn.resetClaim(); f = stripe(200, session()); r = await post({ session_id: SID }, f, e);
    assert.strictEqual(r.status, 503); assert.deepStrictEqual(await r.json(), { error: "pro_off" }); assert.strictEqual(f.calls.length, 0);
  }

  // rate limit: 5 per minute per IP, then 429 with Retry-After; another IP is not affected
  fn.resetClaim(); f = stripe(200, session());
  const ip = { "CF-Connecting-IP": "203.0.113.7" };
  for (let i = 0; i < 5; i++) assert.strictEqual((await post({ session_id: SID }, f, env, ip)).status, 200);
  r = await post({ session_id: SID }, f, env, ip); assert.strictEqual(r.status, 429); assert.ok(Number(r.headers.get("Retry-After")) >= 1);
  assert.strictEqual((await r.json()).error, "rate_limited"); assert.strictEqual(f.calls.length, 5);
  assert.strictEqual((await post({ session_id: SID }, f, env, { "CF-Connecting-IP": "203.0.113.8" })).status, 200);

  // other methods
  assert.strictEqual((await fn.onRequest()).status, 405);
} finally { console.log = real; }

// log lines: one per claim, codes only; never the key, its signature, the session id, the Stripe key or the secret
const all = lines.join("\n");
for (const s of [keyIssued, keyIssued.split(".")[2], SID, SUB, STRIPE, SECRET, "a1B2c3D4"]) assert.ok(!all.includes(s), s);
assert.ok(lines.length > 20 && lines.every(l => { const o = JSON.parse(l); return Object.keys(o).sort().join() === "code,evt,ms,status" && o.evt === "pro_claim"; }));
for (const c of ["claim_issued", "not_paid", "unknown_session", "stripe_error", "bad_session", "pro_off", "rate_limited"])
  assert.ok(all.includes(`"code":"${c}"`), c);
console.log("pro claim ok");
