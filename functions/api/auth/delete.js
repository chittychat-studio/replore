// SPEC RS94: POST /api/auth/delete, body {} with "Authorization: Bearer <Firebase ID token>". Deletes the Firebase user
// and with it the custom claims (the Pro link). It needs a sign-in in the last 5 minutes (401 "reauth" otherwise; the
// page asks Google again), so a token left in a browser cannot delete an account later. It does not cancel a Stripe
// subscription: the page says so and links Stripe's customer portal. Codes only.

import { deleteUser } from "./google.js";
import { guard, out, logAuth } from "./http.js";

export const DELETE_MAX = 5, REAUTH_SEC = 300;
const DELETE_RATE = new Map();
export function resetDelete() { DELETE_RATE.clear(); }

export async function handleDelete(request, env, now = Date.now()) {
  const g = await guard(request, env, DELETE_RATE, DELETE_MAX, now);
  if (g.res) return g.res;
  if (Math.floor(now / 1000) - g.pay.auth_time > REAUTH_SEC) return out(401, { error: "reauth" });
  if (!(await deleteUser(env, g.pay.sub))) return out(503, { error: "auth_error" });
  return out(200, { deleted: true });
}

export async function onRequestPost(context) {
  const t0 = Date.now();
  return logAuth("auth_delete", await handleDelete(context.request, context.env || {}), t0);
}
export async function onRequest() { return out(405, { error: "post_only" }); }
