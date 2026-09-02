// main.ts — bootstrap: owns the renderer, scene, camera, resize handling, and
// the render loop. Wires in lighting + ground + the page stack (with printed
// calendar faces) + the pointer peel interaction + the HTML date readout.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createLighting } from './scene/lighting.ts';
import { createGround } from './scene/ground.ts';
import { createStack, DEFAULT_STACK, type Stack } from './scene/stack.ts';
import { createPeel, type PeelController } from './peel/peel.ts';
import { createDateState, startDate } from './calendar/date.ts';
import { drawFace, drawBaseFace } from './calendar/face.ts';
import { createReadout } from './calendar/readout.ts';
import { createChrome } from './ui.ts';
import { createSfx } from './audio.ts';

const prefersReducedMotion = window.matchMedia(
  '(prefers-reduced-motion: reduce)'
).matches;

// --- Renderer -------------------------------------------------------------
const app = document.getElementById('app')!;
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // cap DPR at 2
renderer.setClearColor(0x000000, 0); // transparent — the desk photo (CSS bg) shows through
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = false; // grounded by a soft shadow decal (scene/ground.ts)
renderer.toneMapping = THREE.NeutralToneMapping; // clean, bright product-render look
renderer.toneMappingExposure = 1.0;
app.appendChild(renderer.domElement);

// --- Scene + camera -------------------------------------------------------
const scene = new THREE.Scene();

// Desk photo as the in-scene background, so post-processing (grain, tone, glow)
// unifies the photo and the 3D calendar into one image (dissolves the "cutout").
const deskTex = new THREE.TextureLoader().load('/desk-bg.png', () => {
  applyBgCover();
  scene.background = deskTex;
});
deskTex.colorSpace = THREE.SRGBColorSpace;
function applyBgCover(): void {
  const img = deskTex.image as HTMLImageElement | undefined;
  if (!img) return;
  const ia = img.width / img.height;
  const va = window.innerWidth / window.innerHeight;
  if (va > ia) {
    deskTex.repeat.set(1, ia / va);
    deskTex.offset.set(0, (1 - ia / va) / 2);
  } else {
    deskTex.repeat.set(va / ia, 1);
    deskTex.offset.set((1 - va / ia) / 2, 0);
  }
}

// Low FOV → gentle perspective that matches the desk photo (less distortion).
const camera = new THREE.PerspectiveCamera(
  30,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(0, 3.05, 2.28); // steep top-down-front, matching the desk shot
camera.lookAt(0, 0.05, 0);

// --- Camera orbit controls ------------------------------------------------
// Constrained so the calendar stays lying flat on the desk plane (blended into
// the photo) — small nudges only, no swinging off into the floating "diamond".
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.05, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.minDistance = 2.2;
controls.maxDistance = 4.5;
controls.minPolarAngle = 0.5;
controls.maxPolarAngle = 0.95;
controls.minAzimuthAngle = -0.4;
controls.maxAzimuthAngle = 0.4;
controls.update();

// --- Lighting + ground ----------------------------------------------------
createLighting(scene);
createGround(scene);

// --- Post-processing: unify photo + 3D (soft glow, film grain, vignette) --
const composer = new EffectComposer(renderer);
composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
composer.addPass(new RenderPass(scene, camera));

// Subtle bloom bleeds bright edges so the 3D doesn't read as a hard cut-out.
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.12, // strength (subtle)
  0.6, // radius
  0.86 // threshold
);
composer.addPass(bloom);

// Film grain + gentle vignette shared across the whole frame → cohesive photo.
const grainPass = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uGrain: { value: 0.05 },
    uVignette: { value: 0.22 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uGrain;
    uniform float uVignette;
    varying vec2 vUv;
    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }
    void main() {
      vec4 col = texture2D(tDiffuse, vUv);
      float g = hash(vUv + fract(uTime)) - 0.5;
      col.rgb += g * uGrain;                                  // film grain
      float vig = smoothstep(0.9, 0.35, length(vUv - 0.5));   // gentle vignette
      col.rgb *= mix(1.0, vig, uVignette);
      gl_FragColor = col;
    }
  `,
});
composer.addPass(grainPass);
composer.addPass(new OutputPass());

// --- Date state + overlays ------------------------------------------------
// Captured once so the printed sheets and the readout share the same "today"
// even if the app is left open across midnight.
const today = startDate();
const dateState = createDateState(today);
const readout = createReadout();
const chrome = createChrome();
const sfx = createSfx();
chrome.onMuteToggle((muted) => sfx.setMuted(muted));
// Browsers hold audio until a gesture — unlock on the first interaction.
renderer.domElement.addEventListener('pointerdown', () => sfx.resume(), {
  once: true,
});

// Face for stack page i: today PLUS i days, so the sheets below the top one are
// the days still to come — tearing the top off exposes tomorrow, like a real
// peel-off calendar. The LAST page is the pad's accent base board.
function faceForIndex(i: number): THREE.Texture {
  if (i >= DEFAULT_STACK.pages - 1) return drawBaseFace();
  const d = new Date(today.getTime());
  d.setDate(d.getDate() + i);
  return drawFace(d, { showSilhouette: false });
}

// --- Stack + peel (rebuildable via the reset button) ----------------------
let stack: Stack;
let peel: PeelController;
let peeledOnce = false;

// Auto-reveal is driven from the render loop (not setTimeout) so page tosses and
// the flying-page physics stay in lockstep — if rAF pauses (tab/pane hidden),
// both pause together instead of pages piling up frozen.
let revealActive = false;
let revealAcc = 0;
const REVEAL_INTERVAL = 0.08; // seconds between page tosses (fast flip-through)

function build(): void {
  dateState.reset();
  // Pages carve the panda out of the relief height field, so the sculpture is
  // literally formed by the stacked paper layers (terraced contours).
  stack = createStack({ face: faceForIndex });
  scene.add(stack.group);
  readout.update(dateState.get(), stack.pages.length);

  peel = createPeel({
    stack,
    camera,
    scene,
    dom: renderer.domElement,
    reducedMotion: prefersReducedMotion,
    onGrab: () => {
      controls.enabled = false;
    },
    onRelease: () => {
      controls.enabled = true;
    },
    callbacks: {
      onDateAdvance: () => {
        dateState.advance();
        readout.update(dateState.get(), stack.pages.length);
        if (!peeledOnce) {
          peeledOnce = true;
          chrome.hideHint();
        }
      },
      onExpose: () => {
        // The newly-promoted top page shows the panda silhouette in its print.
        // The final page is the accent base board — leave its face alone.
        const top = stack.pages.length > 1 ? stack.pages[0] : null;
        if (top) {
          const old = top.uniforms.uFace.value;
          top.uniforms.uFace.value = drawFace(dateState.get(), { showSilhouette: true });
          (old as THREE.Texture)?.dispose?.();
        }
        readout.update(dateState.get(), stack.pages.length);
      },
      onTear: (strength) => sfx.tear(strength),
      onLand: () => sfx.land(),
    },
  });
}

// Auto-peel every page until only the full-relief bottom page remains — the
// render loop pumps peelTop() on REVEAL_INTERVAL (see tick).
function startReveal(): void {
  if (!peeledOnce) {
    peeledOnce = true;
    chrome.hideHint();
  }
  revealActive = true;
  revealAcc = 0;
}

function teardown(): void {
  revealActive = false;
  peel.dispose();
  scene.remove(stack.group);
  for (const p of stack.pages) {
    p.material.dispose();
    (p.uniforms.uFace.value as THREE.Texture)?.dispose?.();
  }
  stack.core.geometry.dispose();
  (stack.core.material as THREE.Material).dispose();
}

chrome.onReset(() => {
  teardown();
  build();
});
chrome.onReveal(() => {
  sfx.resume(); // the click is a gesture — unlock audio if it hasn't been yet
  startReveal();
});

// --- Resize ---------------------------------------------------------------
function resize(): void {
  // Guard against a zero-sized viewport (loading in a hidden tab or a
  // display:none container). A 0/0 aspect poisons the projection matrix with
  // NaN and the scene stays blank for good, even once it becomes visible.
  const w = Math.max(1, window.innerWidth);
  const h = Math.max(1, window.innerHeight);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloom.setSize(w, h);
  applyBgCover();
}
window.addEventListener('resize', resize);
// A window `resize` doesn't fire when only the CONTAINER changes size (revealed
// pane, split view, CSS layout shift), so watch the element itself too.
new ResizeObserver(resize).observe(app);

// --- Render loop ----------------------------------------------------------
const clock = new THREE.Clock();

function tick(): void {
  const dt = Math.min(clock.getDelta(), 0.05);

  // Drive the auto-reveal in lockstep with physics (dt is clamped, so at most
  // one toss per couple of frames even after a long pause — no page pile-up).
  if (revealActive) {
    revealAcc += dt;
    while (revealAcc >= REVEAL_INTERVAL) {
      revealAcc -= REVEAL_INTERVAL;
      if (!peel.peelTop()) {
        revealActive = false;
        sfx.chime(); // the pad is peeled out — the sculpture has landed
        break;
      }
    }
  }

  peel.update(dt);

  // Keep the moss core sized from the ground up to just below the current top
  // page (half a gap down) so its top face never z-fights the printed top page.
  const topY = stack.pages.length > 0 ? stack.pages[0].mesh.position.y : 0.001;
  const coreH = Math.max(0.001, topY - stack.config.gap * 0.5);
  stack.core.scale.y = coreH;
  stack.core.position.y = coreH * 0.5;
  // Once the pad is peeled flat the core collapses onto the base sheet and
  // z-fights it — hide it so the accent base board reads cleanly.
  stack.core.visible = coreH > stack.config.gap;

  controls.update(); // camera orbit + damping (view is user-controlled now)

  grainPass.uniforms.uTime.value += dt;
  composer.render();
  requestAnimationFrame(tick);
}

// Wait for the display serif so the calendar faces render with it, then start.
async function start(): Promise<void> {
  try {
    await Promise.all([
      document.fonts.load("500 40px 'Eugusto'"),
      document.fonts.load("500 40px 'Playfair Display'"),
      document.fonts.load("700 40px 'Gilroy'"),
      document.fonts.load("800 40px 'Poppins'"),
      document.fonts.load("700 40px 'Poppins'"),
    ]);
  } catch {
    /* fonts are optional — fall back to system fonts */
  }
  build();
  tick();
}
start();
