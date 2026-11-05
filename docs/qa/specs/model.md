# The model generator

How the speeltoestel's 3D model is made and what the app gets from it: the generator that builds every part from the Wickey ArcticFlyer manual, the check against the manual's parts list, the ladder-and-slide switch, the GLB file it writes, and how the app loads that file. Project #7 seeded these clauses for the port of the Python generator to TypeScript and the move from a JSON model to GLB. This area holds only the clauses projects have seeded so far. Every clause is `[seed]` until a human promotes it (`K-SPEC-8`).

The app's own behaviour on the model (what the panel, the filters and the viewer do with it) is the `APP` area's, in `docs/qa/specs/app.md`.

**Id prefix:** `MODEL`

## The generator

- `[MODEL-1]` `[seed]` `npm run model` runs the generator, written in TypeScript under `model/`, on Node, and writes the GLB to `public/models/speeltoestel.glb`. It needs neither Python nor any tool outside the repository's npm dependencies. A plain run writes no other file; `npm run model -- --baseline` also rewrites the baseline fixture of the next clause from the generator's own parts.
- `[MODEL-2]` `[seed]` The generator's parts match the baseline fixture `tests/fixtures/model-baseline.json`, which starts as a byte-for-byte copy of the Python generator's last output (`src/data/speeltoestel.json` as committed when this clause is first enforced) and changes only through `npm run model -- --baseline`: the same 161 parts in 11 modules, with the same ids in the same order, each with an identical `module`, `kit`, `group`, `size`, `source` and `natural`, the same number of triangles, and every triangle coordinate at most 1 mm from the baseline's.
- `[MODEL-3]` `[seed]` Before it writes anything, the generator checks its parts against the manual's parts list: it counts the parts by stock code (the last word of each part's `kit`) and, for each of the 25 codes in the stock table carried over unchanged from the Python generator (`P-220` to `handle`), checks that the model's count equals the table's. Last words that are not in the table, such as `hook`, `seat` and `slide`, are not checked. If any of the 25 codes differs, the generator exits non-zero, names each differing code with the model's count and the manual's, and writes no file.
- `[MODEL-4]` `[seed]` Each part's id is its module code, `_` and its id within the module (`A45_VP1`); a handle takes the module of the structure it is fixed to (`C14` beside the ladder, `A47` on the ship). Ids are unique: a duplicate stops the generator, naming the id, before anything is written.
- `[MODEL-5]` `[seed]` The generator has one ladder-and-slide switch, the constant `SWAP_LADDER_SLIDE`, on by default as in today's model, and it is the default of an option the generator's build function takes, so both settings can be built in one process. With it on, the ladder and the slide stand as `[APP-3]` states. With it off, the ladder's eight parts (`C14_S1`, `C14_S2`, `C14_T1` to `C14_T4`, `C14_G1`, `C14_G2`) and `G01_slide` are built unmirrored, as the manual shows them, and triangulated by the same routine as every other part. For each of those nine parts, the switch-off build has the same number of triangles as the switch-on build. Its set of distinct vertex positions is the switch-on set mirrored to x′ = 2190 − x: each vertex in either set lies at most 1 mm from the mirror image of a vertex in the other. Its triangles face outward in both settings, so the part's signed volume, summed over its triangles, is positive in both. Every other part is identical in both settings. The clause does not require a switch-off triangle to be the mirror of a switch-on triangle, because the mirror reverses each face's vertex order before triangulation and ear clipping then cuts the same quad along its other diagonal.

## The GLB

- `[MODEL-6]` `[seed]` The GLB is glTF 2.0 binary with one scene that holds one node per part, in the generator's order, each named by the part's id. Each part node's `extras` hold the part's `id`, `module`, `kit`, `group`, `size`, `source`, `natural` (its wood colour, three numbers from 0 to 1) and `name`, the Dutch name the app's `kindOf` gives the part (`Laddersport` for `C14_T1`). The scene's `extras` hold `moduleColors`, one colour for each of the 11 module codes, equal to the colours the JSON model carried.
- `[MODEL-7]` `[seed]` Each part node's mesh has one primitive of unindexed triangles (mode 4, no `indices`) with a `POSITION` attribute in metres: reading it back, multiplying by 1000 and rounding gives exactly the part's whole-millimetre triangle coordinates from the generator, in the generator's order. The primitive's material has the part's `natural` colour, converted from sRGB to linear as glTF requires, as its base colour, so a generic glTF viewer shows the wood colours.
- `[MODEL-8]` `[seed]` The committed GLB is byte-for-byte what `npm run model` writes from the committed generator, and two runs write identical bytes, so a generator change committed without its regenerated GLB fails `npm test`.

## The app on the GLB

- `[MODEL-9]` `[seed]` The app reads its model only from the GLB, fetched at runtime: no JSON model is tracked under `src/` or bundled into the client. Every part record the panel, the filters and the viewer use (its id, module, kit, group, size, source, natural colour and Dutch name) and the module colours come from the GLB's `extras`, and the card's kind is the part's `name` from the GLB.
- `[MODEL-10]` `[seed]` The viewer draws each part with the GLB's own geometry, unindexed as stored, so it derives per-triangle normals and its edges at a 25° threshold as it did from the JSON; the model's bounds, and so the grid's position and the home view, equal the ones the JSON gave, to float32 precision.
- `[MODEL-11]` `[seed]` Until the GLB has loaded, the stats line reads `Loading model…` and the panel shows no chips. If the GLB cannot be fetched or read, the `#fail` element shows `The model can't load. Reload the page or try another browser.` in place of its WebGL message, and the panel stays empty. Once the GLB has loaded, a viewer that cannot start still leaves the panel working, as `[APP-15]` states.

## Removal of the Python generator

- `[MODEL-12]` `[seed]` The repository tracks no Python and no Swift (`git ls-files '*.py' '*.swift'` lists nothing), and neither `package.json`, `README.md` nor `docs/HANDOVER.md` names Python, USDA, `usdzip` or `render3`.

## Deploy

- `[MODEL-13]` `[seed]` The smoke hook also fetches `/models/speeltoestel.glb` from the environment's deployed URL, and fails unless it answers 200 with a body that starts with the glTF magic bytes `glTF`.
