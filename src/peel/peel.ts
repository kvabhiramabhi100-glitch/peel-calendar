// peel.ts — owns the pointer-driven peel interaction and its state machine:
//
//   idle → grabbing → (relaxing | tossing) → idle
//
// Grab: pointer-down in the top page's front-right region, detected by raycasting
// an INVISIBLE FLAT PROXY plane at the top page's rest position (never the curled
// mesh — that's unreliable to raycast). Grabbing maps vertical pointer travel to
// uPeel (0..1) on the top page only. Release < THRESHOLD relaxes back to flat;
// release ≥ THRESHOLD tosses the page off with physics, promotes the next page,
// and decrements the date.

import * as THREE from 'three';
import type { Stack } from '../scene/stack.ts';
import type { Page } from '../scene/page.ts';

const PEEL_RANGE_PX = 300; // pointer travel (up) for a full peel
const TOSS_THRESHOLD = 0.55;
const RELAX_SPEED = 9; // uPeel → 0 lerp rate when relaxing
const GRAVITY = 5.5; // gentle arc so pages sail off before falling back
const MAX_LIFE = 1.0; // backstop lifetime for a tossed page (usually exits sooner)
const FADE_TAIL = 0.2; // seconds of fade at the end of MAX_LIFE (avoids a pop)
// Toss velocity in camera-screen space: up the screen + into the screen
// (receding) + an alternating sideways fan so pages clear the centre.
const TOSS_UP = 2.4;
const TOSS_AWAY = 2.8;
const TOSS_LATERAL = 1.4;

type State = 'idle' | 'grabbing' | 'relaxing';

interface FlyingPage {
  page: Page;
  vel: THREE.Vector3;
  ang: THREE.Vector3;
  life: number;
}

export interface PeelCallbacks {
  onDateDecrement: () => void;
  onFirstPeel?: () => void;
  onExpose?: (remaining: number) => void;
}

export interface PeelOptions {
  stack: Stack;
  camera: THREE.Camera;
  scene: THREE.Scene;
  dom: HTMLElement;
  reducedMotion: boolean;
  callbacks: PeelCallbacks;
  // Fired when a peel grab starts / ends, so the caller can pause camera orbit
  // for the duration of the drag.
  onGrab?: () => void;
  onRelease?: () => void;
}

export interface PeelController {
  update: (dt: number) => void;
  isBusy: () => boolean; // grabbing or relaxing → pause idle rotation
  peelTop: () => boolean; // programmatically toss the top page (auto-reveal)
  dispose: () => void;
}

export function createPeel(opts: PeelOptions): PeelController {
  const { stack, camera, scene, dom, reducedMotion, callbacks } = opts;

  // --- Invisible flat proxy at the top page's rest position ---------------
  const proxy = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })
  );
  proxy.rotation.x = -Math.PI / 2; // flat, matching the pages
  proxy.position.y = stack.pages[0].mesh.position.y;
  stack.group.add(proxy);

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const UP = new THREE.Vector3(0, 1, 0);
  const projTmp = new THREE.Vector3(); // reused to project flying pages to NDC

  let state: State = 'idle';
  let grabStartY = 0;
  let active: Page | null = null; // page currently grabbed/relaxing
  let tossSide = 1; // alternates so tossed pages fan out to both sides
  const flying: FlyingPage[] = [];

  function topPage(): Page | null {
    return stack.pages.length > 0 ? stack.pages[0] : null;
  }

  function syncProxy(): void {
    const t = topPage();
    if (t) proxy.position.y = t.mesh.position.y;
  }

  // --- Pointer handlers ----------------------------------------------------
  function toNdc(e: PointerEvent): void {
    const r = dom.getBoundingClientRect();
    ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  }

  function onPointerDown(e: PointerEvent): void {
    if (state !== 'idle') return;
    if (stack.pages.length <= 1) return; // keep a base page
    toNdc(e);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObject(proxy, false)[0];
    if (!hit || !hit.uv) return;
    // Front-right region: right half (uv.x high), near/front (uv.y low).
    if (hit.uv.x < 0.4 || hit.uv.y > 0.6) return;

    state = 'grabbing';
    grabStartY = e.clientY;
    active = topPage();
    opts.onGrab?.(); // pause camera orbit for this drag
    try {
      dom.setPointerCapture?.(e.pointerId);
    } catch {
      /* synthetic/invalid pointer id — ignore */
    }
    callbacks.onFirstPeel?.();
  }

  function onPointerMove(e: PointerEvent): void {
    if (state !== 'grabbing' || !active) return;
    const peel = clamp01((grabStartY - e.clientY) / PEEL_RANGE_PX);
    active.uniforms.uPeel.value = peel;
  }

  function onPointerUp(e: PointerEvent): void {
    if (state !== 'grabbing' || !active) return;
    opts.onRelease?.(); // resume camera orbit
    try {
      dom.releasePointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
    // Recompute from the final pointer position so a fast drag with few
    // intermediate move events still peels the correct amount.
    const peel = clamp01((grabStartY - e.clientY) / PEEL_RANGE_PX);
    active.uniforms.uPeel.value = peel;
    if (peel >= TOSS_THRESHOLD) {
      toss(active);
      state = 'idle';
      active = null;
    } else {
      state = 'relaxing'; // active keeps relaxing in update()
    }
  }

  // Capture phase so the peel sees the pointer before OrbitControls does and can
  // pause the orbit when the drag starts on the page.
  dom.addEventListener('pointerdown', onPointerDown, true);
  dom.addEventListener('pointermove', onPointerMove, true);
  dom.addEventListener('pointerup', onPointerUp, true);
  dom.addEventListener('pointercancel', onPointerUp, true);

  // --- Toss: detach the top page and fling it up & away from the camera ----
  function toss(page: Page): void {
    // Remove from the stack; promote the next page.
    stack.pages.shift();
    scene.attach(page.mesh); // reparent to scene, preserving world transform
    // Stays OPAQUE while flying (correct depth sorting, no glassy overlap). It
    // is removed once it leaves the view (or a short backstop, with a tail fade).

    // Camera-relative basis: fly the page UP the screen, INTO the screen
    // (receding — so it never grows toward the lens), and fan it out to a side.
    // Screen-space directions work at any orbit angle, unlike a purely
    // horizontal "away" which, at a low head-on camera, sent pages straight up
    // through the sculpture toward the viewer.
    const fwd = camera.getWorldDirection(new THREE.Vector3()); // into the screen
    const right = new THREE.Vector3().crossVectors(fwd, UP);
    if (right.lengthSq() < 1e-4) right.set(1, 0, 0); // guard near top-down
    right.normalize();
    const screenUp = new THREE.Vector3().crossVectors(right, fwd).normalize();

    // Alternate sides so pages fan out symmetrically and clear the centre.
    tossSide = -tossSide;
    const lateral = tossSide * (0.7 + Math.random() * TOSS_LATERAL);

    let vel: THREE.Vector3;
    let ang: THREE.Vector3;
    if (reducedMotion) {
      // No bounce: a gentle drift up-screen & back + fade, no spin.
      vel = new THREE.Vector3()
        .addScaledVector(screenUp, 0.7)
        .addScaledVector(fwd, 0.9);
      ang = new THREE.Vector3(0, 0, 0);
    } else {
      vel = new THREE.Vector3()
        .addScaledVector(screenUp, TOSS_UP)
        .addScaledVector(fwd, TOSS_AWAY)
        .addScaledVector(right, lateral);
      ang = new THREE.Vector3(
        (Math.random() - 0.5) * 5,
        (Math.random() - 0.5) * 3,
        3 + Math.random() * 2.5
      );
    }
    flying.push({ page, vel, ang, life: 0 });

    // Promote next page + advance the calendar. The newly exposed sheet becomes
    // the die-cut frame; the tossed one keeps its hole as it flies away.
    const next = topPage();
    if (next) {
      next.uniforms.uPeel.value = 0;
      next.uniforms.uFrame.value = 1;
    }
    syncProxy();
    callbacks.onDateDecrement();
    callbacks.onExpose?.(stack.pages.length);
  }

  function removeFlying(f: FlyingPage): void {
    scene.remove(f.page.mesh);
    f.page.material.dispose(); // NB: never dispose the shared PAGE_GEOMETRY
  }

  // --- Per-frame update ----------------------------------------------------
  function update(dt: number): void {
    // Relaxing: settle the released page back to flat.
    if (state === 'relaxing' && active) {
      const u = active.uniforms.uPeel;
      u.value += (0 - u.value) * Math.min(1, dt * RELAX_SPEED);
      if (u.value < 0.01) {
        u.value = 0;
        state = 'idle';
        active = null;
      }
    }

    // Flying pages: sail up & away, then remove as soon as they leave the view
    // (keeps the frame clear so the sculpture stays visible while it forms).
    for (let i = flying.length - 1; i >= 0; i--) {
      const f = flying[i];
      f.life += dt;
      if (!reducedMotion) f.vel.y -= GRAVITY * dt;
      f.page.mesh.position.addScaledVector(f.vel, dt);
      f.page.mesh.rotation.x += f.ang.x * dt;
      f.page.mesh.rotation.y += f.ang.y * dt;
      f.page.mesh.rotation.z += f.ang.z * dt;

      // Off-screen? (project the page centre to NDC; drop it once it's behind
      // the camera or well outside the frame.)
      projTmp.copy(f.page.mesh.position).project(camera);
      const offScreen =
        projTmp.z > 1 ||
        Math.abs(projTmp.x) > 1.3 ||
        Math.abs(projTmp.y) > 1.3;

      // Tail fade only in the last stretch of the backstop life (rare: a page
      // still on-screen at MAX_LIFE) so it doesn't pop.
      const tail = f.life - (MAX_LIFE - FADE_TAIL);
      if (tail > 0) {
        f.page.material.transparent = true;
        f.page.material.depthWrite = false;
        f.page.uniforms.uOpacity.value = clamp01(1 - tail / FADE_TAIL);
      }

      if (offScreen || f.life >= MAX_LIFE || f.page.mesh.position.y < -3) {
        removeFlying(f);
        flying.splice(i, 1);
      }
    }
  }

  function isBusy(): boolean {
    return state === 'grabbing' || state === 'relaxing';
  }

  // Toss the top page programmatically (used by the auto-reveal button). Returns
  // false when nothing left to peel or the user is mid-drag.
  function peelTop(): boolean {
    if (state !== 'idle') return false;
    if (stack.pages.length <= 1) return false;
    const top = stack.pages[0];
    top.uniforms.uPeel.value = 0.6; // curl so it reads as a peel as it flies
    toss(top);
    return true;
  }

  function dispose(): void {
    dom.removeEventListener('pointerdown', onPointerDown, true);
    dom.removeEventListener('pointermove', onPointerMove, true);
    dom.removeEventListener('pointerup', onPointerUp, true);
    dom.removeEventListener('pointercancel', onPointerUp, true);
    stack.group.remove(proxy);
    proxy.geometry.dispose();
    (proxy.material as THREE.Material).dispose();
    // Remove any pages still in flight so a restack leaves nothing frozen.
    for (const f of flying) removeFlying(f);
    flying.length = 0;
  }

  return { update, isBusy, peelTop, dispose };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
