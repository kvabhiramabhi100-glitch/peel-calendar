# Peel-Off Sculpture Calendar

A web peel-off desk calendar. Drag the top-right corner of a sheet to peel it —
each page tears away, the date counts down, and a 3D panda sculpture buried in
the paper pad is progressively revealed.

Built with **Vite + TypeScript + raw Three.js** (no React). Fully client-side and
static-deployable.

## Run

```bash
npm install
npm run dev
```

## Build

```bash
npm run build     # → dist/
npm run preview   # serve the production build locally
```

## Controls

| Action | How |
| --- | --- |
| Peel a page | Drag the sheet's top-right corner upward |
| Orbit / tilt | Drag the background |
| Zoom | Scroll / pinch |
| Reveal the sculpture | **✦ Reveal sculpture** — auto-peels the whole pad |
| Start over | **↺ Restack** |

## How it works

- **One shared `PlaneGeometry(1,1,128,128)`** across all pages — pages differ only
  by per-material uniforms, never cloned geometry (`src/scene/page.ts`).
- **Vertex shader** (`src/shaders/page.vert.glsl`) does the hinge-curl: a
  constant-curvature bend around the sheet's back edge, driven by `uPeel`.
- **Peel state machine** (`src/peel/peel.ts`): `idle → grabbing → relaxing | tossing`.
  The grab raycasts an invisible flat proxy plane at the top sheet's rest position
  (never the curled mesh). Tossed pages fly up-and-away **in camera space**, so they
  never sail into the lens at any orbit angle.
- **The sculpture** (`src/scene/sculpture.ts`) is a GLB clipped by a plane pinned to
  the current top-sheet height — only the part above the sheet renders, so peeling
  lowers the "sea level" and the panda emerges top-down out of the pad.
- **Compositing** (`src/main.ts`): the desk photo is the scene background, then
  bloom + film grain + vignette run over photo *and* 3D together so the render
  reads as one photograph rather than a pasted-on layer.

## Assets

- `public/desk-bg.png` — desk scene backdrop.
- `public/models/panda.glb` — the revealed sculpture.

Swap either file (keeping the same path) to re-theme the piece. The panda is
auto-centred and scaled on load; keep its height under the pad thickness
(`relief` in `src/scene/stack.ts`) so it stays hidden until peeled.

`src/relief/relief.ts` still holds the original **procedural** height-field
sculpture behind a clearly marked swap seam, if you ever want the carved-relief
look back instead of a mesh.
