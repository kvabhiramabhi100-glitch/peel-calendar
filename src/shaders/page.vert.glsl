// page.vert.glsl — owns page geometry deformation. Two jobs (spec):
//   1. CARVE: terraced height displacement from the relief texture.
//   2. HINGE-CURL: bend the sheet around its back edge, driven by uPeel.
//
// The page mesh is rotated -90° about X by the factory, so LOCAL axes map to the
// world as: local +Z → world +Y (up), local +Y → world -Z (back). The hinge is
// the back edge, world z = -0.5, i.e. LOCAL y = +0.5. The peel lifts the front
// edge (local y = -0.5) up and rolls it back over the hinge.

uniform sampler2D uHeight; // R = relief height [0,1], G = patch mask
uniform float uPageDepth;  // 0..1 this page's slice into the relief
uniform float uPeel;       // 0..1 curl amount
uniform float uRelief;     // world height of the full sculpture
uniform float uLevels;     // terracing quantization (e.g. 22)
// 1 on the TOP sheet: it is a die-cut FRAME, not sculpture. It stays flat and the
// fragment shader punches out the sculpture's cross-section, so the form pokes
// through the paper and the sheet lifts away around it (never dragging it).
uniform float uFrame;

varying vec2 vUv;
varying vec3 vNormalW;
varying float vCarved;    // displaced carve (0 on a frame sheet)


const float HINGE_Y = 0.5;         // local y of the back-edge hinge
const float PEEL_MAX_ANGLE = 2.7;  // total curl angle (rad) at uPeel = 1

// Terraced carve height at a uv.
// Terraced carve — used for the actual displacement (the layered paper look).
float carvedAt(vec2 uvp) {
  float raw = texture2D(uHeight, uvp).r;
  float h = floor(raw * uLevels) / uLevels;
  return max(0.0, h - uPageDepth) * uRelief;
}

void main() {
  vUv = uv;

  // --- Job 1: carve (flat sheet + relief along local +Z) ---
  // A frame sheet keeps its true cross-section (for the cut-out) but is NOT
  // displaced — it stays a flat sheet of paper.
  float cRaw = carvedAt(uv);
  // (cut-out is evaluated per-pixel in the fragment shader)
  float c = cRaw * (1.0 - uFrame);
  vCarved = c;

  // Lighting normal from finite differences of the TERRACED field, so each paper
  // layer gets a flat lit top and a shaded riser — the stacked-paper contour look.
  float e = 1.0 / 128.0;
  float hL = carvedAt(uv - vec2(e, 0.0));
  float hR = carvedAt(uv + vec2(e, 0.0));
  float hD = carvedAt(uv - vec2(0.0, e));
  float hU = carvedAt(uv + vec2(0.0, e));
  vec3 nFlat = normalize(vec3(
    -((hR - hL) / (2.0 * e)) * (1.0 - uFrame),
    -((hU - hD) / (2.0 * e)) * (1.0 - uFrame),
    1.0
  ));

  // Flat carved point.
  vec3 p = vec3(position.x, position.y, c);
  vec3 n = nFlat;

  // --- Job 2: hinge-curl (constant-curvature arc about the back edge) ---
  float Phi = uPeel * PEEL_MAX_ANGLE; // total bend across the sheet
  if (Phi > 1e-4) {
    float d = clamp(HINGE_Y - position.y, 0.0, 1.0); // distance from hinge → front
    float phi = Phi * d;                              // angle grows with distance
    float invK = 1.0 / Phi;                           // arc radius = 1/curvature

    // Bent base position: curl up (local +Z) and back toward the hinge (local +Y).
    float oy = -sin(phi) * invK;
    float oz = (1.0 - cos(phi)) * invK;
    vec3 base = vec3(position.x, HINGE_Y + oy, oz);

    // Rotate the relief offset + normal by the local bend (about local X).
    float cs = cos(phi);
    float sn = sin(phi);
    vec3 nb = vec3(nFlat.x, nFlat.y * cs - nFlat.z * sn, nFlat.y * sn + nFlat.z * cs);
    // Sheet surface normal (flat +Z) bent the same way, for riding the relief.
    vec3 surf = vec3(0.0, -sn, cs);

    p = base + c * surf;
    n = nb;
  }

  vNormalW = normalize(mat3(modelMatrix) * n);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
