# The viewer app

What the speeltoestel viewer does for the person using it: the model data it loads, the Dutch texts it shows, its filters, its panel, its colour modes and its 3D viewer. Project #6 seeded these clauses to lock the app's behaviour before it moves from Vite to Next.js, so the move can be checked against them; they describe the app as it was on Vite. Project #7 reworded `[APP-1]` to `[APP-3]` when the app moved from its bundled JSON model to the GLB it fetches (`docs/qa/specs/model.md`). This area holds only the clauses projects have seeded so far. Every clause is `[seed]` until a human promotes it (`K-SPEC-8`).

**Id prefix:** `APP`

## Model data

- `[APP-1]` `[seed]` The model the app loads, the GLB `public/models/speeltoestel.glb` read as the app reads it, holds 161 parts with 161 distinct ids; each part's `module` is one of the 11 module codes the app names, and each part's geometry is unindexed, with a non-empty list of vertex positions whose count is divisible by 3, so whole triangles.
- `[APP-2]` `[seed]` Exactly 22 parts of the GLB the app loads carry `source: "estimate"`.
- `[APP-3]` `[seed]` The ladder and the slide stand swapped against the manual: in the GLB the app loads, which stores metres, every x coordinate of part `C14_S1` is above 2190 mm, and the smallest x coordinate of part `G01_slide` is below 0.

## Part texts and filters

- `[APP-4]` `[seed]` A part's size reads `1950 × 88 × 44 mm` for the raw size `1950x88x44`, `Ø 280 mm` for `dia 280`, and `700 × 590 mm (tekening: ca. 700 hoog)` for a size that notes `drawn about 700`; a raw size that starts with neither a digit nor `dia ` shows no size at all.
- `[APP-5]` `[seed]` A part's manual code drops the English description the generator appends (`E24-F swing hook` reads `E24-F`), keeps any other code as it is (`A45-A BG-220`), and reads `Handgreep uit de stuklijst` for the kit `handle`.
- `[APP-6]` `[seed]` A part is named by its role in its module: a `floor` part of `C14` is a `Laddersport` and of `A45` a `Vloerplank`, every `H10` part is a `Schild`, and a group the app has no Dutch name for shows its raw group name.
- `[APP-7]` `[seed]` With no filter (`null`), every part matches; the filter `estimate` matches exactly the parts with `source: "estimate"`, and any other filter matches exactly the parts whose module is that code.
- `[APP-8]` `[seed]` Choosing a filter keeps the selected part selected only when it matches the new filter, and otherwise clears the selection.

## The panel

- `[APP-9]` `[seed]` The stats line reads `161 onderdelen · 11 modules · 22 geschat`. The part count and the estimated count are counted from the model data; the module count is the length of the app's own module list (`MODULE_ORDER`), not the number of distinct modules in the data. The module row holds, in this order, `Alles`, one chip per module in the app's module order showing its tape-colour swatch, code, Dutch name and part count, then `Geschat` with the number of estimated parts; exactly the chip of the current filter (`Alles` for none) is `aria-pressed="true"`.
- `[APP-10]` `[seed]` With no filter the part list is empty; with a filter it holds one chip per matching part, in data order. Clicking a part's chip selects that part, clicking the selected part's chip clears the selection, and only the selected part's chip is `aria-pressed="true"`.
- `[APP-11]` `[seed]` The card shows, for a selected part, its id, its Dutch kind, its module code and name, its manual code, its size when it has one, and the badge `Uit handleiding` or `Geschat`; with nothing selected and the `estimate` filter, `<n> geschatte onderdelen`; with nothing selected and a module filter, the module's code and name and `<n> onderdeel` or `<n> onderdelen`; with nothing selected and no filter, `Tik op een onderdeel`.
- `[APP-12]` `[seed]` The colour button switches between module colours and wood colours: in wood colours the page `body` has the class `natural` and the button reads `Modulekleur`; in module colours the class is absent and the button reads `Houtkleur`. The app opens in module colours.

## The 3D viewer

- `[APP-13]` `[seed]` A part's appearance follows the state: the selected part is coloured `#ff1f6b`, with that emissive colour at intensity 0.75 and a translucent copy of it drawn over every other part; any other part takes its own `natural` colour in wood colours and its module's colour otherwise; a part outside the filter is drawn at opacity 0.09 without depth writes and without edges, and a part inside it opaque with its edges.
- `[APP-14]` `[seed]` A press counts as a tap only for the primary pointer, when it moves at most 8 px and lasts at most 500 ms. A tap selects the first part hit by a ray through the tap point or, failing that, through 8 points on each ring of 8, 16 and 24 px around it, considering only parts inside the filter; a tap that hits no part clears an existing selection.
- `[APP-15]` `[seed]` When the 3D viewer cannot start, the page shows the `#fail` message, and the panel's filters, part list, card and colour button keep working.
