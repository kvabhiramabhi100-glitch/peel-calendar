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
- **The sculpture is carved out of the pages themselves** — it is *not* a model
  hidden under the paper. `src/relief/relief.ts` owns a procedural height field
  (the panda), and every page displaces its own geometry by
  `carved = max(0, floor(h·L)/L − pageDepth) · relief`. Because the terrace count
  `L` defaults to `pages − 1`, each contour step lands **exactly on a page plane**,
  so the form is literally built from stacked paper layers — the laser-cut
  paper-block look. Peeling lowers the "sea level" and more of the form appears.
- **Compositing** (`src/main.ts`): the desk photo is the scene background, then
  bloom + film grain + vignette run over photo *and* 3D together so the render
  reads as one photograph rather than a pasted-on layer.

## Assets

- `public/desk-bg.png` — desk scene backdrop. Swap the file (same path) to
  re-theme the scene.

The sculpture needs no asset — it is generated procedurally. `relief.ts` marks a
**swap seam**: point it at a grayscale height PNG (white = tall, black = flat) to
carve any other shape while keeping the paper-layer look.
