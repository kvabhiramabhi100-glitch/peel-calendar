// sculpture.ts — loads the panda GLB and reveals it in step with the peel.
//
// The model replaces the procedural carved relief. To keep the "buried in the
// paper stack" magic, its material is CLIPPED at the current top-page height:
// only the part of the panda ABOVE the top sheet renders, so peeling pages
// lowers the sea level and the panda emerges from the pad, top-down.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const MODEL_URL = '/models/panda.glb';

// Footprint/height the panda is normalized into (pad is 1x1 in X/Z).
const TARGET_WIDTH = 0.62; // max of X/Z extent
// Y extent must stay under the pad thickness (stack `relief`, 0.36) so the
// panda is completely buried in a full pad and fully exposed once peeled out.
const TARGET_HEIGHT = 0.345;

export interface Sculpture {
  group: THREE.Group;
  /** Show only the part above this world Y (the current top-page height). */
  setRevealLevel: (worldY: number) => void;
  dispose: () => void;
}

export function createSculpture(parent: THREE.Object3D): Sculpture {
  const group = new THREE.Group();
  parent.add(group);

  // Keeps only geometry above the plane: p.y + constant > 0  →  p.y > level.
  const clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const materials: THREE.Material[] = [];

  new GLTFLoader().load(MODEL_URL, (gltf) => {
    const model = gltf.scene;

    // Sketchfab/FBX exports are usually Z-up — stand the panda upright.
    model.rotation.x = -Math.PI / 2;
    model.updateMatrixWorld(true);

    // Normalize: centre on X/Z, sit its feet at y = 0, fit the target size.
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const scale = Math.min(
      TARGET_WIDTH / Math.max(size.x, size.z),
      TARGET_HEIGHT / size.y
    );
    model.scale.setScalar(scale);
    model.updateMatrixWorld(true);

    const scaled = new THREE.Box3().setFromObject(model);
    const centre = scaled.getCenter(new THREE.Vector3());
    model.position.x -= centre.x;
    model.position.z -= centre.z;
    model.position.y -= scaled.min.y; // feet on the pad's base plane

    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        m.clippingPlanes = [clipPlane];
        m.clipShadows = true;
        m.side = THREE.DoubleSide; // clipped cross-section stays solid-looking
        materials.push(m);
      }
    });

    group.add(model);
  });

  function setRevealLevel(worldY: number): void {
    // Plane lives in world space; group may be rotated by the idle/orbit parent,
    // but the reveal is purely vertical so a world-Y plane is correct.
    clipPlane.constant = -worldY;
  }

  function dispose(): void {
    parent.remove(group);
    group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) mesh.geometry?.dispose();
    });
    for (const m of materials) m.dispose();
  }

  return { group, setRevealLevel, dispose };
}
