// page.frag.glsl — lit paper surface for a page.
//
// Two regimes, blended by how much this fragment is carved (vCarved):
//   * FLAT sheet (vCarved ~ 0): the printed calendar face (uFace).
//   * CARVED relief (vCarved > 0): the panda — white fur with dark markings
//     read from the patch mask (uHeight.g).
//
// On top of the base lighting it layers the things that sell it as real paper:
// fibre grain, a soft off-axis sheen, a contact shadow hugging the die-cut hole,
// crevice shading down in the terraces, and a gentle falloff toward the sheet's
// edges. uOpacity fades a tossed page out.

uniform sampler2D uFace;   // printed calendar face
uniform sampler2D uHeight; // R = relief height, G = dark-patch mask
uniform float uOpacity;
uniform float uFrame;      // 1 = top sheet: die-cut frame, hole punched below
uniform float uPageDepth;  // this sheet's slice into the relief (for the cut)
uniform float uLevels;     // terrace quantization (for the cut)

varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vWorldPos;
varying float vCarved;

const vec3 EDGE = vec3(0.84, 0.83, 0.8);  // warm light-grey paper edges / walls
const vec3 FUR = vec3(0.86, 0.85, 0.82);  // warm panda white clay
const vec3 PATCH = vec3(0.1, 0.11, 0.13); // panda dark markings

// --- cheap value noise (paper fibre) --------------------------------------
float hash21(vec2 p) {
  p = fract(p * vec2(233.34, 851.73));
  p += dot(p, p + 23.45);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

void main() {
  // Terraced cross-section of the sculpture at this sheet's depth. Positive
  // "outside" distance means this pixel is paper; <= 0 is where the form rises.
  float rawH = texture2D(uHeight, vUv).r;
  float terraced = floor(rawH * uLevels) / uLevels;
  float outside = uPageDepth - terraced;

  // Die-cut: on the top sheet, punch out the sculpture's cross-section so the
  // form pokes through the paper and the sheet peels away as a frame around it.
  // Sampled PER-PIXEL so the cut edge resolves at texture resolution.
  if (uFrame > 0.5 && outside < 0.0) discard;

  vec3 N = normalize(vNormalW);
  vec3 V = normalize(cameraPosition - vWorldPos);

  // Soft matte lighting, kept below clipping so the white paper sits into the
  // warm desk rather than blowing out.
  vec3 keyDir = normalize(vec3(-1.4, 3.2, 1.8));
  float key = max(dot(N, keyDir), 0.0);
  float ambient = 0.68 + 0.08 * (N.y * 0.5 + 0.5);
  float light = ambient + key * 0.3;

  // How "up-facing" the surface is: 1 on flat tops, ~0 on vertical walls.
  float upness = smoothstep(0.2, 0.75, N.y);

  // Flat calendar sheet: printed face on tops, plain light-grey on walls/edges.
  vec3 face = texture2D(uFace, vUv).rgb;
  vec3 sheet = mix(EDGE, face, upness);

  // Panda colouring on the carved relief.
  float patchMask = texture2D(uHeight, vUv).g;
  vec3 panda = mix(FUR, PATCH, smoothstep(0.35, 0.6, patchMask));

  // Blend sheet → panda as the fragment rises out of the flat page.
  float onRelief = smoothstep(0.02, 0.07, vCarved);
  vec3 col = mix(sheet, panda, onRelief);

  // --- paper fibre grain -------------------------------------------------
  // Two octaves: fine speckle plus a stretched fibre direction. Kept subtle and
  // slightly stronger on the flat print than on the sculpted form.
  float speck = vnoise(vUv * 620.0);
  float fibre = vnoise(vec2(vUv.x * 190.0, vUv.y * 780.0));
  float grain = (speck - 0.5) * 0.055 + (fibre - 0.5) * 0.035;
  col *= 1.0 + grain * mix(0.7, 1.0, 1.0 - onRelief);

  // --- contact shadow hugging the die-cut ---------------------------------
  // Paper right at the cut sits in the shadow of the form rising through it.
  float holeAO = 1.0 - 0.42 * exp(-max(outside, 0.0) * 55.0);

  // --- crevice shading in the terraces ------------------------------------
  // Deeper folds of the relief catch less light.
  float crevice = mix(1.0, 0.90, (1.0 - upness) * onRelief);

  // --- edge falloff on the sheet ------------------------------------------
  // A whisper of darkening toward the paper's border so it doesn't read flat.
  vec2 q = abs(vUv - 0.5) * 2.0;
  float border = 1.0 - 0.07 * smoothstep(0.72, 1.0, max(q.x, q.y));

  // --- soft sheen ----------------------------------------------------------
  // Broad, low-intensity Blinn highlight — coated paper catches a sheen rather
  // than a specular dot.
  vec3 H = normalize(keyDir + V);
  float sheen = pow(max(dot(N, H), 0.0), 26.0) * 0.10 * upness;

  col *= light * mix(0.86, 1.0, upness) * holeAO * crevice * border;
  col += sheen;

  gl_FragColor = vec4(col, uOpacity);
}
