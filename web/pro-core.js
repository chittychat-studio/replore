// SPEC RS87, RS89, RS90: Replore Pro on the web, shared by index.html (the "Leo, Pro" window) and pro.html (/pro), so the
// buy links, prices and the key rules live in one place. A separate file because the CSP allows no inline script (RS49).
// The key stays in this browser (localStorage "replore.key"): never in a URL, a log or the feedback form.
"use strict";
// The owner's switches. PRO_URL empty = the Pro button and window stay hidden and /pro says keys are not on sale yet.
// PRO_URL / PRO_URL_YEAR: Stripe Payment Links (monthly / yearly), optionally with ?prefilled_promo_code=CODE.
// PRO_PRICE_WAS / PRO_PRICE_YEAR_WAS: an old price shown struck through before PRO_PRICE / PRO_PRICE_YEAR (empty = hidden).
// PRO_OFFER: one offer line (empty = hidden).
var PRO_URL="https://buy.stripe.com/cNifZk7PYeTzeAMd5OgrS02", PRO_URL_YEAR="https://buy.stripe.com/3cI7sO2vEdPv78kd5OgrS03?prefilled_promo_code=YEAR50";   // owner 2026-10-25   // the owner pastes the two Stripe Payment Links here (yearly with ?prefilled_promo_code=CODE)
var PRO_PRICE="8 USD a month", PRO_PRICE_WAS="", PRO_PRICE_YEAR="36 USD for your first year", PRO_PRICE_YEAR_WAS="72 USD",
  PRO_OFFER="Launch offer: pay yearly and your first year is half price, 36 USD instead of 72. Cancel any time.";   // owner's copy 2026-10-24; checked on Stripe 2026-10-25: YEAR50 makes the first year 36, then 72
// RS94: Stripe customer portal login link (Stripe dashboard, Settings, Billing, Customer portal), shown next to "Delete my account"
// so a signed-in user can cancel; empty = the page says to write to hello@cardzo.co.in instead.
var PRO_PORTAL_URL="";
function proPortalOk(u){ return /^https:\/\/billing\.stripe\.com\/p\/login\/[A-Za-z0-9_]{6,80}$/.test(String(u||"")); }
var PRO_KEY="replore.key", PRO_SHAPE=/^rp\.sub_[A-Za-z0-9_]{8,80}\.[0-9a-f]{16}$/;   // RS87: rp.<Stripe subscription id>.<signature>
var PRO_LIVE_HOSTS=["replore.cardzo.co.in","replore.pages.dev"];
// RS90: a one-time marker set when a buy link on this site is clicked, so /pro saves a claimed key on its own only after a
// checkout this browser started (a crafted /pro link carrying someone else's session can never replace a key). sessionStorage: this tab only,
// survives Stripe's redirect back, removed when /pro reads it.
var PRO_CHECKOUT="replore.checkout";
function proCheckoutMark(){ try{ var a=new Uint8Array(16); crypto.getRandomValues(a);
  sessionStorage.setItem(PRO_CHECKOUT,Array.prototype.map.call(a,function(b){ return ("0"+b.toString(16)).slice(-2); }).join("")); }catch(_){} }
function proCheckoutTake(){ var v=""; try{ v=sessionStorage.getItem(PRO_CHECKOUT)||""; sessionStorage.removeItem(PRO_CHECKOUT); }catch(_){}
  return /^[0-9a-f]{32}$/.test(v); }
var PRO_ENV_HINT="For the plugin: in Claude Code, set it in your shell before you start claude; in an MCP config, add it as an env entry.";
// RS89: a Stripe Payment Link only (same rule as the tip link, RS44), plus an optional prefilled promotion code; a test_
// link is refused on the live hosts
function proUrlOk(u, host){ u=String(u||"");
  if(!/^https:\/\/buy\.stripe\.com\/[A-Za-z0-9_\-]+(\?prefilled_promo_code=[A-Z0-9_\-]{1,30})?$/.test(u)) return false;
  return !(/^https:\/\/buy\.stripe\.com\/test_/.test(u) && PRO_LIVE_HOSTS.indexOf(String(host||""))>=0); }
function proKeyGet(){ try{ var k=String(localStorage.getItem(PRO_KEY)||"").trim(); return PRO_SHAPE.test(k)?k:""; }catch(_){ return ""; } }
// RS87: rides in the plugin-key header on /api/relevance only (same origin)
function proKeyHeader(h){ var k=proKeyGet(); if(k) h["X-Replore-Plugin-Key"]=k; return h; }
function proKeySave(v){ var k=String(v==null?"":v).trim();   // stored only if it has the Pro shape
  if(!PRO_SHAPE.test(k)) return false;
  try{ localStorage.setItem(PRO_KEY,k); }catch(_){ return false; }
  proKeyChanged();
  return proKeyGet()===k; }
function proKeyRemove(){ try{ localStorage.removeItem(PRO_KEY); }catch(_){} proKeyChanged(); }
// RS94: tells auth.js (sign-in box) that the saved key changed, so "Link my Pro key" shows or hides
function proKeyChanged(){ try{ document.dispatchEvent(new CustomEvent("replore-key")); }catch(_){} }
// pure: what the buy area shows. Nothing (on:false) until PRO_URL is a valid link; the yearly button only with PRO_URL_YEAR.
// Both buttons have the same shape (label, an optional struck-through "was" price, the price), so an offer can sit on either.
function proButtons(c, host){ c=c||{};
  if(!proUrlOk(c.url, host)) return {on:false, month:null, year:null, offer:""};
  return {on:true, month:{href:c.url, label:"Get a key, ", price:String(c.price||""), was:String(c.was||"").trim()},
    year:proUrlOk(c.urlYear, host)&&c.priceYear ? {href:c.urlYear, label:"Yearly, ", price:String(c.priceYear), was:String(c.wasYear||"").trim()} : null,
    offer:String(c.offer||"").trim()}; }
function proConfig(){ return {url:PRO_URL, urlYear:PRO_URL_YEAR, price:PRO_PRICE, priceYear:PRO_PRICE_YEAR, was:PRO_PRICE_WAS, wasYear:PRO_PRICE_YEAR_WAS, offer:PRO_OFFER}; }
// pure: the saved key shown back (so moving to another browser or the plugin is copy-paste), or null
function proReveal(k){ k=String(k==null?"":k).trim(); if(!PRO_SHAPE.test(k)) return null;
  return {key:k, env:"REPLORE_KEY="+k, hint:PRO_ENV_HINT}; }

// ---- DOM (browser only). p = id prefix: "pro" in the window, "pp" on /pro ----
function proBuyLabel(a, m){ a.textContent=""; a.appendChild(document.createTextNode(m.label));
  if(m.was){ var s=document.createElement("s"), sr=document.createElement("span"); sr.className="sr-only"; sr.textContent="was ";
    s.appendChild(sr); s.appendChild(document.createTextNode(m.was)); a.appendChild(s); a.appendChild(document.createTextNode(" ")); }
  a.appendChild(document.createTextNode(m.price)); }
function proCopy(input, btn){ if(!input||!btn) return; var t=input.value, done=function(){ btn.textContent="Copied"; setTimeout(function(){ btn.textContent="Copy"; },1600); };
  try{ if(navigator.clipboard&&navigator.clipboard.writeText){ navigator.clipboard.writeText(t).then(done,function(){ input.select(); }); return; } }catch(_){}
  try{ input.select(); if(document.execCommand("copy")) done(); }catch(_){} }
function proView(p){ var $=function(id){ return document.getElementById(p+id); }, r=proReveal(proKeyGet());
  var ed=$("Edit"), on=$("On"), inp=$("Key"), sh=$("Show"), env=$("Env");
  if(ed) ed.hidden=!!r; if(on) on.hidden=!r;
  if(inp){ inp.value=""; inp.removeAttribute("aria-invalid"); }
  if(sh) sh.value=r?r.key:""; if(env) env.value=r?r.env:""; var kb=$("KeyBox"); if(kb&&r) kb.open=true; }
function proMount(p, host){ var $=function(id){ return document.getElementById(p+id); }, b=proButtons(proConfig(), host);
  var buy=$("Buy"), yr=$("Year"), off=$("Offer");
  if(buy){ if(b.month){ buy.href=b.month.href; proBuyLabel(buy,b.month); } buy.hidden=!b.month; }
  if(yr){ if(b.year){ yr.href=b.year.href; proBuyLabel(yr,b.year); } yr.hidden=!b.year; }
  if(off){ off.textContent=b.offer; off.hidden=!b.offer; }
  var c=proConfig(), pm=$("PlanM"), py=$("PlanY"), pw=$("PlanYWas");   // RS99: the plan cards show the same prices as the buttons
  if(pm) pm.textContent=c.price; if(py){ py.textContent=c.priceYear; var tg=py.parentNode.querySelector(".pro-plan-tag"); if(tg) tg.hidden=!c.offer; if(!c.offer) py.parentNode.classList.remove("pro-plan-on"); } if(pw) pw.textContent=c.wasYear?"Then "+c.wasYear+" a year. Cancel any time.":"Cancel any time.";
  if(buy) buy.addEventListener("click",proCheckoutMark);
  var cm=$("CardM"), cy=$("CardY");   // RS99: the plan cards are the buy buttons
  if(cm){ if(b.month) cm.href=b.month.href; cm.hidden=!b.month; cm.addEventListener("click",proCheckoutMark); }
  if(cy){ if(b.year) cy.href=b.year.href; cy.hidden=!b.year; cy.addEventListener("click",proCheckoutMark); }
  if(yr) yr.addEventListener("click",proCheckoutMark);
  var have=$("Have"), form=$("Form"), rm=$("Remove"), cp=$("Copy"), ecp=$("EnvCopy");
  if(have) have.addEventListener("click",function(){ proView(p); var i=$("Key"); if(i&&!i.closest("[hidden]")) i.focus(); });
  if(form) form.addEventListener("submit",function(e){ e.preventDefault(); var i=$("Key");
    if(proKeySave(i&&i.value)){ proView(p); var c=$("Copy"); if(c) c.focus(); }
    else if(i){ i.setAttribute("aria-invalid","true"); i.focus(); } });
  if(rm) rm.addEventListener("click",function(){ proKeyRemove(); proView(p); var i=$("Key"); if(i) i.focus(); });
  if(cp) cp.addEventListener("click",function(){ proCopy($("Show"),cp); });
  if(ecp) ecp.addEventListener("click",function(){ proCopy($("Env"),ecp); });
  proView(p);
  return b; }
