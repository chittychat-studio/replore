// SPEC RS94: the sign-in box's pure logic (web/auth.js) and its pro-core.js hooks, in Node (no browser, no network).
const fs = require("fs"), path = require("path"), assert = require("assert");
const read = f => fs.readFileSync(path.join(__dirname, "..", "web", f), "utf8").replace('"use strict";', "");
const LS = { m: {}, getItem(k){ return Object.prototype.hasOwnProperty.call(this.m, k) ? this.m[k] : null; }, setItem(k, v){ this.m[k] = String(v); }, removeItem(k){ delete this.m[k]; } };
let fetched = 0;
const s = {};
// no document: auth.js's start-up block returns at once, as on a page without a sign-in box
new Function("localStorage", "fetch",
  read("pro-core.js") + "\n" + read("auth.js") +
  "; this.authCfgOk=authCfgOk; this.authProFromClaims=authProFromClaims; this.authView=authView; this.authDeleteNote=authDeleteNote;" +
  " this.authReason=authReason; this.authHeader=authHeader; this.authHintGet=authHintGet; this.authHintSet=authHintSet; this.AUTH_HINT=AUTH_HINT;" +
  " this.AUTH_SDK=AUTH_SDK; this.proPortalOk=proPortalOk; this.PRO_PORTAL_URL=PRO_PORTAL_URL; this.proKeySave=proKeySave; this.proKeyRemove=proKeyRemove;")
  .call(s, LS, () => { fetched++; return Promise.reject(new Error("no network in tests")); });

(async () => {
  // the config answer must be complete and well formed, or there is no sign-in UI
  const good = { on: true, apiKey: "AIzaSyA-test_key_0123456789abcdefghijk", projectId: "replore-test", clientId: "123456789012-abcdefghijklmnop0123.apps.googleusercontent.com" };
  assert.ok(s.authCfgOk(good));
  for (const bad of [null, {}, { on: false }, { ...good, on: "true" }, { ...good, apiKey: "" }, { ...good, clientId: "" },
    { ...good, clientId: "123456789012-abcdefghijklmnop0123.apps.googleusercontent.com.evil.io" }, { ...good, clientId: "evil.example.com" }, { ...good, projectId: "Bad Id" }])
    assert.ok(!s.authCfgOk(bad), JSON.stringify(bad));
  // Pro only from fresh claims our server set (same rule as session.js)
  const now = 1793000000, SUB = "sub_1QabcDEF234ghiJKL";
  assert.ok(s.authProFromClaims({ pro: true, sub_id: SUB, checked_at: now - 3600 }, now));
  assert.ok(!s.authProFromClaims({ pro: true, sub_id: SUB, checked_at: now - 27 * 3600 }, now));
  assert.ok(!s.authProFromClaims({ pro: true, checked_at: now }, now) && !s.authProFromClaims({ pro: false, sub_id: SUB, checked_at: now }, now));
  assert.ok(!s.authProFromClaims(null, now));
  // the box's words: signed out, signed in without Pro (with and without a saved key), signed in with Pro
  let v = s.authView({ user: null });
  assert.deepStrictEqual([v.signedIn, v.button, v.link], [false, "Sign in with Google", false]);
  v = s.authView({ user: { email: "a@example.com" }, pro: false, hasKey: false });
  assert.ok(v.signedIn && !v.link && /no Pro yet/.test(v.lead) && /Get a key/.test(v.lead));
  v = s.authView({ user: { email: "a@example.com" }, pro: false, hasKey: true });
  assert.ok(v.link && v.linkLabel === "Link my Pro key to this account");
  v = s.authView({ user: { email: "a@example.com" }, pro: true, hasKey: true });
  assert.ok(v.signedIn && !v.link && /Pro is on for a@example.com/.test(v.lead));
  // delete never claims to cancel Stripe; it names the portal, or the address while there is no portal link
  assert.ok(/does not cancel your Pro subscription/.test(s.authDeleteNote(true).text) && s.authDeleteNote(true).portal);
  assert.ok(/hello@cardzo\.co\.in/.test(s.authDeleteNote(false).text) && !s.authDeleteNote(false).portal);
  assert.strictEqual(s.PRO_PORTAL_URL, "");
  assert.ok(s.proPortalOk("https://billing.stripe.com/p/login/test_abc123XYZ"));
  for (const bad of ["", "http://billing.stripe.com/p/login/abc123", "https://billing.stripe.com.evil.io/p/login/abc123", "https://buy.stripe.com/abc123"])
    assert.ok(!s.proPortalOk(bad), bad);
  for (const code of ["bad_key", "not_pro", "already_linked", "stripe_error", "auth_error", "reauth", "nonsense"])
    assert.ok(s.authReason(code) && !/—/.test(s.authReason(code)), code);
  // the hint holds "1" only, and authHeader adds nothing (and asks nothing) for a browser that never signed in
  assert.strictEqual(s.AUTH_HINT, "replore.auth");
  assert.ok(!s.authHintGet()); s.authHintSet(true); assert.strictEqual(LS.getItem("replore.auth"), "1"); s.authHintSet(false); assert.strictEqual(LS.getItem("replore.auth"), null);
  const h = await s.authHeader({ "Content-Type": "application/json" });
  assert.deepStrictEqual(h, { "Content-Type": "application/json" }); assert.strictEqual(fetched, 0);
  assert.strictEqual(s.AUTH_SDK, "/vendor/firebase-12.19.0/");
  // pro-core.js: saving or removing a key still works without a DOM (the change event is best effort)
  assert.ok(s.proKeySave("rp." + SUB + ".0123456789abcdef")); s.proKeyRemove();
  console.log("auth web logic ok");
})().catch(e => { console.error(e); process.exit(1); });
