# Achievement builder: full page, sentence nodes, dartboard and rule text

Status: implemented 2026-11-08, unstaged (see "Progress" at the end).
Design reference: the "Achievement Node Concepts" artifact, round 2 (concepts 1 + 9, with 3 and 8).

## Goals

1. Move the achievement builder out of the seasons-page dialog onto its own route and page, so it
   gets the full window.
2. Replace the form-like logic nodes with **sentence nodes**: a node is a group (All, Any or Round);
   its simple conditions are one readable line each, and child groups branch to the right as
   their own nodes. Not is a flag, not a box.
3. Add a **readout**: the whole rule written out in plain language for a chosen parameter value,
   linked to the canvas by hover.
4. Build the **dartboard** into hit locations: hover a target chip for a small board, click it to
   pick on a board. Round nodes can show their targets on a board. Progression achievements are
   edited on a board.
5. Add **rule text**: a small text language for the same rule, in two-way sync with the canvas
   (Blocks / Split / Text). People add structure with blocks and tweak values in text.

Out of scope: a test bench (needs a backend draft evaluator), and changes to the stored model or the backend.

## Decisions

| Question | Decision | Why |
|---|---|---|
| Route | `/seasons/:seasonId/achievements`, with `?template=&version=` kept in the URL via `history.replaceState` | Reloading keeps your place; the seasons page links to it. |
| Management access | Shared helper `helpers/managementAccess.ts` (storage key + unlock dialog), used by the seasons page and the builder page. The page opens read-only and shows "Unlock editing" | No duplicated unlock code; browsing doesn't need the code. |
| Save / Publish | Buttons in the page header; the save flow moves from `seasons-page.ts` to `achievement-builder-page.ts` | The seasons page no longer hosts the builder. |
| Leaving with unsaved changes | Vaadin `onBeforeLeave` + `beforeunload` | The same guard the dialog had. |
| Player view-only builder (user page) | Stays a dialog | A quick look; not part of this change. |
| "and"/"or" on lines | On every line after the first | You never have to remember the group type. |
| Not | A toggle on lines and branches, not an addable block | No empty Not boxes; any stored Not shape still renders. |
| Shorthand | `S/D/T` + segment, `Bull` (25), `DBull` (50), `rim`, `miss` | What darts players write. |
| Progression | Board editor with a chip list of the targets (parameter targets live only in the list) | Fixed segments are a board-shaped problem; parameter targets aren't. |
| Rule text scope | Full Split view with autocomplete, inline errors, quick fixes and board hover | The user wants to edit values in text. |
| Code editor library | CodeMirror 6, only the modules used: `@codemirror/state`, `view`, `language`, `autocomplete`, `lint`, `commands`. Lazy-loaded when Split/Text opens | A robust editor without writing one; no cost for Blocks-only users. |
| Comments in rule text | Not supported; `#` gives an error that says so | The rule tree can't store them, so they would silently disappear. |
| Raw (advanced) conditions | Print as `raw(N) { expression }`; read-only, kept by position | They can't be written as blocks or text today. |

## Architecture

Pure logic lives in plain TypeScript modules with unit tests; Lit components only render and wire
events. Everything new lives under `src/components/achievement-builder/` unless noted.

```
pages/achievement-builder-page/        route page: load, access, save/publish, URL, leave guard
helpers/managementAccess.ts            storage key + unlock dialog (shared with seasons page)
helpers/dartboard.ts                   board order, neighbours, valid segments (pure)
ui/dartboard/aa-dartboard.ts           SVG board: zones, markers, labels, click-to-pick

achievement-builder/
  achievement-builder.ts               workbench (library | rule workspace | inspector)
  rule-workspace/
    aa-rule-workspace.ts               readout + Blocks/Split/Text + canvas/text/progression; owns
                                       preview binding, highlighted rule, view mode
    aa-rule-readout.ts                 readout banner with preview picker
    rule-readout.ts            (pure)  readout items + phrases per rule type
  sentence-canvas/
    aa-sentence-canvas.ts              pan/zoom canvas of sentence nodes + wires
    rule-graph.ts              (pure)  rule tree → nodes, lines, branches (Not folded in)
    rule-edits.ts              (pure)  tree edits: toggle not, move, duplicate, add, remove
    sentence-line.ts                   render functions for each leaf line type
    value-chip.ts                      compact value editor (number / parameter / field)
  hit-target/
    hit-target.ts              (pure)  target model {throwType, hitLocation} + contexts + labels
    aa-hit-target-chip.ts              chip with hover board + click picker popover
    aa-hit-target-picker.ts            picker: source tabs, board, type row, preview n
  progression/
    aa-progression-board-editor.ts     board + target chips for progression achievements
  rule-text/
    rule-text-vocabulary.ts    (pure)  keywords, fields ↔ value sources, statuses, operators
    rule-text-lexer.ts         (pure)  tokens with positions
    rule-text-parser.ts        (pure)  text → rule / progression + diagnostics + ranges
    rule-text-printer.ts       (pure)  rule / progression → text + ranges
    rule-text-completions.ts   (pure)  scope-aware completion items
    rule-structure.ts          (pure)  semantic equality + id reconciliation
    aa-rule-text-editor.ts             Lit wrapper; lazy-loads the CodeMirror setup
    rule-text-codemirror.ts            CodeMirror: highlighting, completion, lint, hover
```

The old `achievement-logic-editor.ts`, `achievement-value-editor.ts`, `logic-canvas-controller.ts`
(moved into the sentence canvas) and their CSS are replaced, not kept alongside.

### Data flow

- The builder owns the draft. The rule workspace receives `rule`, `progression`, `parameters`,
  `achievementScope`, `previews` and `readOnly`, and emits `achievement-logic-change`
  `{ rule? , progression? }`, the same event the builder already handles.
- Canvas and text are both views of `rule`. The text editor remembers the rule it last emitted;
  when `rule` comes back unchanged it does not reprint (the cursor stays). Any other change
  (a canvas edit) is reprinted.
- Text → rule: debounced parse (250 ms). Diagnostics with errors keep the last valid rule. A clean
  parse is compared semantically with the current rule; only real changes are emitted, after
  `reconcileIds` copies node ids from the previous tree so canvas state (collapsed nodes,
  selection) survives typing.
- Highlight: the workspace keeps `highlightedRuleId`. Hovering a readout item or a canvas line sets
  it; moving the text cursor sets it from the parser's ranges; selecting a canvas line moves the
  text cursor.

### Rule text language

```
rule      = { statement }                                   top level: all of these
statement = group | not | round | condition
group     = ("all" | "any") "{" { statement } "}"
not       = "not" statement
round     = "round" ["any" | "every"] [statuses] "{" { statement } "}"
statuses  = status { "|" status } | "none"                  omitted = all four
condition = ("hit" | "every dart") target                   throw
          | "count" "(" target ")" op value                 throw count
          | "winning" target                                winning throw
          | "sequence" target ">" target ">" target         ordered, same round
          | value op value                                  compare
          | "raw" "(" N ")" "{" … "}"                       kept advanced condition
target    = [S|D|T] segment | S | D | T | "any" | "Bull" | "DBull" | "rim" | "miss"
segment   = number | "{" name [("+"|"-") number] "}" | "{left " name "}" | "{right " name "}"
value     = ["-"] number | param | field
field     = round.number | round.points | round.throws | round.modified | round.singles
          | round.doubles | round.triples | round.distinctScores | round.lowestScore
          | game.rounds | game.placement | game.validRounds | game.victories | game.overshoots
          | game.failedWins | game.doubles | game.triples | game.rims | game.misses
op        = "=" | "!=" | "<" | "<=" | ">" | ">="
progression document = "collect" [valid|victory statuses] "{" { target } "}"
```

- A target without a kind uses that block's "any" type (`any` for throws, counts and winning
  throws, `anyScoring` for sequence steps).
- `Bull`/`DBull` print only for location 25/50 without a kind; otherwise `D25` etc.
- Scope rules follow `achievementRulePlacements` and `getAvailableValueSources`: throws, counts,
  sequences and `round.*` only inside a round block; `game.*`, rounds and winning throws only
  outside one. Breaking one is an error with a quick fix where one exists ("wrap in round any").
- Hit locations that are not on the board (not 1–20, 25 or 50) are warnings.
- Printing is canonical (two-space indent, one statement per line), so print → parse → print is
  stable. Round-trip tests run over sample rules for every rule type and every built-in shape.

### Sentence canvas

- `buildRuleGraph(rule)` returns nodes (group/round, with negation and scope) whose lines are leaf
  conditions or branches to child nodes. A Not around one thing folds into that line or node; a
  Not around a single-child group unwraps the group. A non-group root renders as a virtual All;
  the first add wraps it for real.
- Lines are sentences built from chips: native `<select>`s styled as chips for choices (keyboard
  and screen-reader friendly), `aa-hit-target-chip` for hit locations, `value-chip` for values.
- Each line has a ⋯ menu: Negate / Remove negation, Move up, Move down, Duplicate, Remove.
  Node headers: All ↔ Any, Negate, Collapse, Remove; Round headers add any/every and statuses.
- Wires are an SVG layer drawn from measured line and node positions (in unscaled graph
  coordinates), updated by a ResizeObserver.
- Zoomed out below 60%, nodes show their readout phrases in large type instead of controls.
- Pan, zoom and left-anchored fit move over from `logic-canvas-controller.ts`.

### Readout

`buildReadout(rule, { parameters, binding })` returns nested items `{ ruleId, text, children }`.
Values resolve through the binding (parameters, offsets and board neighbours), so it reads
"you hit T7" for n = 7, or `{n}` when no preview value exists. The preview picker lists the
generated achievements (`getPreviews`), with previous/next buttons.

### Dartboard

- `helpers/dartboard.ts`: clockwise order from 20, `getBoardNeighbor(n, 'left'|'right')` matching
  the backend's `DartBoardHelper` (left = previous clockwise), valid locations 1–20, 25, 50.
- `aa-dartboard`: `zones` (number, ring, tone), `markers` (number, ring, label), `labels`,
  `interactive` (emits `dartboard-pick` with number and ring), sized by CSS.
- Hit target chip: hover shows a small board after 300 ms (and on focus); click opens the picker.
  The picker's tabs are the existing value sources (fixed, parameter, neighbour, offset); its
  type row is limited per block (`hit-target.ts` contexts). Typing shorthand into the picker's
  input (`T20`, `D{n}`) uses the rule-text target parser.

## Phases

1. **Foundations:** plan; `helpers/dartboard.ts`; `managementAccess.ts`; the builder page and
   route; remove the builder dialog from the seasons page.
2. **Pure core with tests:** rule graph + edits, readout, hit target model, rule text
   (vocabulary, lexer, parser, printer, structure, completions).
3. **Components:** `aa-dartboard`, hit target chip/picker, sentence canvas, progression board,
   readout, rule workspace; wire into the builder; delete the old logic editor.
4. **Rule text editor:** CodeMirror setup, Split/Text modes, sync, diagnostics, completion, hover.
5. **Verification:** typecheck, lint, unit tests, visual check of each state in a temporary harness
   page, docs.

## Smoke test

1. Seasons → Achievement builder opens `/seasons/<id>/achievements` full-size; reload keeps the
   selected achievement.
2. Without the management code the page is read-only with "Unlock editing"; after unlocking,
   Save draft and Publish work, and leaving with unsaved changes asks first.
3. A rule with All, Any, Not, Round, throws, counts, compare and a sequence renders as sentence
   nodes with wires; "and"/"or" show per line; Not shows as a flag.
4. Line menus negate, move, duplicate and remove; node headers switch All/Any.
5. Hovering a target chip shows the board; clicking opens the picker; picking updates the line.
6. The readout matches the canvas; switching the preview achievement changes values; hover links
   both ways.
7. Split view: editing a number in text updates the canvas without moving the cursor; an error
   keeps the canvas and shows a message with a fix; autocomplete respects round scope; hovering a
   target shows a board.
8. Progression achievement: board toggles targets; text shows a `collect` block.

## Progress

- [x] Phase 1 – foundations: route + page, shared management access, seasons page links to the page,
  builder `locked` mode and URL sync (`?template=&version=`).
- [x] Phase 2 – pure core with tests: `rule-text.test.ts` (printing, round trips, errors and fixes,
  completions, id reconciliation) and `sentence-canvas.test.ts` (graph, edits, readout, neighbours).
- [x] Phase 3 – components: `aa-dartboard`, hit target chip/picker, sentence canvas, progression
  board, readout, rule workspace. The old logic editor, value editor and their CSS are deleted.
- [x] Phase 4 – rule text editor: CodeMirror (lazy chunk, ~118 KB gzipped), Blocks / Split / Text,
  250 ms parse, errors keep the last valid rule, canvas edits reprint the text.
- [x] Phase 5 – verification: typecheck, lint (no warnings in new code), 331 tests, production build,
  and a temporary harness (deleted) that checked in a real browser:
  - Blocks, Split and Text views; progression board; target picker; line menu;
  - text edit → canvas updates and the cursor stays; broken text leaves the rule unchanged;
    canvas edit → text is reprinted;
  - add a round and a hit, negate, move; readout follows; one wire per branch line;
  - the page locked (read-only, first achievement shown) and unlocked (link opens the draft).

Not verified: the page against the real backend (save, publish, category actions). The save flow
is the one the seasons page used, moved unchanged.

### Notes for later

- Bull targets can't be toggled on the progression board (only typed, e.g. `S25`), because how the
  backend treats a progression target on 25/50 wasn't checked.
- The player view-only builder (user page) still opens in a dialog; it uses the same workspace.
- Comments in rule text are rejected on purpose (the rule tree can't store them).
