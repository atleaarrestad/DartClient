# Play Page Side Dock

As of 2026-11-09. Client (`C:\Users\Atle\git\dartClient`, branch `main`). The last-dart goals (win first, the 69 rule) also change the backend (`C:\Users\Atle\git\dartBackend`, branch `master`). Everything is unstaged; the user commits, pushes and deploys.

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
  - The strip and panel placements are replaced by one docked layout, stacked top to bottom: the name, an SVG dartboard, the Rim and Miss chips, and one list of up to four suggested throws. There is no heading over the list and no colour key under it: the user found both useless, and the rows, rings and callouts explain themselves.
  - When the box is wide (`aspect-ratio > 2`, the narrow-screen fallback), the board moves to the left and the four suggestions sit two by two.
  - **Suggested throws** (one list, max 4, replacing the big throw card and the "also worth" rows):
    - The one to make first is on top. Each row has a tile in its target's board colour, ringed like the board for the main throw, second choice and 69 dart.
    - Then pills for a win or 69, each tier's icon with a count (e.g. silver 6, bronze 6), and the MMR.
    - The second line says what it is: "Easiest win", "Best throw", "Second choice", "If you hit", or "Next round scores double" for 69. No dot-separated extras.
    - The MMR sits right-aligned at the end of the second line, so it forms a column down the list. The top line has only pills and tier counts.
    - In a column narrower than 400px (a 1600px screen gives 352px), the rows and miss cells use tighter spacing and sizes (`@container hints (width < 400px)`), so nothing is cut off.
    - **Miss cell:** a treble or double whose miss usually still gets something gets a quieter right third (a 2/3 + 1/3 split, dashed divider, faint background).
      - The miss usually lands in the single of the same number (`getMissFallback`).
      - The cell is a small version of the throw beside it, with no label: a tile for that target in its board colour, what it gets on top (tier icons with counts, a "WIN" pill, or a "69" pill), and its MMR below.
      - Other targets, and misses that get nothing, use the full width.
    - The achievements' names are the row's tooltip.
    - The old card grouped names that differ only in brackets, e.g. "(Raw, Modified)", so 12 achievements showed as 6 lines and looked like 6. The tier counts don't have that problem.
    - The main row has the strongest border and shadow, and the second choice a lighter one.
    - Pointing at a lit target the list doesn't have puts it in the last row ("If you hit") while pointed at.
  - The board is a regulation board, measured in millimetres:
    - bull 6.35, 25 at 15.9, trebles 99–107, doubles 162–170;
    - a 451mm black surround with the numbers.
  - It uses a dartboard's own colours: black and cream singles, red and green trebles and doubles (red on the black wedges), a red bull and a green 25. This replaces the purple, orange and blue ring colours.
  - Once something is lit, unlit targets dim to 20%. Lit targets keep their colour and get a yellow edge. The edge's width (1.5–4mm) shows the four heat steps.
  - Singles get 1.6× the edge width.
  - Once anything is lit, every single that shows (lit, or ringed though it unlocks nothing) gets matched brightness: black lifts to `#6f6f6f` and cream drops to `#978e77`, about as bright as the lit red and green rings.
    - Full cream outshone the black singles, so a lit S20 was lost next to a lit S19.
    - A lit black single kept black would look like a dimmed one.
    - The yellow edge says what is lit; the hue says black or cream.
  - There are no count badges on the segments, because the 8mm rings can't hold them. The ringed throws get callouts outside the board (below), and every lit target shows its counts in the list when pointed at.
  - The best throw is ringed and outlined in white on a black halo. A pointed target gets the same ring, dashed. Pointing at a suggestion rings its target.
  - The throw tiles use their target's board colour: T19 green, T13 red, S20 black, Bull red.
  - Trebles and doubles show where a miss usually lands, when that still gets something (`getMissFallback`, now exported).
  - The dock is always the same size, and the list keeps room for four rows, so nothing moves between darts.
- **Helpers**
  - `buildHintStrip` (columns) is replaced by `buildHintTargets`: a map of every target by dart notation, with tests updated.
  - Board geometry (`polar`, `arcPath`, `circlePath`, `wedgeSpan`) moved to `src/ui/dartboard/dartboardGeometry.ts`, which `aa-dartboard` now uses too.
- **Side column** (`<aside class="side">` in `game-page.ts`): everything that isn't a player moved out of the card area, so the cards have it to themselves.
  - Top: the page's own header (`renderPlayerHeaderContent`; only the spectate page has one). It shows "Spectating", the React picker and "Join game" on one line, divided off from the hints. "Spectator mode" was shortened to "Spectating" so it fits.
  - Then the last-dart hints.
  - Over both: `aa-reaction-overlay`. The crowd pill sits in the column's bottom-right corner, in the free space under the suggestions, and reactions rise up the column (`--lane-width: 55%`).
  - The column carries the border and background. Below 1000px wide it goes under the cards.
  - The spectate page's `.player-container` top-padding override is gone, since the header no longer sits above the cards.

## Last-dart goals: win first, then achievements, and the 69 rule

Decided with the user: winning matters most.

- **What the dock shows** (`planLastDart` in `lastDartHints.ts`, tested)
  - **Main throw:** if any dart wins, the easiest winning dart. It gets the top suggestion, labelled "Easiest win", and a bold white ring.
  - **Ease order:** the same order the ranking uses (`throwDifficulty`): single, treble, 25, bull, double.
  - **No win:** the main throw is the best throw for achievements ("Best throw"), as before.
  - **Second choice:** when the main throw is a win, the best throw for achievements, if it's a different dart. That's usually a dart that doesn't win, but it can be a harder winning dart that unlocks more. It gets a thinner grey ring and the second suggestion, labelled "Second choice", with its tile ringed grey. If it's the same dart as the easiest win, there's only one ring.
  - **69 rule:** when the season plays it, the easiest dart that leaves the total on exactly 69 gets a cyan ring and a suggestion with a "69" pill and "Next round scores double". If the dart to 69 is also the main throw or the second choice, that row gets the pill instead.
    - Already on 69 after two darts, the last dart counts double. So only a Miss (or Rim) keeps the total there, and the dock suggests a Miss.
  - **Undimmed:** ringed targets never dim, even when they unlock nothing.
  - **Callouts:** like the rank-change badges on the statistics charts, each ring gets a badge just outside the board on a leader line in the ring's colour.
    - The badge shows a green "WIN" pill if the dart wins, a cyan "69" pill if it lands on 69, and the highest tier icon it unlocks with the number of achievements.
    - The second choice's badge is drawn at 85% size.
    - Rim and Miss get no badge; their chips already say what they are.
    - Badges sit 12°, 30°, 48° and so on to either side of their target, never straight out, so the leader passes between numbers instead of covering the target's own. A spot is used only if it stays inside the view box (±290mm, which leaves the board some margin) and covers no earlier badge (`placeCallouts`).
  - **The rest of the list** is the next throws for achievements, up to four suggestions in total.
  - **Ranking:** `rankThrows` now ranks by achievements alone, since the win is handled by `planLastDart`. `victoryValue`, `getFinishValue` and the game page's `getVictoryValue` are gone.
- **Backend**
  - `AchievementPredictionService.FindLastDartTargets` replaces `FindVictoryHits`. In one pass over every legal last dart it finds:
    - the darts that win;
    - when the season has `DoublePointsAt69`, the darts whose simulated round ends with `CumulativePoints == 69`.
  - `LastDartHintService` now answers even when no achievement is in reach, or when the catalog is empty. It returns null only when there are no hints, no winning darts and no darts to 69. Before, a dart that could only win sent nothing.
  - `LastDartHints` (the response) gains `SixtyNineHits` in dart notation. The client schema defaults it to `[]` for older servers.
  - Tests: two new cases in `LastDartHintTests`:
    - a win with no achievements;
    - 69 reached by D15/T10, Miss/Rim when already on 69, and nothing without the rule.

## Checks

- `pnpm typecheck` is clean, and vitest passes 438/438.
- `pnpm build` passes.
- ESLint: no new warnings in `game-page.ts` (128, all already there). One new alignment warning in `achievementBuilderApi.ts`, the same kind as its neighbours.
- Backend: all 449 tests pass. They were built to a separate artifacts path, because the running `Web.exe` locks `Web/bin`.
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
7. Restart the backend first (the running one predates `SixtyNineHits`). Leave a player 12 short of the goal: S12 gets the white ring and "Easiest win". If a different dart unlocks achievements, it shows as the grey second choice.
8. In a season with the 69 rule, leave a player 30 short of 69 after two darts: T10 gets the cyan ring and a "Lands on 69" row.
