// SPEC RS59: a slow mesh gradient with film grain behind the hero, drawn by Paper Shaders (Apache-2.0, self-hosted in
// vendor/paper-shaders-0.0.81, see its LICENSE and NOTICE). Pure decoration: the page looks and works the same without it.
//   - skipped on data-saver, low-memory devices and browsers without WebGL2 (the CSS shapes stay as they are)
//   - "reduce motion" gets one still frame, never animation
//   - pauses itself off-screen and in hidden tabs (ShaderMount does this), and stops for good once results show
//   - colours follow the light / dark theme, including the theme toggle
const PALETTES = {
  light: { colors: ["#f2f6f9", "#a9c4d8", "#fbfcfd", "#6f97b5", "#d4e3ee", "#c3d8e8"], opacity: 0.9, grain: 0.1 },
  dark: { colors: ["#0f171f", "#22374a", "#16212c", "#35607e", "#1b2a38", "#2a4a63"], opacity: 1, grain: 0.14 },
};
const SPEED = 0.18;   // slow drift: one full "breath" takes ~30 s

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
  const [{ ShaderMount }, { meshGradientFragmentShader }, { getShaderColorFromString }, { ShaderFitOptions }] = await Promise.all([
    import("./vendor/paper-shaders-0.0.81/shader-mount.js"),
    import("./vendor/paper-shaders-0.0.81/shaders/mesh-gradient.js"),
    import("./vendor/paper-shaders-0.0.81/get-shader-color-from-string.js"),
    import("./vendor/paper-shaders-0.0.81/shader-sizing.js"),
  ]);
  const box = document.createElement("div");
  box.className = "hero-shader";
  box.setAttribute("aria-hidden", "true");
  host.parentNode.insertBefore(box, host);   // under the drifting shapes

  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const uniforms = (name) => {
    const p = PALETTES[name], c = p.colors.map(getShaderColorFromString);
    while (c.length < 10) c.push([0, 0, 0, 0]);
    box.style.setProperty("--hs-op", String(p.opacity));   // CSS fades to it, and hides it once results show
    return {
      u_colors: c, u_colorsCount: p.colors.length,
      u_distortion: 0.9, u_swirl: 0.2, u_grainMixer: 0, u_grainOverlay: p.grain,
      u_fit: ShaderFitOptions.cover, u_scale: 1, u_rotation: 0, u_offsetX: 0, u_offsetY: 0,
      u_originX: 0.5, u_originY: 0.5, u_worldWidth: 0, u_worldHeight: 0,
    };
  };
  let current = theme(), mount;
  try {
    // 1 device pixel per CSS pixel and at most ~1.3 MP: a soft gradient doesn't need retina resolution
    mount = new ShaderMount(box, meshGradientFragmentShader, uniforms(current), { alpha: true, premultipliedAlpha: false },
      reduce ? 0 : SPEED, 9000, 1, 1600 * 820);
  } catch (e) { box.remove(); return; }
  document.body.classList.add("has-hero-shader");
  requestAnimationFrame(() => box.classList.add("on"));   // fade in

  const repaint = () => { const t = theme(); if (t !== current) { current = t; mount.setUniforms(uniforms(t)); } };
  new MutationObserver(repaint).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  if (window.matchMedia) matchMedia("(prefers-color-scheme: dark)").addEventListener("change", repaint);

  // once results are on screen the hero is folded away: free the GPU instead of animating something nobody sees
  const stopWhenResults = () => {
    if (document.body.classList.contains("has-results")) mount.setSpeed(0); else if (!reduce) mount.setSpeed(SPEED);
  };
  new MutationObserver(stopWhenResults).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  stopWhenResults();
}

// after first paint and idle time, so it never delays the search box
const later = window.requestIdleCallback || ((f) => setTimeout(f, 300));
if (document.readyState === "complete") later(() => start().catch(() => {}));
else addEventListener("load", () => later(() => start().catch(() => {})), { once: true });
