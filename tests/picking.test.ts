import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { TAP_OFFSETS, createTapTracker, isTap, pickPart } from '../src/viewer/picking';
import { partMesh } from '../src/viewer/meshes';
import type { Filter, ModuleCode, Source } from '../src/domain/model';

describe('what counts as a tap', () => {
  const at = (x: number, y: number, t: number) => ({ x, y, t });

  it('[APP-14] is a press that moves at most 8 px and lasts at most 500 ms', () => {
    expect(isTap(at(100, 100, 0), at(100, 100, 0))).toBe(true);
    expect(isTap(at(100, 100, 0), at(108, 100, 500))).toBe(true);
    expect(isTap(at(100, 100, 0), at(100, 92, 10))).toBe(true);
    expect(isTap(at(100, 100, 0), at(105, 106, 10))).toBe(true);       // 7.81 px on the diagonal
    expect(isTap(at(100, 100, 0), at(108.1, 100, 10))).toBe(false);
    expect(isTap(at(100, 100, 0), at(106, 106, 10))).toBe(false);      // 8.49 px on the diagonal
    expect(isTap(at(100, 100, 0), at(100, 100, 500.1))).toBe(false);
  });

  it('[APP-14] counts only the primary pointer', () => {
    let now = 0;
    const taps: [number, number][] = [];
    const tracker = createTapTracker((x, y) => taps.push([x, y]), () => now);
    const pointer = (clientX: number, clientY: number, isPrimary = true) => ({ clientX, clientY, isPrimary });

    tracker.down(pointer(50, 60));
    now = 100;
    tracker.up(pointer(53, 64));
    expect(taps).toEqual([[53, 64]]);

    // A second finger's release neither taps nor ends the first press.
    tracker.down(pointer(50, 60));
    tracker.up(pointer(51, 61, false));
    expect(taps).toEqual([[53, 64]]);
    now = 200;
    tracker.up(pointer(52, 62));
    expect(taps).toEqual([[53, 64], [52, 62]]);

    // A second finger's press starts no tap, and cancels the pending tap of the first.
    tracker.down(pointer(50, 60, false));
    tracker.up(pointer(50, 60));
    tracker.up(pointer(50, 60, false));
    expect(taps).toHaveLength(2);
    tracker.down(pointer(50, 60));
    tracker.down(pointer(80, 90, false));
    now = 300;
    tracker.up(pointer(51, 61));
    expect(taps).toHaveLength(2);

    // A release without a press, a drag and a long press are no taps; each release ends its press.
    tracker.up(pointer(50, 60));
    tracker.down(pointer(50, 60));
    tracker.up(pointer(70, 60));
    tracker.up(pointer(50, 60));
    tracker.down(pointer(50, 60));
    now += 501;
    tracker.up(pointer(50, 60));
    expect(taps).toHaveLength(2);
  });

  it('[APP-14] tries the tap point, then 8 points on each ring of 8, 16 and 24 px', () => {
    expect(TAP_OFFSETS).toHaveLength(25);
    expect(TAP_OFFSETS[0]).toEqual([0, 0]);
    [8, 16, 24].forEach((r, ring) => {
      for (let i = 0; i < 8; i++) {
        const [dx, dy] = TAP_OFFSETS[1 + ring * 8 + i];
        expect(dx).toBeCloseTo(r * Math.cos(i * Math.PI / 4), 10);
        expect(dy).toBeCloseTo(r * Math.sin(i * Math.PI / 4), 10);
      }
    });
  });
});

describe('which part a tap picks', () => {
  // A camera 5 m in front of the origin, looking at it, in a 200 × 200 px canvas at (10, 20).
  const rect = { left: 10, top: 20, width: 200, height: 200 };
  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 80);
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const mmPerPx = 2 * 5000 * Math.tan(THREE.MathUtils.degToRad(20)) / rect.height;
  const centre = { x: rect.left + 100, y: rect.top + 100 };

  // A square part facing the camera at z = 0, placed and sized in screen pixels around the centre.
  function square(
    id: string, dxPx: number, dyPx: number, halfPx: number,
    { module = 'A45', source = 'manual', z = 0 }: { module?: ModuleCode; source?: Source; z?: number } = {},
  ) {
    const x0 = (dxPx - halfPx) * mmPerPx, x1 = (dxPx + halfPx) * mmPerPx;
    const y0 = -(dyPx + halfPx) * mmPerPx, y1 = -(dyPx - halfPx) * mmPerPx;
    const tri = [x0, y0, z, x1, y0, z, x1, y1, z, x0, y0, z, x1, y1, z, x0, y1, z];
    return partMesh({ id, module, source, tri, natural: [1, 1, 1] });
  }
  const pick = (meshes: ReturnType<typeof square>[], filter: Filter = null, dx = 0, dy = 0) =>
    pickPart({ x: centre.x + dx, y: centre.y + dy, rect, camera, meshes, filter })?.id ?? null;

  it('[APP-14] picks the nearest part on the ray through the tap point', () => {
    const back = square('back', 0, 0, 50);
    const front = square('front', 0, 0, 20, { z: 1000, module: 'B07' });
    expect(pick([back, front])).toBe('front');
    expect(pick([front, back])).toBe('front');
    expect(pick([back, front], null, 40, 0)).toBe('back');
  });

  it('[APP-14] considers only parts inside the filter', () => {
    const back = square('back', 0, 0, 50);
    const front = square('front', 0, 0, 20, { z: 1000, module: 'B07' });
    const estimate = square('estimate', 0, 0, 10, { z: 2000, module: 'B07', source: 'estimate' });
    const meshes = [back, front, estimate];
    expect(pick(meshes)).toBe('estimate');
    expect(pick(meshes, 'B07')).toBe('estimate');
    expect(pick(meshes, 'A45')).toBe('back');
    expect(pick(meshes, 'estimate')).toBe('estimate');
    expect(pick([back, front], 'estimate')).toBeNull();
    expect(pick(meshes, 'G01')).toBeNull();
  });

  it('[APP-14] falls back to the rings around the tap point, nearest ring and first angle first', () => {
    const right16 = square('right16', 16, 0, 1);
    const left8 = square('left8', -8, 0, 1);
    const down8 = square('down8', 0, 8, 1);
    const right24 = square('right24', 24, 0, 1);
    expect(pick([right16, left8])).toBe('left8');
    expect(pick([left8, down8])).toBe('down8');       // 90° comes before 180° on the 8 px ring
    expect(pick([right16, right24])).toBe('right16');
    expect(pick([right24])).toBe('right24');
    expect(pick([square('diagonal', 24 * Math.SQRT1_2, -24 * Math.SQRT1_2, 1)])).toBe('diagonal');
    expect(pick([square('between', 12, 0, 1)])).toBeNull();
    expect(pick([square('far', 32, 0, 1)])).toBeNull();
    expect(pick([left8], 'B07')).toBeNull();
  });
});
