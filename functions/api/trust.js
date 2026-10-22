// SPEC RS52b — "Safe to build on?" trust check. Cloudflare Pages Function: GET /api/trust?repo=owner/repo&lang=<language>
// Asks OpenSSF Scorecard (security health) and Google's deps.dev (published package, its licenses and OSV advisory IDs)
// about one PUBLIC repo name, server-side so the visitor's IP is not passed on. It never receives search words (RS33).
// Display only: nothing here touches the ranking (RS5, RX3). Every part fails on its own: "error" or "none", never a guess (RS7).
import { sameOrigin, rateLimit } from "./relevance.js";

const CALL_MS = 4000, CACHE_TTL = 86400, MAX_ADVISORIES = 10;
const TRUST_RATE = new Map();   // RS52b: its own per-IP store, so opening panels never eats the relevance check's burst allowance
export function resetTrustRate() { TRUST_RATE.clear(); }
// RS51/RS52b: the only repo names accepted — the same owner/repo shape GitHub allows
const REPO_RE = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;
export const validRepo = r => typeof r === "string" && REPO_RE.test(r) && !/\/\.\.?$/.test(r);
// RS52b: GitHub language -> the one ecosystem the forward check tries (deps.dev system names)
export const ECOSYSTEM = { JavaScript: "npm", TypeScript: "npm", Python: "pypi", Rust: "cargo", Go: "go", Ruby: "rubygems", "C#": "nuget" };
// RS9: values from the APIs are data; anything outside these shapes is dropped, never shown
const NAME_RE = /^[@A-Za-z0-9._\/~+-]{1,214}$/, VERSION_RE = /^[A-Za-z0-9.+_~-]{1,64}$/,
  ADVISORY_RE = /^[A-Z][A-Z0-9]{1,15}-[A-Za-z0-9._:-]{1,60}$/, LICENSE_RE = /^[A-Za-z0-9.+() -]{1,80}$/, DATE_RE = /^\d{4}-\d{2}-\d{2}/;

// the package name the forward check looks up for this repo in this ecosystem
export function packageCandidate(repo, system) {
  if (!system) return null;
  return system === "go" ? "github.com/" + repo.toLowerCase() : repo.split("/")[1].toLowerCase();
}

// OpenSSF Scorecard answer -> { score, date, maintained } or null when the shape is wrong
export function shapeScorecard(j) {
  if (!j || typeof j.score !== "number" || !(j.score >= 0 && j.score <= 10)) return null;
  const m = (Array.isArray(j.checks) ? j.checks : []).find(c => c && c.name === "Maintained");
  return {
    score: Math.round(j.score * 10) / 10,
    date: typeof j.date === "string" && DATE_RE.test(j.date) ? j.date.slice(0, 10) : null,
    maintained: m && typeof m.score === "number" && m.score >= 0 && m.score <= 10 ? m.score : null,
  };
}

// deps.dev package answer -> its default version string, or null
export function defaultVersion(j) {
  const v = (j && Array.isArray(j.versions) ? j.versions : []).find(x => x && x.isDefault && x.versionKey);
  const s = v && v.versionKey.version;
  return typeof s === "string" && VERSION_RE.test(s) ? s : null;
}

// RS52b: accept a version only when the package itself names this exact repo as its source (spoofs claim the reverse way)
export function linksToRepo(j, repo) {
  const want = "github.com/" + repo.toLowerCase();
  return (j && Array.isArray(j.relatedProjects) ? j.relatedProjects : []).some(p =>
    p && p.relationType === "SOURCE_REPO" && p.projectKey && String(p.projectKey.id || "").toLowerCase() === want);
}

// deps.dev version answer -> the fields the card shows
export function shapeVersion(j, system, name, version) {
  const ids = (Array.isArray(j.advisoryKeys) ? j.advisoryKeys : []).map(a => a && a.id).filter(id => typeof id === "string" && ADVISORY_RE.test(id));
  return {
    system, name, version,
    licenses: (Array.isArray(j.licenses) ? j.licenses : []).filter(l => typeof l === "string" && LICENSE_RE.test(l)).slice(0, 3),
    advisories: ids.slice(0, MAX_ADVISORIES), advisoryCount: ids.length,
  };
}

// one GET with its own deadline; resolves to { status, json } (json null when the body isn't JSON)
async function getJson(url, fetchImpl) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), CALL_MS);
  try {
    const res = await fetchImpl(url, { headers: { Accept: "application/json" }, signal: ctl.signal });
    let json = null; try { json = await res.json(); } catch {}
    return { status: res.status, json };
  } finally { clearTimeout(timer); }
}

export async function scorecardPart(repo, fetchImpl = fetch) {
  try {
    const r = await getJson("https://api.securityscorecards.dev/projects/github.com/" + repo, fetchImpl);
    if (r.status === 404) return { status: "none" };
    const s = r.status === 200 && shapeScorecard(r.json);
    return s ? { status: "ok", ...s } : { status: "error" };
  } catch { return { status: "error" }; }
}

// RS52b: Go publishes major version N>=2 as its own module, `<path>/vN`; the bare path is only v0/v1 (live 2026-10-22:
// gofiber/fiber's bare path is v1.14.6 from 2020, with 6 advisories, while the current module is /v3 at v3.6.1)
export const GO_MAJORS = ["", "/v2", "/v3", "/v4", "/v5", "/v6", "/v7", "/v8", "/v9"];
export async function packagePart(repo, lang, fetchImpl = fetch) {
  const system = ECOSYSTEM[lang] || null, root = packageCandidate(repo, system);
  if (!root) return { status: "skipped" };
  const url = n => "https://api.deps.dev/v3/systems/" + system + "/packages/" + encodeURIComponent(n);
  try {
    const names = system === "go" ? GO_MAJORS.map(m => root + m) : [root];
    const found = await Promise.all(names.map(n => getJson(url(n), fetchImpl).catch(() => ({ status: 0 }))));
    let i = found.length - 1;   // the highest major that exists wins
    while (i >= 0 && !(found[i].status === 200 && defaultVersion(found[i].json))) i--;
    const failed = p => p.status !== 404 && p.status !== 200;
    if (i < 0) return found.some(failed) ? { status: "error" } : { status: "none" };
    if (found.slice(i + 1).some(failed)) return { status: "error" };   // a newer major may exist: never show an older one instead
    const name = names[i], version = defaultVersion(found[i].json), base = url(name);
    const v = await getJson(base + "/versions/" + encodeURIComponent(version), fetchImpl);
    if (v.status !== 200 || !v.json) return { status: "error" };
    if (!linksToRepo(v.json, repo)) return { status: "none" };   // same name, someone else's package
    return { status: "ok", ...shapeVersion(v.json, system, name, version) };
  } catch { return { status: "error" }; }
}

export async function trustFor(repo, lang, fetchImpl = fetch) {
  const [scorecard, pkg] = await Promise.all([scorecardPart(repo, fetchImpl), packagePart(repo, lang, fetchImpl)]);
  return { repo, scorecard, package: pkg };
}

const json = (status, obj, cache = "no-store") => new Response(JSON.stringify(obj), {
  status, headers: { "Content-Type": "application/json", "Cache-Control": cache, "X-Content-Type-Options": "nosniff" } });

export async function onRequestGet(context, fetchImpl = fetch, cache = globalThis.caches && globalThis.caches.default) {
  const { request } = context, url = new URL(request.url);
  if (!sameOrigin(request)) return json(403, { error: "bad_origin" });
  const repo = url.searchParams.get("repo") || "", lang = url.searchParams.get("lang") || "";
  if (!validRepo(repo) || (lang && !Object.prototype.hasOwnProperty.call(ECOSYSTEM, lang))) return json(400, { error: "bad_request" });
  const wait = rateLimit(request.headers.get("CF-Connecting-IP"), Date.now(), TRUST_RATE);
  if (wait) return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Retry-After": String(wait) } });
  const key = new Request(url.origin + "/api/trust?v=1&repo=" + encodeURIComponent(repo.toLowerCase()) +
    "&lang=" + encodeURIComponent(lang));
  if (cache) { try { const hit = await cache.match(key); if (hit) return json(200, await hit.json(), "public, max-age=3600"); } catch {} }
  const body = await trustFor(repo, lang, fetchImpl);
  if (cache && body.scorecard.status !== "error" && body.package.status !== "error") {   // RS52b: never cache a failure
    const put = Promise.resolve().then(() => cache.put(key, new Response(JSON.stringify(body), {
      headers: { "Content-Type": "application/json", "Cache-Control": "max-age=" + CACHE_TTL } }))).catch(() => {});
    if (context.waitUntil) context.waitUntil(put);
  }
  return json(200, body, "public, max-age=3600");
}
