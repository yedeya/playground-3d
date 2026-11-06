// The model data's types, written once here instead of inferred from the generated JSON (see src/data/speeltoestel.d.json.ts).

/** The 11 module codes of the manual. */
export type ModuleCode = 'A45' | 'F34' | 'C14' | 'D42' | 'E24' | 'B07' | 'A47' | 'G28' | 'G24' | 'H10' | 'G01';

/** Whether a part's shape and place come from the manual, or are estimated. */
export type Source = 'manual' | 'estimate';

/** An sRGB colour as [r, g, b], each from 0 to 1. */
export type Rgb = readonly [number, number, number];

/** One part of the model, as the generator writes it. */
export interface Part {
  id: string;
  module: ModuleCode;
  /** The manual's part code, with an English description the generator may append. */
  kit: string;
  /** The raw kind of part, such as `post` or `floor`. */
  group: string;
  /** Dimensions in mm, as `LxWxH` or `dia D`, or only a description. */
  size: string;
  source: Source;
  /** The part's wood colour. */
  natural: Rgb;
  /** Triangles in mm: x, y, z of three corners per triangle, so a multiple of 9 numbers. */
  tri: readonly number[];
}

/** The generated model the app loads. */
export interface Model {
  parts: readonly Part[];
  moduleColors: Readonly<Record<ModuleCode, Rgb>>;
}

/** null = everything, 'estimate' = estimated parts, otherwise a module code. */
export type Filter = null | 'estimate' | ModuleCode;
