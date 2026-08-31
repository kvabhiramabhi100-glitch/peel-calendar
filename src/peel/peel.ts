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
const FLIGHT_TIME = 0.85; // seconds from toss to touchdown
// Discarded sheets land on a small set of CURATED spots that flank the pad left
// and right and fall away behind it. Deliberately avoids the near side (+Z,
// toward the camera) where sheets would loom huge and cover the desk props, and
// keeps the pad itself clear. Angle is radians about world Y; 0 = +X.
const SLOTS: ReadonlyArray<{ a: number; r: number }> = [
  { a: 0.30, r: 1.12 }, // right of the pad, on the mat
  { a: Math.PI - 0.30, r: 1.12 }, // left of the pad
  { a: -0.34, r: 1.34 }, // right, set back a little
  { a: Math.PI + 0.34, r: 1.34 }, // left, set back a little
];
// Discarded sheets come to rest on the desk mat and stay there.
const DESK_Y = 0.002; // resting height of the first settled sheet
const LAYER_Y = 0.0016; // per-sheet lift so stacked sheets never z-fight
const SETTLE_TIME = 0.28; // seconds to flatten out once it touches down
const MAX_SETTLED = SLOTS.length; // one sheet per slot; the oldest is retired

type State = 'idle' | 'grabbing' | 'relaxing';

interface FlyingPage {
  page: Page;
  vel: THREE.Vector3;
  ang: THREE.Vector3;
  life: number;
  restY: number; // desk height this sheet comes to rest at
  landed: boolean; // touched the mat; now flattening out
  settleT: number; // 0..1 flatten progress once landed
  fromQuat: THREE.Quaternion; // orientation at touchdown
  toQuat: THREE.Quaternion; // flat-on-the-mat orientation
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

  let state: State = 'idle';
  let grabStartY = 0;
  let active: Page | null = null; // page currently grabbed/relaxing
  let settledCount = 0; // how many sheets have been discarded onto the mat
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

    // Take the next curated slot (they alternate left/right by construction), with
    // a touch of jitter so the arrangement reads hand-strewn, not mechanical.
    const slot = SLOTS[settledCount % SLOTS.length];
    const theta = slot.a + (Math.random() - 0.5) * 0.22;
    const radius = slot.r + (Math.random() - 0.5) * 0.22;

    // Rest flat on the mat, each discarded sheet a hair above the last.
    const restY = DESK_Y + (settledCount % MAX_SETTLED) * LAYER_Y;
    settledCount++;

    // Ballistic solve: constant horizontal velocity to the target, vertical
    // velocity that lands it there after FLIGHT_TIME under gravity.
    const start = page.mesh.position;
    const T = FLIGHT_TIME;
    const vel = new THREE.Vector3(
      (Math.cos(theta) * radius - start.x) / T,
      reducedMotion ? 0 : (restY - start.y + 0.5 * GRAVITY * T * T) / T,
      (Math.sin(theta) * radius - start.z) / T
    );
    const ang = reducedMotion
      ? new THREE.Vector3(0, 0, 0)
      : new THREE.Vector3(
          (Math.random() - 0.5) * 3.5,
          (Math.random() - 0.5) * 2.5,
          2.0 + Math.random() * 2.0
        );
    flying.push({
      page,
      vel,
      ang,
      life: 0,
      restY,
      landed: false,
      settleT: 0,
      fromQuat: new THREE.Quaternion(),
      toQuat: new THREE.Quaternion().setFromEuler(
        // Laid flat (local +Z up), spun randomly in-plane so the pile looks strewn.
        new THREE.Euler(-Math.PI / 2, 0, Math.random() * Math.PI * 2)
      ),
    });
    // Retire the oldest discarded sheets so the mat never grows unbounded.
    while (flying.length > MAX_SETTLED) {
      removeFlying(flying[0]);
      flying.shift();
    }

    // Promote next page + advance the calendar. The newly exposed sheet becomes
    // the die-cut frame; the tossed one keeps its hole as it flies away.
    const next = topPage();
    if (next) {
      next.uniforms.uPeel.value = 0;
      // The final sheet is the base board holding the sculpture — never holed.
      next.uniforms.uFrame.value = stack.pages.length > 1 ? 1 : 0;
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

    // Discarded sheets: flutter off the pad, drop onto the desk mat and stay
    // there — a scatter of die-cut frames around the emerging sculpture.
    for (let i = flying.length - 1; i >= 0; i--) {
      const f = flying[i];
      f.life += dt;
      const mesh = f.page.mesh;

      if (!f.landed) {
        if (!reducedMotion) f.vel.y -= GRAVITY * dt;
        // Air drag on the horizontal glide so paper flutters instead of skidding.
        const drag = 1;
        f.vel.x *= drag;
        f.vel.z *= drag;
        mesh.position.addScaledVector(f.vel, dt);
        mesh.rotation.x += f.ang.x * dt;
        mesh.rotation.y += f.ang.y * dt;
        mesh.rotation.z += f.ang.z * dt;

        // Touchdown on the mat.
        if (mesh.position.y <= f.restY && f.vel.y < 0) {
          mesh.position.y = f.restY;
          f.landed = true;
          f.settleT = 0;
          f.fromQuat.copy(mesh.quaternion);
        }
      } else if (f.settleT < 1) {
        // Flatten out where it landed, easing to lie flat on the desk.
        f.settleT = Math.min(1, f.settleT + dt / SETTLE_TIME);
        const e = 1 - Math.pow(1 - f.settleT, 3); // ease-out
        mesh.quaternion.slerpQuaternions(f.fromQuat, f.toQuat, e);
        mesh.position.y = f.restY;
        // A little residual slide as it comes to rest.
        mesh.position.x += f.vel.x * dt * (1 - e);
        mesh.position.z += f.vel.z * dt * (1 - e);
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
