// The app's icons ([PWA-1]): a house under its roof with the slide beside it, drawn in the module colours the model
// gives the house (A45), the roof (F34) and the slide (G01), on the stylesheet's accent colour. `npm run icons`
// (model/icons-cli.ts) writes them to public/icons/ as PNG files, which src/pwa/app-manifest.ts names. Node only:
// the PNG is written with node:zlib, and nothing here needs a package.
import { deflateSync } from 'node:zlib';
import { THEME_COLOR } from '../src/pwa/app-manifest.ts';
import type { Rgb } from '../src/domain/model.ts';
import { MODULE_COLORS } from './generator.ts';

type Point = readonly [number, number];
interface Shape { color: Rgb; points: readonly Point[] }

/** One icon file: its path under public/, its size in pixels, and whether it is maskable. */
export interface IconSpec { path: string; size: number; maskable: boolean }

export const ICON_SPECS: readonly IconSpec[] = [
  { path: 'public/icons/icon-192.png', size: 192, maskable: false },
  { path: 'public/icons/icon-512.png', size: 512, maskable: false },
  { path: 'public/icons/icon-maskable-512.png', size: 512, maskable: true },
  { path: 'public/icons/apple-touch-icon.png', size: 180, maskable: false },
];

/** `#rrggbb` as three numbers from 0 to 1. */
export function hexRgb(hex: string): Rgb {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) throw new Error(`${hex} is not a #rrggbb colour`);
  return [parseInt(match[1]!, 16) / 255, parseInt(match[2]!, 16) / 255, parseInt(match[3]!, 16) / 255];
}

export const BACKGROUND: Rgb = hexRgb(THEME_COLOR);

/** The drawing, in a unit square with y pointing down; later shapes lie over earlier ones. */
export const SHAPES: readonly Shape[] = [
  // The slide, from the house's floor down to the ground on the right.
  { color: MODULE_COLORS.G01, points: [[0.56, 0.52], [0.66, 0.52], [1.0, 0.92], [1.0, 1.0], [0.9, 1.0]] },
  // The house.
  { color: MODULE_COLORS.A45, points: [[0.08, 0.42], [0.62, 0.42], [0.62, 1.0], [0.08, 1.0]] },
  // The roof.
  { color: MODULE_COLORS.F34, points: [[0.35, 0.0], [0.7, 0.44], [0.0, 0.44]] },
];

/**
 * How much of the icon's width the drawing takes. A maskable icon may be cut to a circle of 80 % of its width, so its
 * drawing stays inside that circle.
 */
export const DRAWING_SCALE = { any: 0.68, maskable: 0.5 } as const;

function inside(x: number, y: number, points: readonly Point[]): boolean {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i]!;
    const [xj, yj] = points[j]!;
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** Samples per pixel along each axis, for smooth edges. */
const SAMPLES = 4;

/** The icon's pixels: `size` rows of `size` RGB triples, 8 bits each. */
export function renderIcon(size: number, maskable: boolean): Uint8Array {
  const scale = maskable ? DRAWING_SCALE.maskable : DRAWING_SCALE.any;
  const offset = (1 - scale) / 2;
  // Each shape's bounding box, so most samples skip the polygon test.
  const boxes = SHAPES.map(({ points }) => {
    const xs = points.map(p => p[0]);
    const ys = points.map(p => p[1]);
    return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)] as const;
  });
  const pixels = new Uint8Array(size * size * 3);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        // The sample, in the drawing's unit square.
        const y = ((py + (sy + 0.5) / SAMPLES) / size - offset) / scale;
        for (let sx = 0; sx < SAMPLES; sx++) {
          const x = ((px + (sx + 0.5) / SAMPLES) / size - offset) / scale;
          let color = BACKGROUND;
          for (let s = 0; s < SHAPES.length; s++) {
            const [x0, x1, y0, y1] = boxes[s]!;
            if (x >= x0 && x <= x1 && y >= y0 && y <= y1 && inside(x, y, SHAPES[s]!.points)) color = SHAPES[s]!.color;
          }
          r += color[0];
          g += color[1];
          b += color[2];
        }
      }
      const at = (py * size + px) * 3;
      const n = SAMPLES * SAMPLES;
      pixels[at] = Math.round((r / n) * 255);
      pixels[at + 1] = Math.round((g / n) * 255);
      pixels[at + 2] = Math.round((b / n) * 255);
    }
  }
  return pixels;
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** A PNG of square RGB pixels, as `renderIcon` returns them. */
export function encodePng(pixels: Uint8Array, size: number): Uint8Array {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, size);
  view.setUint32(4, size);
  header.set([8, 2, 0, 0, 0], 8); // 8 bits per channel, RGB, deflate, no filter method, no interlace
  // Each row starts with its filter type, 0: the bytes as they are.
  const raw = new Uint8Array(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) raw.set(pixels.subarray(y * size * 3, (y + 1) * size * 3), y * (size * 3 + 1) + 1);
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array()),
  ];
  const png = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    png.set(part, at);
    at += part.length;
  }
  return png;
}
