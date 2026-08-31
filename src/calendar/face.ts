// face.ts — draws the printed calendar sheet as a CanvasTexture. Editorial look:
// a white rounded sheet, the MONTH in bold black at the top, a big elegant
// serif RED day number, and the weekday in heavy black below. With
// { showSilhouette } it faintly prints the panda into the sheet (exposed pages).

import * as THREE from 'three';
import { sampleHeight, samplePatch } from '../relief/relief.ts';

const SHEET = '#f8f5ee'; // warm off-white paper (sits into the desk, not glowing)
const RED = '#f82e2e'; // day number (primary red)
const INK = '#141518'; // month + weekday

// Number uses Eugusto; sans text uses Gilroy. Fallbacks kick in until the font
// files are added (Playfair for the serif number, Poppins/system for the sans).
const SERIF = "'Eugusto', 'Playfair Display', 'Didot', Georgia, serif";
const SANS = "'Gilroy', 'Poppins', -apple-system, 'Helvetica Neue', Arial, sans-serif";

export interface FaceOptions {
  showSilhouette?: boolean;
}

const MONTHS = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
];
const WD = [
  'SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY',
];

// --- Cached panda silhouette (soft grey, printed faintly on the white sheet) ---
let silCanvas: HTMLCanvasElement | null = null;
function silhouette(): HTMLCanvasElement {
  if (silCanvas) return silCanvas;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S;
      const v = 1 - (y + 0.5) / S;
      const h = sampleHeight(u, v);
      const p = samplePatch(u, v);
      const i = (y * S + x) * 4;
      const g = p > 0.5 ? 150 : 205;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = g;
      img.data[i + 3] = Math.round(smoothstep(0.08, 0.42, h) * 130);
    }
  }
  ctx.putImageData(img, 0, 0);
  silCanvas = c;
  return c;
}

// Set ctx.font to `weight px family`, shrinking px so `text` fits within maxW.
function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
  basePx: number,
  weight: string,
  family: string
): void {
  let px = basePx;
  ctx.font = `${weight} ${px}px ${family}`;
  const w = ctx.measureText(text).width;
  if (w > maxW) px = Math.floor((px * maxW) / w);
  ctx.font = `${weight} ${px}px ${family}`;
}

// Accent colour of the pad's base board — the surface the sculpture is finally
// revealed sitting on. Bold so the reveal lands on something vibrant.
export const BASE_ACCENT = '#ff5733'; // primary orange

/**
 * The pad's bottom board: a solid accent sheet (no calendar type) with a subtle
 * inner shading so it reads as a printed board rather than flat colour.
 */
export function drawBaseFace(): THREE.CanvasTexture {
  const S = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = BASE_ACCENT;
  ctx.fillRect(0, 0, S, S);

  // Gentle radial shading: slightly brighter centre, softly deeper edges.
  const g = ctx.createRadialGradient(S * 0.5, S * 0.42, S * 0.05, S * 0.5, S * 0.5, S * 0.75);
  g.addColorStop(0, 'rgba(255,255,255,0.13)');
  g.addColorStop(0.55, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(90,20,0,0.16)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

export function drawFace(date: Date, opts: FaceOptions = {}): THREE.CanvasTexture {
  const S = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d')!;

  // Clean paper sheet.
  ctx.fillStyle = SHEET;
  ctx.fillRect(0, 0, S, S);

  // Faint panda in the upper-middle (exposed pages).
  if (opts.showSilhouette) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    const w = S * 0.5;
    ctx.drawImage(silhouette(), (S - w) / 2, S * 0.04, w, w);
    ctx.restore();
  }

  ctx.textAlign = 'center';

  // Month, bold black, top.
  ctx.fillStyle = INK;
  ctx.textBaseline = 'alphabetic';
  fitFont(ctx, MONTHS[date.getMonth()], S * 0.6, Math.round(S * 0.06), '700', SANS);
  ctx.fillText(MONTHS[date.getMonth()], S * 0.5, S * 0.17);

  // Big elegant serif red day number.
  ctx.fillStyle = RED;
  ctx.textBaseline = 'middle';
  ctx.font = `500 ${Math.round(S * 0.33)}px ${SERIF}`;
  ctx.fillText(String(date.getDate()), S * 0.5, S * 0.46);

  // Weekday, heavy black, large — fit to width for long names.
  ctx.fillStyle = INK;
  ctx.textBaseline = 'alphabetic';
  fitFont(ctx, WD[date.getDay()], S * 0.84, Math.round(S * 0.15), '800', SANS);
  ctx.fillText(WD[date.getDay()], S * 0.5, S * 0.76);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
