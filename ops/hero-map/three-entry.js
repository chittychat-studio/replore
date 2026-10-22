// SPEC RS60: the only three.js parts the hero map uses. ops/hero-map/build.md bundles this, tree-shaken and minified,
// into web/vendor/three-0.186.1-hero.min.js so the page never loads the whole library (~420 KB compressed).
export { WebGLRenderer, Scene, PerspectiveCamera, PlaneGeometry, ShaderMaterial, Mesh, Color, Vector2 } from "three";
