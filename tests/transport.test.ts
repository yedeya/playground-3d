import { describe, expect, it } from 'vitest';
import data from '../src/data/speeltoestel.json';
import type { Part, Rgb } from '../src/domain/model.js';
import {
  CONTACT_MARGIN_MM, DISPLACED_MM, LABEL_TEXT_MAX, TAPE_PALETTE,
  addPiece, analyseModel, assignPart, deleteLabel, deletePiece, displacedLabels, emptyPlan, isDisplaced,
  labelsNaming, looseParts, neighbourPairs, neighboursOf, orphanLabels, orphanMemberships, partBox, partsOf,
  pieceOf, putLabel, renamePiece, tapeSwatch, touches, unassignPart, unknownParts,
} from '../src/domain/transport.js';
import type { Box, JointLabel, Plan, PlanResult, TapeColour } from '../src/domain/transport.js';

const RED: Rgb = [0.8, 0.1, 0.1];
const BLUE: Rgb = [0.1, 0.3, 0.8];
const GREEN: Rgb = [0.1, 0.6, 0.2];

/** The plan of a successful result; fails the test with the error otherwise. */
function ok(result: PlanResult): Plan {
  if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
  return result.plan;
}

/** A plan with pieces `house`, `bridge` and `ship`, each holding the given part ids. */
function planWith(members: { house?: string[]; bridge?: string[]; ship?: string[] } = {}): Plan {
  let plan = emptyPlan();
  plan = ok(addPiece(plan, { id: 'house', name: 'House', colour: RED }));
  plan = ok(addPiece(plan, { id: 'bridge', name: 'Bridge', colour: BLUE }));
  plan = ok(addPiece(plan, { id: 'ship', name: 'Ship', colour: GREEN }));
  for (const [piece, parts] of Object.entries(members)) {
    for (const part of parts) plan = ok(assignPart(plan, part, piece));
  }
  return plan;
}

const label = (over: Partial<JointLabel> = {}): JointLabel => ({
  id: 'L1', pieces: ['house', 'bridge'], partId: 'A45_VP2', point: [780, 1700, 790], tape: 'Red', text: '3', ...over,
});

const modelIds = data.parts.map(p => p.id);
const model = analyseModel(data.parts);

describe('the plan', () => {
  it('[TRANS-1] starts with no pieces, and a piece has an id, a colour and a name', () => {
    const empty = emptyPlan();
    expect(empty.pieces).toEqual([]);
    expect(empty.memberships).toEqual([]);
    expect(empty.labels).toEqual([]);

    const plan = ok(addPiece(empty, { id: 'house', name: '  House ', colour: RED }));
    expect(plan.pieces).toEqual([{ id: 'house', name: 'House', colour: RED }]);
    expect(empty.pieces).toEqual([]);
  });

  it('[TRANS-1] refuses an empty name, and a name already used, compared case-insensitively after trimming', () => {
    const plan = planWith();
    expect(addPiece(plan, { id: 'p4', name: '', colour: RED })).toEqual({ ok: false, error: 'empty-name' });
    expect(addPiece(plan, { id: 'p4', name: '   ', colour: RED })).toEqual({ ok: false, error: 'empty-name' });
    expect(addPiece(plan, { id: 'p4', name: 'house', colour: RED })).toEqual({ ok: false, error: 'duplicate-name' });
    expect(addPiece(plan, { id: 'p4', name: ' HOUSE  ', colour: RED })).toEqual({ ok: false, error: 'duplicate-name' });
    expect(addPiece(plan, { id: 'house', name: 'Roof', colour: RED })).toEqual({ ok: false, error: 'duplicate-id' });
    expect(ok(addPiece(plan, { id: 'p4', name: 'House 2', colour: RED })).pieces.map(p => p.name))
      .toEqual(['House', 'Bridge', 'Ship', 'House 2']);
  });

  it('[TRANS-1] keeps a renamed piece\'s name unique too', () => {
    const plan = planWith();
    expect(renamePiece(plan, 'ship', ' bridge')).toEqual({ ok: false, error: 'duplicate-name' });
    expect(renamePiece(plan, 'ship', ' ')).toEqual({ ok: false, error: 'empty-name' });
    expect(renamePiece(plan, 'nope', 'Boat')).toEqual({ ok: false, error: 'unknown-piece' });
    expect(ok(renamePiece(plan, 'ship', ' SHIP ')).pieces[2].name).toBe('SHIP');
    expect(ok(renamePiece(plan, 'ship', 'Boat')).pieces[2]).toEqual({ id: 'ship', name: 'Boat', colour: GREEN });
  });

  it('[TRANS-1] puts a part in at most one piece: assigning it removes it from the piece it was in', () => {
    let plan = planWith({ house: ['A45_AP1', 'A45_AP2'] });
    expect(pieceOf(plan, 'A45_AP1')).toBe('house');

    plan = ok(assignPart(plan, 'A45_AP1', 'bridge'));
    expect(pieceOf(plan, 'A45_AP1')).toBe('bridge');
    expect(partsOf(plan, 'house')).toEqual(['A45_AP2']);
    expect(partsOf(plan, 'bridge')).toEqual(['A45_AP1']);
    expect(plan.memberships.filter(m => m.partId === 'A45_AP1')).toHaveLength(1);

    expect(assignPart(plan, 'A45_AP1', 'nope')).toEqual({ ok: false, error: 'unknown-piece' });
  });

  it('[TRANS-1] counts a part of the model that is in no piece as Loose', () => {
    let plan = planWith({ house: ['A45_AP1'], bridge: ['B07_B1'] });
    const loose = looseParts(plan, modelIds);
    expect(loose).toHaveLength(159);
    expect(loose).not.toContain('A45_AP1');
    expect(loose).not.toContain('B07_B1');
    expect(pieceOf(plan, 'A45_AP2')).toBeNull();

    plan = unassignPart(plan, 'A45_AP1');
    expect(pieceOf(plan, 'A45_AP1')).toBeNull();
    expect(looseParts(plan, modelIds)).toHaveLength(160);
    expect(looseParts(emptyPlan(), modelIds)).toEqual(modelIds);
  });
});

describe('a part id the model does not have', () => {
  it('[TRANS-2] is kept in the plan, and counted and listed by id as an unknown part', () => {
    let plan = planWith({ house: ['A45_AP1', 'A45_GONE'], ship: ['A47_RENAMED'] });
    expect(unknownParts(plan, modelIds)).toEqual(['A45_GONE', 'A47_RENAMED']);

    // Editing the rest of the plan never drops it.
    plan = ok(assignPart(plan, 'A45_AP2', 'house'));
    plan = ok(renamePiece(plan, 'house', 'Big house'));
    plan = unassignPart(plan, 'A45_AP1');
    plan = deletePiece(plan, 'bridge').plan!;
    expect(pieceOf(plan, 'A45_GONE')).toBe('house');
    expect(pieceOf(plan, 'A47_RENAMED')).toBe('ship');
    expect(unknownParts(plan, modelIds)).toEqual(['A45_GONE', 'A47_RENAMED']);

    // It is not a part of the model, so it is not counted as Loose either.
    expect(looseParts(plan, modelIds)).not.toContain('A45_GONE');
  });

  it('[TRANS-2] includes the part id of a label, listed once', () => {
    let plan = planWith({ house: ['A45_GONE'], bridge: ['B07_R11'] });
    plan = ok(putLabel(plan, label({ partId: 'A45_GONE' })));
    expect(unknownParts(plan, modelIds)).toEqual(['A45_GONE']);
    expect(unknownParts(planWith({ house: ['A45_AP1'] }), modelIds)).toEqual([]);
  });
});

describe('deleting a piece', () => {
  const labelled = () => {
    let plan = planWith({ house: ['A45_VP2', 'A45_AP1'], bridge: ['B07_R11'], ship: ['A47_C3'] });
    plan = ok(putLabel(plan, label({ id: 'L1' })));
    plan = ok(putLabel(plan, label({ id: 'L2', text: 'A-B' })));
    plan = ok(putLabel(plan, label({ id: 'L3', pieces: ['bridge', 'ship'], partId: 'A47_C3', point: [860, 1120, 2290] })));
    return plan;
  };

  it('[TRANS-3] asks for confirmation first when a label names it, saying how many labels go with it', () => {
    const plan = labelled();
    expect(labelsNaming(plan, 'house')).toBe(2);
    expect(labelsNaming(plan, 'bridge')).toBe(3);

    const deletion = deletePiece(plan, 'house');
    expect(deletion.needsConfirmation).toBe(true);
    expect(deletion.labelCount).toBe(2);
    expect(deletion.plan).toBeUndefined();
  });

  it('[TRANS-3] once confirmed, deletes the piece, its memberships and every label that names it together', () => {
    const plan = labelled();
    const after = deletePiece(plan, 'bridge').confirm();
    expect(after.pieces.map(p => p.id)).toEqual(['house', 'ship']);
    expect(after.memberships.some(m => m.pieceId === 'bridge')).toBe(false);
    expect(after.labels).toEqual([]);
    expect(pieceOf(after, 'B07_R11')).toBeNull();
    expect(looseParts(after, modelIds)).toContain('B07_R11');
    expect(partsOf(after, 'house')).toEqual(['A45_VP2', 'A45_AP1']);
  });

  it('[TRANS-3] cancelled, changes nothing', () => {
    const plan = labelled();
    const before = structuredClone(plan);
    deletePiece(plan, 'house'); // asked, never confirmed
    expect(plan).toEqual(before);
  });

  it('[TRANS-3] deletes a piece that no label names with its memberships, and its parts become Loose', () => {
    const plan = labelled();
    const deletion = deletePiece(ok(deleteLabel(plan, 'L3')), 'ship');
    expect(deletion.needsConfirmation).toBe(false);
    expect(deletion.labelCount).toBe(0);
    const after = deletion.plan!;
    expect(after.pieces.map(p => p.id)).toEqual(['house', 'bridge']);
    expect(after.labels.map(l => l.id)).toEqual(['L1', 'L2']);
    expect(pieceOf(after, 'A47_C3')).toBeNull();
    expect(looseParts(after, modelIds)).toContain('A47_C3');
    expect(deletion.confirm()).toEqual(after);
  });
});

describe('contacts', () => {
  it('[TRANS-4] two parts touch when their boxes, each grown by 5 mm on every side, overlap', () => {
    expect(CONTACT_MARGIN_MM).toBe(5);
    const box = (min: number): Box => ({ min: [min, 0, 0], max: [min + 100, 100, 100] });
    const a = box(0);
    expect(touches(a, box(50))).toBe(true);      // overlapping
    expect(touches(a, box(100))).toBe(true);     // faces meet
    expect(touches(a, box(110))).toBe(true);     // 10 mm apart: the two grown boxes just meet
    expect(touches(a, box(110.5))).toBe(false);  // 10.5 mm apart
    expect(touches(box(110.5), a)).toBe(false);
    expect(touches(a, { min: [0, 0, 110], max: [100, 100, 200] })).toBe(true);
    expect(touches(a, { min: [0, 111, 0], max: [100, 200, 100] })).toBe(false);
    // Apart on one axis is enough to not touch, however close the others are.
    expect(touches(a, { min: [50, 50, 120], max: [60, 60, 130] })).toBe(false);
  });

  it('[TRANS-4] takes a part\'s box from its triangles', () => {
    const part: Pick<Part, 'id' | 'tri'> = { id: 'x', tri: [0, 5, -3, 10, 2, 4, -1, 7, 0] };
    expect(partBox(part)).toEqual({ min: [-1, 2, -3], max: [10, 7, 4] });
  });

  it('[TRANS-4] finds the contacts the model makes obvious', () => {
    const touching = (a: string, b: string) => model.contacts.get(a)?.has(b) ?? false;
    expect(model.boxes.size).toBe(161);
    // A bridge railing against a house post (3 mm apart), and a bridge belt resting on a ship beam.
    expect(touching('B07_R11', 'A45_VP2')).toBe(true);
    expect(touching('A45_VP2', 'B07_R11')).toBe(true);
    expect(touching('B07_B1', 'A47_C3')).toBe(true);
    // The bridge belt ends 13 mm short of the house's top beam, more than the two 5 mm margins.
    expect(touching('B07_B1', 'A45_VL')).toBe(false);
    // The swing seat and the ladder are metres apart.
    expect(touching('E24_seat', 'C14_S1')).toBe(false);
    // A part does not touch itself.
    expect(touching('B07_B1', 'B07_B1')).toBe(false);
  });

  it('[TRANS-4] makes two distinct pieces neighbours when some part of one touches some part of the other', () => {
    const plan = planWith({ house: ['A45_VP2', 'A45_AP1'], bridge: ['B07_R11', 'B07_B1'], ship: ['A47_C3'] });
    expect(neighbourPairs(plan, model.contacts)).toEqual([['house', 'bridge'], ['bridge', 'ship']]);
    expect(neighboursOf(plan, model.contacts, 'bridge')).toEqual(['house', 'ship']);
    expect(neighboursOf(plan, model.contacts, 'house')).toEqual(['bridge']);

    // Parts touching within one piece make no pair, and loose parts make none.
    const one = planWith({ house: ['A45_VP2', 'B07_R11'] });
    expect(neighbourPairs(one, model.contacts)).toEqual([]);
    expect(neighbourPairs(planWith({ house: ['A45_VP2'] }), model.contacts)).toEqual([]);
  });

  it('[TRANS-4] only suggests joints: a label between pieces that do not touch is still placed', () => {
    let plan = planWith({ house: ['A45_AP1'], ship: ['A47_P1'] });
    expect(neighbourPairs(plan, model.contacts)).toEqual([]);
    plan = ok(putLabel(plan, label({ pieces: ['house', 'ship'], partId: 'A45_AP1', point: [40, 900, 20] })));
    expect(plan.labels).toHaveLength(1);
    expect(ok(assignPart(plan, 'A47_P2', 'ship')).memberships).toHaveLength(3);
  });
});

describe('joint labels', () => {
  const plan = planWith({ house: ['A45_VP2'], bridge: ['B07_R11'], ship: ['A47_C3'] });

  it('[TRANS-5] records two distinct pieces, a part of one of them, a point in mm, a tape colour and a short text', () => {
    const placed = ok(putLabel(plan, label()));
    expect(placed.labels).toEqual([{
      id: 'L1', pieces: ['house', 'bridge'], partId: 'A45_VP2', point: [780, 1700, 790], tape: 'Red', text: '3',
    }]);
    // The part may be in either piece, and the text may be empty or up to 12 characters.
    expect(putLabel(plan, label({ partId: 'B07_R11', text: '' })).ok).toBe(true);
    expect(putLabel(plan, label({ text: 'A-B' })).ok).toBe(true);
    expect(LABEL_TEXT_MAX).toBe(12);
    expect(putLabel(plan, label({ text: '123456789012' })).ok).toBe(true);
  });

  it('[TRANS-5] refuses a label that breaks a rule of what it records', () => {
    const refused = (over: Partial<JointLabel>) => {
      const result = putLabel(plan, label(over));
      return result.ok ? 'ok' : result.error;
    };
    expect(refused({ pieces: ['house', 'house'] })).toBe('same-pieces');
    expect(refused({ pieces: ['house', 'gone'] })).toBe('unknown-piece');
    expect(refused({ partId: 'A47_C3' })).toBe('part-not-in-pieces');
    expect(refused({ partId: 'A45_AP1' })).toBe('part-not-in-pieces');      // a loose part
    expect(refused({ point: [780, Number.NaN, 790] })).toBe('bad-point');
    expect(refused({ point: [780, Infinity, 790] })).toBe('bad-point');
    expect(refused({ tape: 'Pink' as TapeColour })).toBe('unknown-tape');
    expect(refused({ text: '1234567890123' })).toBe('text-too-long');
    expect(refused({ text: '🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴' })).toBe('ok');      // counted in characters, not code units
  });

  it('[TRANS-5] edits a label in place by its id, and deletes it', () => {
    let edited = ok(putLabel(plan, label()));
    edited = ok(putLabel(edited, label({ id: 'L2', pieces: ['bridge', 'ship'], partId: 'A47_C3' })));
    edited = ok(putLabel(edited, label({ tape: 'Blue', text: 'B', point: [781, 1701, 791] })));
    expect(edited.labels.map(l => [l.id, l.tape, l.text])).toEqual([['L1', 'Blue', 'B'], ['L2', 'Red', '3']]);
    expect(ok(deleteLabel(edited, 'L1')).labels.map(l => l.id)).toEqual(['L2']);
    expect(deleteLabel(edited, 'nope')).toEqual({ ok: false, error: 'unknown-label' });
  });
});

describe('the tape palette', () => {
  it('[TRANS-6] is Red, Orange, Yellow, Green, Blue, Purple, White, Black, Grey and Brown, in that order', () => {
    expect(TAPE_PALETTE.map(t => t.name))
      .toEqual(['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple', 'White', 'Black', 'Grey', 'Brown']);
  });

  it('[TRANS-6] gives each colour one swatch of its own', () => {
    const swatches = TAPE_PALETTE.map(t => t.swatch.join(','));
    expect(new Set(swatches).size).toBe(10);
    for (const { name, swatch } of TAPE_PALETTE) {
      expect(swatch, name).toHaveLength(3);
      for (const v of swatch) expect(v >= 0 && v <= 1, name).toBe(true);
      expect(tapeSwatch(name)).toBe(swatch);
    }
  });
});

describe('a displaced label', () => {
  // A45_VP2's box runs from (692, 0, 756) to (780, 2190, 800).
  const plan = planWith({ house: ['A45_VP2'], bridge: ['B07_R11'] });
  const at = (point: readonly [number, number, number], partId = 'A45_VP2') => label({ point, partId });

  it('[TRANS-7] is one whose point lies more than 20 mm outside its part\'s box', () => {
    expect(DISPLACED_MM).toBe(20);
    expect(isDisplaced(at([700, 1000, 780]), model.boxes)).toBe(false);   // inside
    expect(isDisplaced(at([800, 1000, 780]), model.boxes)).toBe(false);   // 20 mm outside
    expect(isDisplaced(at([800.5, 1000, 780]), model.boxes)).toBe(true);
    expect(isDisplaced(at([700, -21, 780]), model.boxes)).toBe(true);
    expect(isDisplaced(at([700, 1000, 735]), model.boxes)).toBe(true);
  });

  it('[TRANS-7] is one whose part the model no longer has', () => {
    expect(isDisplaced(at([700, 1000, 780], 'A45_GONE'), model.boxes)).toBe(true);
  });

  it('[TRANS-7] is listed, and keeps its stored point', () => {
    let labelled = ok(putLabel(plan, at([700, 1000, 780])));
    labelled = ok(putLabel(labelled, label({ id: 'L2', point: [700, 1000, 900] })));
    expect(displacedLabels(labelled, model.boxes).map(l => [l.id, l.point])).toEqual([['L2', [700, 1000, 900]]]);
  });

  it('measures the distance outside the box straight, so a corner counts by its diagonal', () => {
    // 15 mm out on both x and z: 21.2 mm from the box's edge.
    expect(isDisplaced(at([795, 1000, 815]), model.boxes)).toBe(true);
    expect(isDisplaced(at([790, 1000, 810]), model.boxes)).toBe(false);
  });
});

describe('a record that names a deleted piece', () => {
  // What a device holds after another device deleted `bridge` while this one, offline, assigned to it and labelled it.
  const synced = (): Plan => {
    const plan = planWith({ house: ['A45_VP2'], bridge: ['B07_R11', 'B07_R12'] });
    const withLabel = ok(putLabel(plan, label()));
    return {
      pieces: withLabel.pieces.filter(p => p.id !== 'bridge'),
      memberships: withLabel.memberships,
      labels: withLabel.labels,
    };
  };

  it('[TRANS-21] is kept, and listed as naming a deleted piece', () => {
    const plan = synced();
    expect(orphanMemberships(plan).map(m => m.partId)).toEqual(['B07_R11', 'B07_R12']);
    expect(orphanLabels(plan).map(l => l.id)).toEqual(['L1']);

    const edited = ok(renamePiece(ok(assignPart(plan, 'A45_AP1', 'house')), 'house', 'Big house'));
    expect(orphanMemberships(edited).map(m => m.partId)).toEqual(['B07_R11', 'B07_R12']);
    expect(orphanLabels(edited).map(l => l.id)).toEqual(['L1']);
  });

  it('[TRANS-21] counts its part as Loose, and assigning the part replaces that membership', () => {
    let plan = synced();
    expect(pieceOf(plan, 'B07_R11')).toBeNull();
    expect(looseParts(plan, modelIds)).toContain('B07_R11');
    expect(unknownParts(plan, modelIds)).toEqual([]);
    expect(neighbourPairs(plan, model.contacts)).toEqual([]);

    plan = ok(assignPart(plan, 'B07_R11', 'house'));
    expect(pieceOf(plan, 'B07_R11')).toBe('house');
    expect(plan.memberships.filter(m => m.partId === 'B07_R11')).toEqual([{ partId: 'B07_R11', pieceId: 'house' }]);
    expect(orphanMemberships(plan).map(m => m.partId)).toEqual(['B07_R12']);
  });

  it('[TRANS-21] lets the owner edit or delete such a label, under the rules of a label placed here', () => {
    let plan = ok(addPiece(synced(), { id: 'deck', name: 'Deck', colour: BLUE }));
    plan = ok(assignPart(plan, 'B07_R11', 'deck'));
    // Edited on this device, it must name pieces of the plan again.
    expect(putLabel(plan, label({ text: 'X' }))).toEqual({ ok: false, error: 'unknown-piece' });
    const edited = ok(putLabel(plan, label({ pieces: ['house', 'deck'] })));
    expect(orphanLabels(edited)).toEqual([]);
    expect(ok(deleteLabel(synced(), 'L1')).labels).toEqual([]);
  });
});
