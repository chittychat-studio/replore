// SPEC RS95/RS96: the router's scheduler, policy and storage plan, with a fake clock. No network, no Cloudflare runtime.
import assert from "node:assert";
import * as P from "../router/src/policy.js";
import { Scheduler, asciiStatus } from "../router/src/scheduler.js";
import { RouterService, FLUSH_MS } from "../router/src/service.js";
import { routerCatalog, RouterClient, parseLimits } from "../router/src/client.js";

const NOON = Date.UTC(2026, 9, 25, 12, 0, 0);
let T = NOON;
const now = () => T;
const H = 3600000;

// ---- policy: the ported formulas ----
assert.strictEqual(P.headroomRamp(0.5), 1); assert.strictEqual(P.headroomRamp(0.2), 1);
assert.ok(Math.abs(P.headroomRamp(0.1) - 0.55) < 1e-9); assert.strictEqual(P.headroomRamp(0), 0.1); assert.strictEqual(P.headroomRamp(-1), 0.1);
assert.strictEqual(P.rateLimitFactor(0), 1); assert.ok(Math.abs(P.rateLimitFactor(10) - 0.4) < 1e-9); assert.ok(Math.abs(P.rateLimitFactor(99) - 0.4) < 1e-9);
assert.strictEqual(P.decayedPenalty(6, 0, 4 * 60000), 4);   // 1 point per 2 minutes
assert.strictEqual(P.parseDuration("2m59.56s"), 179.56); assert.strictEqual(P.parseDuration("7.66s"), 7.66);
assert.strictEqual(P.parseDuration("1h2m3s"), 3723); assert.strictEqual(P.parseDuration("250ms"), 0.25); assert.strictEqual(P.parseDuration("x"), null);
{ const hdr = { "x-ratelimit-limit-requests": "1000", "x-ratelimit-remaining-requests": "990", "x-ratelimit-limit-tokens": "8000",
    "x-ratelimit-remaining-tokens": "5000", "x-ratelimit-reset-requests": "2m59.56s", "x-ratelimit-reset-tokens": "7.66s" };
  assert.deepStrictEqual(P.parseGroqHeaders(k => hdr[k]), { rpdLimit: 1000, rpdLeft: 990, tpmLimit: 8000, tpmLeft: 5000, rpdResetSec: 179.56, tpmResetSec: 7.66 });
  assert.strictEqual(P.parseGroqHeaders(() => null), null);
  assert.strictEqual(P.retryAfterSec(k => ({ "retry-after": "12" })[k]), 12);
  assert.strictEqual(P.retryAfterSec(k => ({ "retry-after-ms": "1500", "retry-after": "12" })[k]), 1.5); }
assert.deepStrictEqual(P.parseLimitText("Rate limit reached for model on tokens per minute (TPM): Limit 6000, Used 5800, Requested 900"), [{ dim: "tpm", limit: 6000 }]);
assert.deepStrictEqual(P.parseLimitText("requests per day (RPD): Limit 500, Used 500"), [{ dim: "rpd", limit: 500 }]);
assert.deepStrictEqual(P.parseLimitText("boom"), []);
// LiteLLM: which errors cool a provider
const cls = (code, status) => P.classify({ ok: false, code, status });
assert.strictEqual(P.classify({ ok: true }), "ok");
assert.strictEqual(cls("llm_rate_limited", 429), "transient"); assert.strictEqual(cls("wai_capacity", 0), "capacity");
assert.strictEqual(cls("llm_daily_limit", 429), "daily"); assert.strictEqual(cls("llm_auth", 401), "auth"); assert.strictEqual(cls("llm_error", 403), "auth");
assert.strictEqual(cls("wai_error_3023", 0), "auth"); assert.strictEqual(cls("llm_payment", 402), "payment");
assert.strictEqual(cls("llm_model_gone", 404), "gone"); assert.strictEqual(cls("wai_error_5028", 0), "gone");
assert.strictEqual(cls("llm_timeout", 0), "server"); assert.strictEqual(cls("llm_error", 503), "server"); assert.strictEqual(cls("llm_error", 408), "server");
assert.strictEqual(cls("llm_error", 400), "client"); assert.strictEqual(cls("llm_error", 413), "client"); assert.strictEqual(cls("llm_unparseable", 200), "soft");
// pacing: at 06:00 a $4 budget allows 4 x 6/24 + 10% = $1.40
{ const six = Date.UTC(2026, 9, 25, 6); assert.ok(Math.abs(P.allowedSpend(4, six) - 1.4) < 1e-9);
  assert.deepStrictEqual(P.admitSpend(1.0, 0.001, 4, six), { ok: true });
  const r = P.admitSpend(1.4, 0.01, 4, six); assert.strictEqual(r.ok, false); assert.ok(!r.daily && r.untilMs > six);
  assert.ok(P.admitSpend(1.4, 0.01, 4, r.untilMs).ok, "allowed once the pacer catches up");
  assert.strictEqual(P.admitSpend(3.999, 0.01, 4, Date.UTC(2026, 9, 25, 23, 59)).why, "budget_cap");
  assert.strictEqual(P.admitSpend(0, 0.0001, 0, six).why, "budget_off"); }
// reasoning tokens count as output; a separate count is added (never understated)
assert.strictEqual(P.outTokens({ completion_tokens: 100 }), 100);
assert.strictEqual(P.outTokens({ completion_tokens: 100, reasoning_tokens: 300 }), 400);
assert.strictEqual(P.outTokens({ completion_tokens: 100, completion_tokens_details: { reasoning_tokens: 80 } }), 180);
assert.ok(Math.abs(P.costUsd(P.PRICES["openai/gpt-oss-20b"], 1800, 200) - 0.000195) < 1e-12);
assert.deepStrictEqual(parseLimits("rpm=5, tpd=9", P.MISTRAL_DEFAULT_LIMITS), { ...P.MISTRAL_DEFAULT_LIMITS, rpm: 5, tpd: 9 });
console.log("policy ok");

// ---- a catalog like production: Workers AI, 3 Groq free models, Mistral, paid, Pro ----
const KEYS = { LLM_API_KEY: "gsk_free_SECRET_1234", MISTRAL_API_KEY: "mis_SECRET_5678", PAID_LLM_API_KEY: "gsk_paid_SECRET_9999" };
const fullEnv = { AI: { run: async () => ({}) }, ...KEYS, ROUTER_DAILY_BUDGET_USD: "4", PRO_LLM_DAILY_BUDGET_USD: "1" };
const { cfg, keys } = await routerCatalog(fullEnv, ["@cf/mistralai/mistral-small-3.1-24b-instruct", "@cf/meta/llama-3.3-70b-instruct-fp8-fast"]);
assert.deepStrictEqual(cfg.providers.map(p => p.id), ["workers-ai", "groq:openai/gpt-oss-20b", "groq:qwen/qwen3.8-27b", "groq:openai/gpt-oss-120b",
  "mistral:mistral-small-latest", "paid:openai/gpt-oss-20b", "pro:openai/gpt-oss-120b"]);
assert.deepStrictEqual(cfg.providers.filter(p => p.cacheable).map(p => p.id), ["workers-ai", "pro:openai/gpt-oss-120b"]);
assert.deepStrictEqual(cfg.budgets, { paid: 4, pro: 1 }); assert.deepStrictEqual(cfg.credits, { anon: 5, user: 20 });
assert.strictEqual(keys.get("pro:openai/gpt-oss-120b").key, KEYS.PAID_LLM_API_KEY, "Pro reuses the one paid Groq key");
for (const v of Object.values(KEYS)) assert.ok(!JSON.stringify(cfg).includes(v), "no key in what the DO receives");
assert.ok(cfg.providers.filter(p => p.keyTag).every(p => /^[0-9a-f]{8}$/.test(p.keyTag)));
// defaults: budget 0 = no paid provider at all; Pro off; Mistral Labs/Preview refused; one key only
{ const c = (await routerCatalog({ LLM_API_KEY: "k", PAID_LLM_API_KEY: "p" }, [])).cfg;
  assert.deepStrictEqual(c.providers.map(p => p.pool), ["free", "free", "free"]);
  assert.strictEqual((await routerCatalog({ MISTRAL_API_KEY: "m", MISTRAL_MODEL: "labs-mistral-small-creative" }, [])).cfg.providers.length, 0);
  assert.strictEqual((await routerCatalog({ MISTRAL_API_KEY: "m", MISTRAL_MODEL: "mistral-medium-preview" }, [])).cfg.providers.length, 0);
  const odd = (await routerCatalog({ PAID_LLM_API_KEY: "p", ROUTER_DAILY_BUDGET_USD: "2", PAID_LLM_MODEL: "unknown/model" }, [])).cfg;
  assert.strictEqual(odd.providers[0].price, null, "unknown price -> never called"); }
console.log("catalog ok");

const mk = (opts = {}) => { const s = new Scheduler({ now, random: () => 0.5, ...opts }); s.setConfig(cfg); return s; };
const check = (extra = {}) => ({ tier: "free", credit: { kind: "none" }, estIn: 1800, leftMs: 4500, ...extra });
const ok = (g, extra = {}) => ({ ticket: g.grant.ticket, id: g.grant.id, check: g.grant.check, ok: true, code: undefined, status: 200, ms: 700, ...extra });
const fail = (g, code, status, extra = {}) => ({ ticket: g.grant.ticket, id: g.grant.id, check: g.grant.check, ok: false, code, status, ms: 300, ...extra });

// ---- tier order: free (Workers AI, then Groq, then Mistral) -> paid -> keyword ----
{ T = NOON; const s = mk();
  let g = await s.acquire({ check: check() }); assert.strictEqual(g.grant.id, "workers-ai");
  s.report(fail(g, "llm_daily_limit", 0, { resetsInSec: 3600 }));
  g = await s.acquire({ check: check() }); assert.ok(g.grant.id.startsWith("groq:"), g.grant.id);
  for (const id of ["groq:openai/gpt-oss-20b", "groq:qwen/qwen3.8-27b", "groq:openai/gpt-oss-120b"]) s.report({ id, ok: false, code: "llm_daily_limit", status: 429, resetsInSec: 7200 });
  g = await s.acquire({ check: check() }); assert.strictEqual(g.grant.id, "mistral:mistral-small-latest");
  s.report({ id: "mistral:mistral-small-latest", ok: false, code: "llm_daily_limit", status: 429 });
  g = await s.acquire({ check: check() }); assert.strictEqual(g.grant.id, "paid:openai/gpt-oss-20b", "paid only after every free provider");
  assert.ok(g.trace.filter(t => t.pool === "free").length === 5, "every free provider was blocked");
  s.report({ id: "paid:openai/gpt-oss-20b", ok: false, code: "llm_daily_limit", status: 429 });
  g = await s.acquire({ check: check() }); assert.strictEqual(g.deny, "daily"); assert.ok(g.resetsInSec >= 3600 && g.resetsInSec <= 3601, g.resetsInSec);
  assert.strictEqual(s.status().fallbacks.daily, 1);
  // a provider excluded for this check (it just failed) is skipped; the next one is used, never the same twice
  T = NOON + 2 * H; const s2 = mk(); g = await s2.acquire({ check: check({ exclude: ["workers-ai"] }) }); assert.ok(g.grant.id.startsWith("groq:")); }
console.log("tier order ok");

// ---- headroom inside the Groq group: the fuller model fades out ----
{ T = NOON; const s = mk(); s.report({ id: "workers-ai", ok: false, code: "llm_daily_limit", status: 0 });
  const a = s.prov.get("groq:openai/gpt-oss-20b"); a.tpd = 190000;   // 5% of the day left -> ramp 0.325
  const g = await s.acquire({ check: check() }); assert.notStrictEqual(g.grant.id, "groq:openai/gpt-oss-20b");
  assert.ok(s.headroom(s.provider("groq:openai/gpt-oss-20b"), a, T) < 0.4);
  // penalty: a recent 429 lowers the score of an otherwise equal peer
  const s3 = mk(); s3.report({ id: "workers-ai", ok: false, code: "llm_daily_limit", status: 0 });
  s3.prov.get("groq:qwen/qwen3.8-27b").penalty = 10; s3.prov.get("groq:qwen/qwen3.8-27b").penaltyAt = T;
  s3.prov.get("groq:openai/gpt-oss-20b").penalty = 10; s3.prov.get("groq:openai/gpt-oss-20b").penaltyAt = T;
  assert.strictEqual((await s3.acquire({ check: check() })).grant.id, "groq:openai/gpt-oss-120b"); }
console.log("headroom ok");

// ---- admission: per-minute and per-day reserves are never crossed (pre-increment) ----
{ T = NOON; const s = mk(); s.report({ id: "workers-ai", ok: false, code: "llm_daily_limit", status: 0 });
  const id = "groq:openai/gpt-oss-20b", p = s.provider(id), st = s.prov.get(id);
  assert.ok(s.admit(p, st, check(), T).ok);
  st.tpmW.push([T - 1000, 7200 - 2400 + 1]);   // 2,400 more (1,800 in + 600 max out) would cross 90% of 8,000
  const a = s.admit(p, st, check(), T); assert.strictEqual(a.ok, false); assert.strictEqual(a.why, "tpm"); assert.strictEqual(a.until, T - 1000 + 60000);
  st.tpmW = []; st.rpmT = Array.from({ length: 27 }, (_, i) => T - 59000 + i);   // 27 = 30 - 10% reserve
  assert.strictEqual(s.admit(p, st, check(), T).why, "rpm");
  st.rpmT = []; st.rpd = 980; assert.strictEqual(s.admit(p, st, check(), T).why, "rpd");   // 1000 - 2%
  st.rpd = 0; st.tpd = 196000 - 2399; assert.strictEqual(s.admit(p, st, check(), T).why, "tpd");
  // Workers AI neurons: 10,000 a day minus 2%
  const w = s.prov.get("workers-ai"); w.coolUntil = 0; w.neu = 9800 - 10;
  assert.strictEqual(s.admit(s.provider("workers-ai"), w, check(), T).why, "neurons"); }
console.log("admission ok");

// ---- cooldown ladder, Retry-After floor, daily, auth until the key changes, breaker ----
{ T = NOON; const s = mk(); const id = "workers-ai", st = s.prov.get(id);
  let g = await s.acquire({ check: check() }); s.report(fail(g, "llm_rate_limited", 429));
  assert.strictEqual(st.coolUntil - T, 90000, "transient 429: 90 s");
  T += 91000; g = await s.acquire({ check: check() }); assert.strictEqual(g.grant.id, id); s.report(fail(g, "llm_rate_limited", 429));
  assert.strictEqual(st.coolUntil - T, 120000, "second 429 within the hour: 2 min");
  T += 121000; g = await s.acquire({ check: check() }); s.report(fail(g, "llm_rate_limited", 429));
  assert.strictEqual(st.coolUntil - T, 600000, "then 10 min");
  T += 601000; g = await s.acquire({ check: check() }); s.report(ok(g));
  assert.strictEqual(st.ladder, 0); assert.strictEqual(st.hits.length, 0, "a success clears the ladder");
  g = await s.acquire({ check: check() }); s.report(fail(g, "llm_rate_limited", 429, { retryAfterSec: 300 }));
  assert.strictEqual(st.coolUntil - T, 300000, "Retry-After is a floor"); assert.ok(st.authoritative);
  const s2 = mk(); g = await s2.acquire({ check: check() }); s2.report(fail(g, "llm_rate_limited", 429, { retryAfterSec: 999999 }));
  assert.strictEqual(s2.prov.get(id).coolUntil - T, 86400000, "capped at 24 h");
  const s3 = mk(); g = await s3.acquire({ check: check() }); s3.report(fail(g, "wai_capacity", 0));
  assert.strictEqual(s3.prov.get(id).coolUntil - T, 20000, "Workers AI 3040: 20 s");
  // daily: until the reset, marked EXHAUST; the day roll clears a heuristic one
  const s4 = mk(); g = await s4.acquire({ check: check() }); s4.report(fail(g, "llm_daily_limit", 0));
  assert.strictEqual(s4.prov.get(id).coolUntil, Date.UTC(2026, 9, 26)); assert.strictEqual(s4.status().providers[0].state, "EXHAUST");
  // auth: off until the key or model changes (one-api)
  const s5 = mk(), gid = "groq:openai/gpt-oss-20b"; s5.report({ id: gid, ok: false, code: "llm_auth", status: 401 });
  assert.ok(s5.prov.get(gid).disabled); assert.strictEqual(s5.admit(s5.provider(gid), s5.prov.get(gid), check(), T + 7 * 86400000).why, "auth");
  s5.setConfig(cfg); assert.ok(s5.prov.get(gid).disabled, "same key: still off");
  s5.setConfig({ ...cfg, providers: cfg.providers.map(p => (p.id === gid ? { ...p, keyTag: "deadbeef" } : p)) });
  assert.strictEqual(s5.prov.get(gid).disabled, null, "a new key re-enables it");
  // 402: a day; 404: an hour; 400: no cooldown at all (LiteLLM)
  const s6 = mk(); s6.report({ id: gid, ok: false, code: "llm_payment", status: 402 }); assert.strictEqual(s6.prov.get(gid).coolUntil - T, 86400000);
  s6.report({ id: "groq:qwen/qwen3.8-27b", ok: false, code: "llm_model_gone", status: 404 }); assert.strictEqual(s6.prov.get("groq:qwen/qwen3.8-27b").coolUntil - T, 3600000);
  s6.report({ id: "groq:openai/gpt-oss-120b", ok: false, code: "llm_error", status: 400 }); assert.strictEqual(s6.prov.get("groq:openai/gpt-oss-120b").coolUntil, 0);
  // breaker: 2 timeouts stay closed, the 3rd opens it for 15 s x 1.1 jitter; the next trip doubles
  const s7 = mk(), b = s7.prov.get(gid);
  for (let i = 0; i < 2; i++) s7.report({ id: gid, ok: false, code: "llm_timeout", status: 0, ms: 2000 });
  assert.strictEqual(b.coolUntil, 0);
  s7.report({ id: gid, ok: false, code: "llm_timeout", status: 0, ms: 2000 }); assert.strictEqual(b.coolUntil - T, 16500);
  for (let i = 0; i < 3; i++) s7.report({ id: gid, ok: false, code: "llm_error", status: 503 }); assert.strictEqual(b.coolUntil - T, 33000);
  s7.report({ id: gid, ok: true, status: 200, ms: 400 }); assert.strictEqual(b.trips, 0, "a successful probe closes it");
  // health: success EWMA under 0.7 skips the provider for 60 s, then lets a probe through
  const s8 = mk(), h = s8.prov.get(gid); h.n = 10; h.okE = 0.5; h.lastAt = T;
  assert.strictEqual(s8.admit(s8.provider(gid), h, check(), T).why, "unhealthy"); assert.ok(s8.admit(s8.provider(gid), h, check(), T + 60001).ok);
  h.okE = 1; h.latE = 3000; assert.strictEqual(s8.admit(s8.provider(gid), h, check(), T).why, "slow"); }
console.log("cooldowns ok");

// ---- learned limits: from Groq headers and error text, only ever lower ----
{ T = NOON; const s = mk(), id = "groq:openai/gpt-oss-20b", st = s.prov.get(id);
  s.report({ id, ok: true, status: 200, groq: { rpdLimit: 500, tpmLimit: 6000, rpdLeft: 450, tpmLeft: 1000 } });
  assert.deepStrictEqual(st.learned, { rpd: 500, tpm: 6000 }); assert.strictEqual(st.rpd, 50, "Groq's remaining count raises ours");
  assert.strictEqual(st.tpmW.reduce((a, w) => a + w[1], 0), 5000);
  s.report({ id, ok: true, status: 200, groq: { rpdLimit: 14400, tpmLimit: 30000 } });
  assert.deepStrictEqual(st.learned, { rpd: 500, tpm: 6000 }, "a higher number never raises a limit");
  s.report({ id, ok: false, code: "llm_rate_limited", status: 429, learn: [{ dim: "tpm", limit: 5000 }] });
  assert.strictEqual(s.limits(s.provider(id), st).tpm, 5000);
  s.report({ id, ok: false, code: "llm_rate_limited", status: 429, learn: [{ dim: "tpm", limit: 7000 }] });
  assert.strictEqual(s.limits(s.provider(id), st).tpm, 5000);
  // Mistral: headers are not trusted (names unverified), only explicit error text
  const m = "mistral:mistral-small-latest"; s.report({ id: m, ok: true, status: 200, groq: { rpdLimit: 1 } });
  assert.deepStrictEqual(s.prov.get(m).learned, {}); }
console.log("learned limits ok");

// ---- usage reconciles the worst-case reservation ----
{ T = NOON; const s = mk(); s.report({ id: "workers-ai", ok: false, code: "llm_daily_limit", status: 0 });
  const g = await s.acquire({ check: check() }), st = s.prov.get(g.grant.id);
  assert.strictEqual(st.tpd, 1800 + 600, "reserved prompt + max_tokens");
  s.report(ok(g, { usage: { in: 1700, out: 150 } })); assert.strictEqual(st.tpd, 1850); assert.strictEqual(st.tpmW[0][1], 1850); }
console.log("usage reconcile ok");

// ---- budget: pacing across the day, hard cap, ledger written on every paid call ----
{ T = Date.UTC(2026, 9, 25, 0, 30); let ledger = 0;
  const only = { ...cfg, providers: cfg.providers.filter(p => p.pool === "paid") };
  const s = new Scheduler({ now, onLedger: () => ledger++ }); s.setConfig({ ...only, budgets: { paid: 0.01, pro: 0 } });
  let grants = 0, g;
  while ((g = await s.acquire({ check: check() })).grant) { grants++; s.report(ok(g)); }   // no usage: the reservation stands
  const est = P.costUsd(P.PRICES["openai/gpt-oss-20b"], 1800, 600);
  assert.strictEqual(g.deny, "busy", "paced, not used up"); assert.strictEqual(ledger, grants);
  assert.ok(s.spend.paid.spent <= 0.01 * (0.5 / 24) + 0.001 + 1e-12, "within the paced share + 10% burst");
  assert.strictEqual(grants, Math.floor((0.01 * (0.5 / 24) + 0.001) / est));
  T = Date.UTC(2026, 9, 25, 23, 59);
  while ((g = await s.acquire({ check: check() })).grant) s.report(ok(g));
  assert.strictEqual(g.deny, "daily"); assert.ok(s.spend.paid.spent <= 0.01 + 1e-12, "never above the cap");
  // actual usage refunds the unused part of the reservation; an error reply is not billed
  const s2 = new Scheduler({ now }); s2.setConfig({ ...only, budgets: { paid: 4, pro: 0 } });
  g = await s2.acquire({ check: check() }); s2.report(ok(g, { usage: { in: 1800, out: 200 } }));
  assert.ok(Math.abs(s2.spend.paid.spent - 0.000195) < 1e-12);
  g = await s2.acquire({ check: check() }); s2.report(fail(g, "llm_error", 500));
  assert.ok(Math.abs(s2.spend.paid.spent - 0.000195) < 1e-12);
  // a paid pool with budget 0 is never used
  const s3 = new Scheduler({ now }); s3.setConfig({ ...only, budgets: { paid: 0, pro: 0 } });
  assert.strictEqual((await s3.acquire({ check: check() })).deny, "daily"); }
console.log("budget ok");

// ---- Pro: its own model and budget first, then the free pool ----
{ T = NOON; const s = mk();
  let g = await s.acquire({ check: check({ tier: "pro" }) }); assert.strictEqual(g.grant.id, "pro:openai/gpt-oss-120b");
  s.spend.pro.spent = 1;   // Pro budget used up
  g = await s.acquire({ check: check({ tier: "pro" }) }); assert.strictEqual(g.grant.id, "workers-ai");
  g = await s.acquire({ check: check() }); assert.strictEqual(g.grant.id, "workers-ai", "free users never get the Pro model"); }
console.log("pro ok");

// ---- Portkey: wait for a provider only when the wait fits the time left ----
{ T = NOON; const only = { ...cfg, providers: cfg.providers.filter(p => p.id === "groq:openai/gpt-oss-20b") };
  const s = new Scheduler({ now }); s.setConfig(only); const st = s.prov.get("groq:openai/gpt-oss-20b");
  st.rpmT = Array.from({ length: 27 }, (_, i) => T - 59500 + i);   // the oldest leaves the window in 0.5 s
  let g = await s.acquire({ check: check({ leftMs: 4000 }) }); assert.ok(g.grant); assert.ok(g.grant.waitMs > 400 && g.grant.waitMs <= 1000, g.grant.waitMs);
  st.rpmT = Array.from({ length: 27 }, (_, i) => T - 59500 + i);
  g = await s.acquire({ check: check({ leftMs: 1800 }) }); assert.strictEqual(g.deny, "busy", "no time to wait and still run"); }
console.log("wait-if-it-fits ok");

// ---- RS96 credits: spend, refund, cap, reset at 00:00 UTC, salted daily hash ----
{ T = NOON; const s = mk(), anon = { kind: "anon", id: "203.0.113.7" };
  for (let i = 1; i <= 5; i++) { const g = await s.acquire({ check: check({ credit: anon }) }); assert.deepStrictEqual(g.credits, { left: 5 - i, cap: 5 }); s.report(ok(g)); }
  let g = await s.acquire({ check: check({ credit: anon }) });
  assert.strictEqual(g.deny, "credits"); assert.deepStrictEqual(g.credits, { left: 0, cap: 5 }); assert.strictEqual(g.resetsInSec, 12 * 3600);
  // a retry inside the same check never charges again; a check where everything failed hands the credit back
  const other = { kind: "anon", id: "198.51.100.2" };
  g = await s.acquire({ check: check({ credit: other }) }); assert.deepStrictEqual(g.credits, { left: 4, cap: 5 });
  s.report(fail(g, "llm_timeout", 0));
  const g2 = await s.acquire({ check: check({ parent: g.grant.check, exclude: [g.grant.id] }) }); assert.deepStrictEqual(g2.credits, { left: 4, cap: 5 });
  s.report({ ...fail(g2, "llm_timeout", 0), refund: false }); s.report({ refund: true, check: g.grant.check });
  assert.strictEqual([...s.credits.values()].reduce((a, b) => a + b, 0), 5, "refunded");
  s.report({ refund: true, check: g.grant.check }); assert.strictEqual([...s.credits.values()].reduce((a, b) => a + b, 0), 5, "a refund is applied once");
  // signed-in users are keyed by uid with their own cap; the same string as an IP is a different id
  const user = { kind: "user", id: "203.0.113.7" };
  g = await s.acquire({ check: check({ credit: user }) }); assert.deepStrictEqual(g.credits, { left: 19, cap: 20 });
  // only hashes are stored: 16 hex, no IP, no uid
  const blob = s.creditsBlob(); assert.ok(!blob.includes("203.0.113") && !blob.includes("198.51.100"));
  assert.ok([...s.credits.keys()].every(k => /^[0-9a-f]{16}$/.test(k)));
  const h1 = await s.idHash("anon", "203.0.113.7");
  // 00:00 UTC: counts and salt are gone; the same IP hashes differently
  T = Date.UTC(2026, 9, 26, 0, 0, 1); g = await s.acquire({ check: check({ credit: anon }) }); assert.deepStrictEqual(g.credits, { left: 4, cap: 5 });
  assert.notStrictEqual(await s.idHash("anon", "203.0.113.7"), h1); assert.strictEqual(s.credits.size, 1);
  // credits are counted only when an AI check runs: a denied check costs nothing
  const s2 = mk(); s2.cfg.providers.forEach(p => { s2.prov.get(p.id).coolUntil = T + 1e9; s2.prov.get(p.id).coolDaily = true; });
  g = await s2.acquire({ check: check({ credit: anon }) }); assert.strictEqual(g.deny, "daily"); assert.deepStrictEqual(g.credits, { left: 5, cap: 5 });
  // the id table is bounded: past it a new id gets keyword results (fail closed on spend)
  const s3 = mk(); for (let i = 0; i < P.MAX_CREDIT_IDS; i++) s3.credits.set("x" + i, 1);
  assert.strictEqual((await s3.acquire({ check: check({ credit: anon }) })).deny, "credits_full"); }
console.log("credits ok");

// ---- owner status: counts and states, never a key, key tag, salt or hash ----
{ T = NOON; const s = mk(); const g = await s.acquire({ check: check({ credit: { kind: "anon", id: "203.0.113.9" } }) }); s.report(ok(g));
  const st = s.status(), text = asciiStatus(st), all = JSON.stringify(st) + text;
  assert.strictEqual(st.providers.length, 7); assert.strictEqual(st.providers[0].state, "OK"); assert.strictEqual(st.credits.ids, 1);
  for (const p of cfg.providers) if (p.keyTag) assert.ok(!all.includes(p.keyTag), "no key tag");
  assert.ok(!all.includes(s.salt)); for (const k of s.credits.keys()) assert.ok(!all.includes(k), "no hash");
  for (const v of Object.values(KEYS)) assert.ok(!all.includes(v));
  assert.match(text, /REPLORE ROUTER/); assert.match(text, /workers-ai/); assert.match(text, /BUDGET paid/); assert.match(text, /FALLBACKS/); }
console.log("status ok");

// ---- storage plan: rows and alarms, eviction keeps the ledger and credits ----
function fakeStorage() {
  const kv = new Map(); const st = { kv, rows: 0, alarms: 0, alarm: null,
    sql: { exec(q, ...b) {
      if (/^INSERT/.test(q)) { kv.set(b[0], b[1]); st.rows++; return { toArray: () => [] }; }
      if (/^SELECT/.test(q)) return { toArray: () => [...kv].map(([k, v]) => ({ k, v })) };
      return { toArray: () => [] }; } },
    async setAlarm(t) { st.alarm = t; st.alarms++; }, async getAlarm() { return st.alarm; } };
  return st;
}
{ T = NOON; const store = fakeStorage(), svc = new RouterService(store, { now }); await svc.init();
  const pcfg = { ...cfg, providers: cfg.providers.filter(p => p.pool === "paid") };
  const g = await svc.acquire({ cfg: pcfg, check: check({ credit: { kind: "anon", id: "203.0.113.1" } }) });
  assert.ok(g.grant); assert.ok(store.kv.has("ledger"), "ledger written before the paid call"); assert.strictEqual(store.alarms, 1);
  await svc.acquire({ cfg: pcfg, reports: [ok(g)] }); assert.strictEqual(store.alarms, 1, "one pending alarm, not one per call");
  T += FLUSH_MS; await svc.alarm(); assert.ok(store.kv.has("state") && store.kv.has("credits"));
  // eviction: a new object restores spend and credits from the rows
  const svc2 = new RouterService(store, { now }); await svc2.init();
  assert.ok(Math.abs(svc2.sched.spend.paid.spent - svc.sched.spend.paid.spent) < 1e-12); assert.strictEqual(svc2.sched.credits.size, 1);
  assert.strictEqual(svc2.sched.salt, svc.sched.salt, "same day, same salt: the visitor's count survives");
  assert.ok(svc.sched.usage.requests >= 3 && svc.sched.usage.rows >= 4);
  const s = svc.status(); assert.ok(s.status && typeof s.text === "string"); }
console.log("storage ok");

// ---- client: 250 ms deadline, breaker after 3 failures, reports queue ----
{ let calls = 0; const hang = { idFromName: () => "x", get: () => ({ acquire: () => { calls++; return new Promise(() => {}); } }) };
  let t = 0; const c = new RouterClient({ now: () => t, random: () => 0, timeoutMs: 20 });
  for (let i = 0; i < 3; i++) assert.strictEqual(await c.call({ ROUTER: hang }, "acquire", {}), null);
  assert.strictEqual(calls, 3); assert.strictEqual(await c.call({ ROUTER: hang }, "acquire", {}), null); assert.strictEqual(calls, 3, "skipped while open");
  t = 30001; const up = { idFromName: () => "x", get: () => ({ acquire: async () => ({ ok: 1 }) }) };
  assert.deepStrictEqual(await c.call({ ROUTER: up }, "acquire", {}), { ok: 1 }); assert.strictEqual(c.takeDoFails(), 4);
  for (let i = 0; i < 60; i++) c.queue({ i }); assert.strictEqual(c.drain().length, 50, "bounded queue"); }
console.log("client ok");
