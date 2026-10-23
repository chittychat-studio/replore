// SPEC RS90: the /pro page. The "Leo, Pro" window as a page (wired by proMount in pro-core.js, ids prefixed "pp"), plus the
// claim state after a Stripe checkout: /pro?session_id=cs_... -> POST /api/pro/claim -> the key, saved in this browser.
// A separate file because the CSP allows no inline script (RS49). Text is set with textContent only.
"use strict";
var CLAIM_SESSION=/^cs_(live|test)_[A-Za-z0-9]{10,200}$/;
var CLAIM_REASONS={
  not_paid:"Stripe says this checkout is not paid yet, or its subscription is not active. If you just paid, wait a minute and try again.",
  not_pro:"This checkout is for another Cardzo product, not Replore Pro, so there is no Pro key for it.",
  unknown_session:"Stripe does not know this checkout. Check that the whole address from the payment page was opened.",
  bad_session:"This address does not carry a Stripe checkout, so there is no key to show.",
  rate_limited:"Too many tries from your connection. Wait a minute, then try again.",
  pro_off:"Getting a key is switched off on this site right now. Try again later, or write to hello@cardzo.co.in.",
  stripe_error:"Could not reach Stripe just now. Try again in a minute."
};
// pure: the session id from the address, or "" (then nothing is sent)
function claimSession(search){ var m=/[?&]session_id=([^&#]*)/.exec(String(search||"")), v="";
  try{ v=m?decodeURIComponent(m[1]):""; }catch(_){ v=""; }
  return CLAIM_SESSION.test(v)?v:""; }
// pure: the address without session_id (other parameters kept), for history.replaceState
function claimCleanUrl(path, search, hash){ var q=String(search||"").replace(/^\?/,"").split("&").filter(function(p){ return p && !/^session_id(=|$)/.test(p); });
  return String(path||"/pro")+(q.length?"?"+q.join("&"):"")+String(hash||""); }
// pure (RS90 security review): save the claimed key on its own only after a checkout this browser started (the marker
// from proCheckoutMark) and never over a different key already saved; otherwise ask
function claimDecision(hasNonce, storedKey, claimedKey){
  if(storedKey && storedKey===claimedKey) return "save";   // already this key: nothing changes
  if(!hasNonce || storedKey) return "ask";
  return "save"; }
var CLAIM_ASK_NEW="This key is not saved in this browser yet. Use it here if you just bought it, or copy it.";
var CLAIM_ASK_OTHER="This browser already has a different Pro key saved. It stays unless you choose this one.";
// pure: what the claim state says, from the reply's HTTP status and JSON body (null when it was not JSON or never came)
function claimView(status, body){
  var k=body&&typeof body.key==="string"?body.key:"";
  if(status===200 && PRO_SHAPE.test(k)){
    var r=body&&typeof body.renews==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(body.renews)?body.renews:"";
    return {ok:true, key:k, on:"Pro is on in this browser.", renews:r?"Your subscription renews on "+r+".":"",
      keep:"Keep this key somewhere safe: it is how you turn Pro on in another browser, and the plugin and MCP server read it as REPLORE_KEY.",
      env:"REPLORE_KEY="+k}; }
  var code=body&&typeof body.error==="string"?body.error:"";
  return {ok:false, reason:CLAIM_REASONS[code]||CLAIM_REASONS.stripe_error}; }

(function(){ if(typeof document==="undefined" || typeof location==="undefined" || !document.getElementById("ppMain")) return;
  var host=location.hostname, b=proMount("pp", host), $=function(id){ return document.getElementById(id); };
  var notSale=$("ppNotSale"); if(notSale) notSale.hidden=b.on;
  var id=claimSession(location.search), nonce=proCheckoutTake();   // the marker is used once, whatever happens next
  if(!/[?&]session_id=/.test(location.search)) return;
  try{ history.replaceState(null,"",claimCleanUrl(location.pathname,location.search,location.hash)); }catch(_){}
  var box=$("ppClaim"), msg=$("ppClaimMsg"), ok=$("ppClaimOk"), err=$("ppClaimErr"), retry=$("ppRetry");
  if(!box) return;
  box.hidden=false;
  function fail(v){ if(msg) msg.hidden=true; if(err){ err.textContent=v.reason; err.hidden=false; }
    if(retry && id){ retry.href="/pro?session_id="+encodeURIComponent(id); retry.hidden=false; } }
  if(!id) return fail(claimView(400,{error:"bad_session"}));
  if(msg){ msg.textContent="Getting your key from Stripe..."; msg.hidden=false; }
  fetch("/api/pro/claim",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({session_id:id})})
    .then(function(r){ return r.json().then(function(j){ return [r.status,j]; },function(){ return [r.status,null]; }); })
    .then(function(a){ var v=claimView(a[0],a[1]); if(!v.ok) return fail(v);
      var had=proKeyGet(), d=claimDecision(nonce, had, v.key), use=$("ppUse"), keep=$("ppKeepMine"), on=$("ppClaimOn");
      if(msg) msg.hidden=true;
      $("ppClaimKey").value=v.key; $("ppClaimEnv").value=v.env;
      $("ppClaimRenews").textContent=v.renews; $("ppClaimKeep").textContent=v.keep;
      if(d==="save"){ proKeySave(v.key); proView("pp"); on.textContent=v.on; }
      else { on.textContent=had?CLAIM_ASK_OTHER:CLAIM_ASK_NEW; if(use) use.hidden=false; if(keep&&had) keep.hidden=false;
        if(use) use.addEventListener("click",function(){ if(proKeySave(v.key)){ proView("pp"); on.textContent=v.on; use.hidden=true; if(keep) keep.hidden=true; } });
        if(keep) keep.addEventListener("click",function(){ box.hidden=true; }); }
      ok.hidden=false;
      var c=$("ppClaimCopy"); if(c){ c.addEventListener("click",function(){ proCopy($("ppClaimKey"),c); }); c.focus(); }
      var e=$("ppClaimEnvCopy"); if(e) e.addEventListener("click",function(){ proCopy($("ppClaimEnv"),e); }); })
    .catch(function(){ fail(claimView(0,null)); });
})();
