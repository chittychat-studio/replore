// SPEC RS94: server-side calls to Firebase Authentication through the Identity Toolkit REST API (no firebase-admin).
// Not a route. The service-account JSON comes from the Pages secret FIREBASE_SERVICE_ACCOUNT; it, the signed JWT and the
// access token are never logged, returned or put in an error (RS8). Every call: a deadline, redirect: "error", and a
// plain result object; nothing here throws to the caller.

import { projectOk } from "./session.js";

export const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const ITK = "https://identitytoolkit.googleapis.com/v1/projects/";
export const SCOPE = "https://www.googleapis.com/auth/identitytoolkit";
export const GOOGLE_TIMEOUT_MS = 5000, MAX_USER_PAGES = 50, PAGE_SIZE = 1000;
// RS94 "What we store", item 2: the only custom claims this code ever writes
export const CLAIM_FIELDS = ["pro", "sub_id", "checked_at"];

let FETCH = (...a) => fetch(...a), NOW = () => Math.floor(Date.now() / 1000), TOKEN = null;
export const __test = { setFetch(f) { FETCH = f || ((...a) => fetch(...a)); }, setNow(f) { NOW = f || (() => Math.floor(Date.now() / 1000)); },
  reset() { TOKEN = null; } };

// the service account, or null when the secret is missing or unreadable
export function serviceAccount(env) {
  try {
    const j = JSON.parse(String(env && env.FIREBASE_SERVICE_ACCOUNT || ""));
    if (!j || typeof j.client_email !== "string" || !/@[a-z0-9.-]+\.iam\.gserviceaccount\.com$/.test(j.client_email)) return null;
    if (typeof j.private_key !== "string" || !j.private_key.includes("BEGIN PRIVATE KEY")) return null;
    return { email: j.client_email, pem: j.private_key };
  } catch { return null; }
}
export const adminOn = env => projectOk(env) && !!serviceAccount(env);

const b64url = bytes => { let s = ""; const b = new Uint8Array(bytes); for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const b64urlText = t => b64url(new TextEncoder().encode(t));
function pemBytes(pem) {
  const body = String(pem).replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  const bin = atob(body), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
// RS256 service-account JWT for Google's OAuth token endpoint
export async function serviceJwt(sa, now) {
  const key = await crypto.subtle.importKey("pkcs8", pemBytes(sa.pem), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const head = b64urlText(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = b64urlText(JSON.stringify({ iss: sa.email, sub: sa.email, aud: TOKEN_URL, scope: SCOPE, iat: now, exp: now + 3600 }));
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(head + "." + body));
  return head + "." + body + "." + b64url(sig);
}

async function call(url, init) {   // -> {status, json} | {status: 0}
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), GOOGLE_TIMEOUT_MS);
  try {
    const res = await FETCH(url, { redirect: "error", signal: ctl.signal, ...init });
    let json = null; try { json = await res.json(); } catch { json = null; }
    return { status: res.status, json };
  } catch { return { status: 0, json: null }; } finally { clearTimeout(timer); }
}

// an OAuth access token for the service account, cached in this isolate until a minute before it expires; or null
export async function accessToken(env) {
  const sa = serviceAccount(env), now = NOW();
  if (!sa) return null;
  if (TOKEN && TOKEN.email === sa.email && TOKEN.until > now) return TOKEN.value;
  let jwt; try { jwt = await serviceJwt(sa, now); } catch { return null; }
  const r = await call(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: "grant_type=" + encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer") + "&assertion=" + jwt });
  const t = r.json && typeof r.json.access_token === "string" ? r.json.access_token : "";
  if (r.status !== 200 || !t) return null;
  const life = Math.max(60, Math.min(3600, Number(r.json.expires_in) || 3600));
  TOKEN = { email: sa.email, value: t, until: now + life - 60 };
  return t;
}

async function itk(env, path, body, method = "POST") {   // -> {ok, status, json}
  const tok = await accessToken(env);
  if (!tok) return { ok: false, status: 0, json: null };
  const r = await call(ITK + env.FIREBASE_PROJECT_ID + path, { method,
    headers: { Authorization: "Bearer " + tok, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  return { ok: r.status === 200, status: r.status, json: r.json };
}

// the claims object RS94 allows, built in one place so a test can check every field against PRIVACY.md
export function proClaims(pro, subId, checkedAt) { return { pro: !!pro, sub_id: String(subId), checked_at: Math.floor(checkedAt) }; }

// set the custom claims (replaces any earlier ones); -> true | false
export async function setClaims(env, uid, claims) {
  const keys = Object.keys(claims || {});
  if (!keys.every(k => CLAIM_FIELDS.includes(k))) return false;   // never anything outside the RS94 list
  return (await itk(env, "/accounts:update", { localId: uid, customAttributes: JSON.stringify(claims) })).ok;
}
// delete the Firebase user (and with it the claims); -> true | false
export async function deleteUser(env, uid) { return (await itk(env, "/accounts:delete", { localId: uid })).ok; }

// RS94 one subscription <-> one account, with no database: page through the project's users and look for another uid
// holding this sub_id. -> "free" | "taken" | "error" (fail closed: too many pages or any failed page is an error)
export async function subHolder(env, subId, uid) {
  let next = "";
  for (let page = 0; page < MAX_USER_PAGES; page++) {
    const r = await itk(env, "/accounts:batchGet?maxResults=" + PAGE_SIZE + (next ? "&nextPageToken=" + encodeURIComponent(next) : ""), null, "GET");
    if (!r.ok || !r.json || typeof r.json !== "object") return "error";
    for (const u of Array.isArray(r.json.users) ? r.json.users : []) {
      if (!u || u.localId === uid || typeof u.customAttributes !== "string") continue;
      let c = null; try { c = JSON.parse(u.customAttributes); } catch { c = null; }
      if (c && c.sub_id === subId) return "taken";
    }
    next = typeof r.json.nextPageToken === "string" ? r.json.nextPageToken : "";
    if (!next) return "free";
  }
  return "error";
}
