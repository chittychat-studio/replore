// SPEC RS53b: the trust function (functions/api/trust.js). No network: Scorecard and deps.dev are a fake fetch.
import assert from "node:assert";
import * as fn from "../functions/api/trust.js";

const R = (status, body) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
// routes: url substring -> Response factory; anything unmatched is a 404 text body (deps.dev's real "not found" shape)
const fake = routes => { const f = async url => { f.calls.push(url);
  for (const [k, v] of routes) if (url.includes(k)) return typeof v === "function" ? v() : R(v[0], v[1]);
  return R(404, "Not found"); }; f.calls = []; return f; };
const SC = { score: 8.94, date: "2026-10-19T21:25:38Z", checks: [{ name: "Code-Review", score: 10 }, { name: "Maintained", score: 10 }] };
const PKG = { versions: [{ versionKey: { version: "4.0.0" } }, { versionKey: { version: "5.3.0" }, isDefault: true }] };
const VER = (repo = "github.com/expressjs/express", extra = {}) => ({ licenses: ["MIT"],
  advisoryKeys: [{ id: "GHSA-qw6h-vgh9-j6wx" }, { id: "<script>" }],
  relatedProjects: [{ projectKey: { id: repo }, relationType: "SOURCE_REPO", relationProvenance: "UNVERIFIED_METADATA" }], ...extra });
const ok = () => fake([["securityscorecards", [200, SC]], ["versions/5.3.0", [200, VER()]], ["packages/express", [200, PKG]]]);
const get = (qs, f, headers = {}, cache) => fn.onRequestGet({ request: new Request("https://replore.test/api/trust?" + qs, { headers }) }, f, cache);
const body = async r => r.json();

// RS53b validation: RS51 repo names only, fixed language list
assert.ok(fn.validRepo("expressjs/express") && fn.validRepo("a-b/c.d_e"));
["", "x", "a/b/c", "a/..", "a/.", "../etc", "a b/c", "-".repeat(40) + "/x", 7].forEach(r => assert.ok(!fn.validRepo(r), String(r)));
for (const qs of ["repo=a%2F..", "repo=a/b/c", "repo=x", "repo=a/b&lang=Klingon", "repo=a/b&lang=__proto__", "lang=Go"])
  assert.strictEqual((await get(qs, ok())).status, 400, qs);
assert.strictEqual((await get("repo=a/b", ok(), { Origin: "https://evil.example" })).status, 403);
assert.strictEqual((await get("repo=a/b", ok(), { Origin: "https://replore.test" })).status, 200);

// forward-check candidates per ecosystem
assert.strictEqual(fn.packageCandidate("expressjs/Express", "npm"), "express");
assert.strictEqual(fn.packageCandidate("gin-gonic/gin", "go"), "github.com/gin-gonic/gin");
assert.strictEqual(fn.packageCandidate("a/b", null), null);
assert.strictEqual(fn.ECOSYSTEM.TypeScript, "npm"); assert.strictEqual(fn.ECOSYSTEM.Java, undefined);

// happy path: score rounded, Maintained picked, package accepted, bad advisory ID dropped (RS9)
{ const f = ok(), j = await body(await get("repo=expressjs/express&lang=JavaScript", f));
  assert.deepStrictEqual(j.scorecard, { status: "ok", score: 8.9, date: "2026-10-19", maintained: 10 });
  assert.deepStrictEqual(j.package, { status: "ok", system: "npm", name: "express", version: "5.3.0", licenses: ["MIT"],
    advisories: ["GHSA-qw6h-vgh9-j6wx"], advisoryCount: 1 });
  assert.ok(f.calls.some(u => u === "https://api.deps.dev/v3/systems/npm/packages/express/versions/5.3.0"));
  assert.ok(f.calls.includes("https://api.securityscorecards.dev/projects/github.com/expressjs/express")); }

// RS53b anti-spoof: a package with the repo's name that points at another repo is not shown
{ const f = fake([["securityscorecards", [200, SC]], ["versions/5.3.0", [200, VER("github.com/someone/else")]], ["packages/express", [200, PKG]]]);
  assert.deepStrictEqual((await body(await get("repo=expressjs/express&lang=JavaScript", f))).package, { status: "none" }); }
// ISSUE_TRACKER links don't count either; repo match is case-insensitive
assert.ok(!fn.linksToRepo({ relatedProjects: [{ projectKey: { id: "github.com/a/b" }, relationType: "ISSUE_TRACKER" }] }, "a/b"));
assert.ok(fn.linksToRepo({ relatedProjects: [{ projectKey: { id: "github.com/PSF/Requests" }, relationType: "SOURCE_REPO" }] }, "psf/requests"));
assert.ok(!fn.linksToRepo(null, "a/b") && !fn.linksToRepo({ relatedProjects: "x" }, "a/b"));

// Go modules: the module path is URL-encoded as one path segment; exact-URL routes (every /vN is probed)
const D = "https://api.deps.dev/v3/systems/go/packages/";
const exact = routes => { const f = async url => { f.calls.push(url); const v = routes[url];
  if (typeof v === "function") return v(); return v ? R(v[0], v[1]) : (url.includes("securityscorecards") ? R(404, "{}") : R(404, "Not found")); };
  f.calls = []; return f; };
const def = v => [200, { versions: [{ versionKey: { version: "v0.1.0" } }, { versionKey: { version: v }, isDefault: true }] }];
{ const f = exact({ [D + "github.com%2Fgin-gonic%2Fgin"]: def("v1.12.0"),
    [D + "github.com%2Fgin-gonic%2Fgin/versions/v1.12.0"]: [200, VER("github.com/gin-gonic/gin")] });
  const j = await body(await get("repo=gin-gonic/gin&lang=Go", f));
  assert.deepStrictEqual(j.scorecard, { status: "none" });
  assert.strictEqual(j.package.name, "github.com/gin-gonic/gin"); assert.strictEqual(j.package.version, "v1.12.0");
  assert.strictEqual(f.calls.filter(u => u.startsWith(D) && !u.includes("/versions/")).length, fn.GO_MAJORS.length, "bare path + /v2…/v9 probed"); }
// RS53b live regression (gofiber/fiber): the highest major module wins over the stale bare path
{ const f = exact({ [D + "github.com%2Fgofiber%2Ffiber"]: def("v1.14.6"), [D + "github.com%2Fgofiber%2Ffiber%2Fv2"]: def("v2.52.15"),
    [D + "github.com%2Fgofiber%2Ffiber%2Fv3"]: def("v3.6.1"),
    [D + "github.com%2Fgofiber%2Ffiber%2Fv3/versions/v3.6.1"]: [200, VER("github.com/gofiber/fiber", { advisoryKeys: [] })] });
  const p = (await body(await get("repo=gofiber/fiber&lang=Go", f))).package;
  assert.strictEqual(p.name, "github.com/gofiber/fiber/v3"); assert.strictEqual(p.version, "v3.6.1"); assert.strictEqual(p.advisoryCount, 0);
  assert.ok(!f.calls.some(u => u.includes("v1.14.6")), "the stale v1 line is never looked up"); }
// a newer major that errors must not fall back to an older one
{ const f = exact({ [D + "github.com%2Fgofiber%2Ffiber"]: def("v1.14.6"), [D + "github.com%2Fgofiber%2Ffiber%2Fv3"]: [503, "busy"],
    [D + "github.com%2Fgofiber%2Ffiber/versions/v1.14.6"]: [200, VER("github.com/gofiber/fiber")] });
  assert.deepStrictEqual((await body(await get("repo=gofiber/fiber&lang=Go", f))).package, { status: "error" }); }

// no language / unsupported -> package skipped, only Scorecard called
{ const f = ok(), j = await body(await get("repo=expressjs/express", f));
  assert.deepStrictEqual(j.package, { status: "skipped" }); assert.strictEqual(f.calls.length, 1); }

// RS7: failures are "error", never invented; a missing package is "none"
{ const f = fake([["securityscorecards", [500, "boom"]], ["packages/express", [200, { versions: [] }]]]);
  const j = await body(await get("repo=expressjs/express&lang=JavaScript", f));
  assert.deepStrictEqual(j.scorecard, { status: "error" }); assert.deepStrictEqual(j.package, { status: "none" }); }
{ const f = fake([["securityscorecards", () => { throw new Error("net down"); }], ["packages/express", [503, "busy"]]]);
  const j = await body(await get("repo=expressjs/express&lang=JavaScript", f));
  assert.deepStrictEqual(j.scorecard, { status: "error" }); assert.deepStrictEqual(j.package, { status: "error" }); }
{ const j = await body(await get("repo=nobody/nothing&lang=Python", fake([])));   // 404 text bodies everywhere
  assert.deepStrictEqual(j.scorecard, { status: "none" }); assert.deepStrictEqual(j.package, { status: "none" }); }
// malformed Scorecard shapes are rejected
[null, {}, { score: "9" }, { score: 11 }, { score: -1 }].forEach(x => assert.strictEqual(fn.shapeScorecard(x), null, JSON.stringify(x)));
assert.strictEqual(fn.shapeScorecard({ score: 5, date: "<b>", checks: [{ name: "Maintained", score: -1 }] }).date, null);
assert.strictEqual(fn.shapeScorecard({ score: 5, checks: [{ name: "Maintained", score: -1 }] }).maintained, null);
assert.strictEqual(fn.defaultVersion({ versions: [{ versionKey: { version: "1.0 <x>" }, isDefault: true }] }), null);
// advisories capped at 10 with the true total kept
{ const many = Array.from({ length: 14 }, (_, i) => ({ id: "GHSA-aaaa-bbbb-" + i }));
  const s = fn.shapeVersion({ advisoryKeys: many, licenses: ["MIT", "x<y"] }, "npm", "p", "1.0.0");
  assert.strictEqual(s.advisories.length, 10); assert.strictEqual(s.advisoryCount, 14); assert.deepStrictEqual(s.licenses, ["MIT"]); }

// RS53b cache: hit skips the network; failures are never stored
{ const store = new Map(), cache = { match: async k => store.get(k.url)?.clone(), put: async (k, v) => { store.set(k.url, v); } };
  const puts = []; const ctx = qs => ({ request: new Request("https://replore.test/api/trust?" + qs), waitUntil: p => puts.push(p) });
  const f1 = ok(); await fn.onRequestGet(ctx("repo=ExpressJS/express&lang=JavaScript"), f1, cache); await Promise.all(puts);
  assert.strictEqual(store.size, 1);
  const f2 = ok(), r2 = await fn.onRequestGet(ctx("repo=expressjs/express&lang=JavaScript"), f2, cache);
  assert.strictEqual(f2.calls.length, 0, "cache hit must not call out"); assert.strictEqual((await r2.json()).scorecard.score, 8.9);
  const f3 = fake([["securityscorecards", [500, "x"]]]); await fn.onRequestGet(ctx("repo=a/b"), f3, cache); await Promise.all(puts);
  assert.strictEqual(store.size, 1, "an errored answer must not be cached"); }

// per-IP burst limit (own store)
{ fn.resetTrustRate(); let last;
  for (let i = 0; i < 11; i++) last = await get("repo=a/b", fake([]), { "CF-Connecting-IP": "203.0.113.9" });
  assert.strictEqual(last.status, 429); assert.ok(+last.headers.get("Retry-After") >= 1);
  assert.strictEqual((await get("repo=a/b", fake([]), { "CF-Connecting-IP": "203.0.113.10" })).status, 200);
  fn.resetTrustRate(); }

// the response never echoes request headers or carries anything but the three parts
{ const j = await body(await get("repo=expressjs/express&lang=JavaScript", ok()));
  assert.deepStrictEqual(Object.keys(j).sort(), ["package", "repo", "scorecard"]); }

// RS54: the shared web/plugin cases (tests/fixtures/trust_cases.json); tests/test_trust.py runs the same file
{ const fs = await import("node:fs");
  const cases = JSON.parse(fs.readFileSync(new URL("./fixtures/trust_cases.json", import.meta.url), "utf8"));
  for (const c of cases.server) {
    const f = async url => { const r = c.routes[url]; if (!r) return R(404, "Not found"); return R(r[0], r[1]); };
    const got = await fn.trustFor(c.repo, c.lang, f);
    assert.deepStrictEqual({ scorecard: got.scorecard, package: got.package }, c.expect, c.name);
  }
  console.log("shared server cases ok:", cases.server.length); }

console.log("trust function tests passed");
