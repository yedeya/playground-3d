// The transport plan's rules (docs/qa/specs/transport.md): pieces, which piece each part is in, the contacts
// between pieces and the tape labels on their joints. Pure data in, new data out: no DOM, no 3D and no network.
// A plan is never changed in place; every edit returns a new plan.
import type { Part, Rgb } from './model';

export type PieceId = string;

/** A set of parts that stays together as one piece in transport. */
export interface Piece {
  id: PieceId;
  /** Non-empty and unique within the plan, compared case-insensitively after trimming. Stored trimmed. */
  name: string;
  /** The display colour. */
  colour: Rgb;
}

/** One record per part id: the piece the part is in. The piece may since have been deleted (`[TRANS-21]`). */
export interface Membership {
  partId: string;
  pieceId: PieceId;
}

/** A point in model millimetres. */
export type Point = readonly [number, number, number];

/** The tape colours, in palette order (`[TRANS-6]`). */
export type TapeColour = 'Red' | 'Orange' | 'Yellow' | 'Green' | 'Blue' | 'Purple' | 'White' | 'Black' | 'Grey' | 'Brown';

/** A piece of tape on the joint between two pieces (`[TRANS-5]`). */
export interface JointLabel {
  id: string;
  /** Two distinct pieces. */
  pieces: readonly [PieceId, PieceId];
  /** The part the tape sits on, a part of one of the two pieces. */
  partId: string;
  /** Where on that part, in model millimetres. */
  point: Point;
  tape: TapeColour;
  /** At most 12 characters, such as `3` or `A-B`; empty for no text. */
  text: string;
}

/** Pieces in plan order, memberships with at most one per part id, and labels. */
export interface Plan {
  pieces: readonly Piece[];
  memberships: readonly Membership[];
  labels: readonly JointLabel[];
}

export type PlanError =
  | 'empty-name' | 'duplicate-name' | 'duplicate-id' | 'unknown-piece' | 'unknown-label'
  | 'same-pieces' | 'part-not-in-pieces' | 'bad-point' | 'unknown-tape' | 'text-too-long';

export type PlanResult = { ok: true; plan: Plan } | { ok: false; error: PlanError };

const done = (plan: Plan): PlanResult => ({ ok: true, plan });
const fail = (error: PlanError): PlanResult => ({ ok: false, error });

export const emptyPlan = (): Plan => ({ pieces: [], memberships: [], labels: [] });

const hasPiece = (plan: Plan, id: PieceId): boolean => plan.pieces.some(p => p.id === id);
const nameKey = (name: string): string => name.trim().toLowerCase();

function nameError(plan: Plan, name: string, ownId?: PieceId): PlanError | null {
  const key = nameKey(name);
  if (key === '') return 'empty-name';
  if (plan.pieces.some(p => p.id !== ownId && nameKey(p.name) === key)) return 'duplicate-name';
  return null;
}

// ─── Pieces and memberships (`[TRANS-1]`, `[TRANS-2]`, `[TRANS-3]`, `[TRANS-21]`) ──────────────────────────────

/** Adds a piece at the end of the plan. */
export function addPiece(plan: Plan, piece: Piece): PlanResult {
  const error = nameError(plan, piece.name);
  if (error) return fail(error);
  if (hasPiece(plan, piece.id)) return fail('duplicate-id');
  return done({ ...plan, pieces: [...plan.pieces, { ...piece, name: piece.name.trim() }] });
}

export function renamePiece(plan: Plan, id: PieceId, name: string): PlanResult {
  if (!hasPiece(plan, id)) return fail('unknown-piece');
  const error = nameError(plan, name, id);
  if (error) return fail(error);
  return done({ ...plan, pieces: plan.pieces.map(p => (p.id === id ? { ...p, name: name.trim() } : p)) });
}

/** Puts a part in a piece of the plan, replacing any membership it had, even one naming a deleted piece. */
export function assignPart(plan: Plan, partId: string, pieceId: PieceId): PlanResult {
  if (!hasPiece(plan, pieceId)) return fail('unknown-piece');
  const others = plan.memberships.filter(m => m.partId !== partId);
  return done({ ...plan, memberships: [...others, { partId, pieceId }] });
}

/** Makes a part `Loose`. */
export const unassignPart = (plan: Plan, partId: string): Plan =>
  ({ ...plan, memberships: plan.memberships.filter(m => m.partId !== partId) });

/** The piece a part is in, or null when it is `Loose`, which includes a membership naming a deleted piece. */
export function pieceOf(plan: Plan, partId: string): PieceId | null {
  const pieceId = plan.memberships.find(m => m.partId === partId)?.pieceId;
  return pieceId !== undefined && hasPiece(plan, pieceId) ? pieceId : null;
}

/** The part ids of a piece, in the order they were assigned. */
export const partsOf = (plan: Plan, pieceId: PieceId): string[] =>
  plan.memberships.filter(m => m.pieceId === pieceId).map(m => m.partId);

/** The parts of the model that are in no piece of the plan, in model order. */
export function looseParts(plan: Plan, modelPartIds: readonly string[]): string[] {
  return modelPartIds.filter(id => pieceOf(plan, id) === null);
}

/**
 * Every part id the plan stores, in a membership or a label, that the loaded model does not contain, listed once
 * in the order first stored. The plan keeps them: nothing here drops a record for naming an unknown part.
 */
export function unknownParts(plan: Plan, modelPartIds: readonly string[]): string[] {
  const known = new Set(modelPartIds);
  const stored = [...plan.memberships.map(m => m.partId), ...plan.labels.map(l => l.partId)];
  return [...new Set(stored.filter(id => !known.has(id)))];
}

/** How many labels name a piece. */
export const labelsNaming = (plan: Plan, pieceId: PieceId): number =>
  plan.labels.filter(l => l.pieces.includes(pieceId)).length;

/**
 * Deleting a piece. When labels name it, the owner is asked first, with `labelCount` in the question, and only
 * `confirm()` deletes; cancelling is not calling it, which leaves the plan as it was. Otherwise `plan` is the
 * result straight away. Either way the piece, its memberships and the labels naming it go together, and its parts
 * become `Loose`.
 */
export type PieceDeletion =
  | { needsConfirmation: true; labelCount: number; plan?: undefined; confirm: () => Plan }
  | { needsConfirmation: false; labelCount: 0; plan: Plan; confirm: () => Plan };

export function deletePiece(plan: Plan, pieceId: PieceId): PieceDeletion {
  const confirm = (): Plan => ({
    pieces: plan.pieces.filter(p => p.id !== pieceId),
    memberships: plan.memberships.filter(m => m.pieceId !== pieceId),
    labels: plan.labels.filter(l => !l.pieces.includes(pieceId)),
  });
  const labelCount = labelsNaming(plan, pieceId);
  return labelCount > 0
    ? { needsConfirmation: true, labelCount, confirm }
    : { needsConfirmation: false, labelCount: 0, plan: confirm(), confirm };
}

/** Memberships that name a piece the plan no longer holds, kept for the overview's `Deleted piece` list. */
export const orphanMemberships = (plan: Plan): Membership[] =>
  plan.memberships.filter(m => !hasPiece(plan, m.pieceId));

/** Labels that name a piece the plan no longer holds, kept for the overview's `Deleted piece` list. */
export const orphanLabels = (plan: Plan): JointLabel[] =>
  plan.labels.filter(l => l.pieces.some(id => !hasPiece(plan, id)));

// ─── Contacts (`[TRANS-4]`) ─────────────────────────────────────────────────────────────────────────────────────

/** An axis-aligned bounding box in model millimetres. */
export interface Box {
  min: Point;
  max: Point;
}

/** Each part's box is grown by this much on every side before two boxes are compared. */
export const CONTACT_MARGIN_MM = 5;

/** The bounding box of a part's triangles. */
export function partBox(part: Pick<Part, 'tri'>): Box {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  part.tri.forEach((v, i) => {
    const axis = i % 3;
    if (v < min[axis]) min[axis] = v;
    if (v > max[axis]) max[axis] = v;
  });
  return { min: [min[0], min[1], min[2]], max: [max[0], max[1], max[2]] };
}

/** Whether two parts touch: their boxes, each grown by 5 mm on every side, overlap. Faces that meet count. */
export function touches(a: Box, b: Box): boolean {
  const reach = 2 * CONTACT_MARGIN_MM;
  return [0, 1, 2].every(k => a.min[k] <= b.max[k] + reach && b.min[k] <= a.max[k] + reach);
}

/** Which parts each part touches, both ways round. */
export type Contacts = ReadonlyMap<string, ReadonlySet<string>>;

/** What the plan's rules need from a loaded model, computed once per load. */
export interface ModelIndex {
  boxes: ReadonlyMap<string, Box>;
  contacts: Contacts;
}

/** Computes every part's box and the contacts between parts, pairwise (161 parts make about 13,000 pairs). */
export function analyseModel(parts: readonly Pick<Part, 'id' | 'tri'>[]): ModelIndex {
  const boxes = new Map(parts.map(p => [p.id, partBox(p)] as const));
  const contacts = new Map<string, Set<string>>(parts.map(p => [p.id, new Set<string>()]));
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      const a = parts[i].id, b = parts[j].id;
      if (touches(boxes.get(a)!, boxes.get(b)!)) {
        contacts.get(a)!.add(b);
        contacts.get(b)!.add(a);
      }
    }
  }
  return { boxes, contacts };
}

/**
 * Every pair of distinct pieces of which some part of one touches some part of the other, each pair once, in plan
 * order. A suggestion only: nothing in the plan is refused for it.
 */
export function neighbourPairs(plan: Plan, contacts: Contacts): [PieceId, PieceId][] {
  const index = new Map(plan.pieces.map((p, i) => [p.id, i]));
  const n = plan.pieces.length;
  const found = new Set<number>();   // i * n + j for the pair of the i-th and j-th piece, i < j
  for (const { partId } of plan.memberships) {
    const mine = pieceOf(plan, partId);
    if (mine === null) continue;
    for (const other of contacts.get(partId) ?? []) {
      const theirs = pieceOf(plan, other);
      if (theirs === null || theirs === mine) continue;
      const i = index.get(mine)!, j = index.get(theirs)!;
      found.add(Math.min(i, j) * n + Math.max(i, j));
    }
  }
  return [...found].sort((x, y) => x - y).map(k => [plan.pieces[Math.floor(k / n)].id, plan.pieces[k % n].id]);
}

/** The neighbours of one piece, in plan order. */
export function neighboursOf(plan: Plan, contacts: Contacts, pieceId: PieceId): PieceId[] {
  const pairs = neighbourPairs(plan, contacts).filter(pair => pair.includes(pieceId));
  const ids = new Set(pairs.map(([a, b]) => (a === pieceId ? b : a)));
  return plan.pieces.map(p => p.id).filter(id => ids.has(id));
}

// ─── Joint labels (`[TRANS-5]`, `[TRANS-6]`, `[TRANS-7]`) ────────────────────────────────────────────────────────

/** The ten tape colours, in this order, each with its one swatch. Show a swatch with its name, never alone. */
export const TAPE_PALETTE: readonly { name: TapeColour; swatch: Rgb }[] = [
  { name: 'Red', swatch: [0.80, 0.10, 0.10] },
  { name: 'Orange', swatch: [0.95, 0.50, 0.10] },
  { name: 'Yellow', swatch: [0.98, 0.85, 0.10] },
  { name: 'Green', swatch: [0.15, 0.60, 0.20] },
  { name: 'Blue', swatch: [0.10, 0.35, 0.80] },
  { name: 'Purple', swatch: [0.50, 0.20, 0.65] },
  { name: 'White', swatch: [0.97, 0.97, 0.97] },
  { name: 'Black', swatch: [0.08, 0.08, 0.08] },
  { name: 'Grey', swatch: [0.55, 0.55, 0.55] },
  { name: 'Brown', swatch: [0.45, 0.28, 0.12] },
];

export const tapeSwatch = (name: TapeColour): Rgb => TAPE_PALETTE.find(t => t.name === name)!.swatch;

export const LABEL_TEXT_MAX = 12;

function labelError(plan: Plan, label: JointLabel): PlanError | null {
  const [a, b] = label.pieces;
  if (a === b) return 'same-pieces';
  if (!hasPiece(plan, a) || !hasPiece(plan, b)) return 'unknown-piece';
  const piece = pieceOf(plan, label.partId);
  if (piece !== a && piece !== b) return 'part-not-in-pieces';
  if (label.point.length !== 3 || !label.point.every(Number.isFinite)) return 'bad-point';
  if (!TAPE_PALETTE.some(t => t.name === label.tape)) return 'unknown-tape';
  if ([...label.text].length > LABEL_TEXT_MAX) return 'text-too-long';
  return null;
}

/**
 * Places a label, or replaces the label with its id, as the owner does on the device in use: its two pieces must
 * then be pieces of the plan. A label received through sync is stored as it is (`[TRANS-21]`), not through this.
 */
export function putLabel(plan: Plan, label: JointLabel): PlanResult {
  const error = labelError(plan, label);
  if (error) return fail(error);
  const exists = plan.labels.some(l => l.id === label.id);
  const labels = exists ? plan.labels.map(l => (l.id === label.id ? label : l)) : [...plan.labels, label];
  return done({ ...plan, labels });
}

export function deleteLabel(plan: Plan, labelId: string): PlanResult {
  if (!plan.labels.some(l => l.id === labelId)) return fail('unknown-label');
  return done({ ...plan, labels: plan.labels.filter(l => l.id !== labelId) });
}

/** A label is displaced this far outside its part's box. */
export const DISPLACED_MM = 20;

/** How far a point lies outside a box, in a straight line; 0 inside it. */
function distanceOutside(point: Point, box: Box): number {
  const gaps = [0, 1, 2].map(k => Math.max(box.min[k] - point[k], 0, point[k] - box.max[k]));
  return Math.hypot(...gaps);
}

/** Whether the model no longer has the label's part, or its point lies more than 20 mm outside that part's box. */
export function isDisplaced(label: Pick<JointLabel, 'partId' | 'point'>, boxes: ReadonlyMap<string, Box>): boolean {
  const box = boxes.get(label.partId);
  return box === undefined || distanceOutside(label.point, box) > DISPLACED_MM;
}

/** The displaced labels, in plan order, each still at its stored point. */
export const displacedLabels = (plan: Plan, boxes: ReadonlyMap<string, Box>): JointLabel[] =>
  plan.labels.filter(l => isDisplaced(l, boxes));
