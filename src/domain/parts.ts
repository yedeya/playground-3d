// Domain knowledge about the parts: Dutch names and how a raw model record is shown. No DOM or 3D here.
import type { Filter, ModuleCode, Part, Rgb } from './model.js';

export const MODULES: Readonly<Record<ModuleCode, string>> = {
  A45: 'Huis', F34: 'Dak', C14: 'Ladder', D42: 'Schommelsteun', E24: 'Schommelbalk',
  B07: 'Brug', A47: 'Schip', G28: 'Boeg', G24: 'Klimstenen', H10: 'Schilden', G01: 'Glijbaan',
};
// Object.keys types its result as string[]; MODULES has exactly the module codes as its keys.
export const MODULE_ORDER = Object.keys(MODULES) as readonly ModuleCode[];

const KINDS: Readonly<Record<string, string>> = {
  post: 'Paal', beam: 'Balk', side: 'Plank', wall: 'Wandplank', back: 'Achterplank', floor: 'Vloerplank',
  bow: 'Boegdeel', mast: 'Mastdeel', sail: 'Zeil', hold: 'Klimsteen', handle: 'Handgreep', canvas: 'Doek',
  hole: 'Opening in doek', belt: 'Brugband', slide: 'Glijbaan', rope: 'Touwladder', metal: 'Schommelhaak', seat: 'Schommelzitje',
};

export function kindOf(part: Pick<Part, 'module' | 'group'>): string {
  if (part.module === 'C14' && part.group === 'floor') return 'Laddersport';
  if (part.module === 'F34' && part.group === 'floor') return 'Dakplank';
  if (part.module === 'F34' && part.group === 'canvas') return 'Dakdoek';
  if (part.module === 'B07' && part.group === 'floor') return 'Brugplank';
  if (part.module === 'B07' && part.group === 'side') return 'Brugleuning';
  if (part.module === 'H10') return 'Schild';
  return KINDS[part.group] || part.group;
}

/** Readable size, or null for parts whose size field is only a description. */
export function sizeText(size: string): string | null {
  if (/^dia /.test(size)) return `Ø ${size.slice(4)} mm`;
  if (!/^\d/.test(size)) return null;
  const nums = `${size.split(' ')[0].split('x').join(' × ')} mm`;
  return /drawn about 700/.test(size) ? `${nums} (tekening: ca. 700 hoog)` : nums;
}

/** Manual part code without the English description the generator appends. */
export function kitText(kit: string): string {
  if (kit === 'handle') return 'Handgreep uit de stuklijst';
  return kit.replace(/ (canvas|plane|belt|shield|hold|slide|swing hook|swing seat|rope ladder|opening)$/, '');
}

/** filter: null = everything, 'estimate' = estimated parts, otherwise a module code. */
export function matchesFilter(part: Pick<Part, 'module' | 'source'>, filter: Filter): boolean {
  if (filter === null) return true;
  if (filter === 'estimate') return part.source === 'estimate';
  return part.module === filter;
}

export const toCssColor = (c: Rgb): string => `rgb(${c.map(v => Math.round(v * 255)).join(',')})`;
