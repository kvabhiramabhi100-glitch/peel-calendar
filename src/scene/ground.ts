// ground.ts — owns a soft baked contact-shadow decal that grounds the calendar
// pad (and the revealed panda) onto the desk photo. A real cast shadow can't
// ground the vertex-displaced relief without a custom depth material, so a soft
// dark blob on the desk plane does the grounding instead — and it stays
// consistent whether the pad is tall (flat calendar) or flat (revealed sculpture).

import * as THREE from 'three';

function softShadowTexture(): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  // Soft rounded blob: fairly solid centre, feathered edges.
  const grad = g.createRadialGradient(S / 2, S / 2, S * 0.06, S / 2, S / 2, S * 0.5);
  grad.addColorStop(0.0, 'rgba(24,22,16,0.42)');
  grad.addColorStop(0.5, 'rgba(24,22,16,0.26)');
  grad.addColorStop(1.0, 'rgba(24,22,16,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(S / 2, S / 2, S * 0.5, 0, Math.PI * 2);
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createGround(scene: THREE.Scene): THREE.Group {
  const group = new THREE.Group();

  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.95, 1.75),
    new THREE.MeshBasicMaterial({
      map: softShadowTexture(),
      transparent: true,
      depthWrite: false,
    })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0.08, -0.004, -0.03); // desk level, nudged toward the shadow side
  shadow.renderOrder = -1;
  group.add(shadow);

  scene.add(group);
  return group;
}
