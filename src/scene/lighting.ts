// lighting.ts — owns all scene lights: hemisphere fill, raking directional key
// (casts soft PCF shadows to catch relief ridges), and a dim green rim light.

import * as THREE from 'three';

export interface Lights {
  hemi: THREE.HemisphereLight;
  key: THREE.DirectionalLight;
  rim: THREE.DirectionalLight;
}

export function createLighting(scene: THREE.Scene): Lights {
  // Bright, even soft-studio fill (matte clay look): near-white sky, light-grey
  // ground bounce so shadows stay open and gentle.
  const hemi = new THREE.HemisphereLight(0xfff7ec, 0xd9d3c8, 1.0); // warm sky to match the desk
  scene.add(hemi);

  // Gentle key from the upper-left for a soft, product-render highlight. Soft
  // PCF shadows, kept subtle.
  const key = new THREE.DirectionalLight(0xfff4e8, 1.05); // warm key, softened
  key.position.set(-1.4, 4.2, 1.6); // more top-down → short soft shadow like the photo
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 12;
  const s = 2.6;
  key.shadow.camera.left = -s;
  key.shadow.camera.right = s;
  key.shadow.camera.top = s;
  key.shadow.camera.bottom = -s;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 6; // softer shadow edges
  scene.add(key);
  scene.add(key.target);

  // Soft warm fill from the right to open the shadow side (no cool blue fringe).
  const rim = new THREE.DirectionalLight(0xf3ece0, 0.32);
  rim.position.set(3.0, 1.4, 0.6);
  scene.add(rim);

  return { hemi, key, rim };
}
