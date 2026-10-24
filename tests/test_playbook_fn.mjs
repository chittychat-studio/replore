// SPEC RS97: the Pro playbook function (functions/api/pro/playbook.js). No network: KV is a fake, Pro is injected.
import assert from "node:assert";
import * as fn from "../functions/api/pro/playbook.js";

const BOOK = { id: "firebase-google-signin", title: "Add Google sign-in", steps: [{ title: "Create the project", body: "Open the console." }, { title: "Register", body: "- one\n- two" }] };
const kv = (data, fail) => ({ async get(k, type) { assert.strictEqual(type, "json"); if (fail) throw new Error("down"); return k in data ? data[k] : null; } });
const STORE = { "pb:index": [{ id: BOOK.id, title: BOOK.title, steps: 2 }], ["pb:" + BOOK.id]: BOOK };
const req = (q = "", headers = {}) => new Request("https://replore.cardzo.co.in/api/pro/playbook" + q, { headers: { "CF-Connecting-IP": "203.0.113.5", ...headers } });
const yes = async () => true, no = async () => false, boom = async () => { throw new Error("x"); };
const call = async (q, env, isPro, headers) => { fn.resetPlaybook(); const r = await fn.playbookResponse(req(q, headers), env, isPro); return { status: r.status, body: await r.json(), cc: r.headers.get("Cache-Control") }; };

// fail closed: no binding, not Pro, a throwing check, a bad id, a store error, a malformed record
assert.deepStrictEqual((await call("", {}, yes)).body, { error: "playbooks_off" });
let r = await call("", { PLAYBOOKS: kv(STORE) }, no); assert.strictEqual(r.status, 403); assert.strictEqual(r.body.error, "pro_required");
assert.ok(!JSON.stringify(r.body).includes("Google"), "nothing about the playbooks leaks to non-Pro");
assert.strictEqual((await call("?id=" + BOOK.id, { PLAYBOOKS: kv(STORE) }, boom)).status, 403);
for (const bad of ["", "../x", "A", "a b", "x".repeat(61)]) assert.strictEqual((await call("?id=" + encodeURIComponent(bad), { PLAYBOOKS: kv(STORE) }, yes)).status, 400, bad);
assert.strictEqual((await call("", { PLAYBOOKS: kv(STORE, true) }, yes)).body.error, "store_error");
assert.strictEqual((await call("?id=nope", { PLAYBOOKS: kv(STORE) }, yes)).status, 404);
for (const badRec of [{ ...BOOK, id: "other" }, { ...BOOK, steps: [] }, { ...BOOK, steps: [{ title: "t" }] }, { ...BOOK, steps: [{ title: "t", body: "x".repeat(8001) }] }, "text"])
  assert.strictEqual((await call("?id=" + BOOK.id, { PLAYBOOKS: kv({ ["pb:" + BOOK.id]: badRec }) }, yes)).body.error, "bad_record");
assert.strictEqual((await call("", { PLAYBOOKS: kv({ "pb:index": [{ id: "x", title: "t", steps: 0 }] }) }, yes)).body.error, "bad_record");
// cross-origin refused
assert.strictEqual((await call("", { PLAYBOOKS: kv(STORE) }, yes, { Origin: "https://evil.example" })).body.error, "bad_origin");
// Pro: index and one playbook, private and never cached; extra stored fields are dropped
r = await call("", { PLAYBOOKS: kv(STORE) }, yes); assert.strictEqual(r.status, 200); assert.deepStrictEqual(r.body, { playbooks: STORE["pb:index"] });
assert.strictEqual(r.cc, "private, no-store");
r = await call("?id=" + BOOK.id, { PLAYBOOKS: kv({ ["pb:" + BOOK.id]: { ...BOOK, secret: "x", steps: BOOK.steps.map(s => ({ ...s, html: "<b>" })) } }) }, yes);
assert.deepStrictEqual(r.body, BOOK);
assert.deepStrictEqual((await call("", { PLAYBOOKS: kv({}) }, yes)).body, { playbooks: [] });
// rate limit: 30 a minute per IP
fn.resetPlaybook(); let last;
for (let i = 0; i <= fn.PB_RATE_MAX; i++) last = await fn.playbookResponse(req(), { PLAYBOOKS: kv(STORE) }, yes, 1000);
assert.strictEqual(last.status, 429);
// the real route without any Pro key or sign-in configured: refused, never the text
fn.resetPlaybook(); const live = await fn.onRequestGet({ request: req("?id=" + BOOK.id, { "X-Replore-Plugin-Key": "rp.sub_fake12345678.0123456789abcdef" }), env: { PLAYBOOKS: kv(STORE) } });
assert.strictEqual(live.status, 403);
console.log("playbook function ok");
