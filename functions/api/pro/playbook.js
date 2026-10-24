// SPEC RS97: Pro playbooks. GET /api/pro/playbook -> the index; GET /api/pro/playbook?id=<id> -> one playbook.
// Only a granted Pro key (RS87) or a signed-in Pro user (RS94) gets an answer; the text lives in the PLAYBOOKS KV
// namespace, never in this public repo. Fail closed. Codes only in logs: never the key, token or playbook text.

import { sameOrigin, hit } from "./claim.js";
import { proKeyOk } from "../relevance.js";
import { signedInUser } from "../auth/session.js";

export const PB_RATE_MAX = 30, PB_WINDOW_MS = 60000, PB_ID = /^[a-z0-9-]{1,60}$/;
const PB_RATE = new Map();
export function resetPlaybook() { PB_RATE.clear(); }

const out = (status, obj, extra = {}) => {
  const r = new Response(JSON.stringify(obj), { status,
    headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", ...extra } });
  r.__code = obj && obj.error ? obj.error : "ok";
  return r;
};
const str = (v, max) => typeof v === "string" && v.length > 0 && v.length <= max;
// a stored record must have exactly the shape the cards render; anything else is refused (503), never passed on
export function cleanIndex(v) {
  if (!Array.isArray(v) || v.length > 50) return null;
  const rows = v.map(r => r && PB_ID.test(r.id) && str(r.title, 120) && Number.isInteger(r.steps) && r.steps > 0 && r.steps <= 60
    ? { id: r.id, title: r.title, steps: r.steps } : null);
  return rows.every(Boolean) ? rows : null;
}
export function cleanBook(v, id) {
  if (!v || v.id !== id || !str(v.title, 120) || !Array.isArray(v.steps) || !v.steps.length || v.steps.length > 60) return null;
  const steps = v.steps.map(s => s && str(s.title, 160) && str(s.body, 8000) ? { title: s.title, body: s.body } : null);
  return steps.every(Boolean) ? { id, title: v.title, steps } : null;
}

// isPro(request, env) -> true for a granted Pro key or a signed-in Pro user; injected so tests need no Stripe or Google
export async function playbookResponse(request, env, isPro, now = Date.now()) {
  if (!sameOrigin(request)) return out(403, { error: "bad_origin" });
  const wait = hit(PB_RATE, request.headers.get("CF-Connecting-IP"), now, PB_RATE_MAX, PB_WINDOW_MS);
  if (wait) return out(429, { error: "rate_limited", resetsInSec: wait }, { "Retry-After": String(wait) });
  const kv = env.PLAYBOOKS;
  if (!kv || typeof kv.get !== "function") return out(503, { error: "playbooks_off" });
  const id = new URL(request.url).searchParams.get("id");
  if (id !== null && !PB_ID.test(id)) return out(400, { error: "bad_id" });
  let pro = false; try { pro = await isPro(request, env); } catch { pro = false; }
  if (!pro) return out(403, { error: "pro_required" });
  let raw; try { raw = await kv.get(id === null ? "pb:index" : "pb:" + id, "json"); } catch { return out(503, { error: "store_error" }); }
  if (raw === null || raw === undefined) return id === null ? out(200, { playbooks: [] }) : out(404, { error: "not_found" });
  const body = id === null ? (v => v && { playbooks: v })(cleanIndex(raw)) : cleanBook(raw, id);
  return body ? out(200, body) : out(503, { error: "bad_record" });
}

export async function proOrSignedInPro(request, env) {
  if (await proKeyOk(request, env)) return true;
  const u = await signedInUser(request, env);
  return !!(u && u.pro);
}

export async function onRequestGet(context) {
  const t0 = Date.now(), res = await playbookResponse(context.request, context.env, proOrSignedInPro);
  try { console.log(JSON.stringify({ evt: "playbook", code: String(res.__code).replace(/[^a-z_]/g, "").slice(0, 40), status: res.status, ms: Date.now() - t0 })); } catch {}
  return res;
}
