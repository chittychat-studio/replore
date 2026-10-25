// SPEC RS98 — Replore Templates showroom. Cloudflare Pages Function for /templates and /templates/*.
// Passes GET/HEAD through to the storefront's own Pages project (TEMPLATES_ORIGIN). Nothing of the paid templates lives
// in this public repo. Fail closed: no or bad origin = 503, upstream failure = 502, never a page from anywhere else (RS7).

const UPSTREAM_MS = 10000;
// RS98: the request headers worth forwarding; everything else (cookies, Authorization, Replore keys) stays here
const PASS_HEADERS = ["accept", "accept-language", "if-none-match", "if-modified-since", "range", "user-agent"];

// RS98: only a bare https origin is accepted (no path, query, credentials or fragment)
export function validOrigin(v) {
  if (typeof v !== "string" || !v) return null;
  let u;
  try { u = new URL(v); } catch { return null; }
  if (u.protocol !== "https:" || u.username || u.password || u.search || u.hash || (u.pathname !== "/" && u.pathname !== "")) return null;
  return u.origin;
}

const plain = (status, code) => new Response(code + "\n", {
  status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
});

export async function onRequest(context, fetchImpl = fetch) {
  const { request, env } = context;
  if (request.method !== "GET" && request.method !== "HEAD") {
    const r = plain(405, "method_not_allowed"); r.headers.set("Allow", "GET, HEAD"); return r;
  }
  const origin = validOrigin(env && env.TEMPLATES_ORIGIN);
  if (!origin) return plain(503, "templates_off");

  const url = new URL(request.url);
  if (!(url.pathname === "/templates" || url.pathname.startsWith("/templates/"))) return plain(404, "not_found");
  const target = origin + url.pathname + url.search;

  const headers = new Headers();
  for (const h of PASS_HEADERS) { const v = request.headers.get(h); if (v) headers.set(h, v); }

  let res;
  try {
    res = await fetchImpl(target, { method: request.method, headers, redirect: "manual", signal: AbortSignal.timeout(UPSTREAM_MS) });
  } catch {
    return plain(502, "templates_unreachable");
  }
  if (res.status >= 500) return plain(502, "templates_upstream_error");

  const out = new Headers(res.headers);
  out.delete("set-cookie");
  // RS98: a redirect is followed by the browser only when it stays inside the storefront; it is shown at our address
  const loc = out.get("location");
  if (loc) {
    let to;
    try { to = new URL(loc, origin); } catch { to = null; }
    if (to && to.origin === origin && (to.pathname === "/templates" || to.pathname.startsWith("/templates/"))) {
      out.set("location", to.pathname + to.search + to.hash);
    } else {
      return plain(502, "templates_bad_redirect");
    }
  }
  return new Response(request.method === "HEAD" ? null : res.body, { status: res.status, statusText: res.statusText, headers: out });
}
