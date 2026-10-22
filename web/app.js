// Replore web page logic (SPEC RS22). Moved out of index.html (RS49) so the Content-Security-Policy in web/_headers
// needs no 'unsafe-inline' for scripts. Loaded with `defer` after vendor/gsap.min.js, so GSAP is defined first (RS24).
"use strict";
// ---- license sets (mirror of scripts/scout.py; keep in sync) ----
var OPEN = new Set(["0BSD","AFL-3.0","AGPL-3.0","Apache-2.0","Artistic-2.0","BSD-2-Clause","BSD-3-Clause",
 "BSD-3-Clause-Clear","BSL-1.0","CC0-1.0","ECL-2.0","EPL-1.0","EPL-2.0","EUPL-1.1","EUPL-1.2","GPL-2.0",
 "GPL-3.0","ISC","LGPL-2.1","LGPL-3.0","MIT","MIT-0","MPL-2.0","MS-PL","MS-RL","NCSA","OFL-1.1","OSL-3.0",
 "PostgreSQL","Unlicense","UPL-1.0","Zlib"]);
var PERMISSIVE=new Set(["0BSD","AFL-3.0","Apache-2.0","Artistic-2.0","BSD-2-Clause","BSD-3-Clause",
 "BSD-3-Clause-Clear","BSL-1.0","CC0-1.0","ECL-2.0","ISC","MIT","MIT-0","MS-PL","NCSA","OFL-1.1","PostgreSQL",
 "Unlicense","UPL-1.0","Zlib"]);
var WEAK=new Set(["EPL-1.0","EPL-2.0","LGPL-2.1","LGPL-3.0","MPL-2.0","MS-RL"]);
var STRONG=new Set(["EUPL-1.1","EUPL-1.2","GPL-2.0","GPL-3.0"]);
var NETWORK=new Set(["AGPL-3.0","OSL-3.0"]);
var STARTER_TOPICS=new Set(["template","starter","starter-kit","starter-template","boilerplate"]);
var STARTER_MIN_SHARE=0.10, MAX_QUERIES=4, MAX_AGE_MONTHS=24;
// harmful descriptions always dropped (RS18)
var SVC="(whats ?app|instagram|facebook|snapchat|telegram|gmail|tiktok|email|wifi|someone'?s? account)";
var HARM=[new RegExp("hack(ing|er)?\\s+(of\\s+|a\\s+|an\\s+|the\\s+)?"+SVC,"i"),
 new RegExp(SVC+"\\s+(account\\s+)?(hack|hacking|hacker|cracker)","i"),/account takeover/i,
 /stalkerware|spyware/i,/credential stealer|password stealer|stealer\b/i,/\bkeygen|crack(ed)?\b/i,
 /\bddos\b/i,/game (cheat|hack)|aimbot|wallhack/i,/free (premium|robux|v-?bucks|coins) generator/i];
var HARM_INTENT=[/\bhack (into|someone|my (ex|girlfriend|boyfriend|wife|husband|partner))/i,
 /steal (passwords|accounts|credentials|data)/i,/spy on\b/i,/crack (paid|licensed) software/i,
 /take down (a )?(website|server|service)/i];

function lu(spdx){ if(PERMISSIVE.has(spdx))return"OK to use in a paid product";
 if(WEAK.has(spdx))return"OK in a paid product, but changes to its own files must stay open";
 if(STRONG.has(spdx))return"You must share your app's code if you give the app to others";
 if(NETWORK.has(spdx))return"You must share your code, even for a website or online service";
 return"No license: you may not reuse this code"; }
function freeText(spdx){ var u=lu(spdx);
 if(u.indexOf("OK to use")===0)return"Yes";
 if(u.indexOf("OK in a paid")===0)return"Yes, but changes to its files must stay open";
 if(u.indexOf("You must share")===0)return"Free to use, but you must share your code";
 return"No: no license"; }
function esc(s){var d=document.createElement("div");d.textContent=s==null?"":s;
  return d.innerHTML.replace(/"/g,"&quot;").replace(/'/g,"&#39;");}
function clean(s){ s=(s||"").replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g," ").trim();
  if(s.length<=200) return s;   // RS28f: long text ends at a word, with "…", never mid-word
  var cut=s.slice(0,199), sp=cut.lastIndexOf(" ");
  return (sp>140?cut.slice(0,sp):cut).replace(/[\s,.;:\-–—]+$/,"")+"…"; }
function kstars(n){return n>=1000?(n/1000).toFixed(n>=10000?0:1)+"k":""+n;}

var STOP=new Set("a an the my our your for to with and or of in on app apps application build building make making want really nice looking simple create please that helps people some something cool new project using use it by from first show as into about i ill i'll sell answers questions".split(" "));
var SYN={   // RS16: specific, live-checked phrases only — never a bare category ("frontend framework", "game framework")
 website:["landing page template","website template"], portfolio:["portfolio template","portfolio website"],
 game:["html5 game engine","phaser game"], diet:["calorie counter","nutrition tracker"],
 chatbot:["rag chatbot"], pdf:["chat with pdf"], dashboard:["admin dashboard template"], spreadsheet:["csv dashboard"],
 blog:["blog starter"], ecommerce:["ecommerce starter"], map:["maplibre","offline map tiles"],
 security:["vulnerable web application","web security training"], hacking:["vulnerable web application","web security training"],
 iphone:["swiftui app template"], habit:["habit tracker"], powerpoint:["pptx generate","presentation generator"]};

var GENERIC=new Set("website websites web site page webpage app application tool platform".split(" "));   // RS16a: the "shell", least specific
function kwWords(t){ return t.toLowerCase().replace(/[^a-z0-9 +#.]/g," ").split(/\s+/).filter(function(w){return w&&!STOP.has(w);}); }
function synFor(w){ return SYN[w]||(w.length>3&&/s$/.test(w)?SYN[w.slice(0,-1)]:null); }   // "maps" -> map
function keywordQueries(text, platform){
  var words=kwWords(text);
  var core=words.slice(0,3).join(" ").trim();   // GitHub ANDs every word: >3 words usually matches nothing
  // RS16a (same rule as the plugin skill): split the description into needs at "and" / "with" / "plus" / "&";
  // each specific need gets its own query first, feature expansions next, the generic shell ("website", "app") last
  var needs=text.toLowerCase().split(/\s+(?:and|with|plus|&)\s+/).map(kwWords).filter(function(n){ return n.length; });
  var specific=needs.filter(function(n){ return n.some(function(w){ return !GENERIC.has(w); }); });
  var qs=[], order=words;
  function add(q){ if(q && qs.length<MAX_QUERIES && qs.indexOf(q)<0) qs.push(q); }
  if(needs.length>1 && specific.length){
    specific.forEach(function(n){ var own=n.filter(function(w){ return !GENERIC.has(w); });
      if(n.length===1 && synFor(n[0])) return;   // a bare one-word need ("diet") is searched through its expansions instead
      add((own.length>1?own:n).slice(0,3).join(" ")); });   // a lone word keeps its shell: "landing page", not "landing"
    order=[].concat.apply([],specific).concat([].concat.apply([],needs.filter(function(n){ return specific.indexOf(n)<0; })));
  } else add(core);
  for(var i=0;i<order.length && qs.length<MAX_QUERIES;i++){ var ex=synFor(order[i]);
    if(ex) for(var j=0;j<ex.length;j++) add(ex[j]); }
  add(core);   // the whole description, as before, when there is room
  if(qs.length<2 && core) qs.push(core+" starter");
  var ex = platform==="ios"?" -topic:macos":""; // keep iOS off Mac apps
  return qs.slice(0,MAX_QUERIES).map(function(q){return (q+ex).trim();});
}

// ---- RS42 hybrid retrieval: lexical (BM25 vs the whole description) + semantic (server meaning scores), fused by RRF.
// Mirrors scripts/hybrid.py line for line; tests assert the same BM25 numbers in both (web and plugin stay in sync).
function lexTokens(t){ return String(t||"").toLowerCase().replace(/[^a-z0-9 +#.]/g," ").split(/\s+/)
  .filter(function(w){ return w && !STOP.has(w); }).map(function(w){ return w.length>3&&/s$/.test(w)?w.slice(0,-1):w; }); }
function repoText(name, desc, topics){ return [String(name||"").replace(/[\/\-_]/g," "), desc||"", (topics||[]).join(" ")].join(" "); }
function bm25Scores(query, docs){ var k1=1.2, b=0.75, toks=docs.map(lexTokens), n=toks.length; if(!n) return [];
  var avg=(toks.reduce(function(a,t){ return a+t.length; },0)/n)||1, df={};
  toks.forEach(function(t){ var u={}; t.forEach(function(w){ if(!u[w]){ u[w]=1; df[w]=(df[w]||0)+1; } }); });
  var q={}; lexTokens(query).forEach(function(w){ q[w]=1; });
  return toks.map(function(t){ var tf={}, s=0; t.forEach(function(w){ tf[w]=(tf[w]||0)+1; });
    Object.keys(q).forEach(function(w){ if(tf[w]){ var idf=Math.log(1+(n-df[w]+0.5)/(df[w]+0.5));
      s+=idf*tf[w]*(k1+1)/(tf[w]+k1*(1-b+b*t.length/avg)); } });
    return Math.round(s*1e6)/1e6; }); }
function rrfOrder(n, lists){ var fused=[], idx=[], i; for(i=0;i<n;i++){ fused.push(0); idx.push(i); }
  lists.forEach(function(sc){ var ord=idx.slice(); if(sc) ord.sort(function(a,b){ return (sc[b]-sc[a])||(a-b); });
    ord.forEach(function(it,rank){ fused[it]+=1/(60+rank+1); }); });
  return idx.sort(function(a,b){ return (fused[b]-fused[a])||(a-b); }); }
function hybridOrder(rows, description, sims){
  if(!rows.length || !String(description||"").trim()) return rows.slice();
  var lists=[null, bm25Scores(description, rows.map(function(r){ return repoText(r.name, r.desc, r.topics); }))];
  if(sims && sims.length===rows.length) lists.push(sims);
  return rrfOrder(rows.length, lists).map(function(i){ return rows[i]; }); }
function confirmQueries(names){ var out=[], cur="";   // live GitHub check for indexed repos, each search under 200 chars
  names.forEach(function(nm){ var part="repo:"+nm; if(cur && cur.length+1+part.length>200){ out.push(cur); cur=part; } else cur=(cur+" "+part).trim(); });
  if(cur) out.push(cur); return out; }

window.__runGen=0;   // search generation: resetAll() and each new search bump it (stale async results are dropped)
// RS2/RS4/RS4b: forks and archived repos out, and the staleness + star filters pushed into the search itself, so
// GitHub's best matches are repos that can pass. Same rule as scripts/scout.py build_query() (RS29b; shared cases in
// tests/fixtures/qualifier_cases.json): a qualifier the user typed is left alone; one that would pass GitHub's
// 256-character limit is dropped (keep() still filters); no AND/OR/NOT is ever added.
var GH_MAX_QUERY=256, PER_PAGE=50, REL_SPAN=20;   // RS4b page size; RS5 relevance span (same as scout.py)
function relTail(r){ return (r.rel||0)>=REL_SPAN?1:0; }   // RS5c: found only past the first 20 best matches -> after the head
function ghTyped(q, key){ return new RegExp("(?:^|\\s)-?"+key+":","i").test(q); }
function ghQuery(q, maxAgeMonths, minStars, now){
  var out=String(q||"").trim(), quals=[];
  [["fork","fork:false"],["archived","archived:false"],["is","is:public"]].forEach(function(p){ if(!ghTyped(out,p[0])) quals.push(p[1]); });
  if(maxAgeMonths>0 && !ghTyped(out,"pushed"))
    quals.push("pushed:>="+new Date((now==null?Date.now():now)-maxAgeMonths*30.44*864e5).toISOString().slice(0,10));
  if(minStars>0 && !ghTyped(out,"stars")) quals.push("stars:>="+minStars);
  quals.forEach(function(x){ if(out.length+1+x.length<=GH_MAX_QUERY) out+=" "+x; });
  return out;
}
async function search(q, minStars){
  // best-match (relevance) order seeds the fit ranking (RS2/RS5); stars are still in each result and weigh in RS5
  var url="https://api.github.com/search/repositories?q="+encodeURIComponent(minStars==null?ghQuery(q,0,0):ghQuery(q,MAX_AGE_MONTHS,minStars))
    +"&per_page="+PER_PAGE;   // RS4b: one page; the filters are already in q
  var r=await fetch(url,{headers:{"Accept":"application/vnd.github+json"}});
  var left=parseInt(r.headers.get("x-ratelimit-remaining"),10); window.__ghLeft=isNaN(left)?null:left;   // RS41: searches left this minute
  if(r.status===403||r.status===429) throw new Error("GitHub rate limit reached (10 searches/minute without a token). Wait a minute and try again.");
  if(r.status===422) throw new Error("GitHub rejected the search “"+q+"”. Use fewer words.");
  if(!r.ok) throw new Error("GitHub search failed (HTTP "+r.status+").");
  return (await r.json()).items||[];
}

function harmful(text){ for(var i=0;i<HARM_INTENT.length;i++) if(HARM_INTENT[i].test(text)) return true; return false; }
function harmfulRepo(desc){ for(var i=0;i<HARM.length;i++) if(HARM[i].test(desc)) return true; return false; }

function keep(items, minStars, platform, excluded, seen){
  seen = seen || {};  // name -> kept row (or null if seen but filtered out); shared across queries for RS5 rel
  var cutoff=Date.now()-MAX_AGE_MONTHS*30.44*864e5, out=[];
  for(var i=0;i<items.length;i++){ var it=items[i], name=it.full_name; if(!name) continue;
    var cname=clean(name);
    if(Object.prototype.hasOwnProperty.call(seen,cname)){ var prev=seen[cname];  // RS5: best (lowest) rel wins
      if(prev && i<prev.rel) prev.rel=i;
      continue; }
    seen[cname]=null;  // mark seen; set to the row below once it survives the filters
    if(it.fork||it.archived||it.disabled){excluded.fork++;continue;}
    var spdx=it.license&&it.license.spdx_id;
    if(!OPEN.has(spdx)){excluded.license++;continue;}
    var pushed=it.pushed_at?Date.parse(it.pushed_at):0;
    if(!pushed||pushed<cutoff){excluded.stale++;continue;}
    if((it.stargazers_count||0)<minStars){excluded.low++;continue;}
    var desc=clean(it.description);
    if(harmfulRepo(desc)){excluded.harm++;continue;}
    var topics=(it.topics||[]).map(function(t){return String(t).toLowerCase();});
    var starter=!!it.is_template||topics.some(function(t){return STARTER_TOPICS.has(t);});
    var row={name:cname,stars:it.stargazers_count||0,spdx:spdx,pushed:(it.pushed_at||"").slice(0,10),
      url:it.html_url||("https://github.com/"+name),desc:desc,starter:starter,rel:i,topics:topics.slice(0,8),forks:it.forks_count||0,
      lang:typeof it.language==="string"?it.language:""};   // RS53: picks the package ecosystem for the trust check
    out.push(row); seen[cname]=row;
  }
  return out;
}

// ---- fit ranking (RS5): relevant + popular + free to use at the top ----
// tie-break on most-recent push (ISO date strings sort lexically), matching scout.py's -_pushed before name
function cmpPushed(a,b){ var x=a.pushed||"", y=b.pushed||""; return x<y?1:(x>y?-1:0); }
function fitScore(r, preferStarters, floor){
  var relScore=1-Math.min(1,(r.rel||0)/REL_SPAN);                           // best-match position (RS2); top match = 1
  var starScore=Math.min(1,Math.log10((r.stars||0)+1)/5);             // log-scaled popularity (~100k stars = 1)
  var freeScore=PERMISSIVE.has(r.spdx)?1:(WEAK.has(r.spdx)?0.7:0.45); // permissive > weak copyleft > GPL/AGPL
  var bonus=(preferStarters && r.starter && r.stars>=floor)?0.08:0;   // RS15 starter nudge
  return 0.45*relScore+0.35*starScore+0.20*freeScore+bonus;
}
function rankByFit(lists, preferStarters){
  var all=[];
  for(var i=0;i<lists.length;i++){  // RS15: starter floor is per-query (that query's top repo), not global
    var floor=lists[i].reduce(function(m,r){return Math.max(m,r.stars);},0)*STARTER_MIN_SHARE;
    for(var j=0;j<lists[i].length;j++){ lists[i][j].fit=fitScore(lists[i][j],preferStarters,floor); all.push(lists[i][j]); }
  }
  all.sort(function(a,b){ return relTail(a)-relTail(b) || b.fit-a.fit || b.stars-a.stars || cmpPushed(a,b) || a.name.localeCompare(b.name); });
  return all;
}

// significant (non-stopword) words from what the user typed — used to explain the match
function sigTokens(text){ var out=[], seen={};
  (text||"").toLowerCase().replace(/[^a-z0-9 +#.]/g," ").split(/\s+/).forEach(function(w){
    if(w && w.length>1 && !STOP.has(w) && !seen[w]){ seen[w]=1; out.push(w); } });
  return out;
}
// one honest line on why a repo is in the list (whole-word keyword match, not AI understanding)
function whyRelevant(r, qtokens){
  if(r.whyText) return r.whyText;   // RS35: gallery cards say why they're listed (stars / forks), not a word match
  var words={}; ((r.name||"")+" "+(r.desc||"")).toLowerCase().replace(/[^a-z0-9 +#.]/g," ").split(/\s+/)
    .forEach(function(w){ if(w) words[w]=1; });  // match whole words, so "ai" never fires on "email"
  var hit=[];
  for(var i=0;i<(qtokens||[]).length && hit.length<3;i++) if(words[qtokens[i]]) hit.push(qtokens[i]);
  return hit.length ? 'Matches: '+hit.join(", ") : '';   // RS37: no generic filler line
}

// RS55: one hand-drawn line-icon set (16px grid, 1.6 stroke, currentColor) in place of emoji and symbol glyphs,
// which read as AI filler. Decorative: aria-hidden; every control keeps its text or aria-label.
var ICONS={
  x:'<path d="M4 4l8 8M12 4l-8 8"/>',
  check:'<path d="M3 8.6l3.1 3L13 4.6"/>',
  plus:'<path d="M8 3v10M3 8h10"/>',
  star:'<path d="M8 1.9l1.8 3.8 4.1.5-3 2.9.8 4.1L8 11.2l-3.7 2 .8-4.1-3-2.9 4.1-.5z"/>',
  fork:'<circle cx="4.5" cy="3.5" r="1.6"/><circle cx="11.5" cy="3.5" r="1.6"/><circle cx="8" cy="12.5" r="1.6"/><path d="M4.5 5.1v1.4c0 1.1.9 2 2 2h3c1.1 0 2-.9 2-2V5.1M8 8.5v2.4"/>',
  copy:'<rect x="5.5" y="5.5" width="8" height="8" rx="1.6"/><path d="M10.5 5.5V3.9c0-.8-.6-1.4-1.4-1.4H3.9c-.8 0-1.4.6-1.4 1.4v5.2c0 .8.6 1.4 1.4 1.4h1.6"/>',
  shield:'<path d="M8 1.8l5 1.9v3.9c0 3.2-2.1 5.6-5 6.6-2.9-1-5-3.4-5-6.6V3.7z"/><path d="M5.8 8l1.6 1.6 2.9-3"/>',
  alert:'<path d="M8 2.2l6 10.6H2z"/><path d="M8 6.6v2.9M8 11.2v.01"/>',
  ban:'<circle cx="8" cy="8" r="5.8"/><path d="M3.9 12.1l8.2-8.2"/>',
  sun:'<circle cx="8" cy="8" r="2.8"/><path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1"/>',
  moon:'<path d="M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8a5.6 5.6 0 1 0 6.8 6.8z"/>'
};
function ico(n,cls){ return '<svg class="ico'+(cls?' '+cls:'')+'" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor"'+
  ' stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">'+ICONS[n]+'</svg>'; }

// ---- card rendering (3D) ----
// one clear license verdict (replaces the redundant "Paid-use OK" + "Free" chips that both read "yes" for MIT)
function licenseVerdict(spdx){
  if(PERMISSIVE.has(spdx)) return {c:"t-good", i:"check", t:"Free for commercial use"};
  if(WEAK.has(spdx))       return {c:"t-good", i:"check", t:"Paid-use OK · changes stay open"};
  if(STRONG.has(spdx))     return {c:"t-warn", i:"alert", t:"Must open-source your app"};
  if(NETWORK.has(spdx))    return {c:"t-warn", i:"alert", t:"Share your code, even as a web app"};
  return {c:"t-warn", i:"ban", t:"No license — can't reuse"};
}
// RS24 result card helpers: owner initial tile (colour from the name, no image fetch) and "updated N ago"
function ownerHue(o){ var h=0; for(var k=0;k<o.length;k++) h=(h*31+o.charCodeAt(k))>>>0; return [14,24,32,198,152,268,340][h%7]; }
function agoText(d){ var t=Date.parse(d); if(!t) return ""; var days=Math.floor((Date.now()-t)/864e5);
  return days<1?"today":days<2?"yesterday":days<31?days+" days ago":days<365?Math.round(days/30)+" mo ago":Math.round(days/365)+" yr ago"; }
// RS51: "Explore" links — each tool takes the same owner/repo path as github.com; only a well-formed name gets links
var EXPLORE=[["Diagram","https://gitdiagram.com/","See the repo as an architecture diagram (GitDiagram)"],
  ["Digest","https://gitingest.com/","Turn the code into one text digest to paste into an AI chat (Gitingest)"],
  ["Wiki","https://deepwiki.com/","Read AI-written docs for the repo and ask it questions (DeepWiki)"],
  ["Browse","https://github1s.com/","Read the code in a VS Code-style viewer (GitHub1s)"],
  ["Edit","https://github.dev/","Open in github.dev, the web editor (sign in to GitHub)"]];
function validRepoName(name){ name=String(name||""); return /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/.test(name) && !/\/\.\.?$/.test(name); }
function exploreLinks(name){ if(!validRepoName(name)) return [];
  return EXPLORE.map(function(e){ return {label:e[0], url:e[1]+name, title:e[2]}; }); }
// RS53: "Safe to build on?" — fetched only when a visitor opens the row; display only, it never touches the rank (RX3)
var TRUST_LANGS={JavaScript:1,TypeScript:1,Python:1,Rust:1,Go:1,Ruby:1,"C#":1};   // the languages /api/trust maps to a package ecosystem
var INSTALL={npm:"npm install ",pypi:"pip install ",cargo:"cargo add ",go:"go get ",rubygems:"gem install ",nuget:"dotnet add package "};
var PKG_RE=/^[@A-Za-z0-9._\/~+-]{1,214}$/, VER_RE=/^[A-Za-z0-9.+_~-]{1,64}$/, ADV_RE=/^[A-Z][A-Z0-9]{1,15}-[A-Za-z0-9._:-]{1,60}$/, TAG_RE=/^[A-Za-z0-9._\/+@-]{1,80}$/;
function trustRow(r){ if(!validRepoName(r.name)) return "";
  return '<details class="trust" data-repo="'+esc(r.name)+'" data-spdx="'+esc(r.spdx||"")+'"'+(TRUST_LANGS[r.lang]===1?' data-lang="'+esc(r.lang)+'"':'')+'>'+
    '<summary>'+ico("shield")+'Safe to build on?</summary><div class="trust-body"></div></details>'; }
function installCmd(system,name){ return INSTALL.hasOwnProperty(system) && PKG_RE.test(String(name||"")) ? INSTALL[system]+name : ""; }
// RS53a: count = the page number of the Link header's rel="last" (per_page=1), else the items returned
function lastPage(link,n){ var m=/<[^>]*[?&]page=(\d+)[^>]*>;\s*rel="last"/.exec(link||""); return m ? +m[1] : (n|0); }
function ghShape(raw){ var c=raw.community||{}, rl=raw.release||{}, g=raw.gfi||{};
  var limited=[c,rl,g].some(function(x){ return x.s===403||x.s===429; });
  var f=c.s===200&&c.j&&c.j.files;
  var rel=rl.s===404?"none":(rl.s===200&&rl.j&&TAG_RE.test(String(rl.j.tag_name||""))&&/^\d{4}-\d{2}-\d{2}/.test(String(rl.j.published_at||""))?
    {tag:rl.j.tag_name, date:rl.j.published_at.slice(0,10)}:null);
  return {limited:limited, files:f?{readme:!!f.readme, contributing:!!f.contributing, coc:!!f.code_of_conduct}:null, release:rel,
    gfi:g.s===200&&Array.isArray(g.j)?lastPage(g.link,g.j.length):null}; }
function trustHtml(gh, tr, spdx, repo){
  var L=[], NA='<span class="mut">couldn\'t check</span>', yes=function(b,t){ return ico(b?"check":"x")+t+'<span class="sr-only">: '+(b?"yes":"no")+'</span>'; };   // RS56: the icon is aria-hidden; the words carry it
  var sc=tr&&tr.scorecard, pk=tr&&tr.package;
  if(sc&&sc.status==="ok") L.push('<b>Security health</b> '+esc(String(sc.score))+'/10'+(sc.maintained!=null?' · maintained '+esc(String(sc.maintained))+'/10':'')+
    ' · <a href="https://scorecard.dev/viewer/?uri=github.com/'+esc(repo)+'" target="_blank" rel="noopener noreferrer">OpenSSF Scorecard</a>');
  else L.push('<b>Security health</b> '+(sc&&sc.status==="none"?'<span class="mut">not scored by OpenSSF Scorecard yet</span>':NA));
  if(pk&&pk.status==="ok"&&PKG_RE.test(String(pk.name))&&VER_RE.test(String(pk.version))){
    var ids=(pk.advisories||[]).filter(function(id){ return ADV_RE.test(String(id)); }), n=Math.max(pk.advisoryCount|0, ids.length);
    L.push('<b>Known vulnerabilities</b> in '+esc(pk.name)+' '+esc(pk.version)+': '+(n===0?ico("check")+'none known':
      '<span class="t-warn-ink">'+ico("alert")+n+' known</span> — '+ids.map(function(id){ return '<a href="https://osv.dev/vulnerability/'+esc(id)+'" target="_blank" rel="noopener noreferrer">'+esc(id)+'</a>'; }).join(", ")+(n>ids.length?' …':'')));
    var cmd=installCmd(pk.system,pk.name);
    if(cmd) L.push('<b>Install</b> <code>'+esc(cmd)+'</code> <button type="button" class="trust-copy" data-cmd="'+esc(cmd)+'" title="Copy the command" aria-label="Copy the command">'+ico("copy")+'</button>');
    var lic=(pk.licenses||[]).filter(function(x){ return /^[A-Za-z0-9.+() -]{1,80}$/.test(String(x)); });
    if(lic.length && lic.indexOf(spdx)<0) L.push('<b>Package license</b> '+esc(lic.join(", "))+' <span class="mut">(the repo says '+esc(spdx||"none")+')</span>');
  } else if(pk&&pk.status==="none") L.push('<b>Package</b> <span class="mut">no published package matched this repo</span>');
  else if(!pk||pk.status==="error") L.push('<b>Known vulnerabilities</b> '+NA);
  if(gh&&gh.limited) L.push('<span class="mut">GitHub\'s hourly limit is used up — try again later</span>');
  else {
    L.push('<b>Beginner-friendly</b> '+(gh&&gh.files?[yes(gh.files.readme,"README"),yes(gh.files.contributing,"contributing guide"),yes(gh.files.coc,"code of conduct")].join(" · "):NA)+
      (gh&&gh.gfi!=null?' · '+gh.gfi+' good first issue'+(gh.gfi===1?'':'s'):''));
    L.push('<b>Latest release</b> '+(gh&&gh.release==="none"?'<span class="mut">no releases yet</span>':gh&&gh.release?esc(gh.release.tag)+', '+esc(agoText(gh.release.date)||gh.release.date):NA));
  }
  return '<ul>'+L.map(function(x){ return '<li>'+x+'</li>'; }).join("")+'</ul><p class="trust-note">For information — it doesn\'t change the ranking. '+
    'Sources: OpenSSF Scorecard, deps.dev, OSV.dev, GitHub.</p>'; }
var __trust={};   // RS53: answers kept in page memory per repo, so reopening a row costs nothing
async function ghTrust(repo){ var H={headers:{"Accept":"application/vnd.github+json"}}, base="https://api.github.com/repos/"+repo;
  function one(p){ return fetch(base+p,H).then(function(r){ return r.json().catch(function(){ return null; })
    .then(function(j){ return {s:r.status, j:j, link:r.headers.get("Link")}; }); }, function(){ return {s:0}; }); }
  var x=await Promise.all([one("/community/profile"), one("/releases/latest"), one("/issues?labels="+encodeURIComponent("good first issue")+"&state=open&per_page=1")]);
  return ghShape({community:x[0], release:x[1], gfi:x[2]}); }
function apiTrust(repo, lang){ return fetch("/api/trust?repo="+encodeURIComponent(repo)+(lang?"&lang="+encodeURIComponent(lang):""),{headers:{"Accept":"application/json"}})
  .then(function(r){ return r.ok?r.json():null; }).catch(function(){ return null; }); }
document.addEventListener("toggle",function(e){ var d=e.target;   // toggle doesn't bubble: listen in the capture phase
  if(!d||!d.classList||!d.classList.contains("trust")||!d.open) return;
  var body=d.querySelector(".trust-body"), repo=d.getAttribute("data-repo"), lang=d.getAttribute("data-lang")||"";
  if(!body||!validRepoName(repo)||body.getAttribute("data-done")) return;
  body.setAttribute("data-done","1"); body.innerHTML='<p class="mut">Checking…</p>';
  var key=repo+"|"+(TRUST_LANGS[lang]===1?lang:"");
  var p=__trust[key]||(__trust[key]=Promise.all([ghTrust(repo), apiTrust(repo, TRUST_LANGS[lang]===1?lang:"")]));
  p.then(function(x){ body.innerHTML=trustHtml(x[0],x[1],d.getAttribute("data-spdx")||"",repo);
    if(!x[1]||x[0].limited){ delete __trust[key]; body.removeAttribute("data-done"); } },   // a failed part retries on the next open
    function(){ delete __trust[key]; body.removeAttribute("data-done"); body.innerHTML='<p class="mut">Couldn\'t check right now.</p>'; });
},true);
document.addEventListener("click",function(e){ var b=e.target&&e.target.closest&&e.target.closest(".trust-copy"); if(!b) return;
  var t=b.getAttribute("data-cmd")||""; function ok(){ b.innerHTML=ico("check"); setTimeout(function(){ b.innerHTML=ico("copy"); },1400); }
  if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(ok,function(){});
});
function cardHtml(r,i,qtokens){
  var free=freeText(r.spdx), paid=lu(r.spdx), v=licenseVerdict(r.spdx);
  var okCom=v.c==="t-good"?1:0;   // one "free for commercial use" flag = the green verdict (permissive + weak copyleft)
  var parts=String(r.name).split("/"), owner=parts.length>1?parts[0]:"", repo=parts.length>1?parts.slice(1).join("/"):r.name;
  var tops=(r.topics||[]).filter(function(t){ return /^[a-z0-9][a-z0-9-]{0,30}$/.test(t); }).slice(0,3);
  return '<article class="rcard'+(i!=null&&i<3?' top'+(i+1):'')+'" data-com="'+okCom+'" data-starter="'+(r.starter?1:0)+'"'+(r.left?' data-left="1"':'')+'>'+
    '<div class="rc-head">'+
      '<span class="avatar" aria-hidden="true" style="--h:'+ownerHue(owner||repo)+'">'+esc((owner||repo).charAt(0).toUpperCase())+'</span>'+
      '<div class="rc-title">'+(owner?'<span class="owner">'+esc(owner)+' /</span>':'')+
        '<div class="name"><a href="'+esc(r.url)+'" target="_blank" rel="noopener" title="'+esc(r.name)+'">'+esc(repo)+'</a></div></div>'+
      (i!=null?'<span class="rank">#'+(i+1)+'</span>':'')+
    '</div>'+
    (function(xs){ return xs.length?'<nav class="explore" aria-label="Explore '+esc(r.name)+'">'+
      xs.map(function(x){ return '<a href="'+esc(x.url)+'" target="_blank" rel="noopener noreferrer" title="'+esc(x.title)+'">'+esc(x.label)+'</a>'; }).join("")+'</nav>':''; })(exploreLinks(r.name))+
    '<div class="rc-stats"><span class="stars">'+ico("star")+'<span class="cnt" data-v="'+r.stars+'">'+kstars(r.stars)+'</span></span>'+
      (r.forks?'<span class="forks" title="Forks">'+ico("fork")+kstars(r.forks)+'</span>':'')+
      (r.starter?'<span class="tag t-star" title="A ready-made template to start your project from">Starter</span>':'')+'</div>'+
    (function(w){ return w?'<div class="why">'+esc(w)+'</div>':''; })(whyRelevant(r,qtokens))+
    '<p class="desc">'+descHtml(r)+'</p>'+
    (tops.length?'<div class="topics">'+tops.map(function(t){ return '<span>#'+esc(t)+'</span>'; }).join("")+'</div>':'')+
    '<div class="meta">'+esc(r.spdx)+' · updated <span title="'+esc(r.pushed)+'">'+esc(agoText(r.pushed)||r.pushed)+'</span></div>'+
    trustRow(r)+
    '<div class="rc-foot">'+
      '<div class="tags"><span class="tag '+v.c+'" title="License: '+esc(r.spdx)+' · '+esc(paid)+' · Completely free? '+esc(free)+'">'+ico(v.i)+esc(v.t)+'</span></div>'+
      '<label class="pick"><input type="checkbox" class="pick-cb" data-name="'+esc(r.name)+'" data-url="'+esc(r.url)+
        '" data-desc="'+esc(r.desc||"")+'"><span class="pk-add">'+ico("plus")+'Add to plan</span><span class="pk-in">'+ico("check")+'In plan</span></label>'+
    '</div>'+
  '</article>';
}
// RS38: cards ease in when they scroll into view (not off-screen, where the animation would be missed)
var __reduceMotion=!!(window.matchMedia&&matchMedia("(prefers-reduced-motion:reduce)").matches);
var __rvIO=("IntersectionObserver" in window)?new IntersectionObserver(function(es){ es.forEach(function(e){
  if(!e.isIntersecting) return; var c=e.target; __rvIO.unobserve(c);
  c.classList.remove("rv-wait","reveal"); void c.offsetWidth; c.classList.add("reveal"); }); },{rootMargin:"0px 0px -30px 0px"}):null;
function queueReveal(c){ if(!__rvIO||__reduceMotion){ return; } c.classList.add("rv-wait"); __rvIO.observe(c); }
function inView(el){ var r=el.getBoundingClientRect(); return r.top<(window.innerHeight||800) && r.bottom>0; }
// RS47 odometer: one column of 0-9,0-9 per digit; it rolls a full turn and stops on the digit. Screen readers read
// the plain number (aria-label); when the roll ends, the plain text comes back so saved results stay simple.
function odometer(el, text, G, delay){
  if(!G || !/\d/.test(text||"")) return;
  var h=""; for(var k=0;k<text.length;k++){ var ch=text.charAt(k);
    if(/\d/.test(ch)){ var strip=""; for(var n=0;n<20;n++) strip+="<i>"+(n%10)+"</i>";
      h+='<span class="odo-col" aria-hidden="true"><span class="odo-strip" data-d="'+ch+'">'+strip+'</span></span>'; }
    else h+='<span aria-hidden="true">'+esc(ch)+'</span>'; }
  el.setAttribute("aria-label", text); el.setAttribute("data-odo","1"); el.innerHTML=h;
  var cols=el.querySelectorAll(".odo-strip"), left=cols.length;
  for(var c=0;c<cols.length;c++){ var d=+cols[c].getAttribute("data-d");
    G.fromTo(cols[c],{yPercent:0},{yPercent:-(10+d)*5, duration:1.1+c*.12, ease:"power3.out", delay:delay,
      onComplete:function(){ if(--left===0){ el.textContent=text; el.removeAttribute("data-odo"); } }}); }
}
function animateCards(container){
  var G=window.gsap, reduce=window.matchMedia&&matchMedia("(prefers-reduced-motion:reduce)").matches;
  attachTilt(container, reduce);
  var all=[].slice.call(container.querySelectorAll(".rcard")), now;
  all.forEach(function(c){ c.classList.remove("rv-wait"); });   // saved results may carry the class; never leave a card invisible
  if(!G||reduce) return;
  now=all.filter(inView);
  if(now.length) G.from(now,{opacity:0,y:18,rotateX:-8,duration:.5,stagger:.04,ease:"power3.out",transformOrigin:"50% 100%"});
  all.forEach(function(c){ if(now.indexOf(c)<0) queueReveal(c); });   // the rest ease in as they scroll into view
  // RS47: star counts roll in like an odometer (each digit spins a full turn and lands)
  container.querySelectorAll(".cnt").forEach(function(elc,i){ odometer(elc, elc.textContent, G, .1+Math.min(i,12)*.04); });
}
// pointer-reactive 3D tilt + glare (no library; skipped on touch / reduced motion)
function attachTilt(container, reduce){
  var hover=window.matchMedia&&matchMedia("(hover: hover)").matches;
  if(reduce || !hover) return;
  container.querySelectorAll(".rcard").forEach(function(card){
    card.addEventListener("mousemove",function(e){
      var b=card.getBoundingClientRect(), px=(e.clientX-b.left)/b.width, py=(e.clientY-b.top)/b.height;
      card.style.transform="perspective(900px) rotateX("+((0.5-py)*10).toFixed(2)+"deg) rotateY("+((px-0.5)*12).toFixed(2)+"deg) translateY(-4px)";   // RS47: deeper tilt
      card.style.setProperty("--mx",(px*100).toFixed(1)+"%");
      card.style.setProperty("--my",(py*100).toFixed(1)+"%");
    });
    card.addEventListener("mouseleave",function(){ card.style.transform=""; });
  });
}

var PLUGIN_CTA='<p class="cta-inline">MORE_LINENeed every match? <button type="button" class="link-btn" data-open="pluginModal">Use the plugin →</button></p>';

// result-side filter chips (filter the already-fetched cards, no new API calls — RS29)
// RS29d: one row. Each filter is an on/off switch (both can be on); none on = every result, so there is no "All" chip.
var RES_FILTERS=[["com","Free for commercial use"],["starter","Starters"]];
function resFlags(){ var f=window.__resFilter||"all"; return {com:f.indexOf("com")>=0, starter:f.indexOf("starter")>=0}; }
function filterBar(){ return '<div class="res-filter" role="group" aria-label="Filter results">'+
  RES_FILTERS.map(function(f){ return '<button type="button" class="rfilter" data-f="'+f[0]+'" aria-pressed="false">'+
    '<span class="rf-on">'+ico("check")+'</span>'+f[1]+'</button>'; }).join("")+
  '<button type="button" class="rsel" id="resSelAll" title="Tick every repo shown, for a build plan (RS28a)">Select all shown</button>'+
  '</div>'; }

function render(top, queries, excluded, totalMatches, qtokens, heading, note, gate){
  if(!top.length){ return '<div class="panel"><p class="err">No repository matched.</p>'+
    '<p class="mut">Searches: '+esc(queries.join("; "))+'. Try fewer or broader words, or lower the minimum stars.</p></div>'; }
  var more=(totalMatches||top.length)-top.length;   // >0 only if we hit the render cap (rare)
  var n=top.length;
  var h='<div class="res-head"><h2>'+(heading?esc(heading):'Top matches')+'</h2>'+
      '<span class="res-count mut">'+n+' result'+(n===1?'':'s')+'</span></div>'+
    (note?'<p class="res-note mut">'+note+'</p>':'')+  /* note is pre-built HTML: repo name already escaped, rest is our own markup */
    filterBar()+
    '<div class="grid">'+top.map(function(r,i){   // RS34: AI-dropped repos follow the kept ones under a quiet divider, shown automatically
      return (r.left && !(i && top[i-1].left) ? '<p class="left-div" hidden>Less likely to fit</p>' : '')+cardHtml(r,i,qtokens);}).join("")+'</div>'+
    '<div id="resEmpty" class="res-empty" hidden>No results match this filter. <button type="button" class="link-btn" id="resClear">Clear filter</button></div>'+
    '<div id="resMore" class="res-more-hint" aria-live="polite" hidden></div>'+   /* scroll sentinel: auto-reveals more (RS29) */
    '<details class="excl"><summary>How we searched</summary>Searches: '+esc(queries.join("; "))+'. Left out — not open-source: '+excluded.license+
    ', inactive: '+excluded.stale+', too few stars: '+excluded.low+', forks/archived: '+excluded.fork+
    ', harmful: '+excluded.harm+'.</details>';
  if(more>0) h+=PLUGIN_CTA.replace("MORE_LINE",
    more+" more passed the filters. ");
  else h+=PLUGIN_CTA.replace("MORE_LINE","");
  return h;
}
// show/hide result cards by the active filter + reveal-limit (client-side only, no API calls)
function applyResultFilter(){
  var out=document.getElementById("out"); if(!out || !out.querySelector(".res-filter")) return;  // only the top-matches view
  var cards=out.querySelectorAll(".rcard"), fl=resFlags(), limit=window.__resLimit||10, shown=0, matched=0;
  for(var i=0;i<cards.length;i++){ var c=cards[i];
    var ok = (!fl.com || c.getAttribute("data-com")==="1")
      && (!fl.starter || c.getAttribute("data-starter")==="1");   // RS29d: switches combine; RS34: left-out repos reveal last
    if(ok){ matched++; if(shown<limit){ if(c.style.display==="none"){ c.style.display=""; if(inView(c)){ c.classList.remove("reveal"); void c.offsetWidth; c.classList.add("reveal"); } else queueReveal(c); }
        c.style.display=""; shown++; } else c.style.display="none"; }
    else c.style.display="none";
  }
  var empty=out.querySelector("#resEmpty"); if(empty) empty.hidden = matched>0;
  var ld=out.querySelector(".left-div"); if(ld) ld.hidden = ![].some.call(out.querySelectorAll('.rcard[data-left="1"]'), function(c){ return c.style.display!=="none"; });
  var more=out.querySelector("#resMore");
  if(more){ if(matched>shown){ more.hidden=false; more.textContent="Showing "+shown+" of "+matched+" · scroll for more"; } else more.hidden=true; }
  var chips=out.querySelectorAll(".rfilter");
  for(var j=0;j<chips.length;j++){ var on=!!fl[chips[j].getAttribute("data-f")]; chips[j].classList.toggle("on",on); chips[j].setAttribute("aria-pressed",String(on)); }
  syncSelAll();
}
// "Select all shown" (RS28a): acts only on visible cards — respects the active filter and scroll-reveal
function shownPickBoxes(){ var out=document.getElementById("out"); if(!out) return [];
  return Array.prototype.filter.call(out.querySelectorAll(".rcard"),function(c){ return c.style.display!=="none"; })
    .map(function(c){ return c.querySelector(".pick-cb"); }).filter(Boolean); }
function syncSelAll(){ var b=document.getElementById("resSelAll"); if(!b) return;
  var bx=shownPickBoxes(), all=bx.length>0 && bx.every(function(x){ return x.checked; });
  b.textContent = all ? "Deselect shown" : "Select all shown ("+bx.length+")"; b.classList.toggle("on",all); b.hidden=!bx.length; }
// infinite scroll: no button — when the sentinel nears the viewport, reveal 10 more (cards are already fetched; no API call)
function checkMore(){ requestAnimationFrame(function(){ var s=document.querySelector("#out #resMore");
  if(s && !s.hidden && s.getBoundingClientRect().top < window.innerHeight+400) revealMore(); }); }
function revealMore(){ window.__resLimit=(window.__resLimit||10)+10; applyResultFilter(); checkMore(); }
function watchMore(){ var s=document.querySelector("#out #resMore"); if(!s) return;
  if(window.__moreObs) window.__moreObs.disconnect();
  if(!("IntersectionObserver" in window)){ window.__resLimit=9999; applyResultFilter(); return; }   // old browsers: show all
  window.__moreObs=new IntersectionObserver(function(es){
    for(var i=0;i<es.length;i++) if(es[i].isIntersecting){ revealMore(); break; } },{rootMargin:"0px 0px 400px 0px"});
  window.__moreObs.observe(s); }
function initResultFilter(){ window.__resFilter="all"; window.__resLimit=10; applyResultFilter(); watchMore(); checkMore(); }
// RS34: ask the same-origin function which repos don't fit; "off" when not set up, {fail} on any failure (fail open, silent)
// RS42: RAG wording appears only when the server says a RAG part is switched on (never claimed while it is off)
function ragRan(d){ return !!(d && d!=="off" && !d.fail && d.rag && (d.rag.meaning||d.rag.index)); }
function applyRagCopy(on){ document.querySelectorAll(".rag-only").forEach(function(el){ el.hidden=!on; });
  document.querySelectorAll(".rag-off").forEach(function(el){ el.hidden=!!on; }); }
fetch("/api/relevance",{method:"GET",cache:"no-store"}).then(function(r){ return r.ok?r.json():null; })
  .then(function(c){ window.__ragCfg=!!(c&&c.rag&&(c.rag.rerank===true||c.rag.index===true)); applyRagCopy(window.__ragCfg); }).catch(function(){});
// RS34c: Cloudflare Turnstile bot check, loaded from challenges.cloudflare.com only when the owner set a site key.
// Resolves null = no bot check configured; "" = no token (the function then refuses; the page shows keyword results).
// Every wait has a deadline so a stalled Cloudflare can never hang the search (RS7); a failed load is retried
// on the next search; token requests are queued so each search gets its own single-use token.
var __ts=null, __tsQ=Promise.resolve();
function tsDeadline(p,ms,v){ return Promise.race([p,new Promise(function(ok){ setTimeout(function(){ ok(v); },ms); })]); }
function loadTurnstile(){
  if(!__ts) __ts=tsDeadline((async function(){
      var c=await (await fetch("/api/relevance",{method:"GET",cache:"no-store"})).json();
      if(!c||typeof c.turnstile!=="string"||!c.turnstile) return {off:true};
      if(!window.turnstile) await new Promise(function(ok,no){ var s=document.createElement("script");
        s.src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"; s.async=true; s.onload=ok; s.onerror=no;
        document.head.appendChild(s); });
      return window.turnstile?{key:c.turnstile,id:null}:null;
    })().catch(function(){ return null; }),8000,null)
    .then(function(cfg){ if(!cfg) __ts=null; return cfg; });   // null = failed: try again next search
  return __ts;
}
function turnstileToken(){
  return loadTurnstile().then(function(cfg){
    if(cfg&&cfg.off) return null;
    if(!cfg) return "";
    var run=__tsQ.then(function(){ return new Promise(function(ok){
      var done=false, t=null, st=document.getElementById("status");
      function fin(tok){ if(done) return; done=true; clearTimeout(t); cfg.fin=cfg.arm=null; window.__tsInteractive=false; ok(tok||""); }
      function arm(ms){ clearTimeout(t); t=setTimeout(function(){ fin(""); },ms); }
      cfg.fin=fin; cfg.arm=arm; arm(8000);
      try{
        if(cfg.id==null) cfg.id=window.turnstile.render(document.getElementById("tsBox"),{sitekey:cfg.key,execution:"execute",
          appearance:"interaction-only",
          callback:function(tok){ cfg.fin&&cfg.fin(tok); },
          "error-callback":function(){ cfg.fin&&cfg.fin(""); },
          "before-interactive-callback":function(){ window.__tsInteractive=true; cfg.arm&&cfg.arm(90000);   // a person needs time to click
            if(st) st.textContent="Quick check: please confirm you\u2019re human below."; }});
        else window.turnstile.reset(cfg.id);   // tokens are single-use
        window.turnstile.execute(cfg.id);
      }catch(e){ fin(""); }
    }); });
    __tsQ=run.catch(function(){});
    return run;
  });
}
// RS41: the bot-check wait has its own 5 s deadline (re-armed while a person is solving an interactive challenge).
// TS_LATE marks a timeout; null still means "no bot check configured" and "" means "bot check failed".
var TS_LATE={late:true};
function tokenWithin(ms){ return new Promise(function(ok){ var done=false;
  turnstileToken().then(function(v){ if(!done){ done=true; ok(v); } },function(){ if(!done){ done=true; ok(""); } });
  (function tick(){ setTimeout(function(){ if(done) return; if(window.__tsInteractive) return tick(); done=true; ok(TS_LATE); },ms); })(); }); }
var AI_OFF_KEY="replore_ai_off_until";   // RS41: only a reset time, set when the daily AI allowance is used up
function aiOffUntil(){ try{ return +localStorage.getItem(AI_OFF_KEY)||0; }catch(_){ return 0; } }
async function relevanceGate(query, repos){
  if(Date.now()<aiOffUntil()) return {fail:true,error:"llm_daily_limit",resetsInSec:Math.ceil((aiOffUntil()-Date.now())/1000)};   // don't ask again until it resets
  if(window.__gateCtl) try{ window.__gateCtl.abort(); }catch(_){}   // a newer search supersedes the old check
  var tok=await tokenWithin(5000), hdr={"Content-Type":"application/json"};
  if(tok===TS_LATE) return {fail:true,error:"bot_check_slow"};
  if(tok) hdr["CF-Turnstile-Token"]=tok;
  var ctl=window.AbortController?new AbortController():null, timer=ctl&&setTimeout(function(){ ctl.abort(); },8000);
  window.__gateCtl=ctl;
  try{ var res=await fetch("/api/relevance",{method:"POST",headers:hdr,signal:ctl&&ctl.signal,
      body:JSON.stringify({query:String(query).slice(0,200),repos:repos.map(function(r){ return {name:r.name,description:(r.desc||"").slice(0,100),topics:(r.topics||[]).slice(0,5)}; })})});   // RS41: shorter = fewer tokens per check
    if(!res.ok){ var er={}; try{ er=await res.json()||{}; }catch(_){}   // read the body once
      if(res.status===404||res.status===405||res.status===501||(res.status===503&&er.error==="not_configured"))
        return "off";   // check not set up (no key / no function): behave as before, no note
      if(er.error==="llm_daily_limit" && +er.resetsInSec>0) try{ localStorage.setItem(AI_OFF_KEY, String(Date.now()+Math.min(+er.resetsInSec,86400)*1000)); }catch(_){}
      return {fail:true, error:er.error||("http_"+res.status), resetsInSec:+er.resetsInSec||0}; }   // RS34: say why, incl. when it resets
    var j=await res.json(); if(!Array.isArray(j.drop)) return {fail:true,error:"bad_reply"};
    var d=j.drop;   // RS42: meaning scores and indexed repos ride along only when the server has them switched on
    if(Array.isArray(j.sim) && j.sim.every(function(x){ return typeof x==="number"; })) d.sim=j.sim;
    if(Array.isArray(j.neighbors)) d.neighbors=j.neighbors.filter(function(x){ return x && typeof x.name==="string" &&
      /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(x.name) && typeof x.score==="number"; }).slice(0,8);
    if(j.rag && typeof j.rag==="object") d.rag={meaning:j.rag.meaning===true, index:j.rag.index===true};   // RS42b: what actually ran
    return d;
  }catch(e){ return {fail:true,error:e&&e.name==="AbortError"?"page_timeout":"network"}; } finally{ if(timer) clearTimeout(timer); if(window.__gateCtl===ctl) window.__gateCtl=null; } }

// RS21: ready-made prompts the user can click to fill the box.
var EXAMPLES=[
  {label:"Portfolio website with animations", text:"a portfolio website with smooth scroll animations", platform:"web", starters:"yes"},
  {label:"SaaS landing page (Next.js)", text:"landing page for my SaaS in Next.js, I'll sell it", platform:"web", starters:"yes"},
  {label:"First iPhone app", text:"my first iPhone app, a habit tracker", platform:"ios", starters:"yes"},
  {label:"Diet / calorie app", text:"a diet and calorie tracking app", platform:"", starters:"no"},
  {label:"Chatbot over my PDFs", text:"a chatbot that answers questions from my PDFs, Python", platform:"", starters:"no"},
  {label:"Dashboard from a spreadsheet", text:"dashboard to show my sales spreadsheet as charts", platform:"web", starters:"no"},
  {label:"2D browser game", text:"a simple 2D browser game engine for beginners", platform:"web", starters:"yes"},
  {label:"Offline maps for a trip planner", text:"offline maps for my trip planner app", platform:"", starters:"no"},
  {label:"Learn security safely", text:"learn web security by hacking a practice app", platform:"", starters:"no"},
  {label:"PowerPoint from notes", text:"generate PowerPoint decks from my notes", platform:"", starters:"no"}
];
// click an example → fill the form on the left, then search straight away (RS21)
function pickExample(ex){
  if(window.__busy) return;   // RS41: don't change the box under a search that's still running
  document.getElementById("q").value=ex.text;
  document.getElementById("platform").value=ex.platform;
  document.getElementById("starters").value=ex.starters;
  if(window.__growQ) window.__growQ();
  run();
}
function buildExamples(box){
  if(!box || box.dataset.built) return; box.dataset.built="1";
  EXAMPLES.forEach(function(ex,i){ var b=document.createElement("button"); b.type="button"; b.className="chip";
    b.textContent=ex.label; b.style.animationDelay=(i*35)+"ms";
    b.addEventListener("click",function(){ pickExample(ex); });
    box.appendChild(b); });
}
// quick-pick chips under the bar: click one to fill the box and search straight away (RS21)
var PILL_IDX=[0,1,2,4,5,6];   // portfolio, SaaS, iPhone, PDF chatbot, spreadsheet dashboard, 2D game
function buildQuickpicks(box){
  if(!box || box.dataset.built) return; box.dataset.built="1";
  EXAMPLES.forEach(function(ex,i){ if(PILL_IDX.indexOf(i)<0) return;   // RS37: six pills, not ten
    var b=document.createElement("button"); b.type="button"; b.className="chip";
    b.textContent=ex.label; b.style.animationDelay=(i*30)+"ms";
    b.addEventListener("click",function(){ pickExample(ex); });
    box.appendChild(b); });
}
buildQuickpicks(document.getElementById("quickpicks"));

// Tech-stack multi-select with autocomplete: type "py" → Python; pick several; value syncs to #stack
var TECHS=["Python","JavaScript","TypeScript","Java","C#","C++","Go","Rust","Ruby","PHP","Swift","Kotlin",
 "Dart","Scala","Elixir","HTML","CSS","SQL","Bash","React","Vue","Svelte","Angular","Next.js","Nuxt","Remix",
 "Astro","SolidJS","Tailwind","Bootstrap","Node.js","Express","Django","Flask","FastAPI","Rails","Laravel",
 "Spring",".NET","Flutter","React Native","Expo","Electron","Tauri","Unity","Godot","Postgres","MySQL",
 "MongoDB","Redis","SQLite","Supabase","Firebase","GraphQL","Prisma","Docker","Kubernetes","Terraform",
 "LangChain","PyTorch","TensorFlow"];
function setStack(v){ window.__stackSel=(v||"").split(/\s+/).filter(Boolean); if(window.__stackRender) window.__stackRender(); }
(function(){
  var input=document.getElementById("stackInput"), chipsEl=document.getElementById("stackChips"),
      menu=document.getElementById("stackMenu"), hidden=document.getElementById("stack"), wrap=document.getElementById("stackMS");
  if(!input||!chipsEl||!menu||!hidden) return;
  var sel=window.__stackSel||[], active=-1;
  function sync(){ hidden.value=sel.join(" "); }
  function render(){ chipsEl.innerHTML=sel.map(function(t,i){
      return '<span class="ms-chip">'+esc(t)+'<button type="button" data-i="'+i+'" aria-label="Remove '+esc(t)+'">×</button></span>'; }).join("");
    sync(); }
  window.__stackSel=sel; window.__stackRender=function(){ sel=window.__stackSel; render(); };
  function add(t){ t=(t||"").trim().slice(0,30); if(!t) return;
    if(!sel.some(function(s){return s.toLowerCase()===t.toLowerCase();})) sel.push(t);
    input.value=""; close(); render(); }
  function close(){ menu.hidden=true; menu.innerHTML=""; active=-1; }
  function open(){ var q=input.value.trim().toLowerCase();
    if(!q){ close(); return; }
    var opts=TECHS.filter(function(t){ return t.toLowerCase().indexOf(q)>=0 &&
        !sel.some(function(s){return s.toLowerCase()===t.toLowerCase();}); }).slice(0,8);
    if(!opts.length){ close(); return; }
    menu.innerHTML=opts.map(function(t){ return '<div class="ms-opt" data-t="'+esc(t)+'">'+esc(t)+'</div>'; }).join("");
    menu.hidden=false; active=-1; }
  function paint(){ var o=menu.querySelectorAll(".ms-opt"); for(var i=0;i<o.length;i++) o[i].classList.toggle("active",i===active); }
  chipsEl.addEventListener("click",function(e){ var b=e.target.closest&&e.target.closest("button"); if(!b) return;
    sel.splice(+b.getAttribute("data-i"),1); render(); input.focus(); });
  input.addEventListener("input",open);
  input.addEventListener("keydown",function(e){ var o=menu.querySelectorAll(".ms-opt");
    if(e.key==="ArrowDown"&&o.length){ e.preventDefault(); active=(active+1)%o.length; paint(); }
    else if(e.key==="ArrowUp"&&o.length){ e.preventDefault(); active=(active-1+o.length)%o.length; paint(); }
    else if(e.key==="Enter"){ e.preventDefault(); if(active>=0&&o[active]) add(o[active].getAttribute("data-t")); else if(input.value.trim()) add(input.value); }
    else if((e.key===","||e.key==="Tab")&&input.value.trim()){ if(input.value.trim()){ e.preventDefault(); add(input.value); } }
    else if(e.key==="Backspace"&&!input.value&&sel.length){ sel.pop(); render(); open(); }
    else if(e.key==="Escape"){ close(); } });
  menu.addEventListener("mousedown",function(e){ var o=e.target.closest&&e.target.closest(".ms-opt"); if(o){ e.preventDefault(); add(o.getAttribute("data-t")); } });
  document.addEventListener("click",function(e){ if(wrap && !wrap.contains(e.target)) close(); });
  wrap.addEventListener("click",function(e){ if(e.target===wrap||e.target===chipsEl) input.focus(); });
  render();
})();

// RS23: pull up to N short feature phrases from a PRD/spec (client-side only).
var PRD_MAX=6; // unauthenticated rate limit is ~10 searches/minute; keep headroom
function prdFeatures(text){
  var lines=text.split(/\r?\n/), feats=[];
  function add(p){ p=clean(p).toLowerCase().replace(/^[\-*\d.\)\s]+/,"").replace(/[^a-z0-9 +#]/g," ")
    .split(/\s+/).filter(function(w){return w&&!STOP.has(w);}).slice(0,4).join(" ").trim();
    if(p && feats.indexOf(p)<0) feats.push(p); }
  for(var i=0;i<lines.length;i++){ var l=lines[i].trim();
    if(/^([-*]|\d+[.)])\s+/.test(l) || /\b(must|shall|should|needs? to|able to|support)\b/i.test(l)) add(l); }
  if(feats.length<2) for(var j=0;j<lines.length && feats.length<PRD_MAX;j++){ var t=lines[j].trim();
    if(t && !/^#/.test(t)) add(t); }
  return feats.slice(0,PRD_MAX);
}

function renderGrouped(groups, excluded, note){
  var total=groups.reduce(function(n,g){return n+g.repos.length;},0);
  if(!total) return '<div class="panel"><p class="err">No repository matched for any feature.</p></div>';
  var h='<div class="res-head"><h2>Grouped by need</h2><span class="mut">'+total+' repos</span></div>'+
    '<p class="mut" style="margin:0 4px 8px">'+esc(note||"")+'</p>';
  groups.forEach(function(g){
    var gtokens=sigTokens(g.query);
    h+='<div class="group-h">'+esc(g.query)+' <span>('+g.repos.length+')</span></div>';
    if(!g.repos.length){ h+='<p class="mut" style="margin:0 4px">No match.</p>'; return; }
    h+='<div class="grid">'+g.repos.map(function(r){return cardHtml(r,null,gtokens);}).join("")+'</div>';
  });
  h+='<details class="excl"><summary>How we searched</summary>'+total+' open-source repos across '+groups.length+' needs. Left out — not open-source: '+
    excluded.license+', inactive: '+excluded.stale+', too few stars: '+excluded.low+', forks/archived: '+excluded.fork+
    ', harmful: '+excluded.harm+
    '. Every suitable match that passed the filters, grouped by the first search that found it — not every repo on GitHub.</details>'+
    PLUGIN_CTA;
  return h;
}

async function runFeatures(features, minStars, platform, preferStarters, out, st, gen){
  var ex2=platform==="ios"?" -topic:macos":"", stack=(document.getElementById("stack").value||"").trim().slice(0,40);
  var excluded={license:0,stale:0,low:0,fork:0,harm:0}, seen={}, groups=[];
  for(var i=0;i<features.length;i++){ think(st,"Searching feature "+(i+1)+"/"+features.length);
    var items=await search((features[i]+(stack?" "+stack:"")+ex2).trim(), minStars);
    if(gen!==window.__runGen) return;   // reset or a newer search happened: drop these results
    var kept=keep(items,minStars,platform,excluded,seen);  // shared seen map (RS5 cross-query rel), not a Set
    var floor=kept.reduce(function(m,r){return Math.max(m,r.stars);},0)*STARTER_MIN_SHARE;
    kept.forEach(function(r){ r.fit=fitScore(r,preferStarters,floor); });
    kept.sort(function(a,b){ return relTail(a)-relTail(b)||b.fit-a.fit||b.stars-a.stars||cmpPushed(a,b)||a.name.localeCompare(b.name); });
    groups.push({query:features[i],repos:kept});
  }
  out.innerHTML=renderGrouped(groups,excluded,
    "From your PRD (read on your device, never uploaded). Browser mode covers the first "+features.length+
    " features; the plugin reads them all.");
  animateCards(out); st.textContent=""; saveResults(); syncClearQ();
}

// "Find similar ones": accept owner/repo or a GitHub URL, look up its topics/language, search those (RS27)
function parseRepo(s){ s=(s||"").trim(); if(!s) return null;
  var m=s.match(/github\.com\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/i); if(m) return m[1].replace(/\.git$/,"");
  m=s.match(/^([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)$/); return m?m[1].replace(/\.git$/,""):null; }
async function repoMeta(full){
  var r=await fetch("https://api.github.com/repos/"+full,{headers:{"Accept":"application/vnd.github+json"}});
  if(r.status===404) throw new Error("Couldn't find “"+full+"” on GitHub. Use owner/repo, e.g. vercel/next.js.");
  if(r.status===403||r.status===429) throw new Error("GitHub rate limit reached (10/min without a token). Wait a minute.");
  if(!r.ok) throw new Error("GitHub lookup failed (HTTP "+r.status+").");
  return await r.json(); }
function altQueries(meta, platform){
  var qs=(meta.topics||[]).slice(0,3);
  if(qs.length<2){ var extra=keywordQueries((meta.description||meta.name||"")+" "+(meta.language||""), platform);
    for(var i=0;i<extra.length && qs.length<MAX_QUERIES;i++) if(qs.indexOf(extra[i])<0) qs.push(extra[i]); }
  if(!qs.length && meta.language) qs.push(meta.language);
  var ex = platform==="ios"?" -topic:macos":"";
  return qs.slice(0,MAX_QUERIES).map(function(q){return (q+ex).trim();}); }

// show the searching state right on the Find button (spinner + "Searching…"), restore when done
function setGoBusy(on){ var go=document.getElementById("go"); if(!go) return;
  document.body.classList.toggle("searching", !!on);   // RS24: search layout from the first moment, not after results
  if(on){ if(!go.dataset.label) go.dataset.label=go.innerHTML;
    go.innerHTML='<span class="spin" aria-hidden="true"></span><span class="go-lbl">Searching…</span>'; go.disabled=true; }
  else { if(go.dataset.label){ go.innerHTML=go.dataset.label; go.removeAttribute("data-label"); } go.disabled=false; }
}
async function run(){
  if(window.__busy) return;                 // ignore re-entry while a search is in flight (rapid quick-pick clicks)
  var text=document.getElementById("q").value.trim();
  var platform=document.getElementById("platform").value;
  var minStars=Math.max(0,parseInt(document.getElementById("minstars").value,10)||0);
  var preferStarters=document.getElementById("starters").value==="yes";
  var stack=(document.getElementById("stack").value||"").trim().slice(0,80);
  var like=(document.getElementById("like").value||"").trim();
  var st=document.getElementById("status"), out=document.getElementById("out"), go=document.getElementById("go");
  stopDemo("heroDemo"); out.innerHTML=""; if(window.__resetPicks) window.__resetPicks(); syncClearQ();
  if(!text && !like){ st.textContent="Type what you're building, or paste a repo to find similar ones."; return; }
  if(like && !text){   // similar-repo search needs words too, so results are narrowed to what you actually want (RS27a)
    st.textContent="Add a few words too — what kind of repos like this? e.g. “free ai call”, then Find.";
    var lq=document.getElementById("q"); if(lq){ lq.focus(); lq.scrollIntoView({block:"center"}); }
    return; }
  if(text.length>200){ st.textContent=""; out.innerHTML='<div class="panel"><p class="err">Too long — use a short sentence (max 200 characters).</p></div>'; return; }
  if(text && harmful(text)){ out.innerHTML='<div class="panel"><p class="err">I can’t help find tools for that.</p>'+
    '<p class="mut">For learning security on systems you own, try: "learn web security by hacking a practice app".</p></div>'; return; }

  var fresh=window.__fresh; window.__fresh=false;
  var hit=fresh?null:recentFind(recentLoad(), recentKey(recentFields()), Date.now());   // RS43 A: same search within the hour
  if(hit){ ++window.__runGen; out.innerHTML=hit.html; cleanCards(out);
    var mins=Math.max(1,Math.round((Date.now()-hit.t)/60000));
    st.innerHTML='Same search as '+mins+' min ago, so these are your saved results. '+
      '<button type="button" class="link-btn" data-action="search-again">Search again</button>';
    animateCards(out); initResultFilter(); saveResults(); syncClearQ(); return; }
  window.__busy=true; setGoBusy(true); st.textContent=""; window.__likeNote="";
  var gen=++window.__runGen;   // a reset or newer search bumps this; stale results are dropped
  try{
    var queries, heading=null, seen={}, qtok;
    if(like){
      var target=parseRepo(like);
      if(!target) throw new Error("Enter a repo as owner/repo or a GitHub link, e.g. vercel/next.js.");
      think(st,"Looking up "+target);
      var meta=await repoMeta(target);
      if(gen!==window.__runGen) return;
      queries=altQueries(meta,platform);
      if(!queries.length) throw new Error("That repo has no topics or description to search from.");
      if(!(meta.topics||[]).length && !text)   // no topics AND no typed words → note explains we matched on description; with text, the words drive the search so the note is moot (RS27a)
        window.__likeNote="“"+esc(clean(meta.full_name||target))+"” has no GitHub topics, so we matched on its description. "+
          "For matches based on what the repo actually does, the plugin reads the repo itself. "+
          "<button type=\"button\" class=\"link-btn\" data-open=\"pluginModal\">Use the plugin</button>";
      seen[clean(meta.full_name||target)]=null;  // exclude the original repo from the results (RS27)
      heading="Repos like "+(meta.full_name||target);
      if(text){  // combine: narrow the similar-repo search by the typed words (RS27a)
        queries=queries.map(function(q){return (q+" "+text).trim();});
        heading+=" · matching “"+text+"”";
      }
      qtok=sigTokens(queries.join(" ")+" "+text);  // highlight both the repo's topics and the typed words
    } else {
      queries=keywordQueries(text,platform); qtok=sigTokens(text);
    }
    if(stack) queries=queries.map(function(q){return (q+" "+stack).trim();});  // narrow to the chosen language/tech
    if(!queries.length) throw new Error("Couldn't build a search. Try different words.");
    var excluded={license:0,stale:0,low:0,fork:0,harm:0}, lists=[];
    for(var i=0;i<queries.length;i++){
      if(i>0 && window.__ghLeft!=null && window.__ghLeft<=1) break;   // RS41: keep the last call for the next search; fewer expansions, not a failure
      think(st,"Searching GitHub ("+(i+1)+"/"+queries.length+")");
      var items=await search(queries[i], minStars);
      if(gen!==window.__runGen) return;
      lists.push(keep(items,minStars,platform,excluded,seen)); }
    var ranked=rankByFit(lists,preferStarters), top=ranked.slice(0,60);  // sane upper bound; we no longer cap at 20
    var gate=null;
    if(top.length || window.__ragIndex!==false){ think(st,"Checking which repos fit");   // RS34 check on the top 30; RS42: an empty
      var drops=await relevanceGate(like?(text+" (similar to "+like+")"):text, top.slice(0,30));   // list still asks the index
      if(gen!==window.__runGen) return;
      if(window.__ragCfg) applyRagCopy(ragRan(drops));   // RS42b: claim "words and meaning" only when it ran for this search
      if(drops==="off"){ gate=null; window.__ragIndex=false; }
      else if(drops&&drops.fail){ gate={ok:false,error:drops.error,resetsIn:drops.resetsInSec}; }
      else if(drops){ var dropped={}; drops.forEach(function(d){ dropped[d.i]=1; });   // RS34: off-topic repos go to the end, shown
        var cut=top.slice(0,30);                                                        // after the kept ones, under "Less likely to fit"
        var keptRows=cut.filter(function(r,i){ return !dropped[i]; }), leftRows=cut.filter(function(r,i){ return dropped[i]; });
        if(drops.sim||drops.neighbors){   // RS42 hybrid (server switched on): same rule as scripts/scout.py
          var sims=null, simBy={};
          if(drops.sim&&drops.sim.length===cut.length){ sims=[]; cut.forEach(function(r,i){ simBy[r.name]=drops.sim[i]; }); }
          var nb=(drops.neighbors||[]).filter(function(x){ return !Object.prototype.hasOwnProperty.call(seen,x.name); }), score={};
          nb.forEach(function(x){ score[x.name.toLowerCase()]=x.score; });
          if(nb.length && !(window.__ghLeft!=null && window.__ghLeft<=1)){   // RS41: skip only when GitHub says we're nearly out
            try{ think(st,"Checking repos found by meaning");   // indexed repos (already AI-checked) count only once GitHub confirms them
              var found=(await search(confirmQueries(nb.map(function(x){ return x.name; }))[0]))
                .filter(function(it){ return it && score[String(it.full_name||"").toLowerCase()]!=null; });
              var conf=keep(found,minStars,platform,{license:0,stale:0,low:0,fork:0,harm:0},seen);   // not counted as "excluded"
              if(gen!==window.__runGen) return;
              conf.sort(function(a,b){ return score[b.name.toLowerCase()]-score[a.name.toLowerCase()]; });
              conf.forEach(function(r){ r.rel=10; r.whyText="Found by meaning, confirmed on GitHub"; keptRows.push(r); });
            }catch(_){}   // unconfirmed -> dropped (RS7); keyword results stand
          }
          if(sims) sims=keptRows.map(function(r){ var k=r.name.toLowerCase(); return simBy[r.name]!=null?simBy[r.name]:(score[k]!=null?score[k]:0); });
          keptRows=hybridOrder(keptRows, like?(text+" "+like):text, sims);
        }
        top=keptRows.concat(leftRows.map(function(r){ r.left=1; return r; }));
        gate={ok:true,hidden:drops.length}; } }
    out.innerHTML=render(top,queries,excluded,ranked.length,qtok,heading,window.__likeNote||"",gate);
    // RS34: no on-screen note about the AI check; its outcome is kept as an attribute for diagnosis only
    out.setAttribute("data-gate", !gate?"off":gate.ok?"ok:"+gate.hidden:String(gate.error||"fail").replace(/[^a-z0-9_]/gi,"").slice(0,40));
    animateCards(out); initResultFilter(); st.textContent=""; saveResults(); syncClearQ();
    try{ cleanCards(out); var now=Date.now(); recentSave(recentAdd(recentLoad(), { k:recentKey(recentFields()), v:CACHE_V, t:now, html:snapHtml(out) }, now)); }catch(_){}   // RS43 A
  }catch(e){ if(gen!==window.__runGen) return; st.textContent=""; out.innerHTML='<div class="panel"><p class="err">'+esc(e.message)+'</p></div>'; }
  finally{ if(gen===window.__runGen){ setGoBusy(false); window.__busy=false; } }
}
document.getElementById("go").addEventListener("click",run);
document.getElementById("prd").addEventListener("change",function(e){
  var f=e.target.files&&e.target.files[0]; if(!f) return;
  var st=document.getElementById("status"), out=document.getElementById("out"), go=document.getElementById("go");
  if(f.size>400000){ out.innerHTML='<div class="panel"><p class="err">That file is large; paste the key sections instead.</p></div>'; return; }
  var rd=new FileReader();
  rd.onload=async function(){ var text=String(rd.result||"");
    var features=prdFeatures(text);
    if(!features.length){ out.innerHTML='<div class="panel"><p class="err">Couldn’t find features in that file. Use bullet points or short requirement lines.</p></div>'; return; }
    var minStars=Math.max(0,parseInt(document.getElementById("minstars").value,10)||0);
    var platform=document.getElementById("platform").value, preferStarters=document.getElementById("starters").value==="yes";
    if(window.__busy){ e.target.value=""; return; }   // RS41: one search at a time
    window.__busy=true; setGoBusy(true); out.innerHTML=""; var gen=++window.__runGen;
    try{ await runFeatures(features,minStars,platform,preferStarters,out,st,gen); }
    catch(err){ if(gen===window.__runGen){ st.textContent=""; out.innerHTML='<div class="panel"><p class="err">'+esc(err.message)+'</p></div>'; } }
    finally{ if(gen===window.__runGen){ setGoBusy(false); window.__busy=false; } e.target.value=""; } };
  rd.onerror=function(){ out.innerHTML='<div class="panel"><p class="err">Could not read that file.</p></div>'; };
  rd.readAsText(f);
});
// Enter searches (like a real search bar); Shift+Enter adds a newline
document.getElementById("q").addEventListener("keydown",function(e){
  if(e.key==="Enter" && !e.shiftKey){ e.preventDefault(); run(); } });

// RS46: screen readers hear a short "N results" / the error line when #out is re-rendered, never the whole card list
// (#out itself is not a live region). A visually hidden status keeps the visible status line empty, so the phone
// layout's "no empty band" rule (RS24) still holds.
function resultSummary(out){ var n=out.querySelectorAll(".rcard").length;
  if(n) return n+" result"+(n===1?"":"s");
  var err=out.querySelector(".err"); return err?String(err.textContent||"").slice(0,160):""; }
(function(){ var out=document.getElementById("out"), sr=document.getElementById("srStatus"), t=null;
  if(!out||!sr||!window.MutationObserver) return;
  new MutationObserver(function(){ clearTimeout(t); t=setTimeout(function(){ var s=resultSummary(out);
    if(s){ sr.textContent=""; setTimeout(function(){ sr.textContent=s; },50); } },150); }).observe(out,{childList:true});
})();

// ---- modals ----
var __lastFocus=null;
function focusables(el){ return Array.prototype.slice.call(el.querySelectorAll(
    'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'))
    .filter(function(n){ return n.offsetParent!==null; }); }
function openModal(id){ var m=document.getElementById(id); if(!m) return;
  var already=document.querySelector(".modal.open");         // never stack modals: close any open one first
  if(already && already!==m){ already.classList.remove("open"); stopDemo("howDemo"); }
  else if(!already){ __lastFocus=document.activeElement; }   // remember opener (keep the original when switching modals)
  m.classList.add("open");
  if(id==="howModal"){ var hd=document.getElementById("howDemo"); buildDemo(hd); if(hd&&hd.__playDemo) hd.__playDemo(); }
  var focusId = id==="filtersModal" ? "stackInput" : (id==="likeModal" ? "like" : (id==="fbModal" ? "fbTitle" : null)), sheet=m.querySelector(".sheet");
  setTimeout(function(){ var f=focusId&&document.getElementById(focusId);
    if(!f){ var fs=focusables(sheet); f=fs[0]||sheet; } if(f&&f.focus) f.focus(); },30);
}
function closeModals(){ var any=false, m=document.querySelectorAll(".modal");
  for(var i=0;i<m.length;i++){ if(m[i].classList.contains("open")) any=true; m[i].classList.remove("open"); }
  stopDemo("howDemo");                                        // stop the Tour carousel when it closes
  if(any && __lastFocus && __lastFocus.focus){ __lastFocus.focus(); __lastFocus=null; }
}
// modal a11y: mark sheets as dialogs, label the × buttons, and trap Tab within the open modal
(function(){
  var sheets=document.querySelectorAll(".modal .sheet");
  for(var i=0;i<sheets.length;i++){ sheets[i].setAttribute("role","dialog"); sheets[i].setAttribute("aria-modal","true");
    var h2=sheets[i].querySelector("h2"), mid=sheets[i].parentNode&&sheets[i].parentNode.id;   // RS46: each dialog is named by its heading
    if(h2&&mid){ if(!h2.id) h2.id=mid+"Title"; sheets[i].setAttribute("aria-labelledby",h2.id); } }
  var xs=document.querySelectorAll(".modal .x"); for(var j=0;j<xs.length;j++) xs[j].setAttribute("aria-label","Close");
  document.addEventListener("keydown",function(e){ if(e.key!=="Tab") return;
    var open=document.querySelector(".modal.open"); if(!open) return;
    var sheet=open.querySelector(".sheet"), fs=focusables(sheet); if(!fs.length) return;
    var first=fs[0], last=fs[fs.length-1];
    if(e.shiftKey && document.activeElement===first){ e.preventDefault(); last.focus(); }
    else if(!e.shiftKey && document.activeElement===last){ e.preventDefault(); first.focus(); }
    else if(!sheet.contains(document.activeElement)){ e.preventDefault(); first.focus(); }
  });
})();
document.getElementById("pluginBtn").addEventListener("click",function(){ openModal("pluginModal"); });
// RS49: no inline onclick (the CSP allows no inline script); buttons name their modal in data-open, delegated here
document.addEventListener("click",function(e){ var t=e.target&&e.target.closest&&e.target.closest("[data-open],[data-action]"); if(!t) return;
  var m=t.getAttribute("data-open"); if(m){ e.preventDefault(); openModal(m); return; }
  if(t.getAttribute("data-action")==="search-again"){ e.preventDefault(); window.__fresh=true; run(); } });
// plugin-modal tabs: Claude Code vs any other agent (ARIA tab pattern: click, ←/→/Home/End, roving tabindex)
(function(){ var pm=document.getElementById("pluginModal"); if(!pm) return;
  function tabs(){ return Array.prototype.slice.call(pm.querySelectorAll(".tab")); }
  function select(t, focus){ var which=t.getAttribute("data-tab");
    tabs().forEach(function(b){ var on=b===t; b.classList.toggle("on",on); b.setAttribute("aria-selected",on?"true":"false"); b.tabIndex=on?0:-1; });
    pm.querySelectorAll(".tabpanel").forEach(function(p){ p.hidden = p.getAttribute("data-panel")!==which; });
    if(focus) t.focus(); }
  pm.addEventListener("click",function(e){ var t=e.target.closest&&e.target.closest(".tab"); if(t) select(t,false); });
  pm.addEventListener("keydown",function(e){ var t=e.target.closest&&e.target.closest(".tab"); if(!t) return;
    var all=tabs(), i=all.indexOf(t), n=all.length, j=null;
    if(e.key==="ArrowRight") j=(i+1)%n; else if(e.key==="ArrowLeft") j=(i-1+n)%n;
    else if(e.key==="Home") j=0; else if(e.key==="End") j=n-1;
    if(j!==null){ e.preventDefault(); select(all[j],true); } });
})();
// Filters chip and "Find similar repos" tile each open a popup window
document.getElementById("optsBtn").addEventListener("click",function(){ openModal("filtersModal"); });
// RS24: the two search modes are also in Filters, so they stay reachable when the intro is folded away
document.getElementById("fmLike").addEventListener("click",function(){ closeModals(); openModal("likeModal"); });
document.getElementById("fmPrd").addEventListener("click",function(){ closeModals(); });   // the label opens the file picker
// "Find similar →" in the modal runs the similar-repo search
(function(){ var go=document.getElementById("likeGo"), like=document.getElementById("like");
  if(go) go.addEventListener("click",function(){ closeModals(); run(); });
  if(like) like.addEventListener("keydown",function(e){ if(e.key==="Enter"){ e.preventDefault(); closeModals(); run(); } });
})();
// auto-grow the vibe bar as you type, up to its max-height
(function(){ var q=document.getElementById("q"); if(!q) return;
  function grow(){ q.style.height="auto"; q.style.height=Math.min(q.scrollHeight,120)+"px"; }
  q.addEventListener("input",grow); window.__growQ=grow; })();
// one-click copy on every command block (capture text before adding the button so the label isn't copied)
(function(){
  document.querySelectorAll(".cmd").forEach(function(pre){
    if(pre.dataset.copyReady) return; pre.dataset.copyReady="1";
    var text=pre.textContent;
    var b=document.createElement("button"); b.type="button"; b.className="copy"; b.textContent="Copy";
    b.addEventListener("click",function(e){ e.stopPropagation();
      function ok(){ b.textContent="Copied!"; setTimeout(function(){ b.textContent="Copy"; },1400); }
      if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(text).then(ok,ok); }
      else { try{ var ta=document.createElement("textarea"); ta.value=text; ta.style.position="fixed"; ta.style.opacity="0";
        document.body.appendChild(ta); ta.focus(); ta.select(); document.execCommand("copy"); document.body.removeChild(ta); ok(); }catch(err){} }
    });
    pre.appendChild(b);
  });
})();
document.getElementById("aboutBtn").addEventListener("click",function(){ openModal("aboutModal"); });
document.getElementById("trendBtn").addEventListener("click",function(){ showTrending("rising"); });
document.getElementById("trendHome").addEventListener("click",function(){ showTrending("rising"); });
document.getElementById("nextBtn").addEventListener("click",function(){ openModal("nextModal"); });
// RS39 feedback: sent to Cardzo through Web3Forms (public access key, emails hello@cardzo.co.in). Without a key,
// or if sending fails, the visitor is told plainly and offered the email-app link — never a fake "sent".
var WEB3FORMS_KEY="615d1716-7fa8-4f30-86a2-623fef081d11";   // owner's public Web3Forms access key (safe to publish; it only lets this form email Cardzo)
var FB_TYPES=["Bug","Feature request","Content issue","Other"], FB_TO="hello@cardzo.co.in";
function feedbackPayload(title, type, desc, email){
  title=String(title||"").trim().slice(0,120); if(!title) return null;
  if(FB_TYPES.indexOf(type)<0) type="Other";
  email=String(email||"").trim().slice(0,120); if(email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) email="";
  var p={access_key:WEB3FORMS_KEY, subject:"[Replore] ["+type+"] "+title, from_name:"Replore feedback", type:type,
    message:String(desc||"").trim().slice(0,2000)||"(no description)", botcheck:false};
  if(email) p.email=email;   // Web3Forms sets reply-to from it
  return p;
}
function feedbackUrl(title, type, desc){
  title=String(title||"").trim().slice(0,120); if(!title) return null;
  if(FB_TYPES.indexOf(type)<0) type="Other";
  var body="Type: "+type+"\n\n"+(String(desc||"").trim().slice(0,1500)||"(no description)")+"\n\n-- Sent from the Replore feedback form";
  return "mailto:"+FB_TO+"?subject="+encodeURIComponent("[Replore] ["+type+"] "+title)+"&body="+encodeURIComponent(body);
}
function openFeedback(){ document.getElementById("fbErr").hidden=true; openModal("fbModal"); }
document.getElementById("fbBtn").addEventListener("click",openFeedback);
document.getElementById("fbFab").addEventListener("click",openFeedback);
document.getElementById("fbTitle").addEventListener("input",function(){ document.getElementById("fbErr").hidden=true; });
document.getElementById("fbGo").addEventListener("click",function(){
  var $=function(id){ return document.getElementById(id); }, go=$("fbGo"), err=$("fbErr"), ok=$("fbOk");
  var t=$("fbTitle").value, ty=$("fbType").value, d=$("fbDesc").value, em=$("fbEmail").value;
  var p=feedbackPayload(t,ty,d,em); ok.hidden=true;
  if(!p){ err.textContent="Add a title first."; err.hidden=false; $("fbTitle").focus(); return; }
  if($("fbBot").checked){ ok.hidden=false; return; }   // honeypot ticked: a bot — pretend, send nothing
  function fallback(msg){ err.innerHTML=msg+' <a href="'+esc(feedbackUrl(t,ty,d))+'">Email it instead</a> (opens your email app).'; err.hidden=false; }
  if(!WEB3FORMS_KEY){ fallback("Sending from the page isn't set up yet."); return; }
  go.disabled=true; go.textContent="Sending…";
  fetch("https://api.web3forms.com/submit",{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify(p)})
    .then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ return r.ok && j && j.success; }); })
    .then(function(sent){ if(sent){ ok.hidden=false; err.hidden=true; $("fbTitle").value=""; $("fbDesc").value=""; }
      else fallback("Couldn't send just now."); },
      function(){ fallback("Couldn't send just now."); })
    .then(function(){ go.disabled=false; go.textContent="Send feedback"; });
});
document.getElementById("fbCopy").addEventListener("click",function(){ var b=this;
  try{ navigator.clipboard.writeText(FB_TO).then(function(){ b.textContent="Copied"; setTimeout(function(){ b.textContent="Copy address"; },1500); }); }catch(_){} });
document.querySelectorAll("[data-close]").forEach(function(b){ b.addEventListener("click",closeModals); });
document.querySelectorAll(".modal").forEach(function(m){ m.addEventListener("click",function(e){ if(e.target===m) closeModals(); }); });
document.addEventListener("keydown",function(e){ if(e.key==="Escape") closeModals(); });

// ---- select repos → hand a PRD prompt to the user's OWN Claude (RS28); no key, no model call here ----
(function(){
  var out=document.getElementById("out"), bar=document.getElementById("prdBar"),
      countEl=document.getElementById("prdCount"), goBtn=document.getElementById("prdGo"),
      clearBtn=document.getElementById("prdClear"), pre=document.getElementById("prdPrompt"),
      copyBtn=document.getElementById("prdCopy"), openLink=document.getElementById("prdOpen");
  if(!out||!bar) return;
  var picks=[];  // [{name,url,desc}] of ticked repos
  function idx(url){ for(var i=0;i<picks.length;i++) if(picks[i].url===url) return i; return -1; }
  function refresh(){ var n=picks.length; syncSelAll();
    if(n){ bar.removeAttribute("hidden"); countEl.textContent=n+" repo"+(n===1?"":"s")+" selected"; }
    else bar.setAttribute("hidden",""); }
  window.__resetPicks=function(){ picks=[]; refresh(); };
  // event delegation so it keeps working after results re-render
  out.addEventListener("change",function(e){ var cb=e.target;
    if(!cb||!cb.classList||!cb.classList.contains("pick-cb")) return;
    var url=cb.getAttribute("data-url"), i=idx(url);
    if(cb.checked){ if(i<0) picks.push({name:cb.getAttribute("data-name"),url:url,desc:cb.getAttribute("data-desc")}); }
    else if(i>=0) picks.splice(i,1);
    refresh(); });
  // result-filter chips + show-more + clear (delegated, survives re-render)
  out.addEventListener("click",function(e){ var t=e.target;
    var fb=t.closest&&t.closest(".rfilter");
    if(fb){ var fl=resFlags(), k=fb.getAttribute("data-f"); fl[k]=!fl[k];   // RS29d: a switch, tap again to turn it off
      window.__resFilter=(fl.com&&fl.starter)?"com+starter":fl.com?"com":fl.starter?"starter":"all";
      window.__resLimit=10; applyResultFilter(); checkMore(); return; }
    if(t.closest&&t.closest(".trend-tab")){ showTrending(t.closest(".trend-tab").getAttribute("data-trend")); return; }
    if(t.closest&&t.closest("#resClear")){ window.__resFilter="all"; window.__resLimit=10; applyResultFilter(); checkMore(); return; }
    if(t.closest&&t.closest("#resSelAll")){ var bx=shownPickBoxes(), all=bx.every(function(x){ return x.checked; });
      bx.forEach(function(x){ if(x.checked===all){ x.checked=!all; x.dispatchEvent(new Event("change",{bubbles:true})); } });
      syncSelAll(); } });
  function buildPrompt(){
    var q=(document.getElementById("q").value||"").trim() || "my project";
    var list=picks.map(function(r,i){ return (i+1)+". "+r.name+" — "+r.url+(r.desc?"\n   "+r.desc:""); }).join("\n");
    return "You are the principal architect for my vibe coding app, with 15+ years of experience building similar apps.\n\n"+   // RS28e
      "I'm building: "+q+"\n\n"+
      "Write a product requirements document (PRD) for it, built on these open-source GitHub repos:\n\n"+list+"\n\n"+
      "Not every repo above will fit (they came from a keyword search). First triage each one as USE, REFERENCE ONLY "+
      "or REJECT, with a one-line reason, and build only on the ones you USE.\n\n"+
      "Include: overview and goals; key features; which repo above covers each part (with its GitHub URL); "+
      "data model and APIs; non-goals; and open questions. Use only the repos listed — don't invent libraries, versions, or statistics. "+
      "If no repo above covers a feature, list it under GAPS instead of stretching a repo to fit.\n\n"+   // RS28c
      "If you have the Context7 MCP server, use it to read each USE repo's current docs before you pick versions or APIs.\n\n"+   // RS53e
      "Before you write anything: ask me 5 short questions that would most improve this plan, all in one numbered "+
      "message, then wait for my answers.";   // RS28d
  }
  if(clearBtn) clearBtn.addEventListener("click",function(){
    var cbs=out.querySelectorAll(".pick-cb"); for(var i=0;i<cbs.length;i++) cbs[i].checked=false;
    window.__resetPicks(); });
  if(goBtn) goBtn.addEventListener("click",function(){ if(!picks.length) return;
    var text=buildPrompt(); if(pre) pre.textContent=text;
    if(openLink){ var url="https://claude.ai/new?q="+encodeURIComponent(text);
      var tooLong=url.length>7500, note=document.getElementById("prdLong");
      // RS28g: too long for a pre-filled link -> the button stays, copies the prompt first, then opens the plain page
      linkMode(openLink, tooLong ? "https://claude.ai/new" : url, tooLong);
      var gpt=document.getElementById("prdGpt"), gurl="https://chatgpt.com/?q="+encodeURIComponent(text);   // RS28b
      if(gpt) linkMode(gpt, gurl.length>7500 ? "https://chatgpt.com/" : gurl, gurl.length>7500);
      var gn=document.getElementById("prdGemNote"); if(gn) gn.hidden=true;   // RS28g: one note for every copy-then-open
      if(note) note.hidden=!tooLong; }
    var many=document.getElementById("prdMany");   // RS28f: warn, never drop picks silently
    if(many){ many.hidden=picks.length<=10; var mn=document.getElementById("prdManyN"); if(mn) mn.textContent=picks.length; }
    openModal("prdModal"); });
  // RS28b/RS28g: copy BEFORE opening the tab: once the new tab has focus the browser refuses clipboard writes from this page
  function copyThenOpen(name, openUrl, why){ var text=pre?pre.textContent:"", gn=document.getElementById("prdGemNote");
    function say(ok){ if(!gn) return; gn.textContent=ok?"Prompt copied — paste it into "+name+why+".":"Couldn't copy automatically — tap the copy icon above, then paste into "+name+"."; gn.hidden=false; }
    var copied=false;
    try{ var ta=document.createElement("textarea"); ta.value=text; ta.setAttribute("readonly",""); ta.style.position="fixed"; ta.style.top="0"; ta.style.opacity="0";
      document.body.appendChild(ta); ta.select(); copied=document.execCommand("copy"); document.body.removeChild(ta); }catch(_){}
    if(copied) say(true);
    else if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function(){ say(true); },function(){ say(false); });
    else say(false);
    window.open(openUrl,"_blank","noopener"); }
  function linkMode(a, href, copyFirst){ a.removeAttribute("hidden"); a.href=href; if(copyFirst) a.setAttribute("data-copy-first","1"); else a.removeAttribute("data-copy-first"); }
  [["prdOpen","Claude"],["prdGpt","ChatGPT"]].forEach(function(p){ var a=document.getElementById(p[0]); if(!a) return;
    a.addEventListener("click",function(e){ if(a.getAttribute("data-copy-first")!=="1") return;   // short prompt: the pre-filled link opens as usual
      e.preventDefault(); copyThenOpen(p[1], a.href, " (the plan is too long to pre-fill)"); }); });
  var gemBtn=document.getElementById("prdGemini");   // RS28b: Gemini has no pre-fill link — copy, then open it
  if(gemBtn) gemBtn.addEventListener("click",function(){ copyThenOpen("Gemini","https://gemini.google.com/app"," (it has no pre-fill link)"); });
  if(copyBtn) copyBtn.addEventListener("click",function(){ var text=pre?pre.textContent:"";
    function ok(){ copyBtn.innerHTML=ico("check"); setTimeout(function(){ copyBtn.innerHTML=ico("copy"); },1400); }
    if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(text).then(ok,ok); }
    else { try{ var ta=document.createElement("textarea"); ta.value=text; ta.style.position="fixed"; ta.style.opacity="0";
      document.body.appendChild(ta); ta.focus(); ta.select(); document.execCommand("copy"); document.body.removeChild(ta); ok(); }catch(err){} } });
})();

// ---- the animated "How it works" explainer (the in-page video) ----
// RS36: hand-drawn step illustrations (inline SVG, theme colours via CSS vars) instead of emoji, which differ per OS
var ART={
  describe:'<svg viewBox="0 0 120 96" aria-hidden="true">'+
    '<ellipse cx="60" cy="88" rx="40" ry="5" fill="var(--line)" opacity=".7"/>'+
    '<rect x="14" y="14" width="80" height="56" rx="14" fill="var(--card)" stroke="var(--line)" stroke-width="2"/>'+
    '<path d="M30 70 l-4 14 l16 -14z" fill="var(--card)" stroke="var(--line)" stroke-width="2" stroke-linejoin="round"/>'+
    '<rect x="26" y="28" width="46" height="6" rx="3" fill="var(--accent)" opacity=".85"/>'+
    '<rect x="26" y="40" width="56" height="6" rx="3" fill="var(--line)"/><rect x="26" y="52" width="34" height="6" rx="3" fill="var(--line)"/>'+
    '<g transform="rotate(35 92 30)"><rect x="86" y="6" width="12" height="44" rx="3" fill="var(--accent)"/>'+
    '<path d="M86 50 h12 l-6 11z" fill="var(--ink)" opacity=".8"/><rect x="86" y="6" width="12" height="7" rx="3" fill="var(--accent2)"/></g></svg>',
  search:'<svg viewBox="0 0 120 96" aria-hidden="true">'+
    '<ellipse cx="60" cy="88" rx="40" ry="5" fill="var(--line)" opacity=".7"/>'+
    '<rect x="12" y="22" width="62" height="20" rx="6" fill="var(--card)" stroke="var(--line)" stroke-width="2"/>'+
    '<rect x="20" y="46" width="62" height="20" rx="6" fill="var(--card)" stroke="var(--line)" stroke-width="2"/>'+
    '<rect x="28" y="70" width="52" height="12" rx="6" fill="var(--card)" stroke="var(--line)" stroke-width="2"/>'+
    '<rect x="19" y="29" width="28" height="5" rx="2.5" fill="var(--line)"/><rect x="27" y="53" width="28" height="5" rx="2.5" fill="var(--line)"/>'+
    '<path d="M60 27.5l1.6 3.3 3.6.5-2.6 2.5.6 3.6-3.2-1.7-3.2 1.7.6-3.6-2.6-2.5 3.6-.5z" fill="var(--accent)"/>'+
    '<circle cx="82" cy="40" r="17" fill="var(--bg2)" fill-opacity=".55" stroke="var(--accent)" stroke-width="6"/>'+
    '<path d="M94 52 l14 14" stroke="var(--ink)" stroke-width="8" stroke-linecap="round" opacity=".85"/>'+
    '<path d="M74 33 a10 10 0 0 1 9 -3" stroke="#fff" stroke-width="3" stroke-linecap="round" fill="none" opacity=".8"/></svg>',
  rank:'<svg viewBox="0 0 120 96" aria-hidden="true">'+
    '<ellipse cx="60" cy="88" rx="44" ry="5" fill="var(--line)" opacity=".7"/>'+
    '<rect x="16" y="52" width="28" height="34" rx="5" fill="var(--card)" stroke="var(--line)" stroke-width="2"/>'+
    '<rect x="46" y="34" width="28" height="52" rx="5" fill="var(--accent)"/>'+
    '<rect x="76" y="62" width="28" height="24" rx="5" fill="var(--card)" stroke="var(--line)" stroke-width="2"/>'+
    '<text x="60" y="68" text-anchor="middle" font-family="Anton,Impact,sans-serif" font-weight="400" font-size="20" fill="#fff">1</text>'+
    '<text x="30" y="76" text-anchor="middle" font-family="Anton,Impact,sans-serif" font-weight="400" font-size="16" fill="var(--muted)">2</text>'+
    '<text x="90" y="80" text-anchor="middle" font-family="Anton,Impact,sans-serif" font-weight="400" font-size="14" fill="var(--muted)">3</text>'+
    '<path d="M60 6l4.4 9 9.9 1.4-7.2 7 1.7 9.8L60 28.6l-8.8 4.6 1.7-9.8-7.2-7 9.9-1.4z" fill="var(--accent2)"/></svg>',
  plan:'<svg viewBox="0 0 120 96" aria-hidden="true">'+
    '<ellipse cx="60" cy="88" rx="38" ry="5" fill="var(--line)" opacity=".7"/>'+
    '<rect x="30" y="8" width="60" height="76" rx="8" fill="var(--card)" stroke="var(--line)" stroke-width="2"/>'+
    '<rect x="48" y="3" width="24" height="10" rx="4" fill="var(--accent)"/>'+
    '<g stroke-linecap="round" stroke-linejoin="round" fill="none">'+
    '<path d="M40 30 l4 4 l7 -8" stroke="var(--good)" stroke-width="3.5"/><path d="M40 48 l4 4 l7 -8" stroke="var(--good)" stroke-width="3.5"/></g>'+
    '<rect x="57" y="27" width="24" height="5" rx="2.5" fill="var(--line)"/><rect x="57" y="45" width="20" height="5" rx="2.5" fill="var(--line)"/>'+
    '<rect x="40" y="61" width="11" height="11" rx="3" fill="none" stroke="var(--accent)" stroke-width="2.5"/>'+
    '<rect x="57" y="64" width="24" height="5" rx="2.5" fill="var(--accent)" opacity=".7"/></svg>'
};
var STEPS=[
  {ico:ART.describe,t:"1 · Describe",d:"Say what you're building",doing:"Reading your idea"},
  {ico:ART.search,t:"2 · We search GitHub",d:"Open-source &amp; maintained",doing:"Searching GitHub"},
  {ico:ART.rank,t:"3 · Ranked by fit",d:"Relevant, popular &amp; free to use",doing:"Ranking by fit"},
  {ico:ART.plan,t:"4 · Build a plan",d:"Tick repos, get a build plan",doing:"Writing your plan"}
];
function buildSteps(host){
  if(!host || host.dataset.built) return;
  host.dataset.built="1";
  host.innerHTML='<div class="steps">'+STEPS.map(function(s){
    return '<div class="step"><div class="ico">'+s.ico+'</div><div class="t">'+s.t+'</div><div class="d">'+s.d+'</div></div>';
  }).join("")+'</div><div class="track"><div class="dot"></div></div>';
  playExplainer(host);
}
function playExplainer(host){
  var steps=host.querySelectorAll(".step"), dot=host.querySelector(".dot"), track=host.querySelector(".track");
  var G=window.gsap, reduce=window.matchMedia&&matchMedia("(prefers-reduced-motion:reduce)").matches;
  if(!G||reduce){ for(var i=0;i<steps.length;i++) steps[i].classList.add("on"); if(dot) dot.style.left="100%"; return; }
  function cycle(){
    var tl=G.timeline({onComplete:cycle});
    steps.forEach(function(s,i){
      tl.call(function(){ for(var k=0;k<steps.length;k++) steps[k].classList.toggle("on",k===i); },null,i*0.9+0.2);
      tl.to(dot,{left:(track.clientWidth*(i/(steps.length-1||1)))+"px",duration:0.8,ease:"power2.inOut"},i*0.9);
    });
    tl.to({},{duration:0.6});
  }
  cycle();
}

// home demo: a smooth carousel of the three steps, one bigger card at a time
function buildDemo(host){
  if(!host || host.dataset.built) return; host.dataset.built="1";
  host.innerHTML='<div class="demo-stage">'+STEPS.map(function(s,i){
    var title=s.t.replace(/^\d+\s*·\s*/,"");
    return '<div class="demo-card'+(i===0?' on':'')+'"><span class="num">'+(i+1)+'</span>'+
      '<div class="ico">'+s.ico+'</div><div class="t">'+title+'</div><div class="d">'+s.d+'</div></div>';
  }).join("")+'</div><div class="demo-foot"><span class="demo-think"></span><div class="demo-dots">'+STEPS.map(function(_,i){
    return '<button type="button" class="demo-dot'+(i===0?' on':'')+'" data-i="'+i+'" aria-label="Show step '+(i+1)+'"></button>';
  }).join("")+'</div></div>';
  var cards=host.querySelectorAll(".demo-card"), dots=host.querySelectorAll(".demo-dot"), cur=0, timer=null;
  var reduce=window.matchMedia&&matchMedia("(prefers-reduced-motion:reduce)").matches;
  function show(n){ cards[cur].classList.remove("on"); dots[cur].classList.remove("on");
    cur=(n+cards.length)%cards.length; cards[cur].classList.add("on"); dots[cur].classList.add("on");
    if(host.__onStep) host.__onStep(cur); }   // RS36: the thinking pill follows the card, one clock for both
  function stop(){ if(timer){ clearInterval(timer); timer=null; } }
  function play(){ stop(); if(!reduce && cards.length>1) timer=setInterval(function(){ show(cur+1); },2600); }   // room for the 0.9 s dissolve
  host.__stopDemo=stop; host.__playDemo=play;   // let the view/modal clear this timer so it can't leak
  for(var i=0;i<dots.length;i++){ (function(d){ d.addEventListener("click",function(){ show(+d.getAttribute("data-i")); play(); }); })(dots[i]); }
  host.addEventListener("mouseenter",stop); host.addEventListener("mouseleave",play);
  play();
}
// stop a carousel's interval (used before its host is replaced, or when the Tour modal closes)
function stopDemo(id){ var h=document.getElementById(id); if(h&&h.__stopDemo) h.__stopDemo(); }
// empty-state in the results panel: the animated demo carousel (home view)
// ---- RS35: trending gallery — three API-sorted lists, fetched only when opened, cached 30 min per tab ----
var TREND_TABS={rising:"Rising", stars:"Most stars", forks:"Most forks"};
var TREND_NOTE={
  rising:"Created in the last 30 days, most stars first.",
  stars:"The most-starred open-source repos on GitHub that are still maintained.",
  forks:"The most-forked open-source repos on GitHub that are still maintained."};
function trendingQuery(kind, now){
  if(kind==="stars") return {q:"stars:>10000", sort:"stars"};
  if(kind==="forks") return {q:"forks:>2000", sort:"forks"};
  var since=new Date((now||Date.now())-30*864e5).toISOString().slice(0,10);
  return {q:"created:>="+since+" stars:>50", sort:"stars"};
}
function slimItem(it){ return {full_name:it.full_name, fork:it.fork, archived:it.archived, disabled:it.disabled,
  license:it.license?{spdx_id:it.license.spdx_id}:null, pushed_at:it.pushed_at, stargazers_count:it.stargazers_count,
  forks_count:it.forks_count, description:it.description, topics:it.topics, is_template:it.is_template, html_url:it.html_url, language:it.language}; }
async function fetchTrending(kind){
  var key="replore_trend_"+kind, hit=null;
  try{ hit=JSON.parse(localStorage.getItem(key)||"null"); }catch(e){}   // public repo data only
  if(hit && hit.t>Date.now()-30*60e3 && Array.isArray(hit.items)) return {items:hit.items, q:hit.q};
  var tq=trendingQuery(kind);
  var url="https://api.github.com/search/repositories?q="+encodeURIComponent(tq.q+" fork:false archived:false is:public")
    +"&sort="+tq.sort+"&order=desc&per_page=50";
  var r=await fetch(url,{headers:{"Accept":"application/vnd.github+json"}});
  if(r.status===403||r.status===429) throw new Error("GitHub rate limit reached (10 searches/minute without a token). Wait a minute and try again.");
  if(!r.ok) throw new Error("GitHub search failed (HTTP "+r.status+").");
  var items=((await r.json()).items||[]).map(slimItem);
  try{ localStorage.setItem(key, JSON.stringify({t:Date.now(), q:tq.q, items:items})); }catch(e){}
  return {items:items, q:tq.q};
}
// RS45: GitHub gives some repos no description. Say so plainly (never "—", never an invented one).
var NO_DESC="No description on GitHub";
function hasDesc(r){ return !!String((r&&r.desc)||"").trim(); }
function descHtml(r){ return hasDesc(r)?esc(r.desc):'<span class="no-desc">'+NO_DESC+'</span>'; }
function trendRows(items, kind){
  var excluded={license:0,stale:0,low:0,fork:0,harm:0};
  var rows=keep(items,0,"",excluded,{});
  rows.sort(function(a,b){ return kind==="forks" ? (b.forks-a.forks || b.stars-a.stars) : (b.stars-a.stars || b.forks-a.forks); });
  rows.forEach(function(r){ r.whyText = kind==="forks" ? kstars(r.forks)+" forks"
    : kind==="rising" ? "New this month"+(r.forks?" · "+kstars(r.forks)+" forks":"") : kstars(r.forks)+" forks"; });
  return {rows:rows, excluded:excluded};
}
async function showTrending(kind){
  kind=TREND_TABS[kind]?kind:"rising";
  var gen=++window.__runGen; window.__busy=false; setGoBusy(false);
  if(window.__gateCtl) try{ window.__gateCtl.abort(); }catch(_){}   // RS41: a running AI check is no longer needed
  var out=document.getElementById("out"), st=document.getElementById("status");
  stopDemo("heroDemo"); think(st,"Loading trending repos");
  try{
    var got=await fetchTrending(kind); if(gen!==window.__runGen) return;
    var t=trendRows(got.items, kind);
    out.innerHTML=render(t.rows,[got.q],t.excluded,t.rows.length,[],"Trending on GitHub","",null);
    var bar=out.querySelector(".res-filter");   // RS29d: the list switcher opens the filter row, the note sits under it
    if(bar){ bar.insertAdjacentHTML("afterbegin",'<div class="trend-tabs" role="tablist" aria-label="Trending lists">'+
      Object.keys(TREND_TABS).map(function(k){ return '<button type="button" class="trend-tab'+(k===kind?' on':'')+'" data-trend="'+k+
        '" role="tab" aria-selected="'+(k===kind)+'">'+TREND_TABS[k]+'</button>'; }).join("")+'</div><span class="rf-sep" aria-hidden="true"></span>');
      bar.insertAdjacentHTML("afterend",'<p class="res-note mut trend-note">'+esc(TREND_NOTE[kind])+'</p>'); }
    out.setAttribute("data-gate","trending");
    animateCards(out); initResultFilter(); st.textContent=""; saveResults(); syncClearQ();
  }catch(e){ if(gen!==window.__runGen) return; st.textContent=""; out.innerHTML='<div class="panel"><p class="err">'+esc(e.message)+'</p></div>'; }
}
// RS36 thinking orb: a small dotted sphere in a pill ("Solving…"-style), used under the home demo and while searching
var THINK_DOTS='<span class="tdots" aria-hidden="true"><i>.</i><i>.</i><i>.</i><i>.</i></span>';
function thinkPill(text, extraClass){
  return '<span class="think'+(extraClass?' '+extraClass:'')+'"><canvas class="think-orb" aria-hidden="true"></canvas>'+
    '<span class="think-txt">'+esc(text)+'</span>'+THINK_DOTS+'</span>'; }
function startDotOrb(canvas){
  if(!canvas || !canvas.getContext || canvas.__orb) return; canvas.__orb=1;
  var ctx=canvas.getContext("2d"), pts=[], rows=13;
  for(var i=1;i<rows;i++){ var lat=Math.PI*i/rows, ring=Math.max(6,Math.round(26*Math.sin(lat)));   // latitude rings of dots
    for(var j=0;j<ring;j++){ var lon=2*Math.PI*j/ring; pts.push([Math.sin(lat)*Math.cos(lon), Math.cos(lat), Math.sin(lat)*Math.sin(lon)]); } }
  var reduce=matchMedia("(prefers-reduced-motion: reduce)").matches, rot=0, last=0, raf=0, visible=true;
  function draw(){
    var dpr=Math.min(2,window.devicePixelRatio||1), w=canvas.clientWidth||40, h=canvas.clientHeight||w;
    if(canvas.width!==Math.round(w*dpr)){ canvas.width=Math.round(w*dpr); canvas.height=Math.round(h*dpr); }
    ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,w,h);
    var ink=(getComputedStyle(document.documentElement).getPropertyValue("--ink")||"#222").trim();
    var R=Math.min(w,h)*0.46, cx=w/2, cy=h/2, cr=Math.cos(rot), sr=Math.sin(rot), t=0.38, ct=Math.cos(t), st=Math.sin(t);
    ctx.fillStyle=ink;
    for(var k=0;k<pts.length;k++){ var p=pts[k], x=p[0]*cr+p[2]*sr, z=-p[0]*sr+p[2]*cr, y=p[1]*ct-z*st, z2=p[1]*st+z*ct;
      var d=(z2+1)/2; ctx.globalAlpha=0.12+0.78*d*d;
      ctx.beginPath(); ctx.arc(cx+x*R, cy+y*R, (0.45+0.75*d)*Math.max(0.8,w/44), 0, 6.2832); ctx.fill(); }
    ctx.globalAlpha=1;
  }
  function frame(tm){
    if(!canvas.isConnected){ cancelAnimationFrame(raf); return; }   // pill removed: stop
    if(visible && !document.hidden){ rot+=(last?Math.min(50,tm-last):16)*0.0011; draw(); }
    last=tm; raf=requestAnimationFrame(frame);
  }
  draw(); if(reduce) return;   // one still frame
  if(window.IntersectionObserver) new IntersectionObserver(function(es){ visible=es[0].isIntersecting; }).observe(canvas);
  raf=requestAnimationFrame(frame);
}
// show the thinking pill in a status line (reused across steps of one search so the orb keeps spinning)
function think(st, text){
  if(!st) return; var t=st.querySelector(".think .think-txt");
  if(t){ t.textContent=text; return; }
  st.innerHTML=thinkPill(text,"think-sm"); startDotOrb(st.querySelector(".think-orb"));
}
function startHomeThinking(wrap, demoHost){
  if(!wrap) return; startDotOrb(wrap.querySelector(".think-orb"));
  var txt=wrap.querySelector(".think-txt"); if(!demoHost || !txt) return;
  demoHost.__onStep=function(i){ if(!txt.isConnected) return;          // dissolve the label with the card
    txt.style.opacity="0"; setTimeout(function(){ txt.textContent=(STEPS[i]&&STEPS[i].doing)||""; txt.style.opacity="1"; },350); };
}

// RS35 home carousel: top Rising repos, rotates itself, pauses on hover/focus/touch, still under reduced motion
// RS47 ticker separator: a git-branch mark (owner 2026-10-15: "change this with different icon"), single colour
var TAPE_ICON='<svg class="tape-ico" viewBox="0 0 16 16" aria-hidden="true"><circle cx="4" cy="3.5" r="2" fill="none" stroke="currentColor" stroke-width="1.6"/>'+
  '<circle cx="4" cy="12.5" r="2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="12" cy="5.5" r="2" fill="none" stroke="currentColor" stroke-width="1.6"/>'+
  '<path d="M4 5.5v5M12 7.5c0 2.5-3 3-6.6 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
function buildTrendCarousel(){
  var box=document.getElementById("trendCar"), ring=document.getElementById("tcarTrack"); if(!box||!ring) return;
  var spin=ring.querySelector(".tring-spin"), tape=box.querySelector(".ttape .run");
  fetchTrending("rising").then(function(got){
    var rows=trendRows(got.items,"rising").rows.filter(hasDesc).slice(0,12); if(rows.length<3) return;   // RS45: a showcase card must say what the repo does
    var card=function(r){ var v=licenseVerdict(r.spdx);
      return '<a class="tcard" href="'+esc(r.url)+'" target="_blank" rel="noopener" draggable="false">'+
        '<span class="tc-top"><span class="tc-name">'+esc(r.name)+'</span><span class="tc-stars">'+ico("star")+kstars(r.stars)+'</span></span>'+
        '<span class="tc-desc">'+esc(r.desc)+'</span>'+
        '<span class="tc-meta">'+esc(v.t||"")+(r.forks?' · '+kstars(r.forks)+' forks':'')+'</span></a>'; };
    spin.innerHTML=rows.map(card).join("");
    // RS47 ticker: the same names on a tape; written twice so the -50% loop has no seam
    if(tape){ var one=rows.map(function(r){ return '<span>'+esc(r.name)+'</span>'+TAPE_ICON; }).join(""); tape.innerHTML=one+one; }
    box.hidden=false;
    // RS47 trending ring: cards stand on a cylinder, each turned 360/N degrees, pushed out by the radius
    var cards=spin.querySelectorAll(".tcard"), n=cards.length, step=360/n, R=0, angle=0;
    function layout(){ var w=cards[0].offsetWidth||260; R=Math.round((w+26)/(2*Math.tan(Math.PI/n)));
      for(var i=0;i<n;i++) cards[i].style.transform="rotateY("+(i*step)+"deg) translateZ("+R+"px)"; paint(); }
    function paint(){   // tilt the ring 6deg toward you; lift it by R*sin(6deg) so the front cards stay centred in the band
      spin.style.transform="translate3d(0,"+(-R*0.1045).toFixed(1)+"px,"+(-R)+"px) rotateX(-6deg) rotateY("+angle.toFixed(2)+"deg)";
      for(var i=0;i<n;i++){ var f=Math.cos((i*step+angle)*Math.PI/180);   // 1 = facing you, -1 = behind
        cards[i].style.opacity=(0.25+0.75*Math.max(0,f)).toFixed(3);
        cards[i].tabIndex = f>0.6 ? 0 : -1; } }   // only cards facing you take keyboard focus
    layout(); window.addEventListener("resize",layout);
    // drag to turn; a drag never opens a card
    var dragging=false, moved=0, lastX=0;
    ring.addEventListener("pointerdown",function(e){ dragging=true; moved=0; lastX=e.clientX; });
    window.addEventListener("pointermove",function(e){ if(!dragging) return; var dx=e.clientX-lastX; lastX=e.clientX; moved+=Math.abs(dx); angle+=dx*0.25; paint(); });
    window.addEventListener("pointerup",function(){ dragging=false; });
    ring.addEventListener("click",function(e){ if(moved>6){ e.preventDefault(); moved=0; } },true);
    function face(i){ angle=-i*step; paint(); }
    ring.addEventListener("keydown",function(e){ if(e.key!=="ArrowLeft"&&e.key!=="ArrowRight") return; e.preventDefault();
      var cur=Math.round(-angle/step); face(cur+(e.key==="ArrowRight"?1:-1)); });
    spin.addEventListener("focusin",function(e){ var c=e.target.closest(".tcard"); if(c) face([].indexOf.call(cards,c)); });
    if(matchMedia("(prefers-reduced-motion: reduce)").matches) return;   // still, but drag and arrow keys work
    var paused=false, idle=null, onScreen=true, running=false, last=0;
    function pause(){ paused=true; clearTimeout(idle); }
    function resume(){ clearTimeout(idle); idle=setTimeout(function(){ paused=false; },2500); }
    ["mouseenter","focusin","pointerdown"].forEach(function(ev){ ring.addEventListener(ev,pause,{passive:true}); });
    ["mouseleave","focusout","pointerup"].forEach(function(ev){ ring.addEventListener(ev,resume,{passive:true}); });
    function turn(t){
      if(!onScreen || document.hidden || !ring.offsetParent){ running=false; last=0; return; }   // stop scheduling frames
      window.__tcarRaf=requestAnimationFrame(turn);
      var dt=last?Math.min(48,t-last):16; last=t;
      if(paused||dragging) return;
      angle-=dt*0.006; paint();                        // about one turn a minute
    }
    function start(){ if(running) return; running=true; last=0; cancelAnimationFrame(window.__tcarRaf); window.__tcarRaf=requestAnimationFrame(turn); }
    window.__tcarStart=start;
    if(window.IntersectionObserver) new IntersectionObserver(function(es){ onScreen=es[0].isIntersecting; if(onScreen) start(); }).observe(ring);
    document.addEventListener("visibilitychange",function(){ if(!document.hidden) start(); });
    start();
  }).catch(function(){});   // GitHub unreachable or rate-limited: no carousel, nothing else changes
}
(function(){ var go=function(){ buildTrendCarousel(); };
  if(window.requestIdleCallback) requestIdleCallback(go,{timeout:2500}); else setTimeout(go,800); })();
// RS24 mobile order: what it does (demo) → search → trending. Below 1000px the home demo moves above the search box;
// on wider screens it stays in the results column. Removed as soon as results replace the home screen.
var DEMO_MQ=window.matchMedia?matchMedia("(max-width: 999px)"):null;
function placeDemo(){
  var ex=document.querySelector(".explain"), slot=document.getElementById("demoSlot"), out=document.getElementById("out");
  if(!ex||!slot||!out) return;
  if(DEMO_MQ&&DEMO_MQ.matches){ if(ex.parentNode!==slot) slot.appendChild(ex); }
  else if(ex.parentNode!==out && !out.querySelector(".rcard, .group-h, .err")) out.appendChild(ex);
  [].forEach.call(ex.querySelectorAll(".demo-dot"),function(d){ d.tabIndex=(DEMO_MQ&&DEMO_MQ.matches)?-1:0; });   // search comes first for keyboards
}
if(DEMO_MQ){ try{ DEMO_MQ.addEventListener("change",placeDemo); }catch(e){ DEMO_MQ.addListener&&DEMO_MQ.addListener(placeDemo); } }
function showHome(){
  var oldSlot=document.getElementById("demoSlot"); if(oldSlot&&oldSlot.firstChild){ stopDemo("heroDemo"); oldSlot.innerHTML=""; }
  var out=document.getElementById("out");
  stopDemo("heroDemo");   // clear any previous carousel before replacing it
  out.innerHTML='<div class="explain">'+
    '<div id="heroDemo" class="demo"></div>'+
    '</div>';
  var hd=document.getElementById("heroDemo"); buildDemo(hd);
  var slot=hd&&hd.querySelector(".demo-think");   // RS36: the orb lives inside the demo card's footer — one component
  if(slot){ slot.id="homeThink"; slot.innerHTML=thinkPill(STEPS[0].doing); startHomeThinking(slot, hd); }
  placeDemo();
  if(window.__resetPicks) window.__resetPicks();
}
// remember the last results so a page refresh brings them back (cached locally, no new API call)
// RS44: the owner's Stripe Payment Link (public URL, no key). Empty = all tip elements stay hidden.
var TIP_URL="https://buy.stripe.com/eVq00meemaDj78k4zigrS00";
// RS44: a Stripe test-mode link (test_...) takes no real money, so it never shows on the live site; previews only.
var TIP_LIVE_HOSTS=["replore.cardzo.co.in","replore.pages.dev"];
function tipUrlOk(u, host){ u=String(u||"");
  if(!/^https:\/\/buy\.stripe\.com\/[A-Za-z0-9_\-]+$/.test(u)) return false;
  return !(/^https:\/\/buy\.stripe\.com\/test_/.test(u) && TIP_LIVE_HOSTS.indexOf(String(host||""))>=0); }
(function(){ if(typeof location==="undefined" || !tipUrlOk(TIP_URL, location.hostname)) return;
  document.querySelectorAll(".tip-link").forEach(function(a){ a.href=TIP_URL; });
  document.querySelectorAll(".tip-el").forEach(function(el){ el.hidden=false; }); })();
var LAST="findrepo_last", CACHE_V="14";   // 14: one filter row, no "All" chip (RS29d); 13: cards carry the trust row (RS53); 12: Wiki (DeepWiki) Explore button; 11: cards carry Explore links (RS51); 10: no inline onclick (RS49)  // bump when saved markup changes, so stale caches are dropped
// RS43 A: the visitor's own last 10 searches for 1 hour, in their browser only. Pure functions (tested) + thin wrappers.
var RECENT="replore_recent", RECENT_TTL_MS=3600000, RECENT_MAX=10;
function recentKey(f){ return JSON.stringify([String(f.q||"").trim().toLowerCase().replace(/\s+/g," "), f.platform||"", String(f.minstars||""),
  f.starters||"", String(f.stack||"").trim().toLowerCase(), String(f.like||"").trim().toLowerCase()]); }
function recentFind(list, key, now){ for(var i=0;i<(list||[]).length;i++){ var e=list[i];
  if(e && e.k===key && e.v===CACHE_V && now-e.t<RECENT_TTL_MS && e.html && e.html.indexOf("rcard")>=0) return e; } return null; }
function recentAdd(list, entry, now){ return [entry].concat((list||[]).filter(function(e){
  return e && e.k!==entry.k && e.v===CACHE_V && now-e.t<RECENT_TTL_MS; })).slice(0,RECENT_MAX); }
function recentLoad(){ try{ var d=JSON.parse(localStorage.getItem(RECENT)||"[]"); return Array.isArray(d)?d:[]; }catch(e){ return []; } }
function recentSave(list){ try{ localStorage.setItem(RECENT, JSON.stringify(list)); }catch(e){   // full: keep the newest half
  try{ localStorage.setItem(RECENT, JSON.stringify(list.slice(0,Math.ceil(list.length/2)))); }catch(_){} } }
function recentFields(){ return { q:document.getElementById("q").value, platform:document.getElementById("platform").value,
  minstars:document.getElementById("minstars").value, starters:document.getElementById("starters").value,
  stack:document.getElementById("stack").value, like:(document.getElementById("like")||{}).value||"" }; }
// strip any inline opacity/transform the animation left on cards, so the cache never stores invisible cards
function cleanCards(root){ var c=root.querySelectorAll(".rcard"); for(var i=0;i<c.length;i++){ c[i].style.opacity=""; c[i].style.transform=""; } }
// RS47: saved HTML comes from a copy, so a half-rolled odometer is saved as its plain number and the live one keeps rolling
function snapHtml(root){ var c=root.cloneNode(true), o=c.querySelectorAll('.cnt[data-odo="1"]');
  for(var j=0;j<o.length;j++){ o[j].textContent=o[j].getAttribute("aria-label")||o[j].textContent; o[j].removeAttribute("data-odo"); }
  var t=c.querySelectorAll("details.trust");   // RS53d: an opened trust panel is never saved — closed and emptied
  for(var k=0;k<t.length;k++){ t[k].removeAttribute("open"); var b=t[k].querySelector(".trust-body"); if(b){ b.innerHTML=""; b.removeAttribute("data-done"); } }
  return c.innerHTML; }
function saveResults(){ try{ var out=document.getElementById("out"); cleanCards(out);
  localStorage.setItem(LAST, JSON.stringify({ v:CACHE_V, html:snapHtml(out), q:document.getElementById("q").value,
    platform:document.getElementById("platform").value, minstars:document.getElementById("minstars").value,
    starters:document.getElementById("starters").value, stack:document.getElementById("stack").value })); }catch(e){} }
function clearSaved(){ try{ localStorage.removeItem(LAST); }catch(e){} }
function restoreResults(){
  var d; try{ d=JSON.parse(localStorage.getItem(LAST)||"null"); }catch(e){}
  // only restore a current-version cache that actually holds result cards; else fall back to the landing view
  if(!d || d.v!==CACHE_V || !d.html || d.html.indexOf("rcard")<0){ clearSaved(); return false; }
  document.getElementById("out").innerHTML=d.html;
  if(d.q!=null) document.getElementById("q").value=d.q;
  if(d.platform!=null) document.getElementById("platform").value=d.platform;
  if(d.minstars!=null) document.getElementById("minstars").value=d.minstars;
  if(d.starters!=null) document.getElementById("starters").value=d.starters;
  if(d.stack!=null) setStack(d.stack);
  var out=document.getElementById("out");
  cleanCards(out);   // ensure restored cards are visible even if an old cache baked in opacity:0
  document.getElementById("status").textContent="Restored your last results. Clear the search bar to start over.";
  animateCards(out); initResultFilter(); syncClearQ();
  return true;
}
if(!restoreResults()) showHome();
// Home: clicking the Replore logo clears results and returns to the start; Tour: the how-it-works walkthrough
// full reset: text, similar-repo, every filter, picked repos, results and cached search (search-bar clear button and logo)
function resetAll(){
  window.__runGen++; window.__busy=false; setGoBusy(false);   // abandon any in-flight search so it can't repaint later
  if(window.__gateCtl) try{ window.__gateCtl.abort(); }catch(_){}   // RS41: and stop its AI check
  clearSaved(); closeModals();
  ["q","like"].forEach(function(id){ var el=document.getElementById(id); if(el) el.value=""; });
  ["platform","starters"].forEach(function(id){ var el=document.getElementById(id); if(!el) return;
    var d=el.querySelector("option[selected]"); el.value = d ? d.value : (el.options[0]&&el.options[0].value); });
  var ms=document.getElementById("minstars"); if(ms) ms.value=ms.defaultValue;
  setStack(""); window.__resFilter="all"; window.__resLimit=10;
  var si=document.getElementById("stackInput"); if(si) si.value="";
  var sm=document.getElementById("stackMenu"); if(sm){ sm.hidden=true; sm.innerHTML=""; }
  document.getElementById("status").textContent=""; showHome();
  syncClearQ(); document.getElementById("q").focus();
}
function syncClearQ(){ var x=document.getElementById("clearQ"); if(!x) return;
  x.hidden = !((document.getElementById("q").value||"").trim() || (document.getElementById("like").value||"").trim()
    || document.querySelector("#out .rcard, #out .group-h, #out .err"));   // results on screen also count
  // RS24: with results on a single-column screen, fold the intro so the search bar sits right above the matches
  document.body.classList.toggle("has-results", !!document.querySelector("#out .rcard, #out .group-h"));
  document.body.classList.toggle("view-trending", !!document.querySelector("#out .trend-tabs"));   // RS35: no Rising twice
  var ds=document.getElementById("demoSlot");   // RS24: a demo moved above the search goes once results show
  if(ds && ds.firstChild && document.querySelector("#out .rcard, #out .group-h, #out .err")){ stopDemo("heroDemo"); ds.innerHTML=""; } }
(function(){ var brand=document.getElementById("brandHome"), x=document.getElementById("clearQ");
  if(brand){ brand.addEventListener("click",resetAll);
    brand.addEventListener("keydown",function(e){ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); resetAll(); } }); }
  if(x) x.addEventListener("click",resetAll);
  ["q","like"].forEach(function(id){ var el=document.getElementById(id); if(el) el.addEventListener("input",syncClearQ); });
})();
document.getElementById("tourBtn").addEventListener("click",function(){ openModal("howModal"); });

// mobile menu: the menu button toggles the nav dropdown; close on pick or outside click
(function(){ var tog=document.getElementById("navToggle"), nav=document.getElementById("nav");
  if(!tog||!nav) return;
  function close(){ nav.classList.remove("open"); tog.setAttribute("aria-expanded","false"); }
  tog.addEventListener("click",function(e){ e.stopPropagation();
    var open=!nav.classList.contains("open");
    nav.classList.toggle("open",open); tog.setAttribute("aria-expanded",open?"true":"false"); });
  nav.addEventListener("click",function(e){ if(e.target.closest(".nav-btn")) close(); });
  document.addEventListener("click",function(e){ if(!nav.contains(e.target)&&e.target!==tog) close(); });
  document.addEventListener("keydown",function(e){ if(e.key==="Escape") close(); });
})();

// typewriter headline (desktop + mobile); full text stays for no-JS / reduced motion

// ---- light / dark theme toggle (per-viewer convenience; falls back to system) ----
(function(){
  var btn=document.getElementById("theme"), root=document.documentElement, KEY="findrepo_theme";
  function sysDark(){ return window.matchMedia && matchMedia("(prefers-color-scheme:dark)").matches; }
  function current(){ return root.getAttribute("data-theme") || (sysDark()?"dark":"light"); }
  function paint(){ btn.innerHTML = ico(current()==="dark" ? "sun" : "moon"); }   // RS44a, RS55: line icons, never a colour emoji
  var saved; try{ saved=localStorage.getItem(KEY); }catch(e){}
  if(saved==="dark"||saved==="light") root.setAttribute("data-theme",saved);
  paint();
  btn.addEventListener("click",function(){
    var next=current()==="dark"?"light":"dark";
    root.setAttribute("data-theme",next);
    try{ localStorage.setItem(KEY,next); }catch(e){}
    paint();
  });
}());


// RS47 motion kit (owner request 2026-10-15): hero lines rise out of masks, magnetic buttons with rolling labels.
// Skipped under reduced motion; the magnet only with a mouse (fine pointer).
(function(){
  var G=window.gsap, reduce=window.matchMedia&&matchMedia("(prefers-reduced-motion:reduce)").matches;
  var fine=window.matchMedia&&matchMedia("(hover:hover) and (pointer:fine)").matches;
  // rolling label for the top-bar pills: the text part only (icons stay put)
  document.querySelectorAll(".nav .nav-btn").forEach(function(b){ b.setAttribute("data-magnet","");
    var t=null; for(var i=b.childNodes.length-1;i>=0;i--){ if(b.childNodes[i].nodeType===3 && b.childNodes[i].textContent.trim()){ t=b.childNodes[i]; break; } }
    if(!t) return; var label=t.textContent.trim(), r=document.createElement("span"); r.className="roll";
    r.innerHTML='<span></span><span aria-hidden="true"></span>'; r.firstChild.textContent=label; r.lastChild.textContent=label;
    b.replaceChild(r,t); });
  if(!G||reduce) return;
  var lines=document.querySelectorAll("#heroTitle .in");
  if(lines.length) G.from(lines,{yPercent:115,rotateX:-80,opacity:0,duration:1.6,ease:"expo.out",stagger:.12,delay:.1});
  if(!fine) return;
  document.querySelectorAll("[data-magnet]").forEach(function(el){
    var xTo=G.quickTo(el,"x",{duration:.9,ease:"elastic.out(1,0.35)"}), yTo=G.quickTo(el,"y",{duration:.9,ease:"elastic.out(1,0.35)"});
    el.addEventListener("pointermove",function(e){ var b=el.getBoundingClientRect();
      xTo((e.clientX-(b.left+b.width/2))*.35); yTo((e.clientY-(b.top+b.height/2))*.35); });
    el.addEventListener("pointerleave",function(){ xTo(0); yTo(0); }); });
}());

// hero entrance
(function(){
  var G=window.gsap, reduce=window.matchMedia&&matchMedia("(prefers-reduced-motion:reduce)").matches;
  if(!G||reduce) return;
  G.from(".topbar, .sub, .vibebar, .modes",{opacity:0,y:16,duration:.5,stagger:.07,ease:"power3.out"});
  G.from(".quickpicks .chip",{opacity:0,y:8,duration:.4,stagger:.03,delay:.3,ease:"power2.out"});
}());
