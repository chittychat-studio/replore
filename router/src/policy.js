// SPEC RS95: pure routing policy for the quota-aware LLM router. No Cloudflare APIs, no keys, no network, so the Pages
// Function, the Durable Object, the unit tests and the offline simulation all share one copy.
// Ported formulas (credited in NOTICE.md): freellmapi (MIT) headroom ramp, 429 penalty, cooldown ladder, Retry-After floor,
// limit learning that never raises a limit; LiteLLM (MIT) which errors cool a provider and pre-increment admission;
// Portkey gateway 1.x (MIT) "wait only if it fits the time budget"; one-api (MIT) permanently-bad-key signals.

export const MINUTE = 60000, HOUR = 3600000, DAY = 86400000;

// ---- time ----
export const utcDay = now => new Date(now).toISOString().slice(0, 10);
export function msToUtcMidnight(now) {
  const d = new Date(now); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - now;
}

// ---- providers ----
// Groq free plan, per model (owner check 2026-10-24): 30 RPM, 1K RPD, 8K TPM, 200K TPD.
export const GROQ_FREE_LIMITS = { rpm: 30, rpd: 1000, tpm: 8000, tpd: 200000 };
export const GROQ_FREE_MODELS = ["openai/gpt-oss-20b", "qwen/qwen3.8-27b", "openai/gpt-oss-120b"];
export const GROQ_PAID_LIMITS = { rpm: 1000, tpm: 250000 };     // paid tier ceiling from the report (2026-10-24)
export const WAI_DAILY_NEURONS = 10000;                           // Workers AI free allocation, resets 00:00 UTC
// Neurons per million tokens (input, output), Workers AI pricing page as of 2026-10-24.
export const WAI_RATES = {
  "@cf/mistralai/mistral-small-3.1-24b-instruct": [31876, 50488],
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast": [26668, 204805],
};
export const WAI_DEFAULT_RATE = [31876, 204805];                  // unknown model: the worst of the two, per side
// USD per million tokens (input, output). Reasoning tokens are billed as output.
export const PRICES = { "openai/gpt-oss-20b": [0.075, 0.30], "openai/gpt-oss-120b": [0.15, 0.60] };
export const MISTRAL_DEFAULT_MODEL = "mistral-small-latest";
export const MISTRAL_DEFAULT_LIMITS = { rpm: 2, rpd: 2000, tpm: 50000, tpd: 1000000 };   // unverified placeholders; only ever learned lower
export const MISTRAL_BANNED = /labs|preview|beta|experimental/i;    // RS95: standard models only (Labs/Preview always train)
export const GROUP = { pro: 0, "workers-ai": 1, groq: 2, openai: 2, mistral: 3, paid: 4 };

// ---- tuning ----
export const RESERVE_MINUTE = 0.10, RESERVE_DAY = 0.02;           // safety reserves (report: 5-10% per-minute, ~2% daily)
export const RAMP_START = 0.2, RAMP_FLOOR = 0.1;                  // freellmapi HEADROOM_RAMP_START / floor
export const PENALTY_429 = 3, PENALTY_FAIL = 1, PENALTY_MAX = 10, PENALTY_DECAY_MS = 2 * MINUTE;
export const TRANSIENT_COOL_MS = 90000, WAI_CAPACITY_COOL_MS = 20000;
export const LADDER_MS = [2 * MINUTE, 10 * MINUTE, HOUR, DAY];    // freellmapi COOLDOWN_DURATIONS
export const MAX_COOL_MS = DAY;
export const BREAKER_CONSEC = 3, BREAKER_WINDOW = 20, BREAKER_IN_WINDOW = 5, BREAKER_BASE_MS = 15000, BREAKER_MAX_MS = 300000;
export const EWMA_ALPHA = 0.25, SLOW_MS = 2700, MIN_SUCCESS = 0.7, PROBE_AFTER_MS = 60000;
export const MIN_RUN_MS = 1500, MAX_WAIT_MS = 2000, MAX_ATTEMPTS = 3;
export const PACER_BURST = 0.10;
export const CREDITS_ANON = 5, CREDITS_SIGNED_IN = 20, MAX_CREDIT_IDS = 50000;

// freellmapi scoring.ts headroomRamp: 1 while >= 20% is left, then linear down to 0.1 at 0%.
export function headroomRamp(frac) {
  if (!(frac > 0)) return RAMP_FLOOR;
  if (frac >= RAMP_START) return 1;
  return RAMP_FLOOR + (1 - RAMP_FLOOR) * (frac / RAMP_START);
}
// freellmapi scoring.ts rateLimitFactor: a max-penalty provider keeps 40% of its score, never excluded by this alone.
export const rateLimitFactor = penalty => 1 - (Math.min(PENALTY_MAX, Math.max(0, penalty)) / PENALTY_MAX) * 0.6;
// freellmapi router.ts getPenalty: lazy decay of 1 point every 2 minutes since the last change.
export function decayedPenalty(p, at, now) {
  if (!p) return 0;
  return Math.max(0, p - Math.floor(Math.max(0, now - at) / PENALTY_DECAY_MS));
}

// ---- budget pacing (linear; report "Budget pacing") ----
export function allowedSpend(budget, now) {
  const elapsed = DAY - msToUtcMidnight(now);
  return budget * (elapsed / DAY) + budget * PACER_BURST;
}
// -> {ok} or {ok:false, daily:true} (hard cap) or {ok:false, untilMs} (pacing: when the pacer will allow it)
export function admitSpend(spent, est, budget, now) {
  if (!(budget > 0)) return { ok: false, daily: true, why: "budget_off" };
  if (spent + est > budget) return { ok: false, daily: true, why: "budget_cap" };
  const allowed = allowedSpend(budget, now);
  if (spent + est <= allowed) return { ok: true };
  const needMs = ((spent + est - budget * PACER_BURST) / budget) * DAY - (DAY - msToUtcMidnight(now));
  return { ok: false, untilMs: now + Math.max(1000, Math.ceil(needMs)), why: "budget_paced" };
}
export const costUsd = (price, inTok, outTok) => (inTok * price[0] + outTok * price[1]) / 1e6;
export const neurons = (rate, inTok, outTok) => (inTok * rate[0] + outTok * rate[1]) / 1e6;
// Output tokens for billing: completion tokens, plus a separately reported reasoning count (may double count: spend is
// overstated, never understated).
export function outTokens(usage) {
  if (!usage) return null;
  const c = Number(usage.completion_tokens) || 0;
  const r = Number(usage.reasoning_tokens) || Number(usage.completion_tokens_details && usage.completion_tokens_details.reasoning_tokens) || 0;
  return c + r;
}
// Rough, conservative token count for a prompt (about 3 characters per token; English is closer to 4).
export const estTokens = chars => Math.ceil(chars / 3) + 16;

// ---- reading provider signals ----
// Groq reset strings look like "2m59.56s", "7.66s", "1h2m3s", "250ms".
export function parseDuration(s) {
  if (s == null) return null;
  const t = String(s).trim(); if (!t) return null;
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t);
  let sec = 0, any = false;
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)(ms|h|m|s)/g)) {
    any = true; const v = Number(m[1]);
    sec += m[2] === "h" ? v * 3600 : m[2] === "m" ? v * 60 : m[2] === "s" ? v : v / 1000;
  }
  return any ? sec : null;
}
const num = v => { const n = Number(v); return v != null && v !== "" && Number.isFinite(n) && n >= 0 ? n : null; };
// Groq: the request headers track the DAILY limit, the token headers the per-MINUTE limit (Groq rate-limits doc).
export function parseGroqHeaders(get) {
  const h = k => { try { return get(k); } catch { return null; } };
  const o = {
    rpdLimit: num(h("x-ratelimit-limit-requests")), rpdLeft: num(h("x-ratelimit-remaining-requests")),
    tpmLimit: num(h("x-ratelimit-limit-tokens")), tpmLeft: num(h("x-ratelimit-remaining-tokens")),
    rpdResetSec: parseDuration(h("x-ratelimit-reset-requests")), tpmResetSec: parseDuration(h("x-ratelimit-reset-tokens")),
  };
  return Object.values(o).some(v => v != null) ? o : null;
}
// Retry-After as seconds (Portkey order: retry-after-ms, then retry-after in seconds).
export function retryAfterSec(get) {
  const h = k => { try { return get(k); } catch { return null; } };
  const ms = num(h("retry-after-ms")); if (ms != null) return ms / 1000;
  const s = num(h("retry-after")); return s;
}
// freellmapi parseProviderLimit: "tokens per minute (TPM): Limit 8000, Used ..." -> [{dim:"tpm", limit:8000}].
const AXES = [["rpm", /requests per minute[^0-9]{0,40}limit[^0-9]{0,4}(\d+)/i], ["rpd", /requests per day[^0-9]{0,40}limit[^0-9]{0,4}(\d+)/i],
  ["tpm", /tokens per minute[^0-9]{0,40}limit[^0-9]{0,4}(\d+)/i], ["tpd", /tokens per day[^0-9]{0,40}limit[^0-9]{0,4}(\d+)/i]];
export function parseLimitText(text) {
  const t = String(text || "").slice(0, 2000), out = [];
  for (const [dim, re] of AXES) { const m = t.match(re); if (m) out.push({ dim, limit: Number(m[1]) }); }
  return out;
}
// one-api ShouldDisableChannel signals (a key that will not start working by waiting).
export const BAD_KEY = /invalid_api_key|invalid api key|account_deactivated|organization has been restricted|authentication_error|permission_error/i;

// LiteLLM _is_cooldown_required + freellmapi ladder, as one classifier over an attempt outcome.
// outcome: {ok, code, status, retryAfterSec, resetsInSec}. Returns the class the scheduler acts on.
export function classify(o) {
  if (o.ok) return "ok";
  const code = String(o.code || ""), st = o.status | 0;
  if (code === "llm_auth" || code === "wai_error_3023" || code === "wai_error_5035" || st === 401 || st === 403) return "auth";
  if (code === "llm_daily_limit") return "daily";
  if (code === "wai_capacity") return "capacity";   // Workers AI 3040 "out of capacity": short cool, then retry elsewhere
  if (code === "llm_rate_limited" || st === 429) return "transient";
  if (code === "llm_payment" || st === 402) return "payment";
  if (code === "llm_model_gone" || /^wai_error_(5007|5028)$/.test(code) || st === 404) return "gone";
  if (/timeout|unreachable/.test(code) || st === 408 || st >= 500) return "server";
  if (st >= 400 && st < 500) return "client";   // LiteLLM: other 4xx are the request's fault, no cooldown
  return "soft";                                // unparseable or empty reply: counts against health, no cooldown
}
