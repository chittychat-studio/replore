// SPEC RS95/RS96: the Pages Function's side of the router. Builds the provider list from the Pages environment (keys stay
// here; the Durable Object gets only an 8-hex tag of each key so a changed key re-enables a provider), and talks to the DO
// with a 250 ms deadline and a circuit breaker (3 failures in a row -> skip the DO for 30 s plus jitter).
import * as P from "./policy.js";

export const DO_TIMEOUT_MS = 250, DO_FAILS = 3, DO_SKIP_MS = 30000, MAX_PENDING = 50, REPORT_FLUSH_MS = 30000;
export const GROQ_BASE = "https://api.groq.com/openai/v1", MISTRAL_BASE = "https://api.mistral.ai/v1";
export const isGroq = base => /^https:\/\/api\.groq\.com\//.test(String(base || ""));
// gpt-oss and Qwen3 reason before answering, and the reasoning shares the completion budget (RS34e)
export const reasoningModel = m => /(^|\/)gpt-oss|(^|\/)qwen3/i.test(String(m || ""));
export const maxOutFor = m => (reasoningModel(m) ? 600 : 120);

const TAGS = new Map();
async function keyTag(key) {   // first 8 hex of SHA-256: enough to notice a changed key, useless for recovering it
  if (TAGS.has(key)) return TAGS.get(key);
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("replore-router|" + key));
  const t = [...new Uint8Array(d)].slice(0, 4).map(b => b.toString(16).padStart(2, "0")).join("");
  if (TAGS.size > 50) TAGS.clear();
  TAGS.set(key, t); return t;
}
const usd = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.min(n, 1000) : 0; };
const int = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) && n >= 0 ? Math.min(n, 10000) : d; };
const list = (v, d) => (v ? String(v).split(",").map(s => s.trim()).filter(Boolean) : d);
export function parseLimits(s, d) {
  const o = { ...d };
  for (const part of String(s || "").split(",")) {
    const m = part.trim().match(/^(rpm|rpd|tpm|tpd)\s*=\s*(\d+)$/i); if (m) o[m[1].toLowerCase()] = Number(m[2]);
  }
  return o;
}
function priceFor(model, env, prefix) {
  const i = Number(env[prefix + "_PRICE_IN"]), o = Number(env[prefix + "_PRICE_OUT"]);
  if (i > 0 && o > 0) return [i, o];
  return P.PRICES[model] || null;   // unknown price -> the scheduler never calls it (fail closed on spend)
}

// -> {cfg (sent to the DO, no keys), keys: Map(id -> {key, base, model})}
export async function routerCatalog(env, waiModels) {
  const providers = [], keys = new Map();
  if (env.AI && typeof env.AI.run === "function") {
    const rates = waiModels.map(m => P.WAI_RATES[m] || P.WAI_DEFAULT_RATE);
    providers.push({ id: "workers-ai", kind: "workers-ai", pool: "free", group: P.GROUP["workers-ai"], model: waiModels.join(","),
      limits: { neurons: int(env.ROUTER_WAI_NEURONS, P.WAI_DAILY_NEURONS) }, rate: [Math.max(...rates.map(r => r[0])), Math.max(...rates.map(r => r[1]))],
      maxOut: 120, cacheable: true });
  }
  if (env.LLM_API_KEY) {
    const base = String(env.LLM_BASE_URL || GROQ_BASE).replace(/\/+$/, ""), groq = isGroq(base), tag = await keyTag(env.LLM_API_KEY);
    const models = groq ? list(env.GROQ_FREE_MODELS, P.GROQ_FREE_MODELS) : [env.LLM_MODEL || "openai/gpt-oss-20b"];
    for (const m of models) {
      const id = (groq ? "groq:" : "llm:") + m;
      providers.push({ id, kind: groq ? "groq" : "openai", pool: "free", group: P.GROUP.groq, model: m, base,
        limits: groq ? { ...P.GROQ_FREE_LIMITS } : { rpm: 10, rpd: 500, tpm: 20000, tpd: 200000 }, maxOut: maxOutFor(m), keyTag: tag });
      keys.set(id, { key: env.LLM_API_KEY, base, model: m });
    }
  }
  const mModel = env.MISTRAL_MODEL || P.MISTRAL_DEFAULT_MODEL;
  if (env.MISTRAL_API_KEY && !P.MISTRAL_BANNED.test(mModel)) {   // standard models only; training must be off (owner step)
    const id = "mistral:" + mModel;
    providers.push({ id, kind: "mistral", pool: "free", group: P.GROUP.mistral, model: mModel, base: MISTRAL_BASE,
      limits: parseLimits(env.MISTRAL_LIMITS, P.MISTRAL_DEFAULT_LIMITS), maxOut: maxOutFor(mModel), keyTag: await keyTag(env.MISTRAL_API_KEY) });
    keys.set(id, { key: env.MISTRAL_API_KEY, base: MISTRAL_BASE, model: mModel });
  }
  const budgets = { paid: usd(env.ROUTER_DAILY_BUDGET_USD), pro: usd(env.PRO_LLM_DAILY_BUDGET_USD) };
  if (env.PAID_LLM_API_KEY && budgets.paid > 0) {   // default budget 0 = paid overflow off
    const model = env.PAID_LLM_MODEL || "openai/gpt-oss-20b", base = String(env.PAID_LLM_BASE_URL || GROQ_BASE).replace(/\/+$/, ""), id = "paid:" + model;
    providers.push({ id, kind: isGroq(base) ? "groq" : "openai", pool: "paid", group: P.GROUP.paid, model, base, limits: { ...P.GROQ_PAID_LIMITS },
      price: priceFor(model, env, "PAID_LLM"), maxOut: maxOutFor(model), keyTag: await keyTag(env.PAID_LLM_API_KEY) });
    keys.set(id, { key: env.PAID_LLM_API_KEY, base, model });
  }
  const proKey = env.PRO_LLM_API_KEY || env.PAID_LLM_API_KEY;   // one Groq account: the paid key serves Pro unless a Pro key is set
  if (proKey && budgets.pro > 0) {
    const model = env.PRO_LLM_MODEL || "openai/gpt-oss-120b", base = String(env.PRO_LLM_BASE_URL || GROQ_BASE).replace(/\/+$/, ""), id = "pro:" + model;
    providers.push({ id, kind: isGroq(base) ? "groq" : "openai", pool: "pro", group: P.GROUP.pro, model, base, limits: { ...P.GROQ_PAID_LIMITS },
      price: priceFor(model, env, "PRO_LLM"), maxOut: maxOutFor(model), cacheable: true, keyTag: await keyTag(proKey) });
    keys.set(id, { key: proKey, base, model });
  }
  const credits = { anon: int(env.ROUTER_CREDITS_ANON, P.CREDITS_ANON), user: int(env.ROUTER_CREDITS_SIGNED_IN, P.CREDITS_SIGNED_IN) };
  return { cfg: { providers, budgets, credits }, keys };
}

// Per-isolate transport to the DO: deadline, breaker, and a small queue of outcome reports that ride on the next call.
export class RouterClient {
  constructor({ now = Date.now, random = Math.random, timeoutMs = DO_TIMEOUT_MS } = {}) {
    this.now = now; this.random = random; this.timeoutMs = timeoutMs;
    this.fails = 0; this.skipUntil = 0; this.pending = []; this.pendingSince = 0; this.doFails = 0;
  }
  reset() { this.fails = 0; this.skipUntil = 0; this.pending = []; this.pendingSince = 0; this.doFails = 0; }
  available() { return this.now() >= this.skipUntil; }
  async call(env, method, arg, ms = this.timeoutMs) {
    if (!this.available()) { this.doFails++; return null; }
    let timer;
    try {
      const out = await Promise.race([
        Promise.resolve().then(() => { const ns = env.ROUTER; return ns.get(ns.idFromName("global"))[method](arg); }),
        new Promise((_, rej) => { timer = setTimeout(() => rej(new Error("do_timeout")), ms); }),
      ]);
      this.fails = 0;
      return out || {};
    } catch {
      this.fails++; this.doFails++;
      if (this.fails >= DO_FAILS) { this.skipUntil = this.now() + Math.round(DO_SKIP_MS * (1 + 0.2 * this.random())); this.fails = 0; }
      return null;
    } finally { clearTimeout(timer); }
  }
  queue(r) {
    if (!this.pending.length) this.pendingSince = this.now();
    this.pending.push(r); if (this.pending.length > MAX_PENDING) this.pending.shift();
  }
  drain() { const p = this.pending; this.pending = []; this.pendingSince = 0; return p; }
  requeue(list) { for (const r of list) this.queue(r); }
  takeDoFails() { const n = this.doFails; this.doFails = 0; return n; }
  stale() { return this.pending.length > 0 && this.now() - this.pendingSince >= REPORT_FLUSH_MS; }
}
