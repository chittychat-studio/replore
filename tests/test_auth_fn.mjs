// SPEC RS94: the sign-in functions (functions/api/auth/). No network: Google's key endpoint, OAuth token endpoint,
// Identity Toolkit and Stripe are all fakes; ID tokens are signed here with a throwaway RSA key.
import assert from "node:assert";
import { createHmac } from "node:crypto";
import * as session from "../functions/api/auth/session.js";
import * as google from "../functions/api/auth/google.js";
import * as config from "../functions/api/auth/config.js";
import * as link from "../functions/api/auth/link.js";
import * as refresh from "../functions/api/auth/refresh.js";
import * as del from "../functions/api/auth/delete.js";
import * as relevance from "../functions/api/relevance.js";

const PROJECT = "replore-test", NOW = 1793000000;   // seconds
const SECRET = "test-signing-secret-0123456789abcdef", SUB = "sub_1QabcDEF234ghiJKL", UID = "uidA1234567890";
const b64u = buf => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const RSA = { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" };
const signer = await crypto.subtle.generateKey(RSA, true, ["sign", "verify"]);
const other = await crypto.subtle.generateKey(RSA, true, ["sign", "verify"]);   // a key Google never published
const saKeys = await crypto.subtle.generateKey(RSA, true, ["sign", "verify"]);
const jwk = { ...(await crypto.subtle.exportKey("jwk", signer.publicKey)), kid: "kid1", alg: "RS256", use: "sig" };
const pkcs8 = Buffer.from(await crypto.subtle.exportKey("pkcs8", saKeys.privateKey)).toString("base64");
const SA = JSON.stringify({ type: "service_account", project_id: PROJECT, client_email: "replore-claims@replore-test.iam.gserviceaccount.com",
  private_key: "-----BEGIN PRIVATE KEY-----\n" + pkcs8.match(/.{1,64}/g).join("\n") + "\n-----END PRIVATE KEY-----\n" });
const PRO_KEY = `rp.${SUB}.${createHmac("sha256", SECRET).update(SUB).digest("hex").slice(0, 16)}`;
const env = { FIREBASE_API_KEY: "AIzaSyA-test_key_0123456789abcdefghijk", FIREBASE_GOOGLE_CLIENT_ID: "123456789012-abcdefghijklmnop0123.apps.googleusercontent.com",
  FIREBASE_PROJECT_ID: PROJECT, FIREBASE_SERVICE_ACCOUNT: SA, PRO_SIGNING_SECRET: SECRET, STRIPE_SECRET_KEY: "rk_test_RESTRICTEDsecret123",
  PRO_PRICE_IDS: "price_ProMonth01" };

async function token(over = {}, { key = signer.privateKey, kid = "kid1", alg = "RS256" } = {}) {
  const head = b64u(JSON.stringify({ alg, kid, typ: "JWT" }));
  const pay = b64u(JSON.stringify({ iss: "https://securetoken.google.com/" + PROJECT, aud: PROJECT, sub: UID, user_id: UID,
    iat: NOW - 100, exp: NOW + 3500, auth_time: NOW - 100, email: "someone@example.com", firebase: { sign_in_provider: "google.com" }, ...over }));
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(head + "." + pay));
  return head + "." + pay + "." + b64u(sig);
}

// one fake for every outside call; records them so a test can check nothing unexpected was asked
function fakeNet({ jwks = 200, cc = "public, max-age=19000", stripe = "active", users = [], itk = 200, oauth = 200 } = {}) {
  const f = async (url, init = {}) => {
    f.calls.push({ url: String(url), init });
    const u = String(url);
    if (u === session.JWKS_URL) {
      if (jwks === "down") throw new TypeError("fetch failed");
      return new Response(JSON.stringify({ keys: [jwk] }), { status: jwks, headers: { "Cache-Control": cc } });
    }
    if (u === google.TOKEN_URL) {
      const body = new URLSearchParams(init.body);
      const [h, p, s] = body.get("assertion").split(".");
      const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", saKeys.publicKey, Buffer.from(s, "base64url"), new TextEncoder().encode(h + "." + p));
      const claims = JSON.parse(Buffer.from(p, "base64url"));
      assert.ok(ok && claims.aud === google.TOKEN_URL && claims.scope === google.SCOPE && claims.iss.endsWith(".iam.gserviceaccount.com"));
      assert.strictEqual(body.get("grant_type"), "urn:ietf:params:oauth:grant-type:jwt-bearer");
      return new Response(JSON.stringify({ access_token: "ya29.fake-access-token", expires_in: 3599 }), { status: oauth });
    }
    if (u.startsWith(google.ITK + PROJECT + "/")) {
      assert.strictEqual(init.headers.Authorization, "Bearer ya29.fake-access-token");
      if (u.includes("accounts:batchGet")) {
        const page = u.includes("nextPageToken=p2") ? 1 : 0, chunk = users[page] || [];
        return new Response(JSON.stringify({ users: chunk, ...(page === 0 && users.length > 1 ? { nextPageToken: "p2" } : {}) }), { status: itk });
      }
      return new Response(JSON.stringify({ kind: "ok", localId: UID }), { status: itk });
    }
    if (u.startsWith("https://api.stripe.com/v1/subscriptions/")) {
      if (stripe === "down") throw new TypeError("fetch failed");
      if (stripe === 404) return new Response("{}", { status: 404 });
      return new Response(JSON.stringify({ id: SUB, status: stripe, items: { data: [{ price: { id: "price_ProMonth01", product: "prod_x" } }] } }), { status: 200 });
    }
    throw new Error("unexpected call " + u);
  };
  f.calls = [];
  f.urls = () => f.calls.map(c => c.url.split("?")[0]);
  return f;
}
function use(f) { session.__test.setFetch(f); google.__test.setFetch(f); return f; }
function reset() { session.__test.reset(); google.__test.reset(); link.resetLink(); refresh.resetRefresh(); del.resetDelete(); relevance.resetRateLimit(); relevance.resetPro(); }
session.__test.setNow(() => NOW); google.__test.setNow(() => NOW);
const req = (path, tok, body = {}, headers = {}) => new Request("https://replore.cardzo.co.in" + path, { method: "POST",
  headers: { "Content-Type": "application/json", ...(tok ? { Authorization: "Bearer " + tok } : {}), ...headers },
  body: typeof body === "string" ? body : JSON.stringify(body) });
const T = NOW * 1000;

const lines = [], real = console.log;
console.log = (...a) => lines.push(a.join(" "));
try {
  // ---- token verification ----
  reset(); let f = use(fakeNet());
  const good = await token();
  const pay = await session.verifyIdToken(good, PROJECT);
  assert.ok(pay && pay.sub === UID, "a good token verifies");
  assert.deepStrictEqual(f.urls(), [session.JWKS_URL]);
  assert.strictEqual(f.calls[0].init.redirect, "manual");
  await session.verifyIdToken(await token({ sub: "other-uid" }), PROJECT);
  assert.strictEqual(f.calls.length, 1, "keys are cached per Cache-Control");
  const bad = [
    ["wrong aud", await token({ aud: "someone-else" })],
    ["wrong iss", await token({ iss: "https://securetoken.google.com/someone-else" })],
    ["expired", await token({ exp: NOW - 1 })],
    ["iat in the future", await token({ iat: NOW + 600 })],
    ["auth_time in the future", await token({ auth_time: NOW + 600 })],
    ["no sub", await token({ sub: "" })],
    ["long sub", await token({ sub: "x".repeat(129) })],
    ["not Google", await token({ firebase: { sign_in_provider: "password" } })],
    ["bad signature", await token({}, { key: other.privateKey })],
    ["HS256 header", await token({}, { alg: "HS256" })],
    ["tampered", good.split(".").map((p, i) => i === 1 ? b64u(JSON.stringify({ ...pay, sub: "attacker" })) : p).join(".")],
    ["garbage", "abc.def"],
  ];
  for (const [why, t] of bad) assert.strictEqual(await session.verifyIdToken(t, PROJECT), null, why);
  // unknown kid: one refetch (cache older than a minute), still unknown -> null
  session.__test.setNow(() => NOW + 120);
  f.calls.length = 0;
  assert.strictEqual(await session.verifyIdToken(await token({ iat: NOW, exp: NOW + 3000 }, { kid: "kid-unknown" }), PROJECT), null, "unknown kid");
  assert.strictEqual(f.calls.length, 1, "an unknown kid refetches once");
  assert.strictEqual(await session.verifyIdToken(await token({ iat: NOW, exp: NOW + 3000 }, { kid: "kid-unknown" }), PROJECT), null);
  assert.strictEqual(f.calls.length, 1, "and not again within a minute");
  session.__test.setNow(() => NOW);
  // key endpoint down -> null, never throws
  reset(); use(fakeNet({ jwks: "down" }));
  assert.strictEqual(await session.verifyIdToken(good, PROJECT), null);
  reset(); use(fakeNet({ jwks: 500 }));
  assert.strictEqual(await session.verifyIdToken(good, PROJECT), null);

  // ---- signedInUser(request, env): the agreed interface ----
  reset(); f = use(fakeNet());
  const plain = t => new Request("https://replore.cardzo.co.in/api/relevance", { headers: t ? { Authorization: t } : {} });
  assert.deepStrictEqual(await session.signedInUser(plain("Bearer " + good), env), { uid: UID, pro: false });
  const proTok = await token({ pro: true, sub_id: SUB, checked_at: NOW - 3600 });
  assert.deepStrictEqual(await session.signedInUser(plain("Bearer " + proTok), env), { uid: UID, pro: true });
  assert.deepStrictEqual(await session.signedInUser(plain("Bearer " + await token({ pro: true, sub_id: SUB, checked_at: NOW - 27 * 3600 })), env),
    { uid: UID, pro: false }, "stale claims are not Pro");
  assert.deepStrictEqual(await session.signedInUser(plain("Bearer " + await token({ pro: true, checked_at: NOW })), env), { uid: UID, pro: false }, "no sub_id");
  assert.deepStrictEqual(await session.signedInUser(plain("Bearer " + await token({ pro: "true", sub_id: SUB, checked_at: NOW })), env), { uid: UID, pro: false });
  for (const h of [null, "", "Basic abc", "Bearer ", "Bearer " + good + " x", "bearer " + good])
    assert.strictEqual(await session.signedInUser(plain(h), env), null, String(h));
  assert.strictEqual(await session.signedInUser(plain("Bearer " + await token({ exp: NOW - 5 })), env), null);
  f.calls.length = 0;
  assert.strictEqual(await session.signedInUser(plain("Bearer " + good), {}), null, "sign-in not configured");
  assert.strictEqual(await session.signedInUser(plain("Bearer " + good), { ...env, FIREBASE_PROJECT_ID: "Bad Project!" }), null);
  assert.strictEqual(f.calls.length, 0, "no network when not configured");
  assert.strictEqual(await session.signedInUser(null, env), null, "never throws");
  assert.strictEqual(await session.signedInUser({ headers: { get() { throw new Error("boom"); } } }, env), null, "never throws");

  // ---- config: dormant until everything is set ----
  const cfg = async e => (await config.onRequestGet({ env: e })).json();
  assert.deepStrictEqual(await cfg(env), { on: true, apiKey: env.FIREBASE_API_KEY, projectId: PROJECT, clientId: "123456789012-abcdefghijklmnop0123.apps.googleusercontent.com" });
  for (const k of ["FIREBASE_API_KEY", "FIREBASE_GOOGLE_CLIENT_ID", "FIREBASE_PROJECT_ID", "FIREBASE_SERVICE_ACCOUNT", "STRIPE_SECRET_KEY", "PRO_SIGNING_SECRET", "PRO_PRICE_IDS"])
    assert.deepStrictEqual(await cfg({ ...env, [k]: "" }), { on: false }, k);
  for (const bad of ["evil.example.com", "123.apps.googleusercontent.com", "123456789012-abcdefghijklmnop0123.apps.googleusercontent.com.evil.io"])
    assert.deepStrictEqual(await cfg({ ...env, FIREBASE_GOOGLE_CLIENT_ID: bad }), { on: false }, "only a Google OAuth Web client id: " + bad);
  assert.ok(!("authDomain" in await cfg(env)), "no auth domain: sign-in never uses a Firebase popup or redirect");
  assert.deepStrictEqual(await cfg({ ...env, FIREBASE_SERVICE_ACCOUNT: "{not json" }), { on: false });
  assert.deepStrictEqual(await cfg({}), { on: false });
  const cr = await config.onRequestGet({ env });
  assert.strictEqual(cr.headers.get("Cache-Control"), "no-store");
  assert.ok(!(await cr.clone().text()).includes("PRIVATE KEY") && !(await cr.text()).includes("client_email"), "the service account never leaves");

  // ---- claims: only the RS94 fields, through Identity Toolkit with a service-account token ----
  reset(); f = use(fakeNet());
  assert.deepStrictEqual(google.proClaims(true, SUB, NOW + 0.7), { pro: true, sub_id: SUB, checked_at: NOW });
  assert.strictEqual(await google.setClaims(env, UID, { pro: true, email: "x@example.com" }), false, "a field outside RS94 is refused");
  assert.strictEqual(f.calls.length, 0);
  assert.strictEqual(await google.setClaims(env, UID, google.proClaims(true, SUB, NOW)), true);
  assert.deepStrictEqual(f.urls(), [google.TOKEN_URL, google.ITK + PROJECT + "/accounts:update"]);
  assert.deepStrictEqual(JSON.parse(f.calls[1].init.body), { localId: UID, customAttributes: JSON.stringify({ pro: true, sub_id: SUB, checked_at: NOW }) });
  assert.ok(f.calls.every(c => c.init.redirect === "manual"));
  await google.setClaims(env, UID, google.proClaims(false, SUB, NOW));
  assert.strictEqual(f.calls.filter(c => c.url === google.TOKEN_URL).length, 1, "the access token is cached");
  reset(); f = use(fakeNet({ oauth: 400 }));
  assert.strictEqual(await google.setClaims(env, UID, google.proClaims(true, SUB, NOW)), false, "no token -> no write");
  assert.strictEqual(await google.setClaims({ ...env, FIREBASE_SERVICE_ACCOUNT: "" }, UID, google.proClaims(true, SUB, NOW)), false);
  reset(); use(fakeNet({ itk: 500 }));
  assert.strictEqual(await google.setClaims(env, UID, google.proClaims(true, SUB, NOW)), false);
  reset(); use(fakeNet({ users: [[{ localId: "u2" }, { localId: "u3", customAttributes: "{bad" }], [{ localId: "u9", customAttributes: JSON.stringify({ sub_id: SUB }) }]] }));
  assert.strictEqual(await google.subHolder(env, SUB, UID), "taken", "found on the second page");
  reset(); use(fakeNet({ users: [[{ localId: UID, customAttributes: JSON.stringify({ sub_id: SUB }) }]] }));
  assert.strictEqual(await google.subHolder(env, SUB, UID), "free", "the same account may relink");
  reset(); use(fakeNet({ itk: 503 }));
  assert.strictEqual(await google.subHolder(env, SUB, UID), "error");

  // ---- link ----
  const post = (h, path, tok, body, headers) => h(req(path, tok, body, headers), env, use(f), T);
  reset(); f = fakeNet();
  let r = await link.handleLink(req("/api/auth/link", good, { key: PRO_KEY }), env, use(f), T);
  assert.strictEqual(r.status, 200); assert.deepStrictEqual(await r.json(), { pro: true, linked: true });
  assert.strictEqual(r.headers.get("Cache-Control"), "no-store");
  assert.deepStrictEqual(f.urls().filter(u => u !== session.JWKS_URL), ["https://api.stripe.com/v1/subscriptions/" + SUB, google.TOKEN_URL,
    google.ITK + PROJECT + "/accounts:batchGet", google.ITK + PROJECT + "/accounts:update"]);
  const upd = JSON.parse(f.calls.at(-1).init.body);
  assert.deepStrictEqual(JSON.parse(upd.customAttributes), { pro: true, sub_id: SUB, checked_at: NOW });
  const code = async (res) => (await res.json()).error;
  reset(); f = fakeNet();
  r = await post(link.handleLink, "/api/auth/link", null, { key: PRO_KEY }); assert.strictEqual(r.status, 401); assert.strictEqual(await code(r), "not_signed_in");
  r = await post(link.handleLink, "/api/auth/link", good, { key: "rp.nope" }); assert.strictEqual(await code(r), "bad_key");
  f.calls.length = 0;
  r = await post(link.handleLink, "/api/auth/link", good, { key: `rp.${SUB}.${"0".repeat(16)}` });
  assert.strictEqual(r.status, 403); assert.strictEqual(await code(r), "bad_key");
  assert.ok(!f.urls().some(u => u.includes("stripe")), "a key we did not sign never reaches Stripe");
  reset(); f = fakeNet({ stripe: "canceled" });
  r = await post(link.handleLink, "/api/auth/link", good, { key: PRO_KEY }); assert.strictEqual(await code(r), "not_pro");
  assert.ok(!f.urls().some(u => u.includes("accounts:update")), "no claims without a granted subscription");
  reset(); f = fakeNet({ stripe: "down" });
  r = await post(link.handleLink, "/api/auth/link", good, { key: PRO_KEY }); assert.strictEqual(r.status, 503); assert.strictEqual(await code(r), "stripe_error");
  reset(); f = fakeNet({ users: [[{ localId: "someone-else", customAttributes: JSON.stringify({ pro: true, sub_id: SUB, checked_at: NOW }) }]] });
  r = await post(link.handleLink, "/api/auth/link", good, { key: PRO_KEY }); assert.strictEqual(r.status, 409); assert.strictEqual(await code(r), "already_linked");
  assert.ok(!f.urls().some(u => u.includes("accounts:update")), "one subscription, one account");
  reset(); f = fakeNet({ itk: 500 });
  r = await post(link.handleLink, "/api/auth/link", good, { key: PRO_KEY }); assert.strictEqual(await code(r), "auth_error");
  reset(); f = fakeNet();
  r = await post(link.handleLink, "/api/auth/link", good, { key: PRO_KEY }, { Origin: "https://evil.example" }); assert.strictEqual(await code(r), "bad_origin");
  r = await link.handleLink(new Request("https://replore.cardzo.co.in/api/auth/link", { method: "POST", headers: { "Content-Type": "text/plain", Authorization: "Bearer " + good }, body: "{}" }), env, f, T);
  assert.strictEqual(await code(r), "json_only");
  r = await post(link.handleLink, "/api/auth/link", good, "x".repeat(2000)); assert.strictEqual(await code(r), "too_large");
  r = await post(link.handleLink, "/api/auth/link", good, "[1]"); assert.strictEqual(await code(r), "bad_body");
  r = await link.handleLink(req("/api/auth/link", good, { key: PRO_KEY }), { ...env, FIREBASE_SERVICE_ACCOUNT: "" }, f, T); assert.strictEqual(await code(r), "auth_off");
  reset(); f = fakeNet();
  for (let i = 0; i < link.LINK_MAX; i++) await post(link.handleLink, "/api/auth/link", null, {}, { "CF-Connecting-IP": "203.0.113.9" });
  r = await post(link.handleLink, "/api/auth/link", good, { key: PRO_KEY }, { "CF-Connecting-IP": "203.0.113.9" });
  assert.strictEqual(r.status, 429); assert.ok(r.headers.get("Retry-After"));

  // ---- refresh: at most once a day, and on a new sign-in ----
  assert.strictEqual(refresh.recheckDue({}, NOW), false);
  assert.strictEqual(refresh.recheckDue({ sub_id: SUB, checked_at: NOW - 3600, auth_time: NOW - 7200 }, NOW), false);
  assert.strictEqual(refresh.recheckDue({ sub_id: SUB, checked_at: NOW - 86400, auth_time: NOW - 90000 }, NOW), true, "a day old");
  assert.strictEqual(refresh.recheckDue({ sub_id: SUB, checked_at: NOW - 3600, auth_time: NOW - 60 }, NOW), true, "new sign-in");
  reset(); f = fakeNet();
  r = await post(refresh.handleRefresh, "/api/auth/refresh", good, {});
  assert.deepStrictEqual(await r.json(), { pro: false, linked: false, changed: false });
  assert.ok(!f.urls().some(u => u.includes("stripe")));
  const fresh = await token({ pro: true, sub_id: SUB, checked_at: NOW - 3600, auth_time: NOW - 7200 });
  f.calls.length = 0;
  r = await post(refresh.handleRefresh, "/api/auth/refresh", fresh, {});
  assert.deepStrictEqual(await r.json(), { pro: true, linked: true, changed: false });
  assert.ok(!f.urls().some(u => u.includes("stripe") || u.includes("identitytoolkit")), "no recheck inside a day");
  const old = await token({ pro: true, sub_id: SUB, checked_at: NOW - 90000, auth_time: NOW - 95000 });
  reset(); f = fakeNet({ stripe: "canceled" });
  r = await post(refresh.handleRefresh, "/api/auth/refresh", old, {});
  assert.deepStrictEqual(await r.json(), { pro: false, linked: true, changed: true });
  assert.deepStrictEqual(JSON.parse(JSON.parse(f.calls.at(-1).init.body).customAttributes), { pro: false, sub_id: SUB, checked_at: NOW }, "cancelled: Pro off, link kept");
  reset(); f = fakeNet();
  r = await post(refresh.handleRefresh, "/api/auth/refresh", await token({ pro: false, sub_id: SUB, checked_at: NOW - 3600, auth_time: NOW - 30 }), {});
  assert.deepStrictEqual(await r.json(), { pro: true, linked: true, changed: true }, "rechecked on a new sign-in");
  reset(); f = fakeNet({ stripe: "down" });
  r = await post(refresh.handleRefresh, "/api/auth/refresh", old, {});
  assert.strictEqual(r.status, 503); assert.strictEqual(await code(r), "stripe_error");
  assert.ok(!f.urls().some(u => u.includes("accounts:update")), "a Stripe error changes nothing");

  // ---- delete: recent sign-in only ----
  reset(); f = use(fakeNet());
  r = await del.handleDelete(req("/api/auth/delete", await token({ auth_time: NOW - 60 })), env, T);
  assert.strictEqual(r.status, 200); assert.deepStrictEqual(await r.json(), { deleted: true });
  assert.ok(f.urls().includes(google.ITK + PROJECT + "/accounts:delete"));
  assert.deepStrictEqual(JSON.parse(f.calls.at(-1).init.body), { localId: UID });
  f.calls.length = 0;
  r = await del.handleDelete(req("/api/auth/delete", await token({ auth_time: NOW - 900 })), env, T);
  assert.strictEqual(r.status, 401); assert.strictEqual(await code(r), "reauth");
  assert.ok(!f.urls().some(u => u.includes("accounts:delete")));
  r = await del.handleDelete(req("/api/auth/delete", null), env, T); assert.strictEqual(await code(r), "not_signed_in");
  reset(); use(fakeNet({ itk: 500 }));
  r = await del.handleDelete(req("/api/auth/delete", await token({ auth_time: NOW - 60 })), env, T); assert.strictEqual(await code(r), "auth_error");

  // ---- routes answer POST only, and log a code only ----
  for (const m of [link, refresh, del]) assert.strictEqual((await m.onRequest()).status, 405);
  assert.strictEqual((await config.onRequest()).status, 405);
  reset(); use(fakeNet()); lines.length = 0;
  await link.onRequestPost({ request: req("/api/auth/link", good, { key: PRO_KEY }), env });
  assert.strictEqual(lines.length, 1); const rec = JSON.parse(lines[0]);
  assert.deepStrictEqual(Object.keys(rec), ["evt", "code", "status", "ms"]); assert.strictEqual(rec.evt, "auth_link");

  // ---- /api/relevance: a signed-in Pro user skips the per-IP limit, like a Pro key (RS87); others do not ----
  const ip = "198.51.100.7";
  for (const [tok, skips] of [[proTok, true], [good, false]]) {
    reset(); use(fakeNet());
    for (let i = 0; i < relevance.RATE_MAX; i++) relevance.rateLimit(ip, Date.now());
    const rr = await relevance.onRequestPost({ request: new Request("https://replore.cardzo.co.in/api/relevance", { method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip, Authorization: "Bearer " + tok }, body: "{}" }),
      env: { ...env, AI: { run: async () => ({}) } } }, async () => { throw new Error("no network"); });
    if (skips) assert.notStrictEqual(rr.status, 429, "signed-in Pro skips the limit");
    else assert.strictEqual(rr.status, 429, "signed in without Pro does not");
  }

  // ---- nothing secret or personal ever lands in a log ----
  const all = lines.join("\n");
  for (const s of [good.slice(0, 40), UID, "someone@example.com", PRO_KEY, "PRIVATE KEY", "ya29", SECRET]) assert.ok(!all.includes(s), s);
} finally { console.log = real; }
console.log("auth function tests passed");
