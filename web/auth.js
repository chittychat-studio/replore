// SPEC RS94: optional Google sign-in for Pro users (Firebase Authentication), on / (inside the "Leo, Pro" window) and
// on /pro, next to the Pro features only. Nothing free is behind it. Dormant until /api/auth/config says {"on": true};
// until then no sign-in UI renders and no Firebase file loads. The SDK (firebase-app + firebase-auth only, vendored,
// pinned) is loaded only on /pro, when the Pro window opens, or when this browser signed in before (the "replore.auth"
// hint). Sign-in uses Google Identity Services (GIS), loaded only when the visitor presses "Sign in with Google", and
// hands GIS's Google ID token to Firebase with signInWithCredential: never signInWithPopup / signInWithRedirect, so the
// page never loads apis.google.com or frames a firebaseapp.com page (RS94 security review, RS49).
// A separate file because the CSP allows no inline script (RS49). Text is set with textContent only.
"use strict";
var AUTH_HINT="replore.auth", AUTH_SDK="/vendor/firebase-12.19.0/", AUTH_PRO_FRESH_SEC=26*3600;
var AUTH_GIS="https://accounts.google.com/gsi/client";   // the only outside script; CSP allows exactly this path
// pure: is this a usable config answer from /api/auth/config?
function authCfgOk(c){ return !!c && c.on===true && /^[A-Za-z0-9_-]{30,60}$/.test(String(c.apiKey||""))
  && /^[0-9]{6,20}-[a-z0-9]{10,64}\.apps\.googleusercontent\.com$/.test(String(c.clientId||"")) && /^[a-z][a-z0-9-]{4,38}[a-z0-9]$/.test(String(c.projectId||"")); }
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
  google:"Google's sign-in did not load. Check that this site may load accounts.google.com, then try again."
};
function authReason(code){ return AUTH_REASONS[code]||AUTH_REASONS.auth_error; }
// pure: what the sign-in box says. st = {user: null | {email}, pro, hasKey}
function authView(st){ st=st||{};
  if(!st.user) return {signedIn:false, lead:"Bought Pro? Sign in with Google to use it on any device, with no key to paste.",
    button:"Sign in with Google", link:false, gisNote:"Google's sign-in loads from accounts.google.com when you press this."};
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
var AUTH={ready:null, fb:null, auth:null, user:null, pro:false, prefixes:[], msg:{}, cfg:null, gis:null, gisOpen:{}, reauth:{}, next:null};
function authTimeout(p, ms){ return Promise.race([p, new Promise(function(ok){ setTimeout(function(){ ok(null); }, ms); })]); }
// The config, then the SDK. -> AUTH once the first sign-in state is known, or null (off, or it failed: no UI)
function authLoad(){
  if(AUTH.ready) return AUTH.ready;
  AUTH.ready=fetch("/api/auth/config",{method:"GET",cache:"no-store"}).then(function(r){ return r.ok?r.json():null; })
    .then(function(c){ if(!authCfgOk(c)) return null; AUTH.cfg=c;
      return Promise.all([import(AUTH_SDK+"firebase-app.js"), import(AUTH_SDK+"firebase-auth.js")]).then(function(m){
        var app=m[0].initializeApp({apiKey:c.apiKey, projectId:c.projectId}, "replore");
        AUTH.fb=m[1];   // initializeAuth with no popup/redirect resolver: IndexedDB persistence only (RS94 item 3)
        AUTH.auth=m[1].initializeAuth(app,{persistence:[m[1].indexedDBLocalPersistence, m[1].browserLocalPersistence]});
        return new Promise(function(ok){ var first=true;
          AUTH.fb.onAuthStateChanged(AUTH.auth,function(u){ AUTH.user=u||null;
            authSync().then(function(){ if(first){ first=false; ok(AUTH); } }); }); }); }); })
    .catch(function(){ return null; });
  return AUTH.ready; }
// Google Identity Services, loaded once, only on demand. -> google.accounts.id, or null
function authGisLoad(){
  if(AUTH.gis) return AUTH.gis;
  AUTH.gis=new Promise(function(ok){
    if(window.google&&google.accounts&&google.accounts.id) return ok(google.accounts.id);
    var sc=document.createElement("script"); sc.src=AUTH_GIS; sc.async=true;
    sc.onload=function(){ ok(window.google&&google.accounts&&google.accounts.id||null); }; sc.onerror=function(){ ok(null); };
    document.head.appendChild(sc); })
    .then(function(id){ if(!id){ AUTH.gis=null; return null; }
      // one callback for every GIS button: it does whatever AUTH.next says (sign in, or confirm before delete)
      id.initialize({client_id:AUTH.cfg.clientId, callback:function(resp){ var f=AUTH.next; if(f&&resp&&resp.credential) f(resp.credential); },
        auto_select:false, cancel_on_tap_outside:true, context:"signin", itp_support:true, use_fedcm_for_prompt:true, use_fedcm_for_button:true});
      return id; });
  return AUTH.gis; }
function authCred(idToken){ return AUTH.fb.GoogleAuthProvider.credential(idToken); }
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
// "Sign in with Google": load GIS now (not before), show Google's button and prompt; its token signs in to Firebase
function authSignIn(p){ AUTH.msg[p]="";
  AUTH.next=function(idToken){ AUTH.gisOpen[p]=false;
    AUTH.fb.signInWithCredential(AUTH.auth, authCred(idToken)).catch(function(){ AUTH.msg[p]=authReason("auth_error"); authRender(); }); };
  authGisLoad().then(function(id){ if(!id){ AUTH.msg[p]=authReason("google"); return authRender(); }
    AUTH.gisOpen[p]=true; authRender(); try{ id.prompt(); }catch(_){} }); }
async function authLink(p){ var k=typeof proKeyGet==="function"?proKeyGet():"";
  var r=await authPost("/api/auth/link",{key:k});
  if(r.status===200){ AUTH.msg[p]=""; await AUTH.user.getIdToken(true); return authSync(); }
  AUTH.msg[p]=authReason(r.body.error); authRender(); }
// Delete: the server wants a sign-in in the last 5 minutes; if it is older, confirm with a fresh GIS token
// (reauthenticateWithCredential), then try once more
async function authDelete(p){
  var r=await authPost("/api/auth/delete",{});
  if(r.status===401 && r.body.error==="reauth"){
    AUTH.msg[p]=authReason("reauth");
    AUTH.next=function(idToken){ AUTH.reauth[p]=false;
      AUTH.fb.reauthenticateWithCredential(AUTH.user, authCred(idToken)).then(function(){ return authDelete(p); },
        function(){ AUTH.msg[p]=authReason("auth_error"); authRender(); }); };
    var id=await authGisLoad(); if(!id){ AUTH.msg[p]=authReason("google"); return authRender(); }
    AUTH.reauth[p]=true; authRender(); return; }
  if(r.status!==200){ AUTH.msg[p]=authReason(r.body.error); return authRender(); }
  try{ await AUTH.fb.signOut(AUTH.auth); }catch(_){}
  AUTH.user=null; AUTH.pro=false; authHintSet(false); AUTH.msg[p]="Your account is deleted. Nothing about it is left with Replore."; authRender(); }
// Google's own button, drawn by GIS into our slot (its look is Google's, as Google's terms ask)
function authGisButton(slot, text){ AUTH.gis.then(function(id){ if(id&&slot) id.renderButton(slot,{type:"standard", theme:"outline", size:"large",
  text:text, shape:"pill", logo_alignment:"left"}); }); }

function authEl(tag, cls, text){ var e=document.createElement(tag); if(cls) e.className=cls; if(text!=null) e.textContent=text; return e; }
function authBtn(cls, text, fn){ var b=authEl("button", cls, text); b.type="button"; b.addEventListener("click", fn); return b; }
function authPortal(){ return typeof PRO_PORTAL_URL==="string" && typeof proPortalOk==="function" && proPortalOk(PRO_PORTAL_URL); }
function authRender(){ AUTH.prefixes.forEach(function(p){ var box=document.getElementById(p+"Auth"); if(!box) return;
  var v=authView({user:AUTH.user, pro:AUTH.pro, hasKey:typeof proKeyGet==="function"&&!!proKeyGet()});
  box.textContent=""; box.hidden=false;
  box.appendChild(authEl("p","pro-hint auth-lead",v.lead));
  if(AUTH.msg[p]){ var m=authEl("p","auth-msg",AUTH.msg[p]); m.setAttribute("role","status"); box.appendChild(m); }
  var acts=authEl("div","pro-acts auth-acts");
  if(!v.signedIn){
    if(AUTH.gisOpen[p]){ var slot=authEl("div","auth-gis"); acts.appendChild(slot); authGisButton(slot,"signin_with"); }
    else { acts.appendChild(authBtn("pro-have", v.button, function(){ authSignIn(p); })); } }
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
    if(AUTH.reauth[p]){ del.hidden=false; var rs=authEl("div","auth-gis"); del.appendChild(rs); authGisButton(rs,"continue_with"); }
    box.appendChild(acts); box.appendChild(del); return; }
  box.appendChild(acts);
  if(!v.signedIn && !AUTH.gisOpen[p]) box.appendChild(authEl("p","pro-hint",v.gisNote)); }); }
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
