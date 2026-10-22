// SPEC RS60: the scout's map. A WebGL contour landscape behind the hero, drawn with three.js (MIT; only the parts used,
// bundled in vendor/three-0.186.1-hero.min.js). It means something: typing sends a ripple across the map, and while a
// search runs a lit path traces across it (we're scouting). Pure decoration otherwise: the page works the same without it.
//   - skipped on data-saver, devices under 4 GB of memory and browsers without WebGL2
//   - "reduce motion": one still frame, no ripples or path
//   - pauses in hidden tabs and off-screen; fades out and stops once results show
// 2D simplex noise below: Ian McEwan, Ashima Arts (MIT), https://github.com/ashima/webgl-noise
const NOISE = `
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
vec2 mod289(vec2 x){return x-floor(x*(1./289.))*289.;}
vec3 permute(vec3 x){return mod289(((x*34.)+1.)*x);}
float snoise(vec2 v){
  const vec4 C=vec4(.211324865405187,.366025403784439,-.577350269189626,.024390243902439);
  vec2 i=floor(v+dot(v,C.yy)); vec2 x0=v-i+dot(i,C.xx);
  vec2 i1=(x0.x>x0.y)?vec2(1.,0.):vec2(0.,1.);
  vec4 x12=x0.xyxy+C.xxzz; x12.xy-=i1; i=mod289(i);
  vec3 p=permute(permute(i.y+vec3(0.,i1.y,1.))+i.x+vec3(0.,i1.x,1.));
  vec3 m=max(.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.); m=m*m; m=m*m;
  vec3 x=2.*fract(p*C.www)-1.; vec3 h=abs(x)-.5; vec3 ox=floor(x+.5); vec3 a0=x-ox;
  m*=1.79284291400159-.85373472095314*(a0*a0+h*h);
  vec3 g; g.x=a0.x*x0.x+h.x*x0.y; g.yz=a0.yz*x12.xz+h.yz*x12.yw;
  return 130.*dot(m,g);
}`;

const VERT = `
uniform float uTime;
varying float vH; varying vec2 vUv; varying float vDepth;
${NOISE}
float terrain(vec2 p){ float h=0., a=.55; for(int i=0;i<4;i++){ h+=a*snoise(p); p*=2.03; a*=.5; } return h; }
void main(){
  vUv=uv;
  vec2 p=uv*vec2(3.4,2.2)+vec2(uTime*.010,uTime*.004);
  float h=terrain(p);
  vH=h;
  vec3 pos=position; pos.z+=h*.9;
  vec4 mv=modelViewMatrix*vec4(pos,1.);
  vDepth=-mv.z;
  gl_Position=projectionMatrix*mv;
}`;

const FRAG = `
uniform float uTime, uRippleT, uPath, uAlpha;
uniform vec2 uRippleO;
uniform vec3 uLine, uGlow;
varying float vH; varying vec2 vUv; varying float vDepth;
float iso(float v, float px){ float g=abs(fract(v-.5)-.5)/max(fwidth(v),1e-4); return 1.-min(g/px,1.); }
float route(float x){ return .52+.16*sin(x*5.1+1.3)+.06*sin(x*12.7+.4); }
void main(){
  float v=vH*9.;
  float minor=iso(v,1.0), major=iso(v/5.,1.4);
  float lines=max(minor*.55,major);
  // ripple from the last keystroke
  vec2 asp=vec2(1.7,1.);
  float age=uTime-uRippleT;
  float d=distance(vUv*asp,uRippleO*asp);
  float ring=age>0.?exp(-pow((d-age*.42)*14.,2.))*exp(-age*1.1):0.;
  // the scout's route while searching
  float x0=.06, x=vUv.x;
  float pd=abs(vUv.y-route(x));
  float on=step(x0,x)*step(x,uPath);
  // a thin dashed trail in map ink, like a route drawn on paper: no glow, no bloom
  float w=fwidth(pd)*1.2+.0012;
  float dash=step(.45,fract(x*46.-uTime*.6));
  float path=on*dash*(1.-smoothstep(w*.5,w,pd));
  float hd=distance(vUv*asp,vec2(uPath,route(uPath))*asp);
  float head=uPath>x0?1.-smoothstep(.006,.006+fwidth(hd)*1.5,hd):0.;
  // distance and side fade, so the map melts into the page
  float fade=(1.-smoothstep(5.5,11.,vDepth))*smoothstep(0.,.12,vUv.x)*smoothstep(1.,.88,vUv.x)*smoothstep(0.,.18,vUv.y);
  vec3 col=mix(uLine,uGlow,clamp(ring*1.2+path*.6+head*.6,0.,1.));
  float a=(lines*.5+ring*lines*1.1+path*.85+head)*fade*uAlpha;
  gl_FragColor=vec4(col,clamp(a,0.,1.));
}`;

const THEMES = {
  light: { line: "#3f6f8e", glow: "#1f5f8b", alpha: 0.75 },
  dark: { line: "#7fa6c2", glow: "#e6f1fa", alpha: 0.9 },
};

function canRun() {
  const nav = navigator, conn = nav.connection || {};
  if (conn.saveData) return false;
  if (nav.deviceMemory && nav.deviceMemory < 4) return false;
  try { return !!document.createElement("canvas").getContext("webgl2"); } catch (e) { return false; }
}
function theme() {
  const t = document.documentElement.getAttribute("data-theme");
  if (t === "dark" || t === "light") return t;
  return window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

async function start() {
  if (!canRun()) return;
  const host = document.querySelector(".bg-shapes");
  if (!host) return;
  const T = await import("./vendor/three-0.186.1-hero.min.js");
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  const box = document.createElement("div");
  box.className = "hero-map";
  box.setAttribute("aria-hidden", "true");
  host.parentNode.insertBefore(box, host);

  let renderer;
  try { renderer = new T.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" }); }
  catch (e) { box.remove(); return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  box.appendChild(renderer.domElement);

  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(36, 1, 0.1, 40);
  const uniforms = {
    uTime: { value: 0 }, uRippleT: { value: -99 }, uRippleO: { value: new T.Vector2(0.5, 0.4) }, uPath: { value: 0 },
    uAlpha: { value: 0 }, uLine: { value: new T.Color() }, uGlow: { value: new T.Color() },
  };
  const paint = () => { const t = THEMES[theme()]; uniforms.uLine.value.set(t.line); uniforms.uGlow.value.set(t.glow); alphaTarget = t.alpha; };
  let alphaTarget = 0;
  paint();
  const mesh = new T.Mesh(new T.PlaneGeometry(16, 10, 220, 140),
    new T.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false }));
  mesh.rotation.x = -Math.PI / 2.45;
  mesh.position.set(0, -1.15, -2.2);
  scene.add(mesh);

  const size = () => {
    const w = box.clientWidth || 1, h = box.clientHeight || 1;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  size();
  new ResizeObserver(size).observe(box);

  // input: pointer parallax, a ripple per keystroke, the route while searching
  const target = { x: 0, y: 0 }, cam = { x: 0, y: 0 };
  const q = document.getElementById("q");
  let pathStart = -1, clock0 = performance.now();
  const now = () => (performance.now() - clock0) / 1000;
  if (!reduce) {
    addEventListener("pointermove", (e) => { target.x = e.clientX / innerWidth - 0.5; target.y = e.clientY / innerHeight - 0.5; }, { passive: true });
    if (q) q.addEventListener("input", () => {
      uniforms.uRippleT.value = uniforms.uTime.value;
      uniforms.uRippleO.value.set(0.3 + Math.random() * 0.4, 0.3 + Math.random() * 0.25);
      wake();
    });
  }
  const searching = () => document.body.classList.contains("searching") && !document.body.classList.contains("has-results");
  const results = () => document.body.classList.contains("has-results");

  let running = false, visible = true, frame = 0, last = now();
  const loop = () => {
    if (!running) return;
    const t = reduce ? 4 : now(), dt = Math.min(0.1, Math.max(0, now() - last)); last = now();
    const ease = (rate) => 1 - Math.exp(-dt * rate);   // frame-rate independent smoothing
    uniforms.uTime.value = t;
    cam.x += (target.x - cam.x) * ease(2.4); cam.y += (target.y - cam.y) * ease(2.4);
    camera.position.set(cam.x * 0.9, 3.1 - cam.y * 0.35, 4.2);
    camera.lookAt(0, -1.0, -2.6);
    if (searching() && !reduce) {
      if (pathStart < 0) pathStart = t;
      uniforms.uPath.value = 0.06 + ((t - pathStart) / 1.8) % 1.1;   // trace across, then again until results land
    } else { pathStart = -1; uniforms.uPath.value = Math.max(0, uniforms.uPath.value - 0.03); }
    const a = results() ? 0 : alphaTarget;
    uniforms.uAlpha.value += (a - uniforms.uAlpha.value) * (reduce ? 1 : ease(2.2));
    renderer.render(scene, camera);
    frame++;
    if (reduce && frame > 1) { running = false; return; }   // one still frame
    if (results() && uniforms.uAlpha.value < 0.01) { running = false; return; }   // faded out: stop until the hero is back
    requestAnimationFrame(loop);
  };
  function wake() { if (!running && visible && !document.hidden) { running = true; last = now(); requestAnimationFrame(loop); } }

  new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) wake(); else running = false; }).observe(box);
  document.addEventListener("visibilitychange", () => { if (document.hidden) running = false; else wake(); });
  new MutationObserver(() => { paint(); if (reduce) { frame = 0; } wake(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  if (window.matchMedia) matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { paint(); wake(); });
  new MutationObserver(wake).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  document.body.classList.add("has-hero-map");
  wake();
}

const later = window.requestIdleCallback || ((f) => setTimeout(f, 300));
if (document.readyState === "complete") later(() => start().catch(() => {}));
else addEventListener("load", () => later(() => start().catch(() => {})), { once: true });
