// SPEC RS98: the Templates showroom pass-through (functions/templates/[[path]].js). No network: the storefront is a fake fetch.
import assert from "node:assert";
import * as fn from "../functions/templates/[[path]].js";

const ORIGIN = "https://cardzo-templates.pages.dev";
const fake = (status = 200, body = "<html>shop</html>", headers = {}) => {
  const f = async (url, init) => { f.calls.push({ url, init }); return new Response(body, { status, headers }); };
  f.calls = []; return f;
};
const call = (path, { method = "GET", headers = {}, env = { TEMPLATES_ORIGIN: ORIGIN }, f = fake() } = {}) =>
  fn.onRequest({ request: new Request("https://replore.test" + path, { method, headers }), env }, f);

// origin validation: bare https origins only
assert.strictEqual(fn.validOrigin(ORIGIN), ORIGIN);
assert.strictEqual(fn.validOrigin(ORIGIN + "/"), ORIGIN);
for (const bad of [undefined, "", "http://x.dev", "https://x.dev/sub", "https://u:p@x.dev", "https://x.dev?a=1", "https://x.dev#h", "javascript:alert(1)", "x.dev", 7])
  assert.strictEqual(fn.validOrigin(bad), null, String(bad));

// fail closed without a valid origin (RS7)
for (const env of [{}, { TEMPLATES_ORIGIN: "http://insecure.dev" }, null]) {
  const r = await call("/templates/", { env });
  assert.strictEqual(r.status, 503); assert.match(await r.text(), /templates_off/);
}

// only GET and HEAD
for (const method of ["POST", "PUT", "DELETE", "PATCH"]) {
  const r = await call("/templates/", { method }); assert.strictEqual(r.status, 405); assert.strictEqual(r.headers.get("Allow"), "GET, HEAD");
}

// happy path: same path and query forwarded, body passed through
{ const f = fake(200, "<html>t</html>", { "content-type": "text/html", "content-security-policy": "default-src 'self'" });
  const r = await call("/templates/t/boho-hotel/?x=1", { f });
  assert.strictEqual(r.status, 200); assert.strictEqual(await r.text(), "<html>t</html>");
  assert.strictEqual(f.calls[0].url, ORIGIN + "/templates/t/boho-hotel/?x=1");
  assert.strictEqual(r.headers.get("content-security-policy"), "default-src 'self'"); }
{ const f = fake(); await call("/templates", { f }); assert.strictEqual(f.calls[0].url, ORIGIN + "/templates"); }

// nothing private goes upstream; cookies never come back
{ const f = fake(200, "ok", { "set-cookie": "a=b" });
  const r = await call("/templates/", { f, headers: { Cookie: "rp=1", Authorization: "Bearer x", "X-Replore-Plugin-Key": "k", Accept: "text/html" } });
  const sent = f.calls[0].init.headers;
  assert.strictEqual(sent.get("cookie"), null); assert.strictEqual(sent.get("authorization"), null);
  assert.strictEqual(sent.get("x-replore-plugin-key"), null); assert.strictEqual(sent.get("accept"), "text/html");
  assert.strictEqual(f.calls[0].init.redirect, "manual");
  assert.strictEqual(r.headers.get("set-cookie"), null); }

// HEAD has no body
{ const r = await call("/templates/", { method: "HEAD" }); assert.strictEqual(r.status, 200); assert.strictEqual(await r.text(), ""); }

// upstream failures are 502, never passed off as a page
{ const r = await call("/templates/", { f: fake(500, "boom") }); assert.strictEqual(r.status, 502); }
{ const f = async () => { throw new Error("timeout"); };
  const r = await call("/templates/", { f }); assert.strictEqual(r.status, 502); assert.match(await r.text(), /templates_unreachable/); }
// a 404 from the store is the store's own 404 page
{ const r = await call("/templates/nope/", { f: fake(404, "<html>404</html>") }); assert.strictEqual(r.status, 404); }

// redirects: inside the store are shown at our address; anywhere else is refused
{ const r = await call("/templates/t/x", { f: fake(308, "", { location: ORIGIN + "/templates/t/x/" }) });
  assert.strictEqual(r.status, 308); assert.strictEqual(r.headers.get("location"), "/templates/t/x/"); }
{ const r = await call("/templates/t/x", { f: fake(301, "", { location: "/templates/t/x/" }) });
  assert.strictEqual(r.headers.get("location"), "/templates/t/x/"); }
for (const loc of ["https://evil.example/", ORIGIN + "/admin/", "//evil.example/templates/"]) {
  const r = await call("/templates/", { f: fake(302, "", { location: loc }) }); assert.strictEqual(r.status, 502, loc);
}

console.log("test_templates_fn: ok");
