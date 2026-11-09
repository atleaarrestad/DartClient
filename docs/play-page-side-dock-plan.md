# Play Page Side Dock

As of 2026-11-09. Client only (`C:\Users\Atle\git\dartClient`, branch `main`). Everything is unstaged; the user commits, pushes and deploys.

Chosen from the redesign canvas (frame 11, "Side dock + dartboard"). On the play screen, horizontal space is scarce and vertical space isn't. So the last-dart hints move from the bottom strip into a dock on the right, and the player cards wrap into rows.

## What changed

- **Page layout** (`game-page.css`, `game-page.ts`)
  - The board and the hints dock sit side by side: `grid-template-columns: minmax(0, 1fr) var(--hints-dock-width)`.
  - The dock width is `clamp(20rem, 22vw, 28rem)`, so a 1600px screen still fits three 400px cards.
  - Below 1000px wide, the hints go under the board instead, 15rem tall.
  - Removed the strip/panel placement code: `placeLastDartHints`, `growLastDartHints`, `hintPanelCells` and `hintsGrowth`.
- **Player cards**
  - The cards are the same as before, and cards in a row stay joined with no gap.
  - They wrap below `--player-min-width: 400px` (was 300px), so six players sit 3 + 3.
  - Rows are half the grid's height (`playerRowsPerScreen = 2`, with `minimumPlayerRowHeight` still 240). A seventh or eighth player starts a third row, which scrolls.
  - Rows are separated by `--space-4`.
  - Only a row's outer corners are rounded. The page counts the columns (`playerColumnCount`) and marks `player--row-start` and `player--row-end`, replacing `:first-child` and `:last-child`.
- **Placeholder rounds** (`getPlaceholderRoundCount`)
  - Empty rounds now only fill the rows the card shows, capped at the round limit.
  - Before, with a round limit, it added a full screen of empty rows after the played rounds and then scrolled to the end. With half-height cards, that pushed the round being thrown out of view.
- **Hints dock** (`aa-last-dart-hints`, rewritten)
  - The strip and panel placements are replaced by one docked layout, stacked top to bottom: the name, an SVG dartboard, the Rim and Miss chips, the chosen throw, up to three other throws, and the colour key.
  - When the box is wide (`aspect-ratio > 2`, the narrow-screen fallback), the board moves to the left.
  - The board is a regulation board, measured in millimetres:
    - bull 6.35, 25 at 15.9, trebles 99–107, doubles 162–170;
    - a 451mm black surround with the numbers.
  - It uses a dartboard's own colours: black and cream singles, red and green trebles and doubles (red on the black wedges), a red bull and a green 25. This replaces the purple, orange and blue ring colours.
  - Once something is lit, unlit targets dim to 20%. Lit targets keep their colour and get a yellow edge. The edge's width (1.5–4mm) shows the four heat steps.
  - Singles get twice the edge width. A lit black single lifts to charcoal (`#5a5a5a`), because a lit black single otherwise looked just like a dimmed one.
  - There are no count badges on the board, because the 8mm rings can't hold them. The counts show in the throw card when you point at a target.
  - The best throw is ringed and outlined in white on a black halo. A pointed target gets the same ring, dashed. Pointing at an "also worth aiming at" row shows that throw too.
  - The throw tiles use their target's board colour: T19 green, T13 red, S20 black, Bull red.
  - Each other throw says where a miss usually lands and what that still gets (`getMissFallback`, now exported).
  - The dock is always the same size, and the rows for the other throws keep their space, so nothing moves between darts.
- **Helpers**
  - `buildHintStrip` (columns) is replaced by `buildHintTargets`: a map of every target by dart notation, with tests updated.
  - Board geometry (`polar`, `arcPath`, `circlePath`, `wedgeSpan`) moved to `src/ui/dartboard/dartboardGeometry.ts`, which `aa-dartboard` now uses too.
- **Unchanged:** the reaction overlay. Its crowd still sits in the bottom-right corner of the board area, so the dock doesn't repeat it.

## Checks

- `pnpm typecheck` is clean, and vitest passes 434/434.
- `pnpm build` passes.
- ESLint on the changed files: no new warnings (128, all already in `game-page.ts`).
- Screenshots of the spectate page against the local backend in headless Chrome:
  - 2000×1000 and 1600×900: 3 + 3 rows, with rounds 1–7 and 1–6 in view.
  - 900×800: the hints sit under the board.
  - The dock was lit by setting sample hints on the component.

## Smoke test (user)

1. Play page with 6 players: cards sit 3 + 3 and are joined within a row; the hints dock is on the right.
2. Throw 2 darts: the board lights up, the best throw is outlined, and the other throws are listed.
3. Point at a lit segment or an "also worth" row: the throw card shows that throw.
4. Throw dart 3: the dock clears, and nothing on the page moves.
5. Add a 7th player: a third row appears and the grid scrolls.
6. Play past round 6: the cards scroll together and keep the current round in view.
