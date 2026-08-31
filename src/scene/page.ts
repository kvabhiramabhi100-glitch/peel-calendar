// page.ts — owns the single page mesh + its material factory.
//
// Hard rule from the spec: ONE PlaneGeometry shared by every page. Pages differ
// ONLY by per-material uniforms (uPageDepth / uPeel / ...). Never clone geometry
// per page. This module exports that one shared geometry and a createPage()
// factory that builds a ShaderMaterial + Mesh around it.

import * as THREE from 'three';
import vertexShader from '../shaders/page.vert.glsl?raw';
import fragmentShader from '../shaders/page.frag.glsl?raw';
import { heightToDataTexture } from '../relief/relief.ts';

// THE one shared geometry. 128x128 as specified. Laid flat / facing up is done
// per-mesh via rotation (below), so geometry stays untouched.
export const PAGE_GEOMETRY = new THREE.PlaneGeometry(1, 1, 128, 128);

// Shared relief height texture (cached inside relief.ts).
const HEIGHT_TEX = heightToDataTexture();

// 1x1 moss placeholder so uFace always has a texture until a real face is set.
const PLACEHOLDER_FACE = new THREE.DataTexture(
  new Uint8Array([244, 241, 234, 255]),
  1,
  1,
  THREE.RGBAFormat
);
PLACEHOLDER_FACE.colorSpace = THREE.SRGBColorSpace;
PLACEHOLDER_FACE.needsUpdate = true;

// Defaults per spec.
export const DEFAULT_RELIEF = 1.5;
export const DEFAULT_LEVELS = 22.0;

export interface PageUniforms {
  uHeight: { value: THREE.Texture };
  uFace: { value: THREE.Texture };
  uPageDepth: { value: number };
  uPeel: { value: number };
  uRelief: { value: number };
  uLevels: { value: number };
  uOpacity: { value: number };
}

export interface Page {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  uniforms: PageUniforms;
}

export interface CreatePageOptions {
  pageDepth: number;
  relief?: number;
  levels?: number;
}

export function createPage(opts: CreatePageOptions): Page {
  const uniforms: PageUniforms = {
    uHeight: { value: HEIGHT_TEX },
    uFace: { value: PLACEHOLDER_FACE },
    uPageDepth: { value: opts.pageDepth },
    uPeel: { value: 0 },
    uRelief: { value: opts.relief ?? DEFAULT_RELIEF },
    uLevels: { value: opts.levels ?? DEFAULT_LEVELS },
    uOpacity: { value: 1 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
    vertexShader,
    fragmentShader,
  });

  // Share the ONE geometry; only the material/uniforms are per-page.
  const mesh = new THREE.Mesh(PAGE_GEOMETRY, material);
  mesh.rotation.x = -Math.PI / 2; // lay flat, facing up (local +Z → world up)

  return { mesh, material, uniforms };
}
