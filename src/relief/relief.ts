// relief.ts — THE RELIEF SOURCE. Owns the single height field that the whole
// scene carves from. Everything (debug plane now, page stack later) reads height
// ONLY through this module, so the source can be swapped without touching any
// other file.
//
// Interface exported:
//   sampleHeight(u, v) -> number in [0,1]   (0 = flat sheet, 1 = tallest fur)
//   samplePatch(u, v)  -> number in [0,1]   (1 = black patch: ears/eyes/arms)
//   heightToDataTexture(size?) -> THREE.DataTexture   (R = height, G = patch)
//
// For this prototype the field is PROCEDURAL: the panda scene built from blended
// round blobs (soft metaballs) — one mother panda, two cubs, rolling back hills.
//
// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  SWAP SEAM                                                                ║
// ║  To replace this procedural field with a painted / AI grayscale PNG:      ║
// ║  implement an alternate source that loads `assets/relief-height.png`      ║
// ║  (white = tall, black = flat) into a DataTexture and exposes THIS SAME    ║
// ║  sampleHeight / samplePatch / heightToDataTexture interface, behind a      ║
// ║  flag. Nothing outside this file should need to change.                   ║
// ╚══════════════════════════════════════════════════════════════════════════╝

import * as THREE from 'three';

export const RELIEF_SIZE = 512; // data texture resolution (square) — smoother edges

// --- Blob primitives -------------------------------------------------------
// A blob is a soft elliptical dome in uv-space. `patch` marks the black-fur
// regions (ears/eyes/arms) for the printed silhouette channel.
interface Blob {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  h: number;
  patch: boolean;
  rot?: number; // radians — lets patches be slanted (panda eye teardrops)
}

function blobShape(u: number, v: number, b: Blob): number {
  let ex = u - b.cx;
  let ey = v - b.cy;
  if (b.rot) {
    const c = Math.cos(b.rot);
    const s = Math.sin(b.rot);
    const rx = ex * c - ey * s;
    const ry = ex * s + ey * c;
    ex = rx;
    ey = ry;
  }
  const dx = ex / b.rx;
  const dy = ey / b.ry;
  const d2 = dx * dx + dy * dy;
  if (d2 >= 1) return 0;
  const f = 1 - d2;
  // smoothstep(f): zero slope at both center and rim → a rounded plateau dome
  // (soft toy-panda mass) instead of a sharp cone.
  return f * f * (3 - 2 * f);
}

// Smooth max — merges overlapping blobs into rounded, welded forms instead of
// hard intersections. k controls the blend radius.
function smax(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + h * h * k * 0.25;
}

// --- The panda scene -------------------------------------------------------
// uv convention (verified against the debug plane): u = left→right,
// v = front(near camera, 0) → back(far, 1). Mother stands at back, cubs in
// front, hills furthest back. Heights are pre-normalization (peak ~0.95).

// White-fur masses. Plush/chibi proportions: chunky round bodies, BIG round
// heads, small features. uv: u = left→right, v = front(near,0) → back(far,1);
// the mother sits facing the camera (head up/back) hugging two cubs in front.
const FUR: Blob[] = [
  // --- Mother panda: chunky round body + a big round head (plush toy) ---
  { cx: 0.5, cy: 0.38, rx: 0.29, ry: 0.27, h: 0.64, patch: false }, // body
  { cx: 0.5, cy: 0.68, rx: 0.31, ry: 0.29, h: 0.8, patch: false }, // head (big, round)
  { cx: 0.5, cy: 0.6, rx: 0.11, ry: 0.085, h: 0.74, patch: false }, // muzzle (gentle snout)

  // --- Two cubs in front (chunky, big-headed) ---
  { cx: 0.34, cy: 0.15, rx: 0.12, ry: 0.11, h: 0.4, patch: false }, // cub L body
  { cx: 0.34, cy: 0.27, rx: 0.11, ry: 0.1, h: 0.5, patch: false }, // cub L head (big)
  { cx: 0.66, cy: 0.15, rx: 0.12, ry: 0.11, h: 0.4, patch: false }, // cub R body
  { cx: 0.66, cy: 0.27, rx: 0.11, ry: 0.1, h: 0.5, patch: false }, // cub R head (big)
];

// Black-patch masses. Ears/arms are gentle raised bumps welded to their parent;
// eyes/nose are FLAT markings (h = 0) that only paint the mask. Small & cute.
// Eye patches are slanted teardrops (rot) for the iconic panda look.
const PATCH: Blob[] = [
  // Mother ears — small round bumps on the head-top corners
  { cx: 0.35, cy: 0.86, rx: 0.07, ry: 0.065, h: 0.5, patch: true },
  { cx: 0.65, cy: 0.86, rx: 0.07, ry: 0.065, h: 0.5, patch: true },
  // Mother eye patches — small slanted teardrops (tilt toward the nose)
  { cx: 0.42, cy: 0.68, rx: 0.045, ry: 0.065, h: 0.0, patch: true, rot: 0.45 },
  { cx: 0.58, cy: 0.68, rx: 0.045, ry: 0.065, h: 0.0, patch: true, rot: -0.45 },
  // Mother nose — small black marking on the muzzle
  { cx: 0.5, cy: 0.61, rx: 0.026, ry: 0.021, h: 0.0, patch: true },
  // Mother arms — raised black limbs hugging down & inward toward the cubs
  { cx: 0.3, cy: 0.31, rx: 0.085, ry: 0.14, h: 0.5, patch: true, rot: -0.35 },
  { cx: 0.7, cy: 0.31, rx: 0.085, ry: 0.14, h: 0.5, patch: true, rot: 0.35 },

  // Cub L ears / eyes / nose (small)
  { cx: 0.29, cy: 0.335, rx: 0.04, ry: 0.037, h: 0.34, patch: true },
  { cx: 0.39, cy: 0.335, rx: 0.04, ry: 0.037, h: 0.34, patch: true },
  { cx: 0.315, cy: 0.27, rx: 0.024, ry: 0.033, h: 0.0, patch: true, rot: 0.4 },
  { cx: 0.385, cy: 0.27, rx: 0.024, ry: 0.033, h: 0.0, patch: true, rot: -0.4 },
  { cx: 0.35, cy: 0.235, rx: 0.016, ry: 0.014, h: 0.0, patch: true },
  // Cub R ears / eyes / nose (small)
  { cx: 0.61, cy: 0.335, rx: 0.04, ry: 0.037, h: 0.34, patch: true },
  { cx: 0.71, cy: 0.335, rx: 0.04, ry: 0.037, h: 0.34, patch: true },
  { cx: 0.615, cy: 0.27, rx: 0.024, ry: 0.033, h: 0.0, patch: true, rot: 0.4 },
  { cx: 0.685, cy: 0.27, rx: 0.024, ry: 0.033, h: 0.0, patch: true, rot: -0.4 },
  { cx: 0.65, cy: 0.235, rx: 0.016, ry: 0.014, h: 0.0, patch: true },
];

const ALL: Blob[] = [...FUR, ...PATCH];
const SMOOTH_K = 0.18; // blend radius for smax welding (softer, chunkier merges)
const NORM = 0.86; // divisor so the tallest welded form lands near 1.0

/**
 * Height of the relief at (u, v). Both in [0,1]; out-of-range clamps.
 * Returns [0,1] where 0 is the flat sheet and 1 is the tallest fur.
 */
export function sampleHeight(u: number, v: number): number {
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  v = v < 0 ? 0 : v > 1 ? 1 : v;
  let acc = 0;
  for (let i = 0; i < ALL.length; i++) {
    const b = ALL[i];
    const c = b.h * blobShape(u, v, b);
    if (c <= 0) continue;
    acc = smax(acc, c, SMOOTH_K);
  }
  acc /= NORM;
  return acc < 0 ? 0 : acc > 1 ? 1 : acc;
}

/**
 * Black-patch mask at (u, v) in [0,1]. 1 where a black patch (ear/eye/arm/leg)
 * dominates. Used later for the printed silhouette; not used for displacement.
 */
export function samplePatch(u: number, v: number): number {
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  v = v < 0 ? 0 : v > 1 ? 1 : v;
  let patch = 0;
  for (let i = 0; i < PATCH.length; i++) {
    const s = blobShape(u, v, PATCH[i]);
    if (s > patch) patch = s;
  }
  // Only count the patch where the surface actually exists (has some height).
  const covered = sampleHeight(u, v) > 0.12 ? 1 : 0;
  const m = patch * 1.6 * covered;
  return m < 0 ? 0 : m > 1 ? 1 : m;
}

// --- Data texture ----------------------------------------------------------
let cached: THREE.DataTexture | null = null;

/**
 * Render the field to a DataTexture the shaders sample.
 *   R channel = height  (0..255)
 *   G channel = patch mask (0..255)
 * Cached after first build.
 */
export function heightToDataTexture(size: number = RELIEF_SIZE): THREE.DataTexture {
  if (cached && cached.image.width === size) return cached;

  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    // Row 0 is the bottom of the texture (flipY handles orientation); sample v
    // to match so u,v line up with the geometry uvs.
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const i = (y * size + x) * 4;
      data[i + 0] = Math.round(sampleHeight(u, v) * 255);
      data[i + 1] = Math.round(samplePatch(u, v) * 255);
      data[i + 2] = 0;
      data[i + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  cached = tex;
  return tex;
}
