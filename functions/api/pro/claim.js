// SPEC RS90 (keys of RS87): Cloudflare Pages Function, POST /api/pro/claim, body {"session_id": "cs_..."}.
// After a Stripe Payment Link checkout, the /pro page sends the Checkout Session id here. If Stripe says the session is
// paid and its subscription is active or trialing, the function answers with a Pro key: rp.<subscription id>.<sig>,
// sig = first 16 hex chars of HMAC-SHA256(PRO_SIGNING_SECRET, subscription id). Nothing is stored: the key is
// deterministic, and relevance.js re-checks the subscription with Stripe (RS87). Fail closed (RS7), codes only (RS34d);
// the Stripe key, the signing secret, the session id and the key itself are never logged or echoed (RS8).
// The shared helpers below (shape, signing, constant-time compare, rate limit) are imported by relevance.js.

export const STRIPE_API = "https://api.stripe.com/v1";
export const CLAIM_TIMEOUT_MS = 5000, CLAIM_MAX = 5, CLAIM_WINDOW_MS = 60000, CLAIM_MAX_BODY = 1024, MAX_IPS = 5000;
const SESSION_SHAPE = /^cs_(live|test)_[A-Za-z0-9]{10,200}$/;
const SUB_SHAPE = /^sub_[A-Za-z0-9_]{8,80}$/;
const KEY_SHAPE = /^rp\.(sub_[A-Za-z0-9_]{8,80})\.([0-9a-f]{16})$/;
export const looksLikeSession = s => typeof s === "string" && SESSION_SHAPE.test(s);
export const looksLikeProKey = k => typeof k === "string" && KEY_SHAPE.test(k);
export const proSubId = k => { const m = looksLikeProKey(k) ? KEY_SHAPE.exec(k) : null; return m ? m[1] : null; };
// RS87: the route is on only with both server secrets (a short signing secret counts as unset)
// and with the Pro price list (or product): the Stripe account also sells other things (tips, later templates), so an
// active subscription counts only while one of its items carries a Pro price (security review 2026-10-23)
const list = s => String(s || "").split(",").map(x => x.trim()).filter(Boolean);
// RS90: the Stripe key as pasted into the dashboard may carry a stray space or line break, which makes the
// Authorization header invalid and every call fail before it leaves (found live 2026-10-25: upstream 0, 0 ms).
// Trim it; a value that still is not a Stripe secret or restricted key is logged as upstream -1 (key format).
export const stripeKey = env => String((env && env.STRIPE_SECRET_KEY) || "").trim();
export const stripeKeyOk = k => /^(rk|sk)_(live|test)_[A-Za-z0-9]{10,}$/.test(k);
export const proOn = env => !!(env && env.STRIPE_SECRET_KEY && String(env.PRO_SIGNING_SECRET || "").length >= 32
  && (list(env.PRO_PRICE_IDS).length || String(env.PRO_PRODUCT_ID || "").trim()));
export function proItemOk(sub, env) {
  const ids = new Set(list(env.PRO_PRICE_IDS)), product = String(env.PRO_PRODUCT_ID || "").trim();
  const items = sub && sub.items && Array.isArray(sub.items.data) ? sub.items.data : [];
  return items.some(it => { const pr = it && it.price; if (!pr || typeof pr !== "object") return false;
    const prod = pr.product && typeof pr.product === "object" ? pr.product.id : pr.product;
    return (typeof pr.id === "string" && ids.has(pr.id)) || (!!product && prod === product); });
}
export const GRANTED = new Set(["active", "trialing"]);

const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
export async function proSig(subId, secret) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(String(secret)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(String(subId)))).slice(0, 16);
}
export async function makeProKey(subId, secret) { return `rp.${subId}.${await proSig(subId, secret)}`; }
export function sameText(a, b) {   // constant time for equal lengths; lengths are public (fixed by the shape)
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
// signature check alone (no network): true only for a key this server signed
export async function proSigOk(key, secret) {
  const m = looksLikeProKey(key) ? KEY_SHAPE.exec(key) : null;
  if (!m || String(secret || "").length < 32) return false;
  return sameText(m[2], await proSig(m[1], secret));
}

// best-effort per-IP limit in this isolate's memory: 0 = allowed, else seconds to wait
export function hit(store, ip, now, max, windowMs) {
  if (!ip) return 0;
  const recent = (store.get(ip) || []).filter(t => now - t < windowMs);
  if (recent.length >= max) { store.set(ip, recent); return Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000)); }
  recent.push(now); store.set(ip, recent);
  if (store.size > MAX_IPS) for (const [k, v] of store) if (now - v[v.length - 1] >= windowMs) store.delete(k);
  if (store.size > MAX_IPS) store.delete(store.keys().next().value);
  return 0;
}
const CLAIM_RATE = new Map();
export function resetClaim() { CLAIM_RATE.clear(); }

const out = (status, obj, extra = {}) => {
  const r = new Response(JSON.stringify(obj), { status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extra } });
  r.__code = obj && obj.error ? obj.error : "claim_issued";
  return r;
};
export function sameOrigin(request) {
  const o = request.headers.get("Origin");
  if (!o) return true;
  try { return new URL(o).host === new URL(request.url).host; } catch { return false; }
}
const day = sec => { const n = Number(sec); return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString().slice(0, 10) : null; };
// Stripe moved current_period_end from the subscription to its items (API 2025-03-31); read either
export function renewsOn(sub) {
  const items = sub && sub.items && Array.isArray(sub.items.data) ? sub.items.data : [];
  return day(sub && sub.current_period_end) || day(items[0] && items[0].current_period_end);
}

// One Stripe call. -> {status, body} for the page; never throws.
export async function claim(sessionId, env, fetchImpl = fetch) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), CLAIM_TIMEOUT_MS);
  let res, s;
  const key = stripeKey(env);
  if (!stripeKeyOk(key)) { clearTimeout(timer); return { status: 503, error: "stripe_error", upstream: -1 }; }
  try {
    try {
      res = await fetchImpl(`${STRIPE_API}/checkout/sessions/${sessionId}?expand[]=subscription`, { method: "GET", redirect: "error",
        signal: ctl.signal, headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } });
    } catch { return { status: 503, error: "stripe_error", upstream: 0 }; }   // upstream: Stripe's HTTP status for the log (0 = no answer)
    if (res.status === 404) return { status: 404, error: "unknown_session" };
    if (res.status !== 200) return { status: 503, error: "stripe_error", upstream: res.status };
    try { s = await res.json(); } catch { return { status: 503, error: "stripe_error", upstream: res.status }; }
  } finally { clearTimeout(timer); }
  if (!s || typeof s !== "object") return { status: 503, error: "stripe_error" };
  if (s.payment_status !== "paid") return { status: 403, error: "not_paid" };
  const sub = s.subscription;
  if (!sub || typeof sub !== "object" || !SUB_SHAPE.test(String(sub.id || ""))) return { status: 503, error: "stripe_error" };
  if (!GRANTED.has(sub.status)) return { status: 403, error: "not_paid" };
  if (!proItemOk(sub, env)) return { status: 403, error: "not_pro" };   // paid, but for another product
  return { status: 200, body: { key: await makeProKey(sub.id, env.PRO_SIGNING_SECRET), renews: renewsOn(sub) } };
}

export async function handleClaim(request, env, fetchImpl = fetch, now = Date.now()) {
  if (!sameOrigin(request)) return out(403, { error: "bad_origin" });
  const wait = hit(CLAIM_RATE, request.headers.get("CF-Connecting-IP"), now, CLAIM_MAX, CLAIM_WINDOW_MS);
  if (wait) return out(429, { error: "rate_limited", resetsInSec: wait }, { "Retry-After": String(wait) });
  if (!proOn(env)) return out(503, { error: "pro_off" });
  const ct = request.headers.get("Content-Type") || "";
  if (ct.split(";")[0].trim().toLowerCase() !== "application/json") return out(415, { error: "json_only" });
  if (Number(request.headers.get("Content-Length") || 0) > CLAIM_MAX_BODY) return out(413, { error: "too_large" });
  const raw = await request.text();
  if (raw.length > CLAIM_MAX_BODY) return out(413, { error: "too_large" });
  let body; try { body = JSON.parse(raw); } catch { return out(400, { error: "bad_session" }); }
  const id = body && typeof body === "object" ? body.session_id : null;
  if (!looksLikeSession(id)) return out(400, { error: "bad_session" });   // before any network call
  const r = await claim(id, env, fetchImpl);
  const res = r.status === 200 ? out(200, r.body) : out(r.status, { error: r.error });
  if (r.error === "stripe_error") res.__upstream = Number(r.upstream) || 0;   // the owner can tell 401 (key) from 403 (permission) from a timeout
  return res;
}

export async function onRequestPost(context, fetchImpl = fetch) {
  const { request, env } = context, t0 = Date.now();
  const res = await handleClaim(request, env || {}, fetchImpl);
  // RS34d: one record per claim, a code only: never the session id, the key, an IP or a secret
  try { const line = { evt: "pro_claim", code: String(res.__code).replace(/[^a-z_]/g, "").slice(0, 40), status: res.status, ms: Date.now() - t0 };
    if (res.__code === "stripe_error") line.upstream = Number(res.__upstream) || 0;   // Stripe's status, a number only
    console.log(JSON.stringify(line)); } catch {}
  return res;
}
export async function onRequest() { return out(405, { error: "post_only" }); }
