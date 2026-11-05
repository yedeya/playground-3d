# The transport plan

What the app does to let its owner plan the playset's disassembly and rebuild it months later: transport pieces (sets of parts that stay together as one piece), the contacts between pieces, the tape labels on the joints between them, how all of that shows in the 3D view and the panel, and where it is stored. Project #9 seeded these clauses; its brief is `docs/projects/9.md`, and "decision N" below means decision N of that brief. They build on the viewer's own clauses in `app.md` (the `APP` area, seeded by project #6) and on the backend of project #8. Every clause is `[seed]` until a human promotes it (`K-SPEC-8`).

**Id prefix:** `TRANS`

A piece's parts are named by the part `id` of the model data. Those ids are this project's own codes, not markings on the wood (`docs/HANDOVER.md`), so every rule below that reads a stored id also says what happens when the model no longer has it.

## The plan

- `[TRANS-1]` `[seed]` A transport plan holds zero or more pieces, each with an id, a display colour and a name that is non-empty and unique within the plan, compared case-insensitively after trimming spaces. Each part id belongs to at most one piece, so assigning a part to a piece removes it from any piece it was in. A part of the model that is in no piece is `Loose`.
- `[TRANS-2]` `[seed]` A stored part id that the loaded model does not contain is kept in the plan, never dropped, and is counted and listed by id as `Unknown part` in the plan overview, so a regenerated model that renames a part shows up rather than silently losing that part's piece.
- `[TRANS-3]` `[seed]` Deleting a piece that any joint label names first asks for confirmation, and the question says how many labels will be deleted with it. Once confirmed, the piece, its memberships and every label that names it are deleted together; cancelled, nothing changes. A piece that no label names is deleted with its memberships. Either way, its parts become `Loose` (decision 9).

## Contacts between pieces

- `[TRANS-4]` `[seed]` Two parts touch when their axis-aligned bounding boxes, each grown by 5 mm on every side, overlap. Two distinct pieces are neighbours when some part of one touches some part of the other. Contacts only suggest where joints are: they never block an edit or a label.

## Joint labels

- `[TRANS-5]` `[seed]` A joint label records two distinct pieces of the plan, the part it sits on (a part of one of those two pieces), a point on that part in model millimetres, one tape colour from the palette, and an optional text of at most 12 characters, such as `3` or `A-B`.
- `[TRANS-6]` `[seed]` The tape palette is, in this order, `Red`, `Orange`, `Yellow`, `Green`, `Blue`, `Purple`, `White`, `Black`, `Grey` and `Brown`, each with one swatch colour (decisions 4 and 11). A label's tape colour is always shown as its swatch together with its name, never as the swatch alone.
- `[TRANS-7]` `[seed]` A label is displaced when the model no longer has its part, or when its point lies more than 20 mm outside its part's bounding box. The plan overview lists displaced labels, and the 3D view still draws each one at its stored point.

## The 3D view and the filter

- `[TRANS-8]` `[seed]` The filter row holds, after the module chips and `Geschat`, one chip per piece in plan order, showing the piece's colour, name and part count, and then `Loose` with the number of parts in no piece. A piece's chip filters the 3D view, the part list and tap picking to that piece's parts, and `Loose` to the parts in no piece. Every rule a module filter follows for the selection, the part list, the card, appearance and picking applies to a piece filter and to `Loose` in the same way.
- `[TRANS-9]` `[seed]` The colour button cycles through three modes, module colours, wood colours and transport colours, in that order, and reads the name of the next mode: `Houtkleur` in module colours, `Transport colour` in wood colours and `Modulekleur` in transport colours. The two Dutch labels exist today and stay; only the new one is English (decision 11). In transport colours each part takes its piece's colour, and a part in no piece is drawn in a neutral grey that a piece cannot be given. The selected part keeps the selection colour in every mode.
- `[TRANS-10]` `[seed]` Joint labels are drawn in the 3D view as markers at their stored point, in their tape colour and with their text, visible through other parts, in every colour mode. With no filter all labels are drawn; with a piece filter only the labels that name that piece; with any other filter none. Tapping a marker opens its label.

## Overview per piece

- `[TRANS-11]` `[seed]` A piece's overview shows its name and colour, its part count, the size of its parts' joint bounding box as `L × W × H mm` (L the longer and W the shorter horizontal extent, H the height, each rounded to the nearest 10 mm), its parts counted per module, and, for each neighbour piece, the labels on that pair with their tape colour and text, or `No label yet` for a neighbour pair that has none.
- `[TRANS-12]` `[seed]` The plan overview, shown when no piece is chosen, lists every piece with its part count and size, then `Loose` with its part count, the number of neighbour pairs that have no label, every unknown part and displaced label, and every membership and label that names a deleted piece (`[TRANS-21]`).

## Editing the plan

- `[TRANS-13]` `[seed]` A piece can be created with a name and a colour, renamed, recoloured and reordered. The app proposes no pieces: a new plan holds none, and the owner defines every piece (decision 1).
- `[TRANS-14]` `[seed]` In edit mode, with a piece active, a tap on a part assigns that part to the active piece, and a tap on a part already in it makes the part `Loose`; `Whole module` adds every part of a chosen module to the active piece. Outside edit mode a tap selects a part exactly as it did before this project.
- `[TRANS-15]` `[seed]` In label mode a tap on a point of a part places a label there. The label's first piece is that part's piece; its second is chosen from that piece's neighbours first and then from the other pieces. A part in no piece cannot carry a label. A label's colour, text and pieces can be edited, it can be moved by tapping a new point, and it can be deleted.

## Storage

- `[TRANS-16]` `[seed]` The transport plan, meaning its pieces, memberships and labels, is stored in the backend of project #8 against the owner's account. A change saved on one device reads back identical on another device after a reload, and the app holds no transport data only in the browser beyond project #8's offline queue.
- `[TRANS-17]` `[seed]` A change made offline is kept, shown as not yet saved, and saved through project #8's sync once the device is online again. A membership is one record per part id, so two devices that assign the same part leave it in exactly one piece after sync.
- `[TRANS-18]` `[seed]` The plan's schema change is additive: new tables only, each row scoped to the owning account under the data-isolation rule of `docs/qa/stack.md`, and no existing table or column changed.
- `[TRANS-21]` `[seed]` A membership or a joint label that names a piece the plan no longer holds is kept, never dropped. This happens when one device deletes a piece while another device, offline, assigns a part to that piece or places or edits a label that names it, and the later change wins under project #8's sync (decision 12). The server accepts such a record, because each collection's validator checks only that record's own fields and never looks up another record, so the record never causes a sync batch to be refused. A part whose membership names a deleted piece counts as `Loose`, and assigning it to a piece replaces that membership. The plan overview lists each such part and label under `Deleted piece`, and the owner can then assign the part again, or edit or delete the label. `[TRANS-5]`'s rule that a label's two pieces are pieces of the plan applies to a label placed or edited on the device in use, not to a label received through sync.

## The model as built

- `[TRANS-19]` `[seed]` The model shows the ladder and the slide swapped against the manual, because that is how the real playset stands (decision 2), so labels are placed on the geometry seen while dismantling. The existing swap test (today in `tests/parts.test.js`) checks this geometry, and citing this id in its title locks the clause.

## Delivery

- `[TRANS-20]` `[seed]` The owner has entered the plan in the app, taped and labelled the real playset's joints, and recorded on the project's last issue that the plan overview showed no neighbour pair without a label, together with a pass or fail for each step of that issue's phone check.
