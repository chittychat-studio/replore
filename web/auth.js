// SPEC RS94: optional Google sign-in for Pro users (Firebase Authentication), on / (inside the "Leo, Pro" window) and
// on /pro, next to the Pro features only. Nothing free is behind it. Dormant until /api/auth/config says {"on": true};
// until then no sign-in UI renders and no Firebase file loads. The SDK (firebase-app + firebase-auth only, vendored,
// pinned) is loaded only on /pro, when the Pro window opens, or when this browser signed in before (the "replore.auth"
// hint). A separate file because the CSP allows no inline script (RS49). Text is set with textContent only.
"use strict";
var AUTH_HINT="replore.auth", AUTH_SDK="/vendor/firebase-12.19.0/", AUTH_PRO_FRESH_SEC=26*3600;
// pure: is this a usable config answer from /api/auth/config?
function authCfgOk(c){ return !!c && c.on===true && /^[A-Za-z0-9_-]{30,60}$/.test(String(c.apiKey||""))
  && /^[a-z0-9][a-z0-9-]{0,62}\.firebaseapp\.com$/.test(String(c.authDomain||"")) && /^[a-z][a-z0-9-]{4,38}[a-z0-9]$/.test(String(c.projectId||"")); }
// pure: Pro from the ID token's claims (set only by our server), the same rule the server uses
function authProFromClaims(c, nowSec){ return !!c && c.pro===true && /^sub_[A-Za-z0-9_]{8,80}$/.test(String(c.sub_id||""))
  && typeof c.checked_at==="number" && nowSec-c.checked_at<=AUTH_PRO_FRESH_SEC; }
var AUTH_REASONS={
  bad_key:"That key is not a Replore Pro key. Check it on the Pro page, then try again.",
  not_pro:"Stripe says this key's subscription is not active, so there is no Pro to link.",
  already_linked:"This Pro subscription is already linked to another Google account. Sign in with that one, or write to hello@cardzo.co.in.",
  stripe_error:"Could not reach Stripe just now. Try again in a minute.",
  auth_error:"Could not reach Google just now. Try again in a minute.",
  auth_off:"Sign-in is switched off on this site right now.",
  rate_limited:"Too many tries from your connection. Wait a minute, then try again.",
  not_signed_in:"Your sign-in has run out. Sign in again, then try again.",
  reauth:"To delete your account, confirm with Google once more.",
  popup:"Google's sign-in window did not open. Allow pop-ups for this site, or try again."
};
function authReason(code){ return AUTH_REASONS[code]||AUTH_REASONS.auth_error; }
// pure: what the sign-in box says. st = {user: null | {email}, pro, hasKey}
function authView(st){ st=st||{};
  if(!st.user) return {signedIn:false, lead:"Bought Pro? Sign in with Google to use it on any device, with no key to paste.",
    button:"Sign in with Google", link:false};
  var who=st.user.email?String(st.user.email):"your Google account";
  if(st.pro) return {signedIn:true, lead:"Pro is on for "+who+". Sign in with Google on any other device to use it there too.", link:false};
  return {signedIn:true, lead:"Signed in as "+who+". This account has no Pro yet."+(st.hasKey?" Link the key saved in this browser to it.":" Get a key here, then link it to this account."),
    link:!!st.hasKey, linkLabel:"Link my Pro key to this account"}; }
// pure: the warning next to "Delete my account" (RS94: deleting does not cancel Stripe)
function authDeleteNote(portalOk){
  return {text:"This deletes your sign-in and its Pro link. It does not cancel your Pro subscription: "+
    (portalOk?"cancel it in Stripe's customer portal.":"to cancel it, write to hello@cardzo.co.in."), portal:!!portalOk}; }
function authHintGet(){ try{ return localStorage.getItem(AUTH_HINT)==="1"; }catch(_){ return false; } }
function authHintSet(on){ try{ if(on) localStorage.setItem(AUTH_HINT,"1"); else localStorage.removeItem(AUTH_HINT); }catch(_){} }

// ---- runtime (browser only) ----
var AUTH={ready:null, fb:null, auth:null, user:null, pro:false, prefixes:[], msg:{}};
function authTimeout(p, ms){ return Promise.race([p, new Promise(function(ok){ setTimeout(function(){ ok(null); }, ms); })]); }
// The config, then the SDK. -> AUTH once the first sign-in state is known, or null (off, or it failed: no UI)
function authLoad(){
  if(AUTH.ready) return AUTH.ready;
  AUTH.ready=fetch("/api/auth/config",{method:"GET",cache:"no-store"}).then(function(r){ return r.ok?r.json():null; })
    .then(function(c){ if(!authCfgOk(c)) return null;
      return Promise.all([import(AUTH_SDK+"firebase-app.js"), import(AUTH_SDK+"firebase-auth.js")]).then(function(m){
        var app=m[0].initializeApp({apiKey:c.apiKey, authDomain:c.authDomain, projectId:c.projectId}, "replore");
        AUTH.fb=m[1]; AUTH.auth=m[1].getAuth(app);   // getAuth: IndexedDB persistence (RS94 item 3), popup and redirect support
        AUTH.fb.getRedirectResult(AUTH.auth).catch(function(){});
        return new Promise(function(ok){ var first=true;
          AUTH.fb.onAuthStateChanged(AUTH.auth,function(u){ AUTH.user=u||null;
            authSync().then(function(){ if(first){ first=false; ok(AUTH); } }); }); }); }); })
    .catch(function(){ return null; });
  return AUTH.ready; }
async function authPost(path, body){
  var t=AUTH.user?await AUTH.user.getIdToken():"", h={"Content-Type":"application/json"};
  if(t) h["Authorization"]="Bearer "+t;
  try{ var r=await fetch(path,{method:"POST",headers:h,body:JSON.stringify(body||{})}), j=null;
    try{ j=await r.json(); }catch(_){ j=null; }
    return {status:r.status, body:j||{}}; }catch(_){ return {status:0, body:{}}; } }
// after any sign-in change: the hint, the daily Pro recheck (server decides if it is due), the claims, the boxes
async function authSync(){
  if(!AUTH.user){ AUTH.pro=false; authHintSet(false); authRender(); return; }
  authHintSet(true);
  try{ var r=await authPost("/api/auth/refresh",{}); if(r.status===200 && r.body.changed) await AUTH.user.getIdToken(true);
    var res=await AUTH.user.getIdTokenResult(); AUTH.pro=authProFromClaims(res&&res.claims, Math.floor(Date.now()/1000)); }
  catch(_){ AUTH.pro=false; }
  authRender(); }
// RS94 on the web: a signed-in Pro user's relevance checks carry the ID token (same origin only); called by app.js
async function authHeader(h){ h=h||{};
  try{ if(!authHintGet() && !AUTH.user) return h;
    var a=await authTimeout(authLoad(),1500); if(!a||!AUTH.user||!AUTH.pro) return h;
    var t=await authTimeout(AUTH.user.getIdToken(),1500); if(t) h["Authorization"]="Bearer "+t; }catch(_){}
  return h; }
function authProvider(){ return new AUTH.fb.GoogleAuthProvider(); }
function authSignIn(p){ AUTH.msg[p]="";
  AUTH.fb.signInWithPopup(AUTH.auth, authProvider()).catch(function(e){ var c=e&&e.code||"";
    if(c==="auth/popup-blocked"||c==="auth/operation-not-supported-in-environment"){   // RS94: redirect where popups fail
      authHintSet(true); return AUTH.fb.signInWithRedirect(AUTH.auth, authProvider()).catch(function(){ AUTH.msg[p]=authReason("popup"); authRender(); }); }
    if(c!=="auth/popup-closed-by-user" && c!=="auth/cancelled-popup-request"){ AUTH.msg[p]=authReason("popup"); authRender(); } }); }
async function authLink(p){ var k=typeof proKeyGet==="function"?proKeyGet():"";
  var r=await authPost("/api/auth/link",{key:k});
  if(r.status===200){ AUTH.msg[p]=""; await AUTH.user.getIdToken(true); return authSync(); }
  AUTH.msg[p]=authReason(r.body.error); authRender(); }
async function authDelete(p){
  var r=await authPost("/api/auth/delete",{});
  if(r.status===401 && r.body.error==="reauth"){
    try{ await AUTH.fb.reauthenticateWithPopup(AUTH.user, authProvider()); }catch(_){ AUTH.msg[p]=authReason("reauth"); return authRender(); }
    r=await authPost("/api/auth/delete",{}); }
  if(r.status!==200){ AUTH.msg[p]=authReason(r.body.error); return authRender(); }
  try{ await AUTH.fb.signOut(AUTH.auth); }catch(_){}
  AUTH.user=null; AUTH.pro=false; authHintSet(false); AUTH.msg[p]="Your account is deleted. Nothing about it is left with Replore."; authRender(); }

function authEl(tag, cls, text){ var e=document.createElement(tag); if(cls) e.className=cls; if(text!=null) e.textContent=text; return e; }
function authBtn(cls, text, fn){ var b=authEl("button", cls, text); b.type="button"; b.addEventListener("click", fn); return b; }
function authPortal(){ return typeof PRO_PORTAL_URL==="string" && typeof proPortalOk==="function" && proPortalOk(PRO_PORTAL_URL); }
function authRender(){ AUTH.prefixes.forEach(function(p){ var box=document.getElementById(p+"Auth"); if(!box) return;
  var v=authView({user:AUTH.user, pro:AUTH.pro, hasKey:typeof proKeyGet==="function"&&!!proKeyGet()});
  box.textContent=""; box.hidden=false;
  box.appendChild(authEl("p","pro-hint auth-lead",v.lead));
  if(AUTH.msg[p]){ var m=authEl("p","auth-msg",AUTH.msg[p]); m.setAttribute("role","status"); box.appendChild(m); }
  var acts=authEl("div","pro-acts auth-acts");
  if(!v.signedIn) acts.appendChild(authBtn("pro-have", v.button, function(){ authSignIn(p); }));
  else {
    if(v.link) acts.appendChild(authBtn("pro-save", v.linkLabel, function(){ authLink(p); }));
    acts.appendChild(authBtn("link-btn", "Sign out", function(){ AUTH.msg[p]=""; AUTH.fb.signOut(AUTH.auth).catch(function(){}); }));
    var del=authEl("div","auth-del"); del.hidden=true;
    acts.appendChild(authBtn("link-btn", "Delete my account", function(){ del.hidden=!del.hidden; }));
    var n=authDeleteNote(authPortal()), np=authEl("p","pro-hint",n.text);
    if(n.portal){ np.appendChild(document.createTextNode(" ")); var a=authEl("a","","Open Stripe's customer portal");
      a.href=PRO_PORTAL_URL; a.target="_blank"; a.rel="noopener noreferrer"; np.appendChild(a); }
    del.appendChild(np);
    var yes=authEl("p","pro-acts");
    yes.appendChild(authBtn("pro-have auth-danger", "Yes, delete my account", function(){ authDelete(p); }));
    yes.appendChild(authBtn("link-btn", "Keep it", function(){ del.hidden=true; }));
    del.appendChild(yes);
    box.appendChild(acts); box.appendChild(del); return; }
  box.appendChild(acts); }); }
function authMount(p, now){ if(AUTH.prefixes.indexOf(p)<0) AUTH.prefixes.push(p);
  var go=function(){ authLoad().then(function(a){ if(a) authRender(); }); };
  if(now) go(); return go; }

(function(){ if(typeof document==="undefined" || typeof location==="undefined") return;
  function start(){
    if(document.getElementById("ppAuth")) authMount("pp", true);   // /pro: ask for the config at once
    if(document.getElementById("proAuth")){   // home: only when the Pro window opens, or if this browser signed in before
      var go=authMount("pro", authHintGet()), btn=document.getElementById("proBtn");
      if(btn) btn.addEventListener("click", go); }
    document.addEventListener("replore-key", function(){ if(AUTH.auth) authRender(); });   // a key was saved or removed
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
