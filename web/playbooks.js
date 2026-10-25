// SPEC RS97: Pro playbooks as step cards on /pro. The section stays hidden unless /api/pro/playbook answers 200 for this
// visitor's Pro key (RS87) or Google sign-in (RS94), so non-Pro visitors never see it. One card at a time: Back / Next
// (arrow keys too), step dots to jump to any step, "Mark complete", a progress line. Progress lives only in this browser
// (localStorage "replore.pb.<id>", try/catch). Stored text is data: rendered with text nodes from a safe subset
// (paragraphs, "- " bullets, "1. " numbered steps, **bold**, `code`, https links), never innerHTML.
var PB_API="/api/pro/playbook", PB_STORE="replore.pb.";

// "line one\n- a\n- b\n\n1. x" -> [{p:[...inline]}, {ul:[[...inline],[...inline]]}, {ol:[[...inline]]}, ...]
function pbBlocks(body){ var out=[], para=[], list=null, kind="ul";
  function flushP(){ if(para.length){ out.push({p:pbInline(para.join(" "))}); para=[]; } }
  function flushL(){ if(list){ var b={}; b[kind]=list; out.push(b); list=null; } }
  String(body||"").replace(/\r/g,"").split("\n").forEach(function(raw){ var ln=raw.trim();
    if(!ln){ flushP(); flushL(); return; }
    var m=/^[-*]\s+(.*)$/.exec(ln), k=m?"ul":"ol"; if(!m) m=/^\d+[.)]\s+(.*)$/.exec(ln);
    if(m){ flushP(); if(list&&kind!==k) flushL(); kind=k; (list=list||[]).push(pbInline(m[1])); return; }
    if(list&&/^\s/.test(raw)){ list[list.length-1]=list[list.length-1].concat([{t:" "}],pbInline(ln)); return; }   // an indented line continues the item
    flushL(); para.push(ln); });
  flushP(); flushL(); return out; }
// inline: **bold**, `code`, [text](https://...) and bare https:// links; everything else is plain text
function pbInline(s){ var out=[], re=/\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\((https:\/\/[^\s)]+)\)|(https:\/\/[^\s)<>"']+)/g, i=0, m;
  while((m=re.exec(s))){ if(m.index>i) out.push({t:s.slice(i,m.index)});
    if(m[1]) out.push({b:m[1]}); else if(m[2]) out.push({c:m[2]}); else if(m[3]) out.push({a:m[3],href:m[4]});
    else { var u=m[5].replace(/[.,;:]+$/,""); out.push({a:u,href:u}); re.lastIndex=m.index+u.length; }
    i=re.lastIndex; }
  if(i<s.length) out.push({t:s.slice(i)}); return out; }
function pbLoad(id){ try{ var v=JSON.parse(localStorage.getItem(PB_STORE+id)||"{}"); return {done:Array.isArray(v.done)?v.done.filter(function(n){ return n===(n|0)&&n>=0; }):[], at:v.at|0}; }catch(_){ return {done:[],at:0}; } }
function pbSave(id,st){ try{ localStorage.setItem(PB_STORE+id,JSON.stringify({done:st.done,at:st.at})); }catch(_){} }

function pbEl(tag,cls,text){ var e=document.createElement(tag); if(cls) e.className=cls; if(text!=null) e.textContent=text; return e; }
function pbRenderInline(parent,parts){ parts.forEach(function(x){
  if(x.b) parent.appendChild(pbEl("strong",null,x.b)); else if(x.c) parent.appendChild(pbEl("code",null,x.c));
  else if(x.a){ var a=pbEl("a",null,x.a); a.href=x.href; a.target="_blank"; a.rel="noopener noreferrer"; parent.appendChild(a); }
  else parent.appendChild(document.createTextNode(x.t)); }); }
function pbRenderBody(parent,body){ pbBlocks(body).forEach(function(b){
  if(b.p){ var p=pbEl("p"); pbRenderInline(p,b.p); parent.appendChild(p); }
  else { var l=pbEl(b.ol?"ol":"ul"); (b.ol||b.ul).forEach(function(it){ var li=pbEl("li"); pbRenderInline(li,it); l.appendChild(li); }); parent.appendChild(l); } }); }

async function pbFetch(q){ var h={Accept:"application/json"};
  var k=typeof proKeyGet==="function"?proKeyGet():""; if(k) h["X-Replore-Plugin-Key"]=k;
  if(typeof authHeader==="function"){ try{ h=await authHeader(h); }catch(_){} }
  var r=await fetch(PB_API+(q||""),{headers:h,credentials:"same-origin"}); if(r.status!==200) return null;
  try{ return await r.json(); }catch(_){ return null; } }

function pbOpen(box,book){
  var reduce=window.matchMedia&&matchMedia("(prefers-reduced-motion:reduce)").matches, n=book.steps.length, st=pbLoad(book.id);
  st.done=st.done.filter(function(i){ return i<n; }); st.at=Math.min(Math.max(st.at,0),n-1);
  var view=box.querySelector(".pb-view"); view.textContent="";
  var head=pbEl("div","pb-head"), title=pbEl("h3","pb-title",book.title), prog=pbEl("p","pb-prog"), bar=pbEl("div","pb-bar"), fill=pbEl("i");
  bar.appendChild(fill); bar.setAttribute("aria-hidden","true"); head.appendChild(title); head.appendChild(prog); head.appendChild(bar);
  var card=pbEl("article","pb-card"); card.setAttribute("aria-live","polite");
  var nav=pbEl("div","pb-nav"), back=pbEl("button","pb-btn","Back"), dots=pbEl("div","pb-dots"), next=pbEl("button","pb-btn pb-next","Next");
  back.type=next.type="button"; dots.setAttribute("role","group"); dots.setAttribute("aria-label","Steps");
  for(var i=0;i<n;i++){ var d=pbEl("button","pb-dot"); d.type="button"; d.setAttribute("data-i",String(i)); d.setAttribute("aria-label","Step "+(i+1)+": "+book.steps[i].title); dots.appendChild(d); }
  nav.appendChild(back); nav.appendChild(dots); nav.appendChild(next);
  view.appendChild(head); view.appendChild(card); view.appendChild(nav);
  function paint(dir){ var s=book.steps[st.at], done=st.done.indexOf(st.at)>=0; card.textContent="";
    var num=pbEl("p","pb-num","Step "+(st.at+1)+" of "+n), h=pbEl("h4","pb-step",s.title), body=pbEl("div","pb-body");
    pbRenderBody(body,s.body);
    var mark=pbEl("button","pb-mark"+(done?" on":""),done?"Completed":"Mark complete"); mark.type="button"; mark.setAttribute("aria-pressed",String(done));
    mark.addEventListener("click",function(){ var j=st.done.indexOf(st.at); if(j>=0) st.done.splice(j,1); else st.done.push(st.at); pbSave(book.id,st); paint(0);
      if(j<0&&st.at<n-1) setTimeout(function(){ go(1); },350); });   // completing a step moves on, after a beat
    card.appendChild(num); card.appendChild(h); card.appendChild(body); card.appendChild(mark);
    var c=st.done.length; prog.textContent=c===n?"All "+n+" steps done":c+" of "+n+" done"; fill.style.transform="scaleX("+(c/n)+")";
    back.disabled=st.at===0; next.textContent=st.at===n-1?"Finish":"Next";
    [].forEach.call(dots.children,function(d,k){ d.classList.toggle("done",st.done.indexOf(k)>=0); d.classList.toggle("cur",k===st.at);
      if(k===st.at) d.setAttribute("aria-current","step"); else d.removeAttribute("aria-current"); });
    if(dir&&!reduce&&card.animate) card.animate([{opacity:0,transform:"translateX("+(dir*24)+"px)"},{opacity:1,transform:"none"}],{duration:240,easing:"cubic-bezier(.22,1,.36,1)"}); }
  function go(d){ var to=Math.min(Math.max(st.at+d,0),n-1); if(to===st.at) return; st.at=to; pbSave(book.id,st); paint(d); }
  back.addEventListener("click",function(){ go(-1); });
  next.addEventListener("click",function(){ if(st.at===n-1){ if(st.done.indexOf(st.at)<0){ st.done.push(st.at); pbSave(book.id,st); } paint(0); } else go(1); });
  dots.addEventListener("click",function(e){ var d=e.target.closest&&e.target.closest(".pb-dot"); if(!d) return; var to=+d.getAttribute("data-i"); if(to!==st.at) go(to-st.at); });
  view.onkeydown=function(e){ if(e.target&&/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
    if(e.key==="ArrowLeft"){ e.preventDefault(); go(-1); } else if(e.key==="ArrowRight"){ e.preventDefault(); go(1); } };
  paint(0); }

async function pbStart(){ var box=document.getElementById("ppBooks"); if(!box) return;
  var idx=await pbFetch(""); if(!idx||!Array.isArray(idx.playbooks)||!idx.playbooks.length) return;   // not Pro, or nothing stored: stays hidden
  var list=box.querySelector(".pb-list"); list.textContent="";
  idx.playbooks.forEach(function(p){ var b=pbEl("button","pb-pick"); b.type="button";
    b.appendChild(pbEl("span","pb-pick-t",p.title)); b.appendChild(pbEl("span","pb-pick-n",p.steps+" steps"));
    b.addEventListener("click",async function(){ [].forEach.call(list.children,function(x){ x.classList.toggle("on",x===b); x.setAttribute("aria-pressed",String(x===b)); });
      var book=await pbFetch("?id="+encodeURIComponent(p.id)); if(book&&book.steps) pbOpen(box,book); });
    list.appendChild(b); });
  box.hidden=false; if(idx.playbooks.length===1){ list.hidden=true; list.firstChild.click(); } }   // one playbook: no picker

if(typeof document!=="undefined" && document.getElementById){
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",pbStart); else pbStart(); }
