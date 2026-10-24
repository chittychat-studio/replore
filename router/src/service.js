// SPEC RS95: the Durable Object's storage plan, kept apart from the DO class so the offline simulation counts the same
// requests and rows the real object would. Free plan: 100,000 requests and 100,000 rows written per day.
//   - counters live in memory (Scheduler); one "state" row at most every 15 s while something changed (an alarm)
//   - the credit table (RS96) at most every 30 s
//   - the dollar ledger on every paid reservation and upward correction (overspending is the one mistake that can't be undone)
//   - every setAlarm() is billed as one row written, so an alarm is armed only when nothing is pending
import { Scheduler, asciiStatus } from "./scheduler.js";

export const FLUSH_MS = 15000, CREDITS_FLUSH_MS = 30000;

export class RouterService {
  // storage: {sql:{exec(q, ...b) -> {toArray()}}, setAlarm(ms), getAlarm()} (the DO's ctx.storage, or a fake)
  constructor(storage, opts = {}) {
    this.storage = storage; this.now = opts.now || Date.now;
    this.sched = new Scheduler({ ...opts, now: this.now, onLedger: () => this.writeLedger() });
    this.alarmAt = 0; this.creditsAt = 0; this.ready = false;
  }
  async init() {
    const sql = this.storage.sql;
    sql.exec("CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)");
    const rows = {}; for (const r of sql.exec("SELECT k, v FROM kv").toArray()) rows[r.k] = r.v;
    this.sched.restore({ state: rows.state, credits: rows.credits, ledger: rows.ledger });
    try { this.alarmAt = (await this.storage.getAlarm()) || 0; } catch { this.alarmAt = 0; }
    this.ready = true;
  }
  write(k, v) {
    this.sched.usage.rows++;
    this.storage.sql.exec("INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v", k, v);
  }
  writeLedger() { this.write("ledger", this.sched.ledgerBlob()); }
  flush(force = false) {
    const d = this.sched.dirty, now = this.now();
    if (d.credits && (force || now - this.creditsAt >= CREDITS_FLUSH_MS)) { this.write("credits", this.sched.creditsBlob()); d.credits = false; this.creditsAt = now; }
    if (d.state || force) { d.state = false; this.write("state", this.sched.stateBlob()); }
  }
  async arm() {
    const d = this.sched.dirty;
    if (!(d.state || d.credits) || this.alarmAt) return;
    this.alarmAt = this.now() + FLUSH_MS; this.sched.usage.rows++;
    await this.storage.setAlarm(this.alarmAt);
  }
  async acquire(req) {
    this.sched.rollDay(this.now()); this.sched.usage.requests++;
    const out = await this.sched.acquire(req || {});
    await this.arm();
    return out;
  }
  async report(list) {
    this.sched.rollDay(this.now()); this.sched.usage.requests++;
    for (const r of Array.isArray(list) ? list.slice(0, 100) : []) this.sched.report(r);
    await this.arm();
    return { ok: true };
  }
  status() {
    this.sched.rollDay(this.now()); this.sched.usage.requests++;
    const s = this.sched.status();
    return { status: s, text: asciiStatus(s) };
  }
  async alarm() {
    this.sched.rollDay(this.now()); this.sched.usage.requests++;
    this.alarmAt = 0; this.flush();
    await this.arm();   // credits still waiting for their 30 s slot, or new changes
  }
}
