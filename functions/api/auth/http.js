// SPEC RS94: the request checks shared by the sign-in routes (link, refresh, delete). Not a route. Codes only in replies
// and logs (RS34d): never the ID token, uid, email, Pro key or a secret.

import { sameOrigin, hit, proOn } from "../pro/claim.js";
import { webConfig, verifiedPayload } from "./session.js";
import { adminOn } from "./google.js";

export const AUTH_MAX_BODY = 1024, AUTH_WINDOW_MS = 60000;

export const out = (status, obj, extra = {}) => {
  const r = new Response(JSON.stringify(obj), { status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extra } });
  r.__code = obj && obj.error ? obj.error : "ok";
  return r;
};
// sign-in is on only when the web config, the service account and the RS87 Pro switches are all set (RS94 dormant switch)
export const authOn = env => !!webConfig(env) && adminOn(env) && proOn(env);

// -> {res} to answer at once, or {pay, body} to go on
export async function guard(request, env, store, max, now = Date.now()) {
  if (!sameOrigin(request)) return { res: out(403, { error: "bad_origin" }) };
  const wait = hit(store, request.headers.get("CF-Connecting-IP"), now, max, AUTH_WINDOW_MS);
  if (wait) return { res: out(429, { error: "rate_limited", resetsInSec: wait }, { "Retry-After": String(wait) }) };
  if (!authOn(env)) return { res: out(503, { error: "auth_off" }) };
  const ct = request.headers.get("Content-Type") || "";
  if (ct.split(";")[0].trim().toLowerCase() !== "application/json") return { res: out(415, { error: "json_only" }) };
  if (Number(request.headers.get("Content-Length") || 0) > AUTH_MAX_BODY) return { res: out(413, { error: "too_large" }) };
  const raw = await request.text();
  if (raw.length > AUTH_MAX_BODY) return { res: out(413, { error: "too_large" }) };
  let body; try { body = JSON.parse(raw || "{}"); } catch { return { res: out(400, { error: "bad_body" }) }; }
  if (!body || typeof body !== "object" || Array.isArray(body)) return { res: out(400, { error: "bad_body" }) };
  const pay = await verifiedPayload(request, env);
  if (!pay) return { res: out(401, { error: "not_signed_in" }) };
  return { pay, body };
}

// one log record per call: the route name, a code, the status and the time taken; nothing else
export function logAuth(evt, res, t0) {
  try { console.log(JSON.stringify({ evt, code: String(res.__code).replace(/[^a-z_]/g, "").slice(0, 40), status: res.status, ms: Date.now() - t0 })); } catch {}
  return res;
}
