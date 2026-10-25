// SPEC RS97: the step-card page's pure parts (web/playbooks.js): the safe renderer subset and progress storage.
// No browser: the file is run in a vm with only what these functions need.
const assert = require("node:assert"), fs = require("node:fs"), vm = require("node:vm");
const store = {}, ctx = { localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } }, console };
vm.createContext(ctx); vm.runInContext(fs.readFileSync(__dirname + "/../web/playbooks.js", "utf8"), ctx);
const B = s => JSON.parse(JSON.stringify(ctx.pbBlocks(s))), I = s => JSON.parse(JSON.stringify(ctx.pbInline(s)));
assert.deepStrictEqual(B("one\ntwo\n\n- a\n- **b**\n\nend"), [{ p: [{ t: "one two" }] }, { ul: [[{ t: "a" }], [{ b: "b" }]] }, { p: [{ t: "end" }] }]);
assert.deepStrictEqual(B("1. one\n2. two\n   more\n- x"),[{ ol: [[{ t: "one" }], [{ t: "two" }, { t: " " }, { t: "more" }]] }, { ul: [[{ t: "x" }]] }]);
assert.deepStrictEqual(I("use `npm i` and **save**"), [{ t: "use " }, { c: "npm i" }, { t: " and " }, { b: "save" }]);
assert.deepStrictEqual(I("see [docs](https://firebase.google.com/docs)."), [{ t: "see " }, { a: "docs", href: "https://firebase.google.com/docs" }, { t: "." }]);
assert.deepStrictEqual(I("open https://console.cloud.google.com."), [{ t: "open " }, { a: "https://console.cloud.google.com", href: "https://console.cloud.google.com" }, { t: "." }]);
// data, not code: markup and non-https links stay plain text
for (const s of ["<img src=x onerror=alert(1)>", "[x](javascript:alert(1))", "[x](http://a.example)", "<script>1</script>"])
  assert.ok(I(s).every(p => !("a" in p) || p.href.startsWith("https://")), s);
assert.deepStrictEqual(I("<b>hi</b>"), [{ t: "<b>hi</b>" }]);
// progress: kept per playbook, junk and storage errors ignored
assert.deepStrictEqual(JSON.parse(JSON.stringify(ctx.pbLoad("x"))), { done: [], at: 0 });
ctx.pbSave("x", { done: [0, 2], at: 2 }); assert.deepStrictEqual(JSON.parse(JSON.stringify(ctx.pbLoad("x"))), { done: [0, 2], at: 2 });
store["replore.pb.y"] = '{"done":[1,"a",-1,2.5],"at":"3"}'; assert.deepStrictEqual(JSON.parse(JSON.stringify(ctx.pbLoad("y"))), { done: [1], at: 3 });
store["replore.pb.z"] = "not json"; assert.deepStrictEqual(JSON.parse(JSON.stringify(ctx.pbLoad("z"))), { done: [], at: 0 });
assert.ok(!/innerHTML/.test(fs.readFileSync(__dirname + "/../web/playbooks.js", "utf8").replace(/\/\/.*$/gm, "")), "never innerHTML");
console.log("playbook cards logic ok");
