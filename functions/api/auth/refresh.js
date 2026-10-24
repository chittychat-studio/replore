// SPEC RS94: POST /api/auth/refresh, body {} with "Authorization: Bearer <Firebase ID token>". Rechecks a linked
// subscription with Stripe at most once a day per user, and on each new sign-in (the token's auth_time is newer than
// checked_at), so a cancelled subscription stops showing Pro. Granted keeps Pro; denied sets pro: false and keeps the
// link (one subscription stays with one account); a Stripe error changes nothing and answers 503 (fail closed, RS7).
// {"changed": true} tells the page to fetch a fresh ID token, which carries the new claims.

import { validateProKey } from "../relevance.js";
import { SUB_ID_SHAPE, proFromClaims } from "./session.js";
import { setClaims, proClaims } from "./google.js";
import { guard, out, logAuth } from "./http.js";

export const REFRESH_MAX = 10, RECHECK_SEC = 86400;
const REFRESH_RATE = new Map();
export function resetRefresh() { REFRESH_RATE.clear(); }

// pure: does this token's Pro link need a Stripe recheck now?
export function recheckDue(pay, nowSec) {
  if (!pay || !SUB_ID_SHAPE.test(String(pay.sub_id || ""))) return false;   // nothing linked
  const c = pay.checked_at;
  return typeof c !== "number" || nowSec - c >= RECHECK_SEC || (typeof pay.auth_time === "number" && pay.auth_time > c);
}

export async function handleRefresh(request, env, fetchImpl = fetch, now = Date.now()) {
  const g = await guard(request, env, REFRESH_RATE, REFRESH_MAX, now);
  if (g.res) return g.res;
  const pay = g.pay, nowSec = Math.floor(now / 1000);
  if (!SUB_ID_SHAPE.test(String(pay.sub_id || ""))) return out(200, { pro: false, linked: false, changed: false });
  if (!recheckDue(pay, nowSec)) return out(200, { pro: proFromClaims(pay, nowSec), linked: true, changed: false });
  const verdict = await validateProKey(pay.sub_id, env, fetchImpl);
  if (verdict === "error") return out(503, { error: "stripe_error" });
  const pro = verdict === "granted";
  if (!(await setClaims(env, pay.sub, proClaims(pro, pay.sub_id, nowSec)))) return out(503, { error: "auth_error" });
  return out(200, { pro, linked: true, changed: true });
}

export async function onRequestPost(context, fetchImpl = fetch) {
  const t0 = Date.now();
  return logAuth("auth_refresh", await handleRefresh(context.request, context.env || {}, fetchImpl), t0);
}
export async function onRequest() { return out(405, { error: "post_only" }); }
