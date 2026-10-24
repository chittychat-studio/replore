// SPEC RS95/RS96: the router's brain. Pure JavaScript with an injectable clock, so the Durable Object (router/src/index.js),
// the unit tests and the offline simulation run the same code. It never sees a key or a search: only provider ids,
// limits, prices, budgets, token counts and outcome codes. Credits are keyed by a salted one-way hash (RS96).
import * as P from "./policy.js";

const POOLS = { free: ["free", "paid"], pro: ["pro", "free", "paid"] };
const newSpend = () => ({ paid: { spent: 0, calls: 0 }, pro: { spent: 0, calls: 0 } });
const newCounters = () => ({ fallback: { credits: 0, daily: 0, busy: 0, failed: 0, doDown: 0 }, served: 0 });
const hex = bytes => [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
async function sha256hex(s) {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))));
}
const randomHex = n => { const b = new Uint8Array(n); crypto.getRandomValues(b); return hex(b); };

function newState(id) {
  return { id, rpmT: [], tpmW: [], rpd: 0, tpd: 0, neu: 0, calls: 0, fails: 0, learned: {}, coolUntil: 0, coolWhy: "",
    coolDaily: false, authoritative: false, ladder: 0, hits: [], penalty: 0, penaltyAt: 0, latE: null, okE: 1, n: 0,
    consec: 0, recent: [], trips: 0, lastAt: 0, disabled: null };
}

export class Scheduler {
  constructor({ now = Date.now, random = Math.random, digest = sha256hex, salt = randomHex, onLedger = null } = {}) {
    this.now = now; this.random = random; this.digest = digest; this.makeSalt = salt; this.onLedger = onLedger;
    this.cfg = { providers: [], budgets: { paid: 0, pro: 0 }, credits: { anon: P.CREDITS_ANON, user: P.CREDITS_SIGNED_IN } };
    this.prov = new Map(); this.inflight = new Map(); this.checks = new Map(); this.credits = new Map(); this.refunds = new Map();
    this.day = null; this.salt = null; this.spend = newSpend(); this.counters = newCounters(); this.errLog = [];
    this.usage = { requests: 0, rows: 0 }; this.seq = 0;
    this.dirty = { state: false, credits: false };
    this.rollDay(now());
  }

  // ---- day boundary: lazy reset when the UTC date changes ----
  rollDay(now) {
    const d = P.utcDay(now);
    if (d === this.day) return;
    this.day = d; this.salt = this.makeSalt(16);   // fresh salt: credit hashes can't be linked across days
    this.credits.clear(); this.refunds = new Map(); this.spend = newSpend(); this.counters = newCounters(); this.usage = { requests: 0, rows: 0 };
    for (const st of this.prov.values()) { st.rpd = 0; st.tpd = 0; st.neu = 0; st.calls = 0; st.fails = 0;
      if (st.coolDaily && !st.authoritative) { st.coolUntil = 0; st.coolDaily = false; st.coolWhy = ""; } }
    this.dirty.state = this.dirty.credits = true;
  }

  setConfig(cfg) {
    if (!cfg || !Array.isArray(cfg.providers)) return;
    this.cfg = { providers: cfg.providers, budgets: { paid: +((cfg.budgets || {}).paid) || 0, pro: +((cfg.budgets || {}).pro) || 0 },
      credits: { anon: Math.max(0, (cfg.credits || {}).anon ?? P.CREDITS_ANON), user: Math.max(0, (cfg.credits || {}).user ?? P.CREDITS_SIGNED_IN) } };
    for (const p of cfg.providers) {
      let st = this.prov.get(p.id); if (!st) { st = newState(p.id); this.prov.set(p.id, st); }
      if (st.disabled && st.disabled !== sig(p)) { st.disabled = null; this.dirty.state = true; }   // one-api: key or model changed
    }
  }
  provider(id) { return this.cfg.providers.find(p => p.id === id); }

  // effective limits: configured, lowered by anything learned (never raised)
  limits(p, st) {
    const L = { ...(p.limits || {}) };
    for (const [k, v] of Object.entries(st.learned)) if (v > 0 && (!(L[k] > 0) || v < L[k])) L[k] = v;
    return L;
  }
  prune(st, t) {
    t = Math.min(t, this.now());   // never prune by a future time (a wait-granted reservation)
    if (st.rpmT.length) st.rpmT = st.rpmT.filter(x => x > t - P.MINUTE);
    if (st.tpmW.length) st.tpmW = st.tpmW.filter(w => w[0] > t - P.MINUTE);
    while (st.hits.length && st.hits[0] <= t - P.HOUR) st.hits.shift();
  }
  estimate(p, check) {
    const inTok = Math.max(1, check.estIn | 0), out = Math.max(1, p.maxOut | 0 || 120);
    return { tok: inTok + out, neu: p.rate ? P.neurons(p.rate, inTok, out) : 0,
      cost: p.price ? P.costUsd(p.price, inTok, out) : 0, inTok, out };
  }

  // Can p take one more call at time t? Pre-increment check (LiteLLM lowest_tpm_rpm_v2), reserves kept back.
  admit(p, st, check, t) {
    if (st.disabled) return { ok: false, perm: true, why: "auth" };
    if (st.coolUntil > t) return { ok: false, until: st.coolUntil, daily: st.coolDaily, why: st.coolWhy || "cooling" };
    if (t - st.lastAt < P.PROBE_AFTER_MS) {
      if (st.n >= 5 && st.okE < P.MIN_SUCCESS) return { ok: false, until: st.lastAt + P.PROBE_AFTER_MS, why: "unhealthy" };
      if (st.n >= 3 && st.latE > P.SLOW_MS) return { ok: false, until: st.lastAt + P.PROBE_AFTER_MS, why: "slow" };
    }
    if ((p.pool === "paid" || p.pool === "pro") && !p.price) return { ok: false, perm: true, why: "no_price" };
    this.prune(st, t);
    const L = this.limits(p, st), e = this.estimate(p, check), toMid = t + P.msToUtcMidnight(t);
    if (L.rpm > 0) {
      const cap = L.rpm - Math.ceil(L.rpm * P.RESERVE_MINUTE), live = st.rpmT.filter(x => x > t - P.MINUTE).sort((a, b) => a - b);
      if (live.length + 1 > cap) return { ok: false, until: live[live.length - cap] + P.MINUTE, why: "rpm" };
    }
    if (L.tpm > 0) {
      const cap = L.tpm * (1 - P.RESERVE_MINUTE);
      if (e.tok > cap) return { ok: false, perm: true, why: "too_big" };
      let sum = st.tpmW.reduce((a, w) => a + (w[0] > t - P.MINUTE ? w[1] : 0), 0);
      if (sum + e.tok > cap) {
        let until = t; for (const w of st.tpmW.filter(w => w[0] > t - P.MINUTE).sort((a, b) => a[0] - b[0])) { sum -= w[1]; until = w[0] + P.MINUTE; if (sum + e.tok <= cap) break; }
        return { ok: false, until, why: "tpm" };
      }
    }
    if (L.rpd > 0 && st.rpd + 1 > L.rpd - Math.ceil(L.rpd * P.RESERVE_DAY)) return { ok: false, until: toMid, daily: true, why: "rpd" };
    if (L.tpd > 0 && st.tpd + e.tok > L.tpd * (1 - P.RESERVE_DAY)) return { ok: false, until: toMid, daily: true, why: "tpd" };
    if (L.neurons > 0 && st.neu + e.neu > L.neurons * (1 - P.RESERVE_DAY)) return { ok: false, until: toMid, daily: true, why: "neurons" };
    if (p.pool === "paid" || p.pool === "pro") {
      const s = P.admitSpend(this.spend[p.pool].spent, e.cost, this.cfg.budgets[p.pool], t);
      if (!s.ok) return { ok: false, until: s.daily ? toMid : s.untilMs, daily: !!s.daily, why: s.why };
    }
    return { ok: true, e };
  }
  headroom(p, st, t) {
    const L = this.limits(p, st); let f = 1;
    const frac = (used, lim) => (lim - used) / lim;
    if (L.rpm > 0) f = Math.min(f, P.headroomRamp(frac(st.rpmT.filter(x => x > t - P.MINUTE).length, L.rpm)));
    if (L.tpm > 0) f = Math.min(f, P.headroomRamp(frac(st.tpmW.reduce((a, w) => a + w[1], 0), L.tpm)));
    if (L.rpd > 0) f = Math.min(f, P.headroomRamp(frac(st.rpd, L.rpd)));
    if (L.tpd > 0) f = Math.min(f, P.headroomRamp(frac(st.tpd, L.tpd)));
    if (L.neurons > 0) f = Math.min(f, P.headroomRamp(frac(st.neu, L.neurons)));
    return f;
  }
  score(p, st, t) {
    return this.headroom(p, st, t) * P.rateLimitFactor(P.decayedPenalty(st.penalty, st.penaltyAt, t)) * Math.max(0.05, st.okE);
  }

  // Fixed tier order, fixed group order inside a tier, best score inside a group; then Portkey's wait-if-it-fits.
  pick(check, now) {
    const exclude = new Set(check.exclude || []), blocked = [];
    const pools = POOLS[check.tier === "pro" ? "pro" : "free"];
    for (const pool of pools) {
      const ps = this.cfg.providers.filter(p => p.pool === pool && !exclude.has(p.id));
      const groups = [...new Set(ps.map(p => p.group))].sort((a, b) => a - b);
      for (const g of groups) {
        let best = null;
        for (const p of ps.filter(x => x.group === g)) {
          const st = this.prov.get(p.id), a = this.admit(p, st, check, now);
          if (a.ok) { const s = this.score(p, st, now); if (!best || s > best.s) best = { p, s, e: a.e }; }
          else blocked.push({ p, ...a });
        }
        if (best) return { grant: best, waitMs: 0, blocked };
      }
    }
    const room = Math.min(P.MAX_WAIT_MS, (check.leftMs || 0) - P.MIN_RUN_MS);
    const waitable = blocked.filter(b => !b.daily && !b.perm && b.until > now && b.until - now <= room)
      .sort((a, b) => pools.indexOf(a.p.pool) - pools.indexOf(b.p.pool) || a.until - b.until);
    for (const b of waitable) {
      const t = b.until + 1, a = this.admit(b.p, this.prov.get(b.p.id), check, t);
      if (a.ok) return { grant: { p: b.p, s: 0, e: a.e }, waitMs: t - now, at: t, blocked };
    }
    if (!blocked.length) return { deny: "none", blocked };
    const soft = blocked.filter(b => !b.daily && !b.perm && b.until > now);
    if (soft.length) return { deny: "busy", resetsInSec: Math.min(600, Math.max(1, Math.ceil((Math.min(...soft.map(b => b.until)) - now) / 1000))), blocked };
    const daily = blocked.filter(b => b.daily && b.until > now);
    const until = daily.length ? Math.min(...daily.map(b => b.until)) : now + P.msToUtcMidnight(now);
    return { deny: "daily", resetsInSec: Math.min(86400, Math.max(60, Math.ceil((until - now) / 1000))), blocked };
  }

  async idHash(kind, value) { return (await this.digest(this.salt + "|" + kind + "|" + String(value))).slice(0, 16); }

  // One call per attempt. req = {cfg, reports:[...], doFails, check:{tier, credit:{kind:"anon"|"user"|"none", id},
  // parent, exclude:[ids], estIn, leftMs}}. Returns {grant:{id, ticket, check, waitMs}, credits} or {deny, resetsInSec, credits}.
  async acquire(req = {}) {
    let now = this.now(); this.rollDay(now);
    if (req.cfg) this.setConfig(req.cfg);
    for (const r of req.reports || []) this.report(r);
    if (req.doFails > 0) { this.counters.fallback.doDown += Math.min(1000, req.doFails | 0); this.dirty.state = true; }
    const c = req.check; if (!c) return { ok: true };
    const parent = c.parent ? this.checks.get(c.parent) : null;
    let hash = null, cap = null;
    const kind = c.credit && (c.credit.kind === "anon" || c.credit.kind === "user") ? c.credit.kind : null;
    if (!parent && kind && c.credit.id) {
      cap = kind === "user" ? this.cfg.credits.user : this.cfg.credits.anon;
      const day = this.day;
      hash = await this.idHash(kind, c.credit.id);   // the IP or uid itself is never stored
      now = this.now(); this.rollDay(now);
      if (this.day !== day) hash = await this.idHash(kind, c.credit.id);
      const used = this.credits.get(hash) || 0;
      const reset = Math.ceil(P.msToUtcMidnight(now) / 1000);
      if (used >= cap) { this.counters.fallback.credits++; this.dirty.state = true; return { deny: "credits", resetsInSec: reset, credits: { left: 0, cap } }; }
      if (!this.credits.has(hash) && this.credits.size >= P.MAX_CREDIT_IDS) this.evictCredits();   // never lock new visitors out
    }
    const creditsInfo = () => {
      if (hash) return { left: Math.max(0, cap - (this.credits.get(hash) || 0)), cap };
      if (parent && parent.credit) return { left: Math.max(0, parent.cap - (this.credits.get(parent.credit) || 0)), cap: parent.cap };
      return null;
    };
    const pk = this.pick(c, now);
    if (!pk.grant) {
      if (pk.deny === "busy") this.counters.fallback.busy++; else if (pk.deny === "daily") this.counters.fallback.daily++;
      this.dirty.state = true;
      return { deny: pk.deny, resetsInSec: pk.resetsInSec, credits: creditsInfo() };
    }
    const { p, e } = pk.grant, st = this.prov.get(p.id), t = pk.at || now;
    st.rpmT.push(t); const ent = [t, e.tok]; st.tpmW.push(ent); st.rpd++; st.tpd += e.tok; st.neu += e.neu; st.calls++;
    const ticket = "t" + (++this.seq).toString(36) + Math.floor(this.random() * 1e9).toString(36);
    let cost = 0;
    if (p.pool === "paid" || p.pool === "pro") {
      cost = e.cost; this.spend[p.pool].spent += cost; this.spend[p.pool].calls++;
      if (this.onLedger) this.onLedger();   // RS95: the dollar ledger is written before the call is made
    }
    this.inflight.set(ticket, { id: p.id, ent, tok: e.tok, neu: e.neu, cost, pool: p.pool, day: this.day, at: now });
    const checkId = parent ? c.parent : ticket;
    if (!parent) this.checks.set(ticket, { credit: hash, cap, at: now });
    if (hash) { this.credits.set(hash, (this.credits.get(hash) || 0) + 1); this.dirty.credits = true; }
    this.dirty.state = true; this.gc(now);
    return { grant: { id: p.id, ticket, check: checkId, waitMs: pk.waitMs }, credits: creditsInfo(),
      trace: pk.blocked.map(b => ({ id: b.p.id, pool: b.p.pool, why: b.why })) };
  }
  // RS96: the id table is full: drop 10%, ids that used a single credit first, then the oldest (Map keeps insertion order)
  evictCredits() {
    const target = Math.ceil(P.MAX_CREDIT_IDS * P.EVICT_SHARE); let n = 0;
    for (const [k, v] of this.credits) { if (n >= target) break; if (v <= 1) { this.credits.delete(k); this.refunds.delete(k); n++; } }
    for (const k of this.credits.keys()) { if (n >= target) break; this.credits.delete(k); this.refunds.delete(k); n++; }
    this.counters.evicted = (this.counters.evicted || 0) + n; this.dirty.credits = this.dirty.state = true;
  }
  gc(now) {
    if (this.inflight.size > 2000 || this.seq % 64 === 0) {
      for (const [k, v] of this.inflight) if (now - v.at > 120000) this.inflight.delete(k);
      for (const [k, v] of this.checks) if (now - v.at > 300000) this.checks.delete(k);
    }
  }

  // One attempt's outcome: {ticket, id, check, ok, code, status, ms, usage:{in,out}, groq:{...headers}, learn:[{dim,limit}],
  // retryAfterSec, resetsInSec, refund}
  report(r) {
    if (!r || typeof r !== "object") return;
    const now = this.now(); this.rollDay(now);
    if (r.refund && r.check) {   // RS96: no provider call ran, so the credit is handed back (at most MAX_REFUNDS a day per id)
      const c = this.checks.get(r.check), done = c && c.credit ? this.refunds.get(c.credit) || 0 : 0;
      if (c && c.credit && (this.credits.get(c.credit) || 0) > 0 && done < P.MAX_REFUNDS) {
        this.credits.set(c.credit, this.credits.get(c.credit) - 1); this.refunds.set(c.credit, done + 1); this.dirty.credits = true; }
      if (c) c.credit = null;
      this.counters.fallback.failed++; this.dirty.state = true;
    }
    const p = this.provider(r.id), st = p && this.prov.get(r.id);
    if (!st) return;
    const inf = r.ticket ? this.inflight.get(r.ticket) : null;
    if (inf) this.inflight.delete(r.ticket);
    this.dirty.state = true;
    const sameDay = inf && inf.day === this.day;
    // reconcile the reservation with the reply's usage (LiteLLM: add the real total after success)
    if (inf && sameDay && r.usage && Number.isFinite(+r.usage.in)) {
      const inTok = +r.usage.in || 0, outTok = +r.usage.out || 0;
      if (p.kind === "workers-ai") { if (p.rate) st.neu += P.neurons(p.rate, inTok, outTok) - inf.neu; }
      else { const d = inTok + outTok - inf.tok; inf.ent[1] = Math.max(0, inf.ent[1] + d); st.tpd = Math.max(0, st.tpd + d); }
      if (inf.cost && p.price) {
        const diff = P.costUsd(p.price, inTok, outTok) - inf.cost;
        this.spend[inf.pool].spent = Math.max(0, this.spend[inf.pool].spent + diff);
        if (diff > 0 && this.onLedger) this.onLedger();
      }
    } else if (inf && sameDay && inf.cost && !r.ok && (r.status | 0) >= 400) {
      this.spend[inf.pool].spent = Math.max(0, this.spend[inf.pool].spent - inf.cost);   // an error reply is not billed
    }
    if (r.groq && p.kind === "groq") this.learnHeaders(p, st, r.groq, now);
    for (const l of r.learn || []) this.lower(st, l.dim, l.limit);
    this.outcome(p, st, r, now);
  }
  lower(st, dim, v) {
    if (!["rpm", "rpd", "tpm", "tpd"].includes(dim) || !(v > 0)) return;
    if (!(st.learned[dim] > 0) || v < st.learned[dim]) st.learned[dim] = v;   // freellmapi: only ever more conservative
  }
  learnHeaders(p, st, h, now) {
    if (h.rpdLimit > 0) this.lower(st, "rpd", h.rpdLimit);
    if (h.tpmLimit > 0) this.lower(st, "tpm", h.tpmLimit);
    const L = this.limits(p, st);
    if (h.rpdLeft != null && L.rpd > 0) st.rpd = Math.max(st.rpd, L.rpd - h.rpdLeft);   // Groq's numbers can only raise ours
    if (h.tpmLeft != null && L.tpm > 0) {
      this.prune(st, now);
      const sum = st.tpmW.reduce((a, w) => a + w[1], 0), seen = L.tpm - h.tpmLeft;
      if (seen > sum) st.tpmW.push([now, seen - sum]);
    }
  }
  cool(st, ms, why, { daily = false, authoritative = false } = {}) {
    const until = this.now() + Math.min(P.MAX_COOL_MS, Math.max(0, ms));
    if (until > st.coolUntil) { st.coolUntil = until; st.coolWhy = why; st.coolDaily = daily; st.authoritative = authoritative; }
  }
  outcome(p, st, r, now) {
    const cls = P.classify(r), floor = r.retryAfterSec > 0 ? r.retryAfterSec * 1000 : 0;
    const pen = d => { st.penalty = Math.min(P.PENALTY_MAX, P.decayedPenalty(st.penalty, st.penaltyAt, now) + d); st.penaltyAt = now; };
    st.n++; st.lastAt = now;
    st.okE = P.EWMA_ALPHA * (cls === "ok" ? 1 : 0) + (1 - P.EWMA_ALPHA) * st.okE;
    if (r.ms > 0 && (cls === "ok" || cls === "server" || cls === "soft")) st.latE = st.latE == null ? r.ms : P.EWMA_ALPHA * r.ms + (1 - P.EWMA_ALPHA) * st.latE;
    st.recent.push(cls === "ok" ? 1 : cls === "server" ? 0 : 1); if (st.recent.length > P.BREAKER_WINDOW) st.recent.shift();
    if (cls !== "ok") { st.fails++; this.errLog.push([now, cls]); if (this.errLog.length > 500) this.errLog.shift(); }
    switch (cls) {
      case "ok":
        st.consec = 0; st.ladder = 0; st.hits = []; st.trips = 0;
        if (st.penalty) { st.penalty = Math.max(0, P.decayedPenalty(st.penalty, st.penaltyAt, now) - 1); st.penaltyAt = now; }
        break;
      case "transient": {   // freellmapi: 90 s, or the ladder after 2+ 429s in the last hour; Retry-After is a floor
        pen(P.PENALTY_429); this.prune(st, now); st.hits.push(now);
        let ms = P.TRANSIENT_COOL_MS;
        if (st.hits.length >= 2) { ms = P.LADDER_MS[Math.min(st.ladder, P.LADDER_MS.length - 1)]; st.ladder++; }
        this.cool(st, Math.max(ms, floor), "429", { authoritative: floor > ms }); break; }
      case "capacity": pen(P.PENALTY_429); this.cool(st, Math.max(P.WAI_CAPACITY_COOL_MS, floor), "capacity"); break;
      case "daily": {
        const ms = r.resetsInSec > 0 ? r.resetsInSec * 1000 : P.msToUtcMidnight(now);
        this.cool(st, Math.max(ms, floor), "daily", { daily: true, authoritative: true }); break; }
      case "auth": st.disabled = sig(p); st.coolWhy = "auth"; break;   // one-api: off until the key or model changes
      case "payment": this.cool(st, P.DAY, "payment", { daily: true }); break;
      case "gone": this.cool(st, P.HOUR, "gone"); break;
      case "server": {
        pen(P.PENALTY_FAIL); st.consec++;
        const bad = st.recent.filter(x => x === 0).length;
        if (st.consec >= P.BREAKER_CONSEC || bad >= P.BREAKER_IN_WINDOW) {
          st.trips++; st.consec = 0; st.recent = [];
          const ms = Math.min(P.BREAKER_MAX_MS, P.BREAKER_BASE_MS * 2 ** (st.trips - 1)) * (1 + 0.2 * this.random());
          this.cool(st, Math.max(ms, floor), "breaker");
        } else if (floor) this.cool(st, floor, "retry_after");
        break; }
      default: pen(P.PENALTY_FAIL);   // client / soft: no cooldown (LiteLLM), health only
    }
  }

  // ---- owner snapshot (RS95): counts and states only; never a key tag, salt or hash ----
  status() {
    const now = this.now(); this.rollDay(now);
    const providers = this.cfg.providers.map(p => {
      const st = this.prov.get(p.id); this.prune(st, now);
      const L = this.limits(p, st);
      const state = st.disabled ? "DISABLED" : st.coolUntil > now ? (st.coolDaily ? "EXHAUST" : "COOLING")
        : this.admit(p, st, { estIn: 1800, leftMs: 4500 }, now).ok ? "OK" : "FULL";
      return { id: p.id, pool: p.pool, group: p.group, state, why: state === "OK" ? "" : st.disabled ? "auth" : st.coolWhy,
        cooldownSec: st.coolUntil > now ? Math.ceil((st.coolUntil - now) / 1000) : 0,
        today: { calls: st.calls, fails: st.fails, rpd: st.rpd, rpdLimit: L.rpd || null, tpd: Math.round(st.tpd), tpdLimit: L.tpd || null,
          neurons: Math.round(st.neu), neuronLimit: L.neurons || null },
        minute: { rpm: st.rpmT.filter(x => x > now - P.MINUTE).length, rpmLimit: L.rpm || null,
          tpm: Math.round(st.tpmW.reduce((a, w) => a + w[1], 0)), tpmLimit: L.tpm || null },
        learned: { ...st.learned }, ewmaMs: st.latE == null ? null : Math.round(st.latE), success: Math.round(st.okE * 100) / 100,
        penalty: P.decayedPenalty(st.penalty, st.penaltyAt, now) };
    });
    const budget = pool => { const B = this.cfg.budgets[pool], s = this.spend[pool];
      return { spent: round6(s.spent), cap: B, paced: B > 0 ? round6(Math.min(B, P.allowedSpend(B, now) - B * P.PACER_BURST)) : 0, calls: s.calls }; };
    let atCapAnon = 0, atCapUser = 0;   // the table holds only hashes, so the kind is unknown; report totals
    for (const v of this.credits.values()) if (v >= this.cfg.credits.anon) atCapAnon++;
    for (const v of this.credits.values()) if (v >= this.cfg.credits.user) atCapUser++;
    const errs = {}; for (const [t, c] of this.errLog) if (t > now - P.HOUR) errs[c] = (errs[c] || 0) + 1;
    return { at: new Date(now).toISOString(), day: this.day, providers, budgets: { paid: budget("paid"), pro: budget("pro") },
      credits: { ids: this.credits.size, atAnonCap: atCapAnon, atSignedInCap: atCapUser, caps: { ...this.cfg.credits } },
      fallbacks: { ...this.counters.fallback }, errors1h: errs, durableObject: { ...this.usage } };
  }

  // ---- persistence (the DO writes these as three rows) ----
  stateBlob() {
    const prov = {};
    for (const [id, st] of this.prov) prov[id] = st;
    return JSON.stringify({ v: 1, day: this.day, salt: this.salt, counters: this.counters, usage: this.usage,
      errLog: this.errLog.slice(-200), seq: this.seq, prov });
  }
  creditsBlob() { return JSON.stringify({ day: this.day, m: Object.fromEntries(this.credits) }); }
  ledgerBlob() { return JSON.stringify({ day: this.day, spend: this.spend }); }
  restore({ state, credits, ledger } = {}) {
    const today = P.utcDay(this.now());
    try { const s = state && JSON.parse(state);
      if (s && s.v === 1) {
        for (const [id, st] of Object.entries(s.prov || {})) this.prov.set(id, { ...newState(id), ...st });
        this.seq = s.seq | 0;
        if (s.day === today) { this.day = s.day; this.salt = s.salt; this.counters = { ...newCounters(), ...s.counters };
          this.usage = { requests: 0, rows: 0, ...s.usage }; this.errLog = s.errLog || []; }
        else { this.day = null; this.rollDay(this.now()); }
      } } catch {}
    try { const c = credits && JSON.parse(credits); if (c && c.day === this.day) this.credits = new Map(Object.entries(c.m || {})); } catch {}
    try { const l = ledger && JSON.parse(ledger);
      if (l && l.day === this.day) for (const k of ["paid", "pro"]) {   // the ledger row wins: it is written on every paid call
        const v = l.spend && l.spend[k]; if (v) this.spend[k] = { spent: Math.max(+v.spent || 0, this.spend[k].spent), calls: Math.max(v.calls | 0, this.spend[k].calls) };
      } } catch {}
    this.dirty.state = this.dirty.credits = false;
  }
}
const round6 = x => Math.round(x * 1e6) / 1e6;
const sig = p => String(p.keyTag || "") + "|" + String(p.model || "") + "|" + String(p.base || "");

// ASCII dashboard in the report's layout (RS95 owner status)
export function asciiStatus(s) {
  const pad = (v, n) => String(v).padEnd(n).slice(0, n), lpad = (v, n) => String(v).padStart(n).slice(-n);
  const L = [`REPLORE ROUTER  ·  ${s.at.slice(0, 16).replace("T", " ")} UTC  ·  DO requests ${s.durableObject.requests}, rows ${s.durableObject.rows} today`,
    "=".repeat(92), "PROVIDER                          pool  state     today used / limit        minute       cooldown  ms",
    "-".repeat(92)];
  for (const p of s.providers) {
    const t = p.today, used = t.neuronLimit ? `${t.neurons} / ${t.neuronLimit} neur` : t.tpdLimit ? `${t.tpd} / ${t.tpdLimit} tok` : `${t.calls} calls`;
    const min = p.minute.rpmLimit ? `${p.minute.rpm}/${p.minute.rpmLimit} rpm` : "-";
    L.push(`${pad(p.id, 33)} ${pad(p.pool, 5)} ${pad(p.state, 9)} ${pad(used, 25)} ${pad(min, 12)} ${lpad(p.cooldownSec ? p.cooldownSec + " s" : "-", 9)} ${lpad(p.ewmaMs ?? "-", 5)}`);
  }
  L.push("-".repeat(92));
  for (const k of ["paid", "pro"]) { const b = s.budgets[k];
    L.push(`BUDGET ${pad(k, 5)} $${b.spent.toFixed(4)} of $${Number(b.cap).toFixed(2)} cap (paced $${b.paced.toFixed(4)}) · ${b.calls} calls${b.cap > 0 ? "" : " · OFF"}`); }
  L.push(`CREDITS      ids ${s.credits.ids} · at anon cap (${s.credits.caps.anon}) ${s.credits.atAnonCap} · at signed-in cap (${s.credits.caps.user}) ${s.credits.atSignedInCap}`);
  const f = s.fallbacks;
  L.push(`FALLBACKS    keyword-only today: credits ${f.credits} · used up ${f.daily} · busy ${f.busy} · all failed ${f.failed} · DO down ${f.doDown}`);
  L.push(`ERRORS 1h    ${Object.entries(s.errors1h).map(([k, v]) => k + ": " + v).join(" · ") || "none"}`);
  return L.join("\n");
}
