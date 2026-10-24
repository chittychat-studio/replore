// SPEC RS95/RS96: /api/relevance with the router bound. The Durable Object is the real RouterService over a fake SQLite;
// providers are fakes. No network, no Cloudflare runtime.
import assert from "node:assert";
import * as fn from "../functions/api/relevance.js";
import { RouterService } from "../router/src/service.js";

const repos = [
  { name: "a/landing", description: "landing page template", topics: ["react"] },
  { name: "b/ionic", description: "mobile UI toolkit", topics: [] },
];
const SECRETS = { LLM_API_KEY: "gsk_free_SECRET_aaaa1111", PAID_LLM_API_KEY: "gsk_paid_SECRET_bbbb2222", MISTRAL_API_KEY: "mis_SECRET_cccc3333",
  EVAL_KEY: "eval-key-SECRET-0123456789" };
function fakeStorage() {
  const kv = new Map();
  return { kv, sql: { exec(q, ...b) { if (/^INSERT/.test(q)) kv.set(b[0], b[1]); return { toArray: () => (/^SELECT/.test(q) ? [...kv].map(([k, v]) => ({ k, v })) : []) }; } },
    async setAlarm() {}, async getAlarm() { return null; } };
}
async function router() {
  const svc = new RouterService(fakeStorage()); await svc.init();
  const calls = { acquire: 0, report: 0, status: 0 };
  const stub = { acquire: a => { calls.acquire++; return svc.acquire(structuredClone(a)); },
    report: a => { calls.report++; return svc.report(structuredClone(a)); }, status: () => { calls.status++; return svc.status(); } };
  return { svc, calls, ROUTER: { idFromName: () => "global", get: () => stub } };
}
const AIok = { calls: 0, run: async () => { AIok.calls++; return { response: '{"drop":[1]}', usage: { prompt_tokens: 900, completion_tokens: 8 } }; } };
const AIdown = { run: async () => { throw new Error("3036: you have used up your daily free allocation of 10,000 neurons"); } };
// fake OpenAI-compatible provider: records which key and model were used
function provider(script = () => ({ status: 200 })) {
  const f = async (url, init) => {
    const body = JSON.parse(init.body), key = init.headers.Authorization.slice(7);
    f.calls.push({ url, key, model: body.model });
    const r = script(key, body.model) || {};
    const headers = { "Content-Type": "application/json", ...(r.headers || {}) };
    if ((r.status || 200) !== 200) return new Response(r.text || "error", { status: r.status, headers });
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"drop":[0]}' } }], usage: { prompt_tokens: 700, completion_tokens: 90 } }), { status: 200, headers });
  };
  f.calls = []; return f;
}
let ipn = 0;
const post = (env, f, { query = "a site for my bakery", headers = {}, ip } = {}) => fn.onRequestPost({
  request: new Request("https://replore.cardzo.co.in/api/relevance", { method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip || "203.0.113." + (++ipn % 250), ...headers },
    body: JSON.stringify({ query, repos }) }),
  env: { ALLOW_NO_TURNSTILE: "1", ...env }, waitUntil: p => p }, f);
const reset = () => { fn.ROUTER_CLIENT.reset(); fn.resetRateLimit(); fn.setSignedInHook(null); };
const nocache = { caches: undefined };
globalThis.caches = undefined;   // the edge cache is exercised separately below

// ---- no binding: exactly today's chain (Workers AI, then LLM_API_KEY), no credits field ----
{ reset(); const f = provider();
  const r = await post({ AI: AIdown, LLM_API_KEY: SECRETS.LLM_API_KEY, PAID_LLM_API_KEY: SECRETS.PAID_LLM_API_KEY, ROUTER_DAILY_BUDGET_USD: "4" }, f);
  const j = await r.json();
  assert.strictEqual(r.status, 200); assert.ok(!("credits" in j)); assert.deepStrictEqual(f.calls.map(c => c.key), [SECRETS.LLM_API_KEY], "never the paid key");
  assert.strictEqual(await fn.routerContext(new Request("https://x/"), {}), null); }
console.log("no binding = today's chain ok");

// ---- routed: Workers AI first, credits counted per IP, returned in the reply ----
{ reset(); const R = await router(), f = provider(); AIok.calls = 0;
  const env = { ROUTER: R.ROUTER, AI: AIok, LLM_API_KEY: SECRETS.LLM_API_KEY };
  for (let i = 1; i <= 5; i++) {
    const r = await post(env, f, { ip: "198.51.100.10" }), j = await r.json();
    assert.strictEqual(r.status, 200); assert.deepStrictEqual(j.credits, { left: 5 - i, cap: 5 }); assert.deepStrictEqual(j.drop.map(d => d.i), [1]);
  }
  const r = await post(env, f, { ip: "198.51.100.10" }), j = await r.json();
  assert.strictEqual(r.status, 429); assert.strictEqual(j.error, "credits_used_up"); assert.deepStrictEqual(j.credits, { left: 0, cap: 5 });
  assert.ok(j.resetsInSec > 0 && j.resetsInSec <= 86400);
  assert.strictEqual(AIok.calls, 5, "no AI call once credits are used up"); assert.strictEqual(f.calls.length, 0);
  // another visitor still has their own 5
  assert.deepStrictEqual((await (await post(env, f, { ip: "198.51.100.11" })).json()).credits, { left: 4, cap: 5 });
  // built-in example searches and EVAL_KEY callers spend no credit
  const ex = await (await post(env, f, { ip: "198.51.100.10", query: fn.EXAMPLE_QUERIES[0] })).json();
  assert.strictEqual(ex.drop.length, 1); assert.ok(!("credits" in ex));
  const ev = await post({ ...env, EVAL_KEY: SECRETS.EVAL_KEY }, f, { ip: "198.51.100.10", headers: { "X-Replore-Eval-Key": SECRETS.EVAL_KEY } });
  assert.strictEqual(ev.status, 200); assert.ok(!("credits" in await ev.json()));
  // the DO stores a hash and a count, never the IP
  R.svc.flush(true);
  for (const v of R.svc.storage.kv.values()) assert.ok(!v.includes("198.51.100"), "no IP in storage"); }
console.log("credits via the function ok");

// ---- the cache: a hit spends no credit and makes no DO call; only Workers AI / Pro answers are stored ----
{ reset(); const R = await router(), f = provider(), store = new Map();
  const cache = { match: async k => store.get(k.url), put: async (k, v) => { store.set(k.url, v.clone ? v.clone() : v); } };
  const env = { ROUTER: R.ROUTER, AI: AIok, LLM_API_KEY: SECRETS.LLM_API_KEY };
  const a = await fn.cachedJudge("q one", repos, env, f, cache, "https://replore.cardzo.co.in", undefined, 4500, { tier: "free", credit: { kind: "anon", id: "1.2.3.4" } });
  assert.strictEqual(a.status, 200); assert.ok(a.cacheable); assert.strictEqual(store.size, 1);
  const before = R.calls.acquire;
  const b = await fn.cachedJudge("q one", repos, env, f, cache, "https://replore.cardzo.co.in", undefined, 4500, { tier: "free", credit: { kind: "anon", id: "1.2.3.4" } });
  assert.ok(b.cached); assert.strictEqual(R.calls.acquire, before, "a cache hit never reaches the DO");
  // Groq free answer (Workers AI used up) is not cached
  const env2 = { ROUTER: R.ROUTER, AI: AIdown, LLM_API_KEY: SECRETS.LLM_API_KEY };
  const c = await fn.cachedJudge("q two", repos, env2, f, cache, "https://replore.cardzo.co.in", undefined, 4500, { tier: "free", credit: { kind: "none" } });
  assert.strictEqual(c.status, 200); assert.ok(!c.cacheable); assert.strictEqual(store.size, 1); }
console.log("cache ok");

// ---- paid overflow: off by default; with a budget, used only after the free pool, with the paid key ----
{ reset(); const R = await router();
  const groq429 = provider((key) => (key === SECRETS.LLM_API_KEY ? { status: 429, text: "Rate limit reached: tokens per day (TPD): Limit 200000", headers: { "retry-after": "7200" } } : { status: 200 }));
  const env = { ROUTER: R.ROUTER, AI: AIdown, LLM_API_KEY: SECRETS.LLM_API_KEY, PAID_LLM_API_KEY: SECRETS.PAID_LLM_API_KEY };
  let r = await post(env, groq429), j = await r.json();
  assert.strictEqual(r.status, 503); assert.strictEqual(j.error, "llm_daily_limit", "budget 0: keyword results, never the paid key");
  assert.ok(groq429.calls.every(c => c.key === SECRETS.LLM_API_KEY)); assert.ok(groq429.calls.length <= 3, "at most 3 attempts");
  reset(); const R2 = await router(), g2 = provider((key) => (key === SECRETS.LLM_API_KEY ? { status: 429, text: "tokens per day (TPD): Limit 200000" } : {}));
  r = await post({ ...env, ROUTER: R2.ROUTER, ROUTER_DAILY_BUDGET_USD: "4" }, g2, { headers: { "X-Replore-Diag": "1" } }); j = await r.json();
  assert.strictEqual(r.status, 503, "3 attempts, all spent on the free pool (which is now cooling)"); assert.strictEqual(j.diag.length, 3);
  assert.deepStrictEqual(j.credits, { left: 5, cap: 5 }, "nothing ran: the credit is handed back");
  r = await post({ ...env, ROUTER: R2.ROUTER, ROUTER_DAILY_BUDGET_USD: "4" }, g2, { headers: { "X-Replore-Diag": "1" } }); j = await r.json();
  assert.strictEqual(r.status, 200, JSON.stringify(j));
  const keys = g2.calls.map(c => c.key); assert.strictEqual(keys[keys.length - 1], SECRETS.PAID_LLM_API_KEY);
  assert.ok(keys.slice(0, -1).every(k => k === SECRETS.LLM_API_KEY), "free first");
  assert.ok(j.diag.some(d => d.p === "paid"), "diag names the pool, not the key");
  assert.ok(R2.svc.storage.kv.has("ledger"), "ledger written on the paid call");
  const spent = R2.svc.sched.spend.paid.spent; assert.ok(spent > 0 && spent < 0.001, spent); }
console.log("paid overflow ok");

// ---- Pro: the Pro model first (cacheable), own budget ----
{ reset(); const R = await router(), f = provider();
  const env = { ROUTER: R.ROUTER, AI: AIok, LLM_API_KEY: SECRETS.LLM_API_KEY, PAID_LLM_API_KEY: SECRETS.PAID_LLM_API_KEY, PRO_LLM_DAILY_BUDGET_USD: "1" };
  const out = await fn.routedJudge("q", repos, env, f, 4500, { tier: "pro", credit: { kind: "none" } });
  assert.strictEqual(out.status, 200); assert.ok(out.cacheable); assert.deepStrictEqual(f.calls.map(c => c.model), ["openai/gpt-oss-120b"]);
  assert.strictEqual(f.calls[0].key, SECRETS.PAID_LLM_API_KEY); assert.ok(R.svc.sched.spend.pro.spent > 0);
  // a signed-in Pro user (RS94 hook) is Pro too; with no hook nobody is signed in
  fn.setSignedInHook(async () => ({ uid: "u_123", pro: true }));
  assert.deepStrictEqual(await fn.routerContext(new Request("https://x/", { headers: { "CF-Connecting-IP": "1.1.1.1" } }), env), { tier: "pro", credit: { kind: "none" } });
  fn.setSignedInHook(async () => ({ uid: "u_123", pro: false }));
  assert.deepStrictEqual(await fn.routerContext(new Request("https://x/", { headers: { "CF-Connecting-IP": "1.1.1.1" } }), env), { tier: "free", credit: { kind: "user", id: "u_123" } });
  fn.setSignedInHook(async () => { throw new Error("bad token"); });
  assert.deepStrictEqual((await fn.routerContext(new Request("https://x/", { headers: { "CF-Connecting-IP": "1.1.1.1" } }), env)).credit, { kind: "anon", id: "1.1.1.1" });
  fn.setSignedInHook(null);
  assert.deepStrictEqual((await fn.routerContext(new Request("https://x/", { headers: { Authorization: "Bearer forged", "CF-Connecting-IP": "1.1.1.1" } }), env)).credit, { kind: "anon", id: "1.1.1.1" });
  // signed-in credits: 20, keyed by uid
  fn.setSignedInHook(async () => ({ uid: "u_456", pro: false }));
  const j = await (await post({ ...env, PRO_LLM_DAILY_BUDGET_USD: "0" }, f)).json(); assert.deepStrictEqual(j.credits, { left: 19, cap: 20 });
  fn.setSignedInHook(null); }
console.log("pro + signed-in hook ok");

// ---- DO down: 250 ms deadline, no paid call, free chain in the isolate, breaker after 3 ----
{ reset(); let hung = 0; const ROUTER = { idFromName: () => "g", get: () => ({ acquire: () => { hung++; return new Promise(() => {}); }, report: () => new Promise(() => {}) }) };
  const f = provider();
  const env = { ROUTER, AI: AIdown, LLM_API_KEY: SECRETS.LLM_API_KEY, PAID_LLM_API_KEY: SECRETS.PAID_LLM_API_KEY, ROUTER_DAILY_BUDGET_USD: "4", PRO_LLM_DAILY_BUDGET_USD: "1" };
  const t0 = Date.now(), r = await post(env, f, { headers: { "X-Replore-Diag": "1" } }), took = Date.now() - t0, j = await r.json();
  assert.strictEqual(r.status, 200); assert.ok(took < 1500, took); assert.ok(!("credits" in j), "credits not enforced without the DO");
  assert.deepStrictEqual(f.calls.map(c => c.key), [SECRETS.LLM_API_KEY], "free only: the paid key is never used without the ledger");
  assert.strictEqual(j.diag[0].code, "router_down");
  await post(env, f); await post(env, f); assert.strictEqual(hung, 3);
  await post(env, f); assert.strictEqual(hung, 3, "breaker open: the DO is skipped for 30 s");
  // a DO that throws (overloaded) is the same
  reset(); const boom = { idFromName: () => "g", get: () => ({ acquire: async () => { throw new Error("overloaded"); } }) };
  assert.strictEqual((await post({ ...env, ROUTER: boom }, provider())).status, 200);
  // the per-IP burst limit still applies
  reset(); for (let i = 0; i < 10; i++) await post({ ...env, ROUTER: boom }, provider(), { ip: "192.0.2.1" });
  assert.strictEqual((await post({ ...env, ROUTER: boom }, provider(), { ip: "192.0.2.1" })).status, 429); }
console.log("DO down ok");

// ---- learning from Groq: headers lower limits, a bad key turns the model off ----
{ reset(); const R = await router();
  const f = provider((key, model) => model === "openai/gpt-oss-20b" ? { status: 401, text: '{"error":{"code":"invalid_api_key"}}' }
    : { headers: { "x-ratelimit-limit-tokens": "6000", "x-ratelimit-remaining-tokens": "5000", "x-ratelimit-limit-requests": "900", "x-ratelimit-remaining-requests": "899" } });
  const env = { ROUTER: R.ROUTER, AI: AIdown, LLM_API_KEY: SECRETS.LLM_API_KEY };
  for (let i = 0; i < 3; i++) await post(env, f);
  await fn.routedJudge("q", repos, env, f, 4500, { tier: "free", credit: { kind: "none" } });   // flushes pending reports
  const st = R.svc.sched.status(), by = Object.fromEntries(st.providers.map(p => [p.id, p]));
  assert.strictEqual(by["groq:openai/gpt-oss-20b"].state, "DISABLED");
  const learned = st.providers.filter(p => p.learned.tpm === 6000); assert.ok(learned.length >= 1, JSON.stringify(st.providers.map(p => p.learned)));
  assert.ok(f.calls.filter(c => c.model === "openai/gpt-oss-20b").length === 1, "a bad key is not retried"); }
console.log("learning ok");

// ---- owner status: only with EVAL_KEY; never a secret anywhere (reply, diag, logs, status) ----
{ reset(); const R = await router(), lines = [], real = console.log; console.log = (...a) => lines.push(a.join(" "));
  let texts = [];
  try {
    const env = { ROUTER: R.ROUTER, AI: AIdown, ...SECRETS, ROUTER_DAILY_BUDGET_USD: "4", PRO_LLM_DAILY_BUDGET_USD: "1" };
    const f = provider(() => ({ status: 500, text: "upstream said " + SECRETS.LLM_API_KEY }));
    for (let i = 0; i < 3; i++) texts.push(await (await post(env, f, { headers: { "X-Replore-Diag": "1" } })).text());
    const g = u => fn.onRequestGet({ request: new Request(u.url, { headers: u.h || {} }), env });
    const pub = await (await g({ url: "https://replore.cardzo.co.in/api/relevance?router=status" })).json();
    assert.ok(!("status" in pub) && "turnstile" in pub, "no key: the normal public config");
    const wrong = await (await g({ url: "https://replore.cardzo.co.in/api/relevance?router=status", h: { "X-Replore-Eval-Key": "x".repeat(26) } })).json();
    assert.ok(!("status" in wrong));
    const own = await g({ url: "https://replore.cardzo.co.in/api/relevance?router=status", h: { "X-Replore-Eval-Key": SECRETS.EVAL_KEY } });
    assert.strictEqual(own.status, 200); assert.strictEqual(own.headers.get("Cache-Control"), "no-store");
    const body = await own.text(); texts.push(body);
    const s = JSON.parse(body); assert.ok(s.status.providers.length >= 5); assert.match(s.text, /REPLORE ROUTER/);
    for (const v of R.svc.sched.credits.keys()) assert.ok(!body.includes(v), "no credit hash in the status");
    assert.ok(!body.includes(R.svc.sched.salt));
    assert.strictEqual((await fn.onRequestGet({ request: new Request("https://x/api/relevance?router=status", { headers: { "X-Replore-Eval-Key": SECRETS.EVAL_KEY } }), env: { EVAL_KEY: SECRETS.EVAL_KEY } })).status, 404);
  } finally { console.log = real; }
  const all = texts.join("\n") + lines.join("\n") + [...R.svc.storage.kv.values()].join("\n");
  for (const v of Object.values(SECRETS)) assert.ok(!all.includes(v), "secret leaked: " + v.slice(0, 8));
  assert.ok(lines.every(l => { const o = JSON.parse(l); return Object.keys(o).sort().join() === "code,evt,example,ms,status,trail"; }), "logs are codes only"); }
console.log("no secrets + owner status ok");
