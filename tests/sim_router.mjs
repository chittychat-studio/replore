// SPEC RS95/RS96: offline simulation of one UTC day at 25,000 checks, with bursts, against fake providers that enforce
// their real free-tier limits. Uses the real RouterService (scheduler + storage plan) over a fake SQLite, so its DO request
// and row counts are the ones the Durable Object would bill. No network. Asserts: no provider limit exceeded, spend never
// above the cap, free used before paid, DO requests and rows written under the free plan.
import assert from "node:assert";
import { RouterService } from "../router/src/service.js";
import { routerCatalog } from "../router/src/client.js";
import * as P from "../router/src/policy.js";

const DAY0 = Date.UTC(2026, 9, 25), CHECKS = 25000, VISITORS = 10000;
let seed = 20261025; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const between = (a, b) => a + rnd() * (b - a);

async function simulate({ budget, proBudget, label }) {
  seed = 20261025;
  let T = DAY0; const now = () => T;
  const kv = new Map(); let alarmAt = null;
  const storage = { sql: { exec(q, ...b) { if (/^INSERT/.test(q)) kv.set(b[0], b[1]); return { toArray: () => [] }; } },
    async setAlarm(t) { alarmAt = t; }, async getAlarm() { return alarmAt; } };
  const svc = new RouterService(storage, { now, random: rnd }); await svc.init();
  const env = { AI: { run() {} }, LLM_API_KEY: "free", MISTRAL_API_KEY: "mis", PAID_LLM_API_KEY: "paid",
    ROUTER_DAILY_BUDGET_USD: String(budget), PRO_LLM_DAILY_BUDGET_USD: String(proBudget) };
  const { cfg } = await routerCatalog(env, ["@cf/mistralai/mistral-small-3.1-24b-instruct"]);
  const byId = Object.fromEntries(cfg.providers.map(p => [p.id, p]));
  const freeIds = cfg.providers.filter(p => p.pool === "free").map(p => p.id);

  // ---- fake providers: exact rolling windows and daily totals on ACTUAL usage ----
  const real = {}; for (const p of cfg.providers) real[p.id] = { reqT: [], tokW: [], rpd: 0, tpd: 0, neu: 0, billed: 0, calls: 0, peakRpm: 0, peakTpm: 0 };
  const LIM = id => byId[id].limits;
  let violations = 0;
  function callProvider(id, t) {
    const p = byId[id], r = real[id], L = LIM(id);
    r.reqT = r.reqT.filter(x => x > t - 60000); r.tokW = r.tokW.filter(w => w[0] > t - 60000);
    const inTok = Math.round(between(1500, 2100)), outTok = p.kind === "workers-ai" || p.kind === "mistral" ? Math.round(between(8, 30)) : Math.round(between(100, 350));
    const ms = Math.round(between(300, 1400));
    if (p.kind === "workers-ai" && t >= DAY0 + 10 * 3600e3 && t < DAY0 + 10 * 3600e3 + 300e3) return { ok: false, code: "wai_capacity", status: 0, ms, inTok };
    if (rnd() < 0.01) return { ok: false, code: "llm_error", status: 503, ms, inTok };   // 1% transient upstream errors
    const tok = inTok + outTok, winTok = r.tokW.reduce((a, w) => a + w[1], 0);
    const over = (L.rpm && r.reqT.length + 1 > L.rpm) || (L.tpm && winTok + tok > L.tpm) || (L.rpd && r.rpd + 1 > L.rpd) || (L.tpd && r.tpd + tok > L.tpd)
      || (L.neurons && r.neu + P.neurons(p.rate, inTok, outTok) > L.neurons);
    if (over) { violations++; return { ok: false, code: "llm_rate_limited", status: 429, ms, inTok }; }
    r.reqT.push(t); r.tokW.push([t, tok]); r.rpd++; r.tpd += tok; r.calls++;
    r.peakRpm = Math.max(r.peakRpm, r.reqT.length); r.peakTpm = Math.max(r.peakTpm, winTok + tok);
    if (p.rate) r.neu += P.neurons(p.rate, inTok, outTok);
    if (p.price) r.billed += P.costUsd(p.price, inTok, outTok);
    const groq = p.kind === "groq" && p.pool === "free" ? { rpdLimit: L.rpd, rpdLeft: L.rpd - r.rpd, tpmLimit: L.tpm, tpmLeft: L.tpm - (winTok + tok) } : undefined;
    return { ok: true, status: 200, ms, inTok, usage: { in: inTok, out: outTok }, groq };
  }

  // ---- traffic: diurnal curve plus three 10-minute bursts at 8x ----
  const arrivals = [];
  const bursts = [10, 14.5, 20].map(h => DAY0 + h * 3600e3);
  while (arrivals.length < CHECKS * 0.85) {   // rejection-sample a curve that peaks at 15:00 UTC
    const t = rnd() * 86400e3, w = 0.35 + 0.65 * Math.max(0, Math.sin(Math.PI * ((t / 3600e3 - 3) / 24)));
    if (rnd() < w) arrivals.push(DAY0 + t);
  }
  while (arrivals.length < CHECKS) { const b = bursts[arrivals.length % 3]; arrivals.push(b + rnd() * 600e3); }
  arrivals.sort((a, b) => a - b);

  const isolates = Array.from({ length: 8 }, () => ({ pending: [], since: 0 }));
  const stats = { served: {}, denied: {}, attempts: 0, paidWhileFreeOpen: 0, checks: 0, doReq: 0 };
  async function fireAlarms(upTo) { while (alarmAt && alarmAt <= upTo) { T = alarmAt; alarmAt = null; await svc.alarm(); } }

  for (let k = 0; k < arrivals.length; k++) {
    await fireAlarms(arrivals[k]);
    T = Math.max(T, arrivals[k]);
    const iso = isolates[k % isolates.length], u = rnd();
    const tier = u < 0.01 ? "pro" : "free";
    const credit = tier === "pro" || u > 0.9 ? { kind: "none" } : { kind: "anon", id: "ip" + Math.floor(VISITORS * rnd() ** 2) };   // heavy head
    let reports = iso.pending; iso.pending = []; let parent = null, left = 4500, exclude = [], done = false;
    stats.checks++;
    for (let a = 0; a < P.MAX_ATTEMPTS && left >= 1000; a++) {
      const res = await svc.acquire({ cfg, reports, check: { tier, credit: parent ? null : credit, parent, exclude, estIn: P.estTokens(1900 * 3.6), leftMs: left } });
      reports = [];
      if (!res.grant) { stats.denied[res.deny] = (stats.denied[res.deny] || 0) + 1; break; }
      const g = res.grant, p = byId[g.id]; parent = parent || g.check; stats.attempts++;
      if (p.pool === "paid") {   // free before paid: every free provider was blocked or already failed in this check
        const blocked = new Set((res.trace || []).map(b => b.id).concat(exclude));
        if (!freeIds.every(id => blocked.has(id))) stats.paidWhileFreeOpen++;
      }
      const t = T + (g.waitMs || 0); left -= g.waitMs || 0;
      const out = callProvider(g.id, t); left -= out.ms;
      const rep = { ticket: g.ticket, id: g.id, check: parent, ok: out.ok, code: out.code, status: out.status, ms: out.ms, usage: out.usage, groq: out.groq };
      if (out.ok) {
        stats.served[p.pool] = (stats.served[p.pool] || 0) + 1;
        if (!iso.pending.length) iso.since = T; iso.pending.push(rep);
        if (T - iso.since >= 30000) { await svc.report(iso.pending); iso.pending = []; }
        done = true; break;
      }
      exclude.push(g.id); reports = [rep];
    }
    if (!done && parent) { reports.push({ refund: true, check: parent }); }
    if (!done && reports.length) await svc.report(reports);
    if (!done) stats.denied.keyword = (stats.denied.keyword || 0) + 1;
  }
  T = DAY0 + 86400e3 - 1000; await fireAlarms(T);
  for (const iso of isolates) if (iso.pending.length) await svc.report(iso.pending);
  T = DAY0 + 86400e3 - 1; await fireAlarms(T);

  const usage = svc.sched.usage, s = svc.sched.status();
  const billed = id => real[id] ? real[id].billed : 0;
  const paidId = cfg.providers.find(p => p.pool === "paid")?.id, proId = cfg.providers.find(p => p.pool === "pro")?.id;
  const out = { label, checks: stats.checks, attempts: stats.attempts, served: stats.served, keywordOnly: stats.denied.keyword || 0, denied: stats.denied,
    paidUsd: +billed(paidId).toFixed(4), proUsd: +billed(proId).toFixed(4), ledgerPaid: s.budgets.paid.spent, ledgerPro: s.budgets.pro.spent,
    doRequests: usage.requests, rowsWritten: usage.rows, violations,
    perProvider: Object.fromEntries(cfg.providers.map(p => [p.id, { calls: real[p.id].calls, rpd: real[p.id].rpd, tpd: real[p.id].tpd, neurons: Math.round(real[p.id].neu),
      peakRpm: real[p.id].peakRpm, peakTpm: real[p.id].peakTpm }])) };

  // ---- the assertions RS95 makes ----
  assert.strictEqual(violations, 0, "the router never sent a call over a provider's limit");
  for (const p of cfg.providers) {
    const r = real[p.id], L = p.limits;
    if (L.rpd) assert.ok(r.rpd <= L.rpd, p.id + " rpd"); if (L.tpd) assert.ok(r.tpd <= L.tpd, p.id + " tpd");
    if (L.rpm) assert.ok(r.peakRpm <= L.rpm, p.id + " rpm"); if (L.tpm) assert.ok(r.peakTpm <= L.tpm, p.id + " tpm");
    if (L.neurons) assert.ok(r.neu <= L.neurons, p.id + " neurons");
  }
  assert.ok(out.paidUsd <= budget + 1e-9, "paid spend never above the cap"); assert.ok(out.proUsd <= proBudget + 1e-9, "Pro spend never above its cap");
  assert.ok(out.ledgerPaid + 1e-9 >= out.paidUsd, "the ledger never under-counts what was billed");
  assert.strictEqual(stats.paidWhileFreeOpen, 0, "paid used only when every free provider was blocked");
  if (!(budget > 0)) assert.ok(!stats.served.paid, "budget 0: paid overflow off");
  assert.ok(out.doRequests < 100000, "DO requests under the free plan: " + out.doRequests);
  assert.ok(out.rowsWritten < 100000, "DO rows written under the free plan: " + out.rowsWritten);
  return out;
}

const t0 = Date.now();
const a = await simulate({ budget: 0, proBudget: 0, label: "defaults (budget 0)" });
const b = await simulate({ budget: 4, proBudget: 1, label: "budget $4 + Pro $1" });
for (const r of [a, b]) {
  const { perProvider, ...head } = r;
  console.log(JSON.stringify(head));
  for (const [id, v] of Object.entries(perProvider)) console.log("   ", id.padEnd(30), JSON.stringify(v));
}
console.log(`router simulation ok (${Date.now() - t0} ms)`);
