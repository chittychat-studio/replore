// SPEC RS94: Firebase ID token checks for the optional Google sign-in, in the Workers runtime (WebCrypto, no firebase-admin).
// Not a route (no onRequest export): the auth routes next to it and /api/relevance import it. It must never import
// relevance.js (relevance.js imports this file). Tokens, uids and emails are never logged or returned from here (RS8).
//
// signedInUser(request, env) -> {uid, pro} | null. Reads "Authorization: Bearer <Firebase ID token>", verifies it and
// answers null on any problem (no header, sign-in not configured, bad or expired token, key fetch failed); never throws.

export const JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
export const SKEW_SEC = 60, KEYS_MIN_SEC = 60, KEYS_MAX_SEC = 86400, KEYS_DEFAULT_SEC = 3600, KEYS_TIMEOUT_MS = 3000;
export const PRO_FRESH_SEC = 26 * 3600;   // claims rechecked at most once a day (refresh.js); older than this = not Pro
const MAX_TOKEN = 4096;
const PROJECT_SHAPE = /^[a-z][a-z0-9-]{4,38}[a-z0-9]$/;
const CLIENT_ID_SHAPE = /^[0-9]{6,20}-[a-z0-9]{10,64}\.apps\.googleusercontent\.com$/;   // the OAuth Web client id GIS needs
const API_KEY_SHAPE = /^[A-Za-z0-9_-]{30,60}$/;
export const SUB_ID_SHAPE = /^sub_[A-Za-z0-9_]{8,80}$/;

export const projectOk = env => !!env && PROJECT_SHAPE.test(String(env.FIREBASE_PROJECT_ID || ""));
// the public web config (RS94: identifiers, not secrets), or null when it is not fully and validly set. No auth domain:
// sign-in goes through Google Identity Services + signInWithCredential, never a popup or redirect (RS94 security review)
export function webConfig(env) {
  if (!projectOk(env)) return null;
  const apiKey = String(env.FIREBASE_API_KEY || ""), clientId = String(env.FIREBASE_GOOGLE_CLIENT_ID || "");
  if (!API_KEY_SHAPE.test(apiKey) || !CLIENT_ID_SHAPE.test(clientId)) return null;
  return { apiKey, projectId: String(env.FIREBASE_PROJECT_ID), clientId };
}

// test seams: a fake fetch and a fixed clock (seconds); production uses the real ones
let FETCH = (...a) => fetch(...a), NOW = () => Math.floor(Date.now() / 1000);
export const __test = { setFetch(f) { FETCH = f || ((...a) => fetch(...a)); }, setNow(f) { NOW = f || (() => Math.floor(Date.now() / 1000)); },
  reset() { KEYS = null; } };

const b64urlBytes = s => {
  s = String(s).replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "=";
  const bin = atob(s), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const b64urlJson = s => JSON.parse(new TextDecoder().decode(b64urlBytes(s)));
const maxAge = cc => { const m = /(?:^|,)\s*max-age\s*=\s*(\d+)/i.exec(String(cc || "")); const n = m ? Number(m[1]) : KEYS_DEFAULT_SEC;
  return Math.min(KEYS_MAX_SEC, Math.max(KEYS_MIN_SEC, n)); };

// Google's securetoken public keys, cached per Cache-Control. -> {keys: Map(kid -> CryptoKey), until, at} or null
let KEYS = null;
async function fetchKeys(now) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), KEYS_TIMEOUT_MS);
  try {
    const res = await FETCH(JWKS_URL, { method: "GET", redirect: "error", signal: ctl.signal, headers: { Accept: "application/json" } });
    if (res.status !== 200) return null;
    const j = await res.json();
    if (!j || !Array.isArray(j.keys)) return null;
    const keys = new Map();
    for (const k of j.keys) {
      if (!k || k.kty !== "RSA" || typeof k.kid !== "string" || typeof k.n !== "string" || typeof k.e !== "string") continue;
      if (k.alg && k.alg !== "RS256") continue;
      try {
        keys.set(k.kid, await crypto.subtle.importKey("jwk", { kty: "RSA", n: k.n, e: k.e, alg: "RS256", ext: true },
          { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]));
      } catch { /* skip a key WebCrypto cannot read */ }
    }
    if (!keys.size) return null;
    return { keys, until: now + maxAge(res.headers.get("Cache-Control")), at: now };
  } catch { return null; } finally { clearTimeout(timer); }
}
async function keyFor(kid, now) {
  if (!KEYS || KEYS.until <= now) { const k = await fetchKeys(now); if (k) KEYS = k; else if (!KEYS || KEYS.until <= now) return null; }
  if (!KEYS.keys.has(kid) && now - KEYS.at >= KEYS_MIN_SEC) {   // keys rotate: an unknown kid refetches, at most once a minute
    const k = await fetchKeys(now); if (k) KEYS = k;
  }
  return KEYS.keys.get(kid) || null;
}

// -> the verified payload, or null. Every RS94 check: RS256 + known kid + signature, iss, aud, exp, iat, auth_time, sub, provider.
export async function verifyIdToken(token, projectId) {
  try {
    if (typeof token !== "string" || token.length > MAX_TOKEN || !PROJECT_SHAPE.test(String(projectId || ""))) return null;
    const parts = token.split(".");
    if (parts.length !== 3 || parts.some(p => !/^[A-Za-z0-9_-]+$/.test(p))) return null;
    const head = b64urlJson(parts[0]), pay = b64urlJson(parts[1]);
    if (!head || head.alg !== "RS256" || typeof head.kid !== "string" || !pay || typeof pay !== "object") return null;
    const now = NOW();
    if (pay.iss !== "https://securetoken.google.com/" + projectId || pay.aud !== projectId) return null;
    if (typeof pay.exp !== "number" || pay.exp <= now) return null;
    if (typeof pay.iat !== "number" || pay.iat > now + SKEW_SEC) return null;
    if (typeof pay.auth_time !== "number" || pay.auth_time > now + SKEW_SEC) return null;
    if (typeof pay.sub !== "string" || !pay.sub || pay.sub.length > 128) return null;
    if (!pay.firebase || pay.firebase.sign_in_provider !== "google.com") return null;
    const key = await keyFor(head.kid, now);
    if (!key) return null;
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlBytes(parts[2]),
      new TextEncoder().encode(parts[0] + "." + parts[1]));
    return ok ? pay : null;
  } catch { return null; }
}

export function bearer(request) {
  const h = request && request.headers ? request.headers.get("Authorization") || "" : "";
  const m = /^Bearer ([A-Za-z0-9_.-]{20,4096})$/.exec(h);
  return m ? m[1] : "";
}
// Pro from the token's claims: set only by our server (link.js / refresh.js), fresh only for PRO_FRESH_SEC
export function proFromClaims(pay, now = NOW()) {
  return !!pay && pay.pro === true && SUB_ID_SHAPE.test(String(pay.sub_id || ""))
    && typeof pay.checked_at === "number" && now - pay.checked_at <= PRO_FRESH_SEC && pay.checked_at <= now + SKEW_SEC;
}
// the verified payload of the request's bearer token, or null (for the auth routes, which need auth_time and claims)
export async function verifiedPayload(request, env) {
  try {
    if (!projectOk(env)) return null;
    const t = bearer(request);
    return t ? await verifyIdToken(t, env.FIREBASE_PROJECT_ID) : null;
  } catch { return null; }
}

// The shared helper (agreed interface): {uid, pro: boolean} or null; never throws.
export async function signedInUser(request, env) {
  try {
    const pay = await verifiedPayload(request, env);
    return pay ? { uid: pay.sub, pro: proFromClaims(pay) } : null;
  } catch { return null; }
}
