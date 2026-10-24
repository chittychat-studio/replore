// SPEC RS94: GET /api/auth/config. The public Firebase web config (apiKey, authDomain, projectId: identifiers, not
// secrets; the API key is referrer-restricted in Google Cloud), exposed the way the Turnstile site key is (RS34c).
// {"on": false} until every switch is set, and then the page renders no sign-in UI and loads no Firebase file.

import { webConfig } from "./session.js";
import { authOn, out } from "./http.js";

export async function onRequestGet({ env }) {
  const c = authOn(env || {}) ? webConfig(env) : null;
  return out(200, c ? { on: true, ...c } : { on: false });
}
export async function onRequest() { return out(405, { error: "get_only" }); }
