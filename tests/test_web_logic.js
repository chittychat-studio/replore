// RS22: exercise the web page's pure logic in Node (no browser, no network).
const fs = require("fs"), path = require("path"), assert = require("assert");
// RS49: the page's code lives in web/app.js (no inline script, so the CSP needs no 'unsafe-inline')
const html = fs.readFileSync(path.join(__dirname, "..", "web", "index.html"), "utf8");
const appCode = fs.readFileSync(path.join(__dirname, "..", "web", "app.js"), "utf8").replace('"use strict";', "");
// RS89: pro-core.js (Pro switches and key rules) loads before app.js on the page; same order here
const coreCode = fs.readFileSync(path.join(__dirname, "..", "web", "pro-core.js"), "utf8").replace('"use strict";', "");
const code = coreCode + "\n" + appCode;
assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(html), "index.html must have no inline <script>");
assert.ok(!/\son[a-z]+\s*=/i.test(html) && !/javascript:/i.test(html), "no inline event handlers or javascript: URLs in index.html");
assert.ok(!/\son(click|load|error|input|change|submit)\s*=\s*\\?["']/i.test(code), "no inline handlers in markup built by app.js");
// fake DOM: elements support the methods the page's load-time code calls (chips, modals, theme, RS21-RS24)
const el = () => ({value:"",checked:false,textContent:"",innerHTML:"",type:"",className:"",dataset:{},style:{},
                   addEventListener(){}, appendChild(){}, focus(){}, querySelector:()=>el(), querySelectorAll:()=>[],
                   classList:{add(){},remove(){},toggle(){}}, getAttribute:()=>null, setAttribute(){}, clientWidth:560});
global.document = {getElementById: el, createElement: el, querySelectorAll:()=>[], querySelector:()=>null, addEventListener(){},
                   documentElement: el()};
global.matchMedia = () => ({matches:false});
global.fetch = () => Promise.reject(new Error("no network in tests"));   // RS35 carousel must not reach GitHub from CI
global.window = global;
const s = {};
// RS87: an in-memory localStorage (empty, like the old stub) so the Pro-key plumbing can be exercised
const LS = { m: {}, getItem(k){ return Object.prototype.hasOwnProperty.call(this.m, k) ? this.m[k] : null; }, setItem(k, v){ this.m[k] = String(v); }, removeItem(k){ delete this.m[k]; } };
new Function("document", "localStorage",
  code + "; this.keywordQueries=keywordQueries; this.exploreLinks=exploreLinks; this.rankByFit=rankByFit; this.fitScore=fitScore; this.whyRelevant=whyRelevant; this.esc=esc; this.lu=lu; this.freeText=freeText;" +
  " this.keep=keep; this.ragRan=ragRan; this.hasDesc=hasDesc; this.descHtml=descHtml; this.plainDesc=plainDesc; this.tipUrlOk=tipUrlOk; this.clean=clean; this.harmful=harmful; this.harmfulRepo=harmfulRepo; this.prdFeatures=prdFeatures; this.trendingQuery=trendingQuery; this.trendRows=trendRows; this.feedbackUrl=feedbackUrl; this.feedbackPayload=feedbackPayload; this.agoText=agoText; this.cardHtml=cardHtml; this.recentKey=recentKey; this.recentFind=recentFind; this.recentAdd=recentAdd; this.CACHE_V=CACHE_V; this.bm25Scores=bm25Scores; this.repoText=repoText; this.rrfOrder=rrfOrder; this.hybridOrder=hybridOrder; this.confirmQueries=confirmQueries; this.ghQuery=ghQuery; this.sigTokens=sigTokens; this.resultSummary=resultSummary; this.trustRow=trustRow; this.trustHtml=trustHtml; this.ghShape=ghShape; this.lastPage=lastPage; this.installCmd=installCmd; this.snapHtml=snapHtml; this.cleanLang=cleanLang; this.relaxedQueries=relaxedQueries; this.sellConflict=sellConflict; this.sellSummary=sellSummary; this.filterBar=filterBar; this.trustScore=trustScore; this.trustOrder=trustOrder; this.trustSort=trustSort; this.sortBox=sortBox; this.TRUST_RANK_NOTE=TRUST_RANK_NOTE; this.__trust=__trust; this.proKeyHeader=proKeyHeader; this.proKeyGet=proKeyGet; this.PRO_KEY=PRO_KEY; this.proKeySave=proKeySave; this.proKeyRemove=proKeyRemove; this.proUrlOk=proUrlOk; this.PRO_URL=PRO_URL; this.PRO_URL_YEAR=PRO_URL_YEAR; this.PRO_PRICE=PRO_PRICE; this.PRO_PRICE_YEAR=PRO_PRICE_YEAR; this.PRO_PRICE_WAS=PRO_PRICE_WAS; this.PRO_OFFER=PRO_OFFER; this.proButtons=proButtons; this.proReveal=proReveal; this.proConfig=proConfig;").call(s, document, LS);

// RS16: iOS excludes macOS
// RS16: expansions are specific on-topic phrases, never a bare category (live regression: "website" -> "frontend framework"
// pulled Ionic/Expo/qiankun/Luigi/choo/san/argon into a portfolio search)
{ const q = s.keywordQueries("portfolio website builder", "");
  assert.deepStrictEqual(q, ["portfolio website builder", "portfolio template", "portfolio website", "landing page template"], q);
  const bare = /^(frontend|backend|web|javascript|css|ui|mobile|game|chatbot|ai agent|ai) (framework|library|engine)s?$/;
  ["website","web","portfolio","dashboard","blog","ecommerce","game","chatbot","map","diet","powerpoint","ai","security","pdf"].forEach(w =>
    s.keywordQueries(w, "").forEach(x => assert.ok(!bare.test(x), w + " expanded to bare category: " + x))); }
// RS16 live-audit regressions (quick-picks that returned junk, 1 result or nothing)
{ const kq = t => s.keywordQueries(t, "");
  assert.ok(kq("learn web security by hacking a practice app").includes("vulnerable web application"));      // was "web app starter"
  assert.ok(!kq("learn web security by hacking a practice app").some(q => /starter/.test(q)));
  assert.ok(kq("offline maps for my trip planner app").includes("maplibre"));                               // plural "maps" -> map
  assert.ok(!kq("an ai image generator").some(q => /agent/.test(q)));                                       // was "ai agent framework"
  assert.ok(kq("a simple 2D browser game engine for beginners").includes("phaser game"));
  assert.ok(kq("a chatbot that answers questions from my PDFs, Python").includes("chat with pdf"));
  assert.ok(kq("my first iPhone app, a habit tracker").every(q => !/\bfirst\b/.test(q)));                  // filler word dropped
  ["by","from","first"].forEach(w => assert.ok(!kq("learn security by doing from first principles").some(q => q.split(" ").includes(w)), w));
  assert.ok(kq("a portfolio website with smooth scroll animations")[0].split(" ").length <= 3);            // core query <= 3 words
}
assert.ok(s.keywordQueries("a diet app for iphone", "ios").every(q => q.includes("-topic:macos")));
// RS42b: the "words and meaning" wording follows what actually ran for the search, not just the switch
assert.ok(s.ragRan(Object.assign([], { rag: { meaning: true, index: false } })));
assert.ok(s.ragRan(Object.assign([], { rag: { meaning: false, index: true } })));
assert.ok(!s.ragRan(Object.assign([], { rag: { meaning: false, index: false } })));
assert.ok(!s.ragRan([]) && !s.ragRan("off") && !s.ragRan({ fail: true, error: "x" }) && !s.ragRan(null));
// RS45: an empty GitHub description is said plainly, and such repos never fill the trending showcase
assert.ok(!s.hasDesc({ desc: "" }) && !s.hasDesc({ desc: "   " }) && !s.hasDesc({}) && s.hasDesc({ desc: "Maps" }));
assert.ok(s.descHtml({ desc: "" }).includes("No description on GitHub") && !s.descHtml({ desc: "" }).includes("—"));
assert.strictEqual(s.descHtml({ desc: "<b>x</b>" }), s.esc("<b>x</b>"));   // escaped like every other repo text
// RS44: only a Stripe Payment Link is accepted
assert.ok(s.tipUrlOk("https://buy.stripe.com/abc123XYZ"));
["", "http://buy.stripe.com/abc", "https://evil.com/buy.stripe.com/x", "https://buy.stripe.com/a b", "javascript:alert(1)", "https://buy.stripe.com/x?y=1"]
  .forEach(u => assert.ok(!s.tipUrlOk(u), u));
// RS44: a test-mode link never shows on the live domains, only on previews
assert.ok(!s.tipUrlOk("https://buy.stripe.com/test_abc", "replore.cardzo.co.in"));
assert.ok(!s.tipUrlOk("https://buy.stripe.com/test_abc", "replore.pages.dev"));
assert.ok(s.tipUrlOk("https://buy.stripe.com/test_abc", "claude-tip-nav.replore.pages.dev"));
assert.ok(s.tipUrlOk("https://buy.stripe.com/abc", "replore.cardzo.co.in"));
// RS43 A: the visitor's own 1-hour cache (pure functions)
{ const f = { q: "  Diet  Tracker ", platform: "web", minstars: "50", starters: "yes", stack: "", like: "" };
  const k = s.recentKey(f);
  assert.strictEqual(k, s.recentKey({ ...f, q: "diet tracker" }), "case and spacing don't matter");
  assert.notStrictEqual(k, s.recentKey({ ...f, platform: "ios" }), "filters are part of the key");
  const html = '<div class="rcard">x</div>', t0 = 1e12;
  let list = s.recentAdd([], { k, v: s.CACHE_V, t: t0, html }, t0);
  assert.ok(s.recentFind(list, k, t0 + 59 * 60000), "hit within the hour");
  assert.strictEqual(s.recentFind(list, k, t0 + 61 * 60000), null, "expired after an hour");
  assert.strictEqual(s.recentFind([{ k, v: "old", t: t0, html }], k, t0), null, "old markup version ignored");
  assert.strictEqual(s.recentFind([{ k, v: s.CACHE_V, t: t0, html: "<p>error</p>" }], k, t0), null, "only real results");
  for (let i = 0; i < 15; i++) list = s.recentAdd(list, { k: "k" + i, v: s.CACHE_V, t: t0 + i, html }, t0 + i);
  assert.strictEqual(list.length, 10, "at most 10 kept");
  assert.strictEqual(list[0].k, "k14", "newest first");
  list = s.recentAdd(list, { k: "late", v: s.CACHE_V, t: t0 + 2 * 3600000, html }, t0 + 2 * 3600000);
  assert.deepStrictEqual(list.map(e => e.k), ["late"], "expired entries dropped on write"); }
// RS42 hybrid: same BM25 numbers as scripts/hybrid.py (tests/test_hybrid.py GOLDEN), same RRF, same damping
{ const DESC = "voice based ai app to track my diet and step counter";
  const docs = [s.repoText("a/calorie-counter", "Track calories and diet", ["nutrition"]), s.repoText("b/karaoke", "Make karaoke from songs", []),
                s.repoText("c/step-counter", "Android step counter app", ["fitness"])];
  assert.deepStrictEqual(Array.from(s.bm25Scores(DESC, docs)), [2.374521, 0, 1.871074]);
  assert.deepStrictEqual(Array.from(s.rrfOrder(3, [null, [0, 5, 1]])), [1, 0, 2]);
  const rows = [{name:"b/karaoke", desc:"Make karaoke from songs"}, {name:"z/noise", desc:"Unrelated toolkit"},
                {name:"a/calorie-counter", desc:"Track calories and diet", topics:["nutrition"]}];
  const names = rs => rs.map(r => r.name);
  assert.deepStrictEqual(names(s.hybridOrder(rows, DESC)), ["b/karaoke", "a/calorie-counter", "z/noise"]);
  assert.deepStrictEqual(names(s.hybridOrder(rows, DESC, [0.1, 0.2, 0.9])), ["a/calorie-counter", "b/karaoke", "z/noise"]);
  assert.deepStrictEqual(names(s.hybridOrder(rows, "")), names(rows));
  const cq = s.confirmQueries(Array.from({length: 9}, (_, i) => "owner" + i + "/repository-name-" + i));
  assert.ok(cq.every(q => q.length <= 200) && cq.join(" ").split("repo:").length - 1 === 9); }
// RS42 edge cases: every case in evals/hybrid_cases.json must give the plugin's exact order ("parity")
{ const H = JSON.parse(require("fs").readFileSync(__dirname + "/../evals/hybrid_cases.json", "utf8"));
  const LONG = "track my diet calories and steps with voice ".repeat(50).slice(0, 2000);
  for (const c of H.cases) {
    const rows = c.rows.map(r => ({ name: r.name, desc: r.desc || "", topics: r.topics || [] }));
    const got = s.hybridOrder(rows, c.description === "LONG" ? LONG : c.description, c.sims).map(r => r.name);
    assert.deepStrictEqual(got, c.parity, "web/plugin parity: " + c.name); } }
// RS42 parity from RAW GitHub items (peer review): the page builds rows with keep(), the plugin with scout.py; same BM25
{ const raw = JSON.parse(require("fs").readFileSync(__dirname + "/fixtures/raw_items.json", "utf8"));
  const ex = { license: 0, stale: 0, low: 0, fork: 0, harm: 0 };
  const rows = s.keep(raw.items, 0, "", ex, {});
  const by = {}; rows.forEach(r => { by[r.name] = r; });
  const ordered = raw.order.map(n => by[n]);
  assert.ok(ordered.every(Boolean), "all fixture rows kept");
  assert.deepStrictEqual(Array.from(s.bm25Scores(raw.description, ordered.map(r => s.repoText(r.name, r.desc, r.topics)))), raw.bm25); }
// RS28f: long text ends at a word with "…", short text untouched
{ const long = "Open-source Python-based fitness tracker web app using Flask. Features include workout logging, nutrition tracking, and progress visualization. Ideal for developers and fitness enthusiasts looking to build their own";
  const c = s.clean(long);
  assert.ok(c.length <= 200 && c.endsWith("…"), c);
  assert.ok(long.startsWith(c.slice(0, -1)) && long[c.length - 1] === " ", "cut at a word: " + c);
  assert.strictEqual(s.clean("  short text  "), "short text"); }
// RS16a needs first, shell last (owner test: generic website templates crowded out voice + offline maps)
{ const kq = t => s.keywordQueries(t, "");
  assert.deepStrictEqual(kq("website with voice ai and show offline maps"), ["voice ai", "offline maps", "maplibre", "offline map tiles"]);
  assert.ok(!kq("website with voice ai and show offline maps").some(q => /template/.test(q)));
  assert.deepStrictEqual(kq("a landing page with a waitlist").slice(0, 2), ["landing page", "waitlist"]);   // lone word keeps its shell
  assert.ok(!kq("a diet and calorie tracking app").includes("diet"));                                       // bare word -> its expansions
  assert.ok(kq("a diet and calorie tracking app").includes("calorie counter"));
  assert.deepStrictEqual(kq("portfolio website builder"), ["portfolio website builder", "portfolio template", "portfolio website", "landing page template"]);   // single need unchanged
  kq("e-commerce store with stripe payments and admin dashboard").forEach(q => assert.ok(q.split(" ").length <= 3, q));
}
// RS14/RS20 labels
assert.strictEqual(s.freeText("MIT"), "Yes");
assert.strictEqual(s.freeText("AGPL-3.0"), "Free to use, but you must share your code");
assert.ok(s.lu("MPL-2.0").startsWith("OK in a paid product"));
// RS18 intent refusal + repo drops (incl. the live 'hacking of WhatsApp' repo that an earlier regex missed)
assert.ok(s.harmful("hack into my ex girlfriend account"));
assert.ok(!s.harmful("build a chat app"));
["WhatsApp Hacking Learn about ethical hacking of WhatsApp accounts", "hack instagram account tool",
 "Free robux generator", "aimbot wallhack"].forEach(d => assert.ok(s.harmfulRepo(d), "should flag: " + d));
assert.ok(!s.harmfulRepo("A privacy-focused nutrition tracker"));
// RS4a/RS3/RS4 filters + RS5 fit ranking (relevance + stars + freedom) with starter floor
const now = "2026-09-01T00:00:00Z", old = "2019-01-01T00:00:00Z";
const q1 = [{full_name:"a/big",stargazers_count:50000,license:{spdx_id:"MIT"},pushed_at:now,description:"big"},
            {full_name:"a/tpl",stargazers_count:6000,license:{spdx_id:"MIT"},pushed_at:now,is_template:true,description:"t"},
            {full_name:"a/old",stargazers_count:9000,license:{spdx_id:"MIT"},pushed_at:old,description:"o"},
            {full_name:"a/nolic",stargazers_count:9000,license:null,pushed_at:now,description:"n"},
            {full_name:"a/tiny",stargazers_count:5,license:{spdx_id:"MIT"},pushed_at:now,description:"ti"}];
const q2 = [{full_name:"b/x",stargazers_count:7000,license:{spdx_id:"MIT"},pushed_at:now,description:"x"}];
const ex = {license:0,stale:0,low:0,fork:0,harm:0};
const k1 = s.keep(q1, 50, "", ex), k2 = s.keep(q2, 50, "", ex);
assert.deepStrictEqual(k1.map(r => r.name), ["a/big", "a/tpl"]);  // old, no-license, tiny dropped
assert.strictEqual(ex.stale, 1); assert.strictEqual(ex.license, 1); assert.strictEqual(ex.low, 1);
assert.deepStrictEqual(s.rankByFit([k1, k2], true).map(r => r.name), ["a/big", "a/tpl", "b/x"]);
// RS5: a precise top-of-search match with far fewer stars can outrank a tangential giant
const rel = [{name:"tiny/exact",stars:300,spdx:"MIT",starter:false,rel:0},
             {name:"big/tangential",stars:120000,spdx:"MIT",starter:false,rel:12}];
assert.strictEqual(s.rankByFit([rel], false)[0].name, "tiny/exact", "relevance should lift a smaller exact match");
// RS5: between equally relevant, equally popular repos, the freer license wins
const lic = [{name:"a/permissive",stars:1000,spdx:"MIT",starter:false,rel:0},
             {name:"a/copyleft",stars:1000,spdx:"AGPL-3.0",starter:false,rel:0}];
assert.strictEqual(s.rankByFit([lic], false)[0].name, "a/permissive", "free-to-use should break the tie");
// RS5/RS24/RS37: a card says why only when the search words really match (honest keyword match, no filler line)
const w1 = s.whyRelevant({name:"me/rag-chat", desc:"A RAG chatbot over your PDFs", rel:0}, ["rag","chatbot","pdfs"]);
assert.strictEqual(w1, "Matches: rag, chatbot, pdfs");
assert.strictEqual(s.whyRelevant({name:"x/y", desc:"unrelated", rel:1}, ["zzz"]), "");
assert.strictEqual(s.whyRelevant({name:"x/y", desc:"unrelated", rel:9}, ["zzz"]), "");
// whole-word match: "ai" must NOT fire on "email"
assert.strictEqual(s.whyRelevant({name:"me/mailer", desc:"a fast email client", rel:0}, ["ai","chat"]), "");
// esc escapes quotes so repo text can't break out of an HTML attribute
assert.ok(s.esc('a"b').indexOf('"') < 0 && s.esc("a'b").indexOf("'") < 0, "esc should escape quotes");
// RS5: a repo found in a later query at a better position takes the lower rel (cross-query dedup)
const xseen = {}, xex = {license:0,stale:0,low:0,fork:0,harm:0};
const L1 = s.keep([{full_name:"z/lo",stargazers_count:5,license:{spdx_id:"MIT"},pushed_at:now,description:"d"},
                   {full_name:"x/dup",stargazers_count:1000,license:{spdx_id:"MIT"},pushed_at:now,description:"d"}], 50, "", xex, xseen);
const xdup = L1.find(r => r.name === "x/dup");
assert.strictEqual(xdup.rel, 1, "first query sees x/dup at index 1");
s.keep([{full_name:"x/dup",stargazers_count:1000,license:{spdx_id:"MIT"},pushed_at:now,description:"d"}], 50, "", xex, xseen);
assert.strictEqual(xdup.rel, 0, "dup rel drops to the better position found by a later query");
// RS4b/RS29b: the page builds exactly the q string scout.py builds (shared cases, asserted in tests/test_scout.py too)
{ const fx = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "qualifier_cases.json"), "utf8"));
  const now = Date.parse(fx.now);
  for (const c of fx.cases) assert.strictEqual(s.ghQuery(c.q, c.max_age_months, c.min_stars, now), c.expect, c.name); }
// RS46: the screen-reader summary is a count or the error line, never the card text
{ const box = (cards, err) => ({ querySelectorAll: () => ({ length: cards }), querySelector: () => err ? { textContent: err } : null });
  assert.strictEqual(s.resultSummary(box(22)), "22 results"); assert.strictEqual(s.resultSummary(box(1)), "1 result");
  assert.strictEqual(s.resultSummary(box(0, "No repository matched.")), "No repository matched.");
  assert.strictEqual(s.resultSummary(box(0)), ""); }
// RS5c: tail matches (best-match position >= 20) rank after every head match, exactly as scout.py
{ const mk = (name, stars, rel) => ({ name, stars, spdx: "MIT", starter: false, rel, pushed: "2026-10-01" });
  const head = Array.from({ length: 20 }, (_, i) => mk("head/r" + i, 60, i));
  const order = s.rankByFit([head.concat([mk("tail/giant", 90000, 20), mk("tail/small", 70, 21)])], false).map(r => r.name);
  assert.deepStrictEqual(order.slice(20), ["tail/giant", "tail/small"]); assert.deepStrictEqual(order.slice(0, 20), head.map(r => r.name)); }
// RS29b parity fixture: the page's keep / rankByFit / whyRelevant give the order, matched words and drops scout.py gives
{ const P = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "parity_items.json"), "utf8"));
  const raw = x => { const y = Object.assign({}, x); y.pushed_at = new Date(Date.now() - y.pushed_days_ago * 864e5).toISOString().slice(0, 19) + "Z";
    delete y.pushed_days_ago; return y; };
  const ex = { license: 0, stale: 0, low: 0, fork: 0, harm: 0 }, seen = {}, qOf = {};
  const lists = P.lists.map((l, qi) => { const k = s.keep(l.map(raw), P.min_stars, "", ex, seen); k.forEach(r => { qOf[r.name] = P.queries[qi]; }); return k; });
  const ranked = s.rankByFit(lists, P.prefer_starters);
  assert.deepStrictEqual(ranked.map(r => r.name), P.expect.order, "web/plugin order parity");
  const E = P.expect.excluded;
  assert.deepStrictEqual(ex, { license: E.license, stale: E.stale, low: E.low_stars, fork: E.fork_or_archived, harm: E.harmful });
  for (const r of ranked) { const h = P.expect.hits[r.name];
    assert.strictEqual(s.whyRelevant(r, s.sigTokens(qOf[r.name])), h.length ? "Matches: " + h.join(", ") : "", r.name); } }
console.log("web logic ok");

// RS58: emoji are dropped from shown descriptions; words, numbers and punctuation stay
{ assert.strictEqual(s.plainDesc("⚡ A minimal portfolio template for Developers"), "A minimal portfolio template for Developers");
  assert.strictEqual(s.plainDesc("Fast 🚀 animations ✨ for React 18"), "Fast animations for React 18");
  assert.strictEqual(s.plainDesc("🇮🇳 Made in India 👍🏽 #1 tool"), "Made in India #1 tool");
  assert.strictEqual(s.plainDesc("👨‍💻 Dev tools: CLI & API © 2026"), "Dev tools: CLI & API © 2026");
  assert.ok(!s.hasDesc({desc: "🚀✨"}) && s.hasDesc({desc: "ok"}));
  console.log("plain desc ok"); }

// RS18, RS29b: shared harm cases (also checked against scout.py in tests/test_scout.py)
{ const H = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "harm_cases.json"), "utf8"));
  assert.deepStrictEqual(H.harmful.filter(d => !s.harmfulRepo(d)), [], "should be dropped");
  assert.deepStrictEqual(H.fine.filter(d => s.harmfulRepo(d)), [], "should be kept");
  console.log("harm ok"); }

// RS23: PRD feature extraction (client-side, capped for the rate limit)
const prd = ["# My app PRD","## Features","- User authentication with email and Google",
 "- Payment checkout with Stripe","- Push notifications","* Image upload and cropping",
 "The app must support offline mode","1) Admin dashboard with charts","random prose line here"].join("\n");
const f = s.prdFeatures(prd);
assert.ok(f.length >= 2 && f.length <= 6, "features: " + f.length);
assert.ok(f.some(x => x.includes("authentication")) && f.some(x => x.includes("payment")), f.join(" | "));
console.log("prd ok:", f.join(" | "));

// RS34b: the function's cached example list is exactly the page's quick-pick texts
{ const src = fs.readFileSync(path.join(__dirname, "..", "functions", "api", "relevance.js"), "utf8");
  const block = src.match(/EXAMPLE_QUERIES = \[([\s\S]*?)\];/)[1];
  const fnList = [...block.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(m => m[1]);
  const pageList = [...code.match(/var EXAMPLES=\[([\s\S]*?)\];/)[1].matchAll(/text:"((?:[^"\\]|\\.)*)"/g)].map(m => m[1]);
  assert.deepStrictEqual(fnList, pageList);
  console.log("example list in sync"); }

// RS35 trending gallery: API-sorted queries, same filters as search, stars/forks order
{ const now = Date.UTC(2026, 9, 14);
  assert.deepStrictEqual(s.trendingQuery("rising", now), { q: "created:>=2026-09-14 stars:>50", sort: "stars" });
  assert.deepStrictEqual(s.trendingQuery("stars", now), { q: "stars:>10000", sort: "stars" });
  assert.deepStrictEqual(s.trendingQuery("forks", now), { q: "forks:>2000", sort: "forks" });
  assert.strictEqual(s.trendingQuery("nonsense", now).q.startsWith("created:>="), true);
  const fresh = new Date(Date.now() - 864e5).toISOString();
  const it = (n, st, fk, lic, extra) => Object.assign({ full_name: "o/" + n, stargazers_count: st, forks_count: fk, license: lic ? { spdx_id: lic } : null,
    pushed_at: fresh, description: n + " tool", html_url: "https://github.com/o/" + n, topics: [] }, extra || {});
  const items = [it("a", 100, 900, "MIT"), it("b", 5000, 10, "Apache-2.0"), it("c", 9000, 50, null), it("d", 300, 300, "MIT", { fork: true }),
                 it("e", 700, 5000, "GPL-3.0")];
  const st = s.trendRows(items, "stars"), fk = s.trendRows(items, "forks");
  assert.deepStrictEqual(st.rows.map(r => r.name), ["o/b", "o/e", "o/a"]);      // no licence and forks are filtered out
  assert.deepStrictEqual(fk.rows.map(r => r.name), ["o/e", "o/a", "o/b"]);
  assert.strictEqual(st.excluded.license, 1); assert.strictEqual(st.excluded.fork, 1);
  assert.match(fk.rows[0].whyText, /5\.0k forks/);
  console.log("trending ok"); }

// RS39 feedback: pre-filled email to Cardzo, user text only URL-encoded, empty title refused
{ assert.strictEqual(s.feedbackUrl("  ", "Bug", "x"), null);
  const u = s.feedbackUrl("Dark <mode> & more", "Feature request", "please\nthanks");
  assert.ok(u.startsWith("mailto:hello@cardzo.co.in?subject="));
  const q = new URLSearchParams(u.split("?")[1]);
  assert.strictEqual(q.get("subject"), "[Replore] [Feature request] Dark <mode> & more");
  assert.match(q.get("body"), /^Type: Feature request\n\nplease\nthanks/);
  assert.ok(!/[<>&\s]/.test(u.split("?")[1].replace(/&body=/, "")), "raw text leaked into the URL");
  assert.strictEqual(new URLSearchParams(s.feedbackUrl("t", "<script>", "").split("?")[1]).get("subject"), "[Replore] [Other] t");  // unknown type
  assert.strictEqual(new URLSearchParams(s.feedbackUrl("x".repeat(500), "Bug", "").split("?")[1]).get("subject").length, 16 + 120);
  assert.ok(s.feedbackUrl("t", "Bug", "y".repeat(5000)).length < 2000, "mailto stays short enough for mail clients");
  // Web3Forms payload: title required, type allowlisted, email kept only if address-shaped, honeypot false
  assert.strictEqual(s.feedbackPayload(" ", "Bug", "x", ""), null);
  const pl = s.feedbackPayload("Dark mode", "<x>", "d".repeat(3000), "not-an-email");
  assert.strictEqual(pl.subject, "[Replore] [Other] Dark mode"); assert.strictEqual(pl.message.length, 2000);
  assert.ok(!("email" in pl) && pl.botcheck === false && "access_key" in pl);
  assert.strictEqual(s.feedbackPayload("t", "Bug", "", "me@site.io").email, "me@site.io");
  console.log("feedback ok"); }

// RS24 result card: relative date, escaped repo text, topics filtered
{ assert.strictEqual(s.agoText(new Date(Date.now() - 3 * 864e5).toISOString()), "3 days ago");
  assert.strictEqual(s.agoText(""), "");
  const h = s.cardHtml({name:"ow<n>/re\"po", stars:1200, forks:30, spdx:"MIT", pushed:"2026-10-01", url:"https://github.com/a/b",
    desc:"<img src=x>", topics:["ok-topic","<bad>"], starter:false, rel:0}, 0, []);
  assert.ok(!h.includes("<img") && !h.includes("<bad>") && !h.includes("ow<n>"), "repo text must be escaped");
  assert.ok(!h.includes("class=\"topics\"") && h.includes("top1") && h.includes("pick-cb") && h.includes("rc-gh") && !h.includes("rc-tools"));   // RS63 card A; a bad name gets no tools
  const ok = s.cardHtml({name:"vercel/next.js", stars:1, forks:9, spdx:"MIT", pushed:"2026-10-01", url:"https://github.com/vercel/next.js", desc:"x", topics:[], starter:false, rel:0}, 0, []);
  assert.ok(ok.includes("rc-tools") && (ok.match(/class="rc-tool"/g) || []).length === 3 && ok.includes("rc-also") && !ok.includes("forks"));   // fake DOM blanks esc(): structure only   // fake DOM: esc() yields "" here, so check structure only
  // RS67 compact card: bookmark = Add to plan, a Details button, extras kept hidden for the side panel, safe filter data
  const c2 = s.cardHtml({name:"vercel/next.js", stars:1500, spdx:"MIT", pushed:"2026-10-01", url:"https://github.com/vercel/next.js", desc:"x", topics:[], starter:true, rel:0, lang:"TypeScript"}, 0, []);
  assert.ok(c2.includes("rc2") && c2.includes("rc-bm") && c2.includes("rc-det") && c2.includes('class="rc-more" hidden') && c2.includes('data-stars="1500"'));
  assert.ok(c2.indexOf("rc-tools") > c2.indexOf("rc-more") && c2.indexOf('class="trust"') > c2.indexOf("rc-more"));   // tools and trust live in Details
  assert.strictEqual(s.cleanLang("constructor"), ""); assert.strictEqual(s.cleanLang("<x>"), ""); assert.strictEqual(s.cleanLang("C#"), "C#");
  console.log("card ok"); }

// RS78: an empty search retries broader: without version-like words, then the two strongest words
{ const r = s.relaxedQueries("motion graphics using opus5.5", ["motion graphics opus5.5"]);
  assert.deepStrictEqual(r, ["motion graphics"]);
  assert.deepStrictEqual(s.relaxedQueries("offline maps trip planner", ["offline maps trip"]), ["offline maps"]);
  assert.deepStrictEqual(s.relaxedQueries("chatbot", ["chatbot"]), []);
  // RS78a: the same cases scripts/scout.py relaxed_queries() must pass (tests/test_scout.py reads this file too)
  const RX = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "relaxed_cases.json"), "utf8"));
  assert.ok(RX.cases.length >= 8);
  for (const c of RX.cases) assert.deepStrictEqual(s.relaxedQueries(c.text, c.tried), c.expect, c.name);
  console.log("relaxed ok"); }

// RS51 Explore links: same owner/repo path on four tools; malformed names get none
{ const x = s.exploreLinks("vercel/next.js");
  assert.deepStrictEqual(x.map(e => e.url), ["https://gitdiagram.com/vercel/next.js", "https://gitingest.com/vercel/next.js", "https://deepwiki.com/vercel/next.js",
    "https://github1s.com/vercel/next.js", "https://github.dev/vercel/next.js"]);
  ["", "noslash", "a/b/c", "a/..", "a/.", "o w/r", "a/b?x=1", "a/b#x", "\"a/b", "javascript:a/b"].forEach(n =>
    assert.deepStrictEqual(s.exploreLinks(n), [], n));
  console.log("explore ok"); }

// RS53 trust check: helpers, anti-injection, saved results. A real escaper stands in for the fake DOM here.
{ const realEl = document.createElement;
  document.createElement = () => { const o = { set textContent(v) { this._t = String(v); },
    get innerHTML() { return this._t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); } }; return o; };
  try {
    // counts from the Link header's rel="last"; none = items returned
    const link = '<https://api.github.com/repositories/1/issues?labels=good+first+issue&state=open&per_page=1&page=2>; rel="next", ' +
      '<https://api.github.com/repositories/1/issues?labels=good+first+issue&state=open&per_page=1&page=37>; rel="last"';
    assert.strictEqual(s.lastPage(link, 1), 37); assert.strictEqual(s.lastPage(null, 1), 1); assert.strictEqual(s.lastPage("", 0), 0);
    assert.strictEqual(s.lastPage('<https://x/y?per_page=1>; rel="last"', 1), 1, "per_page= is not page=");
    // install commands: known ecosystems, safe names only (RX4: text, never run)
    assert.strictEqual(s.installCmd("npm", "express"), "npm install express");
    assert.strictEqual(s.installCmd("go", "github.com/gin-gonic/gin"), "go get github.com/gin-gonic/gin");
    assert.strictEqual(s.installCmd("pypi", "requests; rm -rf /"), "");
    assert.strictEqual(s.installCmd("npm", "$(curl x)"), ""); assert.strictEqual(s.installCmd("hasOwnProperty", "x"), "");
    // GitHub answers -> shape
    const gh = s.ghShape({ community: { s: 200, j: { files: { readme: {}, contributing: null, code_of_conduct: {} } } },
      release: { s: 200, j: { tag_name: "v5.3.0", published_at: "2026-10-01T00:00:00Z" } }, gfi: { s: 200, j: [{}], link } });
    assert.deepStrictEqual(gh, { limited: false, files: { readme: true, contributing: false, coc: true }, release: { tag: "v5.3.0", date: "2026-10-01" }, gfi: 37 });
    assert.strictEqual(s.ghShape({ release: { s: 404 } }).release, "none");
    assert.strictEqual(s.ghShape({ release: { s: 200, j: { tag_name: "<img src=x>", published_at: "2026-10-01" } } }).release, null);
    assert.ok(s.ghShape({ community: { s: 403 } }).limited);
    // full panel: values shown, hostile values dropped, failures said plainly (RS7)
    const tr = { scorecard: { status: "ok", score: 8.9, maintained: 10 }, package: { status: "ok", system: "npm", name: "express", version: "5.3.0",
      licenses: ["MIT"], advisories: ["GHSA-qw6h-vgh9-j6wx", "<script>alert(1)</script>"], advisoryCount: 2 } };
    let h = s.trustHtml(gh, tr, "MIT", "expressjs/express");
    assert.ok(h.includes("8.9/10") && h.includes("maintained 10/10") && h.includes("scorecard.dev/viewer/?uri=github.com/expressjs/express"));
    assert.ok(h.includes("osv.dev/vulnerability/GHSA-qw6h-vgh9-j6wx") && h.includes("</svg>2 known") && h.includes("M8 2.2l6 10.6H2z") && !h.includes("<script"));
    assert.ok(h.includes("npm install express") && h.includes("37 good first issues") && h.includes("v5.3.0"));
    assert.ok(!h.includes("Package license"), "same license as the repo: no extra line");
    assert.ok(h.includes("doesn't change the ranking"));
    h = s.trustHtml(gh, { scorecard: { status: "ok", score: 5 }, package: { ...tr.package, licenses: ["GPL-3.0"], advisories: [], advisoryCount: 0 } }, "MIT", "a/b");
    assert.ok(h.includes("</svg>none known") && h.includes("Package license") && h.includes("the repo says MIT"));
    h = s.trustHtml({ limited: true }, null, "MIT", "a/b");   // function down + GitHub limit
    assert.ok(h.includes("couldn't check") && h.includes("hourly limit") && !h.includes("/10"));
    h = s.trustHtml(gh, { scorecard: { status: "none" }, package: { status: "none" } }, "MIT", "a/b");
    assert.ok(h.includes("not scored by OpenSSF Scorecard yet") && h.includes("no published package matched"));
    h = s.trustHtml(gh, { scorecard: { status: "ok", score: 7 }, package: { status: "skipped" } }, "MIT", "a/b");
    assert.ok(!h.includes("Known vulnerabilities") && !h.includes("Install"), "no language -> no package lines");
    h = s.trustHtml(gh, { scorecard: { status: "ok", score: 7 }, package: { status: "ok", system: "npm", name: "<x>", version: "1" } }, "MIT", "a/b");
    assert.ok(!h.includes("&lt;x&gt;") && !h.includes("<x>"), "a malformed package name is dropped, not shown");
    // the row: only for RS51-valid names; language only from the fixed list
    assert.ok(s.trustRow({ name: "a/b", spdx: "MIT", lang: "Python" }).includes('data-lang="Python"'));
    assert.ok(!s.trustRow({ name: "a/b", spdx: "MIT", lang: "COBOL" }).includes("data-lang"));
    assert.ok(!s.trustRow({ name: "a/b", spdx: "MIT", lang: "constructor" }).includes("data-lang"));
    assert.strictEqual(s.trustRow({ name: "a/..", spdx: "MIT" }), "");
    assert.ok(s.cardHtml({ name: "a/b", stars: 1, spdx: "MIT", pushed: "2026-10-01", url: "https://github.com/a/b", desc: "", topics: [], lang: "Go" }, 0, []).includes('class="trust"'));
  } finally { document.createElement = realEl; }
  // RS53d: a saved copy never keeps an opened panel
  const body = { innerHTML: "<ul>secret</ul>", attrs: { "data-done": "1" }, removeAttribute(k) { delete this.attrs[k]; } };
  const det = { attrs: { open: "" }, removeAttribute(k) { delete this.attrs[k]; }, querySelector: () => body };
  const root = { cloneNode: () => ({ innerHTML: "saved", querySelectorAll: q => q === "details.trust" ? [det] : [] }) };
  assert.strictEqual(s.snapHtml(root), "saved");
  assert.ok(!("open" in det.attrs) && body.innerHTML === "" && !("data-done" in body.attrs));
  assert.strictEqual(s.CACHE_V, "16");   // 16: compact card + filter panel (RS67)
  console.log("trust ok"); }

// RS56: the shared web/plugin cases — GitHub shaping and the panel's wording (tests/test_trust.py runs the same file)
{ const cases = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "trust_cases.json"), "utf8"));
  cases.github.forEach(c => assert.deepStrictEqual(s.ghShape(c.raw), c.expect, c.name));
  const realEl = document.createElement;
  document.createElement = () => ({ set textContent(v) { this._t = String(v); },
    get innerHTML() { return this._t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); } });
  try {
    cases.render.forEach(c => { const html = s.trustHtml(c.gh, c.tr, c.spdx, c.repo), text = html.replace(/<[^>]+>/g, "");
      c.contains.forEach(w => assert.ok(text.includes(w), c.name + ": missing " + w + " in " + text));
      c.absent.forEach(w => assert.ok(!text.includes(w) && !html.includes(w), c.name + ": must not show " + w)); });
  } finally { document.createElement = realEl; }
  console.log("shared trust cases ok"); }

// RS82: the opt-in Trust sort: the same formula and order as scripts/trust.py (tests/test_trust.py runs the same file)
{ const RK = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "trust_rank_cases.json"), "utf8"));
  RK.scores.forEach(c => assert.strictEqual(s.trustScore(c.t), c.expect, c.name));
  RK.orders.forEach(c => assert.deepStrictEqual(s.trustOrder(c.rows, r => s.trustScore(r.t), RK.n).map(r => r.repo), c.expect, c.name));
  const box = s.sortBox();
  assert.ok(box.indexOf('value="fit"') < box.indexOf('value="trust"') && box.includes(">Trust (top 5)<") && !/selected/.test(box));   // never the default
  assert.ok(!/\u2014/.test(s.TRUST_RANK_NOTE));
  console.log("trust rank ok"); }

// RS82: choosing Trust fetches /api/trust for the top 5 visible cards only and re-orders just those (network mocked)
(async () => {
  await Promise.resolve();   // run after the synchronous checks below, so the DOM stand-ins here never leak into them
  const mkCard = (name, i, extra = {}) => { const a = Object.assign({ "data-i": String(i), "data-lang": "" }, extra), kids = [];
    return { name, attrs: a, style: { display: "" }, getAttribute: k => (k in a ? a[k] : null), setAttribute(k, v) { a[k] = v; },
      querySelector: sel => sel === ".pick-cb" ? { getAttribute: () => name } : sel === ".rc-in" ? { appendChild: x => kids.push(x) } : null, kids }; };
  const cards = ["a/c0", "a/c1", "a/c2", "a/c3", "a/c4", "a/c5"].map((n, i) => mkCard(n, i));
  cards.splice(1, 0, mkCard("a/hidden", 9)); cards[1].style.display = "none";   // filtered out: not part of the top 5
  const g = { kids: cards.slice(), isConnected: true, querySelectorAll: sel => sel === ".rcard" ? g.kids.slice() : [],
    insertBefore(node, ref) { const j = g.kids.indexOf(node); if (j >= 0) g.kids.splice(j, 1); g.kids.splice(g.kids.indexOf(ref), 0, node); } };
  const note = { hidden: true, textContent: "" }, sel = { value: "trust" };
  const realGet = document.getElementById, realCC = document.createComment, realCE = document.createElement, realFetch = global.fetch;
  document.getElementById = id => id === "resSort" ? sel : id === "resTrustNote" ? note : realGet(id);
  document.createComment = () => { const m = { remove() { g.kids.splice(g.kids.indexOf(m), 1); } }; return m; };
  document.createElement = () => ({ className: "", textContent: "" });
  const SC = { "a/c2": { scorecard: { status: "ok", score: 9, maintained: 10 }, package: { status: "ok", advisoryCount: 0 } },
               "a/c4": { scorecard: { status: "ok", score: 4, maintained: 0 }, package: { status: "none" } } };
  const urls = [];
  global.fetch = url => { urls.push(url); const m = /\/api\/trust\?repo=([^&]+)/.exec(url);
    if (m) { const r = decodeURIComponent(m[1]); return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(SC[r] || { scorecard: { status: "none" }, package: { status: "skipped" } }) }); }
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}), headers: { get: () => null } }); };
  try {
    await s.trustSort(g);
    const trustUrls = urls.filter(u => u.startsWith("/api/trust"));
    assert.strictEqual(trustUrls.length, 5); assert.ok(!trustUrls.some(u => /hidden|c5/.test(u)));
    assert.deepStrictEqual(g.kids.filter(c => c.style.display !== "none").map(c => c.name), ["a/c2", "a/c4", "a/c0", "a/c1", "a/c3", "a/c5"]);
    assert.strictEqual(cards.find(c => c.name === "a/c2").attrs["data-trust"], "16");
    assert.ok(cards.find(c => c.name === "a/c2").kids[0].textContent.startsWith("Trust score 16"));
    assert.ok(note.textContent.startsWith("The top 5 were re-ordered by trust") && !note.hidden);
    assert.strictEqual(cards.find(c => c.name === "a/c5").attrs["data-trust"], undefined);   // outside the top 5: untouched
    console.log("trust sort ok");
  } finally { document.getElementById = realGet; document.createComment = realCC; document.createElement = realCE; global.fetch = realFetch; }
})().catch(e => { console.error(e); process.exit(1); });

// RS83: selling a closed-source product: the same lines as scripts/scout.py (tests/test_scout.py runs the same file)
{ const SL = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "selling_cases.json"), "utf8"));
  SL.conflicts.forEach(c => assert.strictEqual(s.sellConflict(c.spdx), c.expect, String(c.spdx)));
  SL.summaries.forEach(c => assert.strictEqual(s.sellSummary(c.picks), c.expect, c.name));
  const gpl = s.cardHtml({name:"a/b", stars:900, spdx:"GPL-3.0", pushed:"2026-10-01", url:"https://github.com/a/b", desc:"x", topics:[], rel:0}, 0, []);
  const mit = s.cardHtml({name:"a/c", stars:900, spdx:"MIT", pushed:"2026-10-01", url:"https://github.com/a/c", desc:"x", topics:[], rel:0}, 1, []);
  assert.ok(gpl.includes('class="rc-conflict"') && !mit.includes("rc-conflict") && gpl.includes("data-spdx="));
  const bar = s.filterBar([{spdx:"GPL-3.0"}, {spdx:"AGPL-3.0"}, {spdx:"MIT"}]);
  assert.ok(bar.includes('class="rf-sell"') && bar.includes("I&#39;ll sell it (closed source)</span><small>2</small>"));
  // flags only: the fit order is the same whether or not the visitor sells (RS6); the plan prompt adds the summary line
  assert.ok(/window\.__selling&&sellSummary\(picks\)\?sellSummary\(picks\)/.test(code));
  assert.ok(!/__selling[^\n]*(rankByFit|sort\()/.test(code), "selling must never re-rank");
  console.log("selling ok"); }

// RS87: the Pro key plumbing (pro-core.js). No key -> no header; a stored Pro-shaped key rides in the plugin-key header;
// anything else is never sent
const GOOD = "rp.sub_1QabcDEF234ghiJKL.0123456789abcdef";
{ assert.strictEqual(s.PRO_KEY, "replore.key");
  LS.removeItem("replore.key");
  assert.deepStrictEqual(s.proKeyHeader({"Content-Type":"application/json"}), {"Content-Type":"application/json"});
  LS.setItem("replore.key", "  " + GOOD + " \n");
  assert.strictEqual(s.proKeyHeader({})["X-Replore-Plugin-Key"], GOOD);
  ["short", "has space inside the key 0123456789", "x".repeat(101), "bad\nline0123456789abcdef", "1C285B2D-6CE6-4BC7-B8BE-ADB6A7E304DA",
   "rp.sub_1QabcDEF234ghiJKL.0123456789ABCDEF", "rp.cus_1QabcDEF234ghiJKL.0123456789abcdef", GOOD + "0"].forEach(v => {
    LS.setItem("replore.key", v); assert.ok(!("X-Replore-Plugin-Key" in s.proKeyHeader({})), v); });
  LS.removeItem("replore.key");
  // only on /api/relevance: the header name appears once in the page code, in proKeyHeader, which only relevanceGate calls
  assert.strictEqual((code.match(/X-Replore-Plugin-Key/g) || []).length, 1);
  assert.strictEqual((appCode.match(/proKeyHeader\(\{/g) || []).length, 1);
  assert.ok(/hdr=typeof proKeyHeader==="function"\?proKeyHeader\(\{"Content-Type":"application\/json"\}\)/.test(appCode));
  console.log("pro key plumbing ok"); }

// RS89: Leo, Pro window logic. Two Stripe Payment Links, offer line, key save / reveal / remove; hidden until PRO_URL
{ assert.strictEqual(s.PRO_URL, "", "the Pro window ships switched off until the owner pastes the Stripe link");
  assert.strictEqual(s.PRO_URL_YEAR, "");
  assert.ok(!s.proUrlOk(s.PRO_URL));
  // Stripe Payment Links only, with at most a prefilled promotion code
  ["https://buy.stripe.com/aEU5kE0Ab1cd", "https://buy.stripe.com/aEU5kE0Ab1cd?prefilled_promo_code=FIRST399",
   "https://buy.stripe.com/test_aEU5kE0Ab1cd", "https://buy.stripe.com/x?prefilled_promo_code=LAUNCH_50-A"].forEach(u => assert.ok(s.proUrlOk(u), u));
  ["", "http://buy.stripe.com/x", "https://evil.example/buy.stripe.com/x", "https://buy.stripe.com.evil.example/x", "javascript:alert(1)",
   "https://buy.stripe.com/a b", "https://buy.stripe.com/", "https://buy.stripe.com/a/b", "https://checkout.stripe.com/c/pay/x",
   "https://buy.stripe.com/x?prefilled_email=a@b.c", "https://buy.stripe.com/x?prefilled_promo_code=first399",
   "https://buy.stripe.com/x?prefilled_promo_code=FIRST399&client_reference_id=1", "https://buy.stripe.com/x?prefilled_promo_code=",
   "https://buy.stripe.com/x?prefilled_promo_code=" + "A".repeat(31), "https://buy.stripe.com/x#frag"].forEach(u => assert.ok(!s.proUrlOk(u), u));
  assert.ok(!s.proUrlOk("https://buy.stripe.com/test_abc", "replore.cardzo.co.in"), "test links never on the live site");
  assert.ok(s.proUrlOk("https://buy.stripe.com/test_abc", "localhost"));
  // the owner's shipped copy
  assert.strictEqual(s.PRO_PRICE, "3.99 USD for your first month"); assert.strictEqual(s.PRO_PRICE_WAS, "8 USD");
  assert.strictEqual(s.PRO_PRICE_YEAR, "72 USD a year");
  assert.strictEqual(s.PRO_OFFER, "Sign-up offer: your first month is 3.99 USD, then 8 USD a month. Cancel any time.");
  [s.PRO_PRICE, s.PRO_PRICE_WAS, s.PRO_PRICE_YEAR, s.PRO_OFFER].forEach(x => assert.ok(!/—/.test(x) && !/[\u{1F000}-\u{1FAFF}☀-➿]/u.test(x), x));
  // buttons: nothing while PRO_URL is empty; monthly only; both
  const M = "https://buy.stripe.com/mon01?prefilled_promo_code=FIRST399", Y = "https://buy.stripe.com/year01";
  assert.deepStrictEqual(s.proButtons(s.proConfig()), { on: false, month: null, year: null, offer: "" });
  let b = s.proButtons({ url: M, price: "3.99 USD for your first month", priceYear: "72 USD a year", was: "8 USD", offer: "" });
  assert.ok(b.on && b.month.href === M && b.month.label === "Get a key, " && b.month.price === "3.99 USD for your first month" && b.month.was === "8 USD");
  assert.strictEqual(b.year, null, "yearly button hidden without PRO_URL_YEAR"); assert.strictEqual(b.offer, "", "offer line hidden when empty");
  b = s.proButtons({ url: M, urlYear: Y, price: "p", priceYear: "72 USD a year", was: "", offer: "  Sign-up offer  " });
  assert.deepStrictEqual(b.year, { href: Y, label: "Yearly, 72 USD a year" }); assert.strictEqual(b.offer, "Sign-up offer"); assert.strictEqual(b.month.was, "");
  assert.strictEqual(s.proButtons({ url: M, urlYear: "https://evil.example/x", price: "p", priceYear: "y" }).year, null);
  assert.strictEqual(s.proButtons({ url: "https://evil.example/x", urlYear: Y }).on, false);
  // save trims and stores a Pro-shaped key; a bad paste never overwrites a good key; Remove clears it; the header follows
  LS.removeItem("replore.key");
  assert.ok(!("X-Replore-Plugin-Key" in s.proKeyHeader({})), "no key, no header");
  assert.ok(s.proKeySave("   " + GOOD + "  "));
  assert.strictEqual(LS.getItem("replore.key"), GOOD, "trimmed");
  assert.strictEqual(s.proKeyHeader({})["X-Replore-Plugin-Key"], GOOD, "header sent when stored");
  assert.ok(!s.proKeySave("") && !s.proKeySave("too short") && !s.proKeySave("REPLORE_1C285B2D-6CE6-4BC7-B8BE-ADB6A7E304DA"));
  assert.strictEqual(LS.getItem("replore.key"), GOOD, "a bad paste never overwrites a good key");
  // the key shown back, plus the plugin line
  assert.deepStrictEqual(s.proReveal(GOOD), { key: GOOD, env: "REPLORE_KEY=" + GOOD,
    hint: "For the plugin: in Claude Code, set it in your shell before you start claude; in an MCP config, add it as an env entry." });
  assert.strictEqual(s.proReveal(" " + GOOD + " ").key, GOOD);
  [null, "", "junk", "REPLORE_KEY=" + GOOD].forEach(v => assert.strictEqual(s.proReveal(v), null, String(v)));
  s.proKeyRemove();
  assert.strictEqual(LS.getItem("replore.key"), null);
  assert.ok(!("X-Replore-Plugin-Key" in s.proKeyHeader({})), "header gone after Remove key");
  // never in a URL, the feedback form or a log
  assert.ok(!/console\.(log|info|warn|error)\([^)]*(proKey|proReveal)/.test(code) && !/location[^;]*(proKey|proReveal)/.test(code));
  assert.ok(!/[?&](key|session_id)=/.test(coreCode));
  const fb = code.slice(code.indexOf("function feedbackPayload"), code.indexOf("function feedbackPayload") + 1200);
  assert.ok(!/replore\.key|proKey|PRO_KEY/.test(fb));
  console.log("pro window ok"); }
