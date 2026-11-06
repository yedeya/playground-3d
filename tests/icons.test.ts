/// <reference types="node" />
// The app's icons ([PWA-1]): the files under public/icons/ are the ones `npm run icons` draws (model/icons.ts), in the
// module colours on the stylesheet's accent, and the maskable one keeps its drawing inside the safe zone.
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { MODULE_COLORS } from '../model/generator';
import { BACKGROUND, hexRgb, ICON_SPECS, renderIcon, SHAPES } from '../model/icons';
import { APPLE_TOUCH_ICON, ICONS } from '../src/pwa/app-manifest';

const repo = (path: string) => new URL(`../${path}`, import.meta.url);

/** A PNG's size and RGB pixels, for the 8-bit RGB, unfiltered PNGs `encodePng` writes. */
function decodePng(path: string) {
  const bytes = readFileSync(repo(path));
  expect(bytes.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  let at = 8;
  let width = 0;
  let height = 0;
  const data: Buffer[] = [];
  while (at < bytes.length) {
    const length = bytes.readUInt32BE(at);
    const type = bytes.subarray(at + 4, at + 8).toString('latin1');
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      expect([...body.subarray(8)], `${path} is 8-bit RGB`).toEqual([8, 2, 0, 0, 0]);
    }
    if (type === 'IDAT') data.push(body);
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(data));
  const stride = width * 3 + 1;
  const pixels = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    expect(raw[y * stride], `${path} row ${y} is unfiltered`).toBe(0);
    pixels.set(raw.subarray(y * stride + 1, (y + 1) * stride), y * width * 3);
  }
  return { width, height, pixels };
}

const cssVariable = (name: string) =>
  new RegExp(`--${name}:\\s*([^;]+);`).exec(readFileSync(repo('src/styles.css'), 'utf8'))![1]!.trim();

describe('the icons', () => {
  it('[PWA-1] are drawn in the module colours of the house, the roof and the slide, on the stylesheet\'s accent', () => {
    expect(BACKGROUND).toEqual(hexRgb(cssVariable('accent')));
    expect(SHAPES.map(shape => shape.color)).toEqual([MODULE_COLORS.G01, MODULE_COLORS.A45, MODULE_COLORS.F34]);
  });

  it('[PWA-1] are the files the manifest and the page name: 192 px, 512 px, a maskable 512 px and the 180 px Apple touch icon', () => {
    const named = [...ICONS.map(icon => ({ src: icon.src, sizes: icon.sizes, maskable: icon.purpose === 'maskable' })),
      { src: APPLE_TOUCH_ICON.src, sizes: APPLE_TOUCH_ICON.sizes, maskable: false }];
    const drawn = ICON_SPECS.map(spec => ({ src: `/${spec.path.replace(/^public\//, '')}`, sizes: `${spec.size}x${spec.size}`, maskable: spec.maskable }));
    expect(drawn).toEqual(named);
  });

  it('[PWA-1] are what npm run icons draws, so the committed files match the drawing', () => {
    for (const { path, size, maskable } of ICON_SPECS) {
      const png = decodePng(path);
      expect({ width: png.width, height: png.height }, path).toEqual({ width: size, height: size });
      expect(Buffer.from(png.pixels).equals(Buffer.from(renderIcon(size, maskable))), `${path}: run npm run icons`).toBe(true);
    }
  }, 30_000);

  it('[PWA-1] keep the maskable icon\'s drawing inside its safe zone, the circle of 80 % of its width', () => {
    const spec = ICON_SPECS.find(s => s.maskable)!;
    const { width, pixels } = decodePng(spec.path);
    const background = BACKGROUND.map(c => Math.round(c * 255));
    const centre = width / 2;
    let outside = 0;
    for (let y = 0; y < width; y++) {
      for (let x = 0; x < width; x++) {
        if (Math.hypot(x + 0.5 - centre, y + 0.5 - centre) <= 0.4 * width) continue;
        outside++;
        const at = (y * width + x) * 3;
        expect([pixels[at], pixels[at + 1], pixels[at + 2]], `pixel ${x},${y}`).toEqual(background);
      }
    }
    expect(outside).toBeGreaterThan(0);
  });
});
