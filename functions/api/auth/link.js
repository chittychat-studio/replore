// SPEC RS94: POST /api/auth/link, body {"key": "rp...."} with "Authorization: Bearer <Firebase ID token>".
// Links a paid Pro subscription (the RS90 key) to the signed-in Google account: the key's signature first (no Stripe
// call when it is wrong), then the RS87 Stripe check (validateProKey, reused, not duplicated), then one subscription to
// one account (subHolder), and only then the custom claims {pro, sub_id, checked_at}. Fail closed (RS7), codes only.

import { looksLikeProKey, proSigOk, proSubId } from "../pro/claim.js";
import { validateProKey } from "../relevance.js";
import { setClaims, subHolder, proClaims } from "./google.js";
import { guard, out, logAuth } from "./http.js";

export const LINK_MAX = 5;
const LINK_RATE = new Map();
export function resetLink() { LINK_RATE.clear(); }

export async function handleLink(request, env, fetchImpl = fetch, now = Date.now()) {
  const g = await guard(request, env, LINK_RATE, LINK_MAX, now);
  if (g.res) return g.res;
  const key = g.body.key;
  if (!looksLikeProKey(key)) return out(400, { error: "bad_key" });
  if (!(await proSigOk(key, env.PRO_SIGNING_SECRET))) return out(403, { error: "bad_key" });   // not ours: no Stripe call
  const subId = proSubId(key);
  const verdict = await validateProKey(subId, env, fetchImpl);
  if (verdict === "error") return out(503, { error: "stripe_error" });
  if (verdict !== "granted") return out(403, { error: "not_pro" });
  const holder = await subHolder(env, subId, g.pay.sub);
  if (holder === "taken") return out(409, { error: "already_linked" });
  if (holder !== "free") return out(503, { error: "auth_error" });
  if (!(await setClaims(env, g.pay.sub, proClaims(true, subId, now / 1000)))) return out(503, { error: "auth_error" });
  return out(200, { pro: true, linked: true });
}

export async function onRequestPost(context, fetchImpl = fetch) {
  const t0 = Date.now();
  return logAuth("auth_link", await handleLink(context.request, context.env || {}, fetchImpl), t0);
}
export async function onRequest() { return out(405, { error: "post_only" }); }
