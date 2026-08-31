// page.frag.glsl — lit paper surface for a page.
//
// Two regimes, blended by how much this fragment is carved (vCarved):
//   * FLAT sheet (vCarved ~ 0): the printed moss-green calendar face (uFace),
//     with the print fading to flat moss on steep terrace walls.
//   * CARVED relief (vCarved > 0): the panda itself — white fur with black
//     patches (ears / eyes / arms / legs) read from the patch mask (uHeight.g),
//     so the revealed sculpture looks like a real panda, not green paper.
//
// uOpacity fades a tossed page out.

uniform sampler2D uFace;   // printed calendar face (moss + type)
uniform sampler2D uHeight; // R = relief height, G = black-patch mask
uniform float uOpacity;
uniform float uFrame;      // 1 = top sheet: die-cut frame, hole punched below

varying vec2 vUv;
varying vec3 vNormalW;
varying float vCarved;
varying float vCutout;

const vec3 EDGE = vec3(0.84, 0.83, 0.8);  // warm light-grey paper edges / walls
const vec3 FUR = vec3(0.86, 0.85, 0.82);  // warm panda white clay (dimmer, sits into scene)
const vec3 PATCH = vec3(0.1, 0.11, 0.13); // panda dark markings

void main() {
  // Die-cut: on the top sheet, punch out the sculpture's cross-section so the
  // form pokes through the paper and the sheet peels away as a frame around it.
  if (uFrame > 0.5 && vCutout > 0.0005) discard;

  vec3 N = normalize(vNormalW);

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

  // Panda coloring on the carved relief.
  float patchMask = texture2D(uHeight, vUv).g;
  vec3 panda = mix(FUR, PATCH, smoothstep(0.35, 0.6, patchMask));

  // Blend sheet → panda as the fragment rises out of the flat page.
  float onRelief = smoothstep(0.02, 0.07, vCarved);
  vec3 col = mix(sheet, panda, onRelief);

  float wallShade = mix(0.86, 1.0, upness); // gentle darkening on the paper edges
  gl_FragColor = vec4(col * light * wallShade, uOpacity);
}
