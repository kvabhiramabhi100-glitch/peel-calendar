// stack.ts — builds & owns the page stack. PAGES sheets, all sharing the ONE
// PAGE_GEOMETRY from page.ts, stacked at descending Y and carved at descending
// depth (top page flat, bottom page full relief).
//
// Geometry that makes it read as a SOLID CARVED BLOCK:
//   - depth p_i = 1 - i/(N-1):  top page (i=0) = 1 (flat) … bottom = 0 (full).
//   - Y_i = (N-1-i) * gap:      top page highest, bottom page at y=0.
//   - gap = relief/(N-1):       "exact fit" — every page's tallest terrace rises
//     exactly to the flat top plane, so pages meet along the terraces and NONE
//     pokes above the page over it. Peeling a page drops the visible "sea level"
//     (p_topmost decreases), exposing more of the form.

import * as THREE from 'three';
import { createPage, type Page } from './page.ts';

export interface StackConfig {
  pages: number;
  relief: number;
  gap: number; // if <= 0, computed as relief/(pages-1)
  levels: number;
  // When true the pages stay FLAT (no carved relief) — used when a real GLB
  // sculpture provides the form instead. `relief` still sets the pad thickness.
  flatPages?: boolean;
  // Optional per-page printed face (page 0 = top). Falls back to a moss
  // placeholder when omitted.
  face?: (pageIndex: number) => THREE.Texture;
}

export interface Stack {
  group: THREE.Group;
  pages: Page[]; // index 0 = top of stack
  config: StackConfig;
  topY: number; // world Y of the flat top page
  core: THREE.Mesh; // solid moss block filling behind the pages (sides read solid)
}

export const DEFAULT_STACK: StackConfig = {
  pages: 44,
  relief: 0.36, // thinner pad → reads as a paper pad lying on the desk
  gap: 0,
  // 0 → auto: one terrace step per sheet (levels = pages - 1). This is what makes
  // the sculpture read as CUT FROM THE PAPER: each contour of the carve lands
  // exactly on a page plane, like the laser-cut layers of a real paper block.
  levels: 0,
};

export function createStack(cfg: Partial<StackConfig> = {}): Stack {
  const config: StackConfig = { ...DEFAULT_STACK, ...cfg };
  const N = config.pages;
  const gap = config.gap > 0 ? config.gap : config.relief / (N - 1);
  config.gap = gap;
  // One terrace per sheet → carve contours land exactly on the page planes.
  const levels = config.levels > 0 ? config.levels : N - 1;
  config.levels = levels;

  const group = new THREE.Group();
  const pages: Page[] = [];

  // Solid moss core, slightly inset, filling the interior so between-page gaps
  // don't show the background and the sides read as a solid pad. Its height is
  // updated each frame (in main) to track the current top page.
  const core = new THREE.Mesh(
    new THREE.BoxGeometry(0.985, 1, 0.985),
    new THREE.MeshStandardMaterial({ color: 0xf0ece3, roughness: 1, metalness: 0 })
  );
  core.castShadow = true;
  core.receiveShadow = true;
  group.add(core);

  for (let i = 0; i < N; i++) {
    const depth = 1 - i / (N - 1); // top flat → bottom full
    const page = createPage({
      pageDepth: depth,
      relief: config.flatPages ? 0 : config.relief, // 0 → no carve, plain sheets
      levels: config.levels,
    });
    page.mesh.position.y = (N - 1 - i) * gap; // top page highest
    if (config.face) page.uniforms.uFace.value = config.face(i);
    pages.push(page);
    group.add(page.mesh);
  }

  // The visible top sheet is a die-cut frame: the sculpture pokes through it.
  if (pages.length > 0) pages[0].uniforms.uFrame.value = 1;

  return { group, pages, config, topY: (N - 1) * gap, core };
}
