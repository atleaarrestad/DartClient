# Last-Dart Achievement Hints Plan

As of 2026-10-19. Covers both repos:
- client: `C:\Users\Atle\git\dartClient`, branch `main`
- backend: `C:\Users\Atle\git\dartBackend`, branch `master`

Ground rules from `achievement-release-plan.md` apply: Claude leaves every change unstaged. No add, commit, push or deploy.

> **2026-11-08:** hints no longer travel in game state or with throw saves. They have their own
> cancellable request; see [last-dart-hints-loading-plan.md](last-dart-hints-loading-plan.md).
>
> **2026-11-08, placement:** where the hints go only changes with the players or the window
> (`placeLastDartHints`), never between darts.
> - **Panel:** used when the last player row has at least two free cells and every row fits
>   without scrolling. The hints fill those cells as tall as the row: a bigger board, with
>   the name and list down the side if the panel is wider than 1400px, stacked if narrower.
> - **Strip:** used otherwise. It grows upward into the space under the last player row, up
>   to 8rem more (`growLastDartHints`, worked out as if the strip had its usual height, so the
>   rows never change because of it). The player grid keeps 8px of bottom padding for the
>   card shadows.
> - **List length:** in both, the list shows as many achievements as fit.
> - **Ranking (`rankThrows`):** each target is scored by aim, not by hit.
>   - What hitting it is worth (achievement MMR, plus `getFinishValue` when the server lists it
>     in `victoryHits`) times its hit chance.
>   - Plus what a miss usually lands in times the fallback chance: a treble or double falls
>     back to the single of the same number, the bull to the 25.
>   - Hit chances, relative to a single: single 1, treble 0.3, 25 0.25, bull 0.2, double 0.18.
>   - Fallback chances: treble 0.55, double 0.35, bull 0.35.
>   - So a double that unlocks far more than its single, or that wins the game, gets
>     recommended; one that adds little doesn't.
> - **Worth line:** reads "Win + 4 achievements (+65 MMR)" (or "4 achievements (+65 MMR)", or
>   "Win"), without dot separators, and only wraps between its parts.
> - **Bull naming:** players call the 25 the bull, so the 50 shows as "Double Bull"
>   (`describeHit`) on the tile, in titles and to screen readers. The notation and wire codes
>   keep "Bull".
> - **Colours:** by ring rather than board colours. Trebles are purple, doubles (and the bull)
>   orange, singles (and the 25) blue, and the rim and a miss grey. The T/D/S row letters are
>   badges in the strong colours, as the key.
> - **Heat map:** a lit segment runs from the pastel end of its ring's colour to the strong
>   end, in four steps (`getHeatLevel`), by how many achievements it unlocks against the most
>   any segment on the board unlocks. Unlit segments are a faint tint. The best-throw tile
>   always takes the strong colour.
> - **Best throw:** marked on the board by the star alone. On the side it is a big tile in its
>   ring's colour (`S20` in large type, as tall as the strip allows), with the label, what it's
>   worth and the achievements to its right. The 🎯 badge on the third-dart input is gone.

## Status (2026-10-19, implementation pass)

Phases 1–4 are implemented in both working trees, unstaged. Placement A (bottom dock) was chosen. Checks: backend 321/321, client tsc clean, vitest 88/88, `pnpm build` passes.

**Not done: end-to-end smoke test in the real app.** Claude couldn't start the backend: reading the local DB password was blocked. The component and dock were checked with headless-Chrome screenshots of a temporary preview page (since removed) at 1440, 1000, 760 and 600 px, with 0, 1 and 5 hints. User smoke test:
1. Start the backend and the client.
2. Throw 2 darts: the dock fills.
3. Throw dart 3: the dock clears.
4. Correct dart 2: the hints update.
5. Bust after 2 darts: no hints.
6. A spectator sees the same hints.
7. Reload with 2 darts down: the hints come back.

Decisions and deviations from the plan below:
- Naming: `LastDartHintsByPlayer` everywhere (tracker, delta, client), not `NextDartHintsByPlayer`.
- Runtime API: a separate `IAchievementBuilderRuntimeService.EvaluateLastDartHints` instead of folding it into the projection call. The projection keeps its strict failure semantics, the hints get their own `try/catch` in `GameController`, and the window check runs before any query. Cost: one extra unlock query, only on the second dart of a round.
- Prediction outcome enum `AchievementPredictionOutcome` (string-serialized like the other builder enums) on the predict endpoint and the client schema. `IsTruncated` is kept.
- Search: groups still advance round-robin, which keeps the small searches finishing first. Each group now shares simulations through a per-request cache (at most 1024 entries). A single global enumeration was tried and dropped: evaluation dominates the cost, and it left more achievements "Unknown" at 2 darts (123 vs 58).
- Skipped:
  - **step 1.3 (incremental simulation):** unsafe, because score modifiers read earlier rounds (`ApplyScoreModifierRule(ref rounds, i, j)`);
  - **step 1.4 (threshold pruning):** not needed for one dart, and an analyzer change risks wrongly ruling achievements out. Worth revisiting only if the 2–3 dart endpoint gets a client.
- Hint budget: `LastDartHintOptions.MaximumEvaluations = 50_000` (config section `LastDartHints`), with no round limit for the trusted game path. The built-in catalog needs far less.
- An empty result is `null`: the dock hides instead of saying "nothing in reach".
- Client: hints are hidden for a player while one of their throws is saving, and whenever the local rounds no longer match the server's window (`isLastDartWindowOpen`). Ties go to the focused player, then the player whose hints arrived last.

**Dock redesign (same day, after user feedback):**
- The "🎯 Last dart · player" heading is gone; the board already shows who is up. The name is still announced to screen readers.
- Each card shows the achievement's easiest throws: up to 3, or fewer if fewer exist, plus "+N". The pills are coloured like the board: trebles and bull red, doubles and outer bull green, singles white.
- The server sends `WinningHits` easiest first (`DartHitEase`: board area per region; single ≫ outer bull > double > treble > bull; rim and miss last). Achievements are ranked by tier, then total winning area, then name.
- The dock is now 7rem tall and up to 90rem wide. `.player-container` keeps a matching free strip through `--last-dart-dock-height`.
- Each card is a container query (`hint`) and shows 3, 2 or 1 targets depending on its own width. The dock container (`dock`) hides the names when very narrow.
- Checked with headless-Chrome screenshots at 1600, 1100, 760 and 520 px (Chrome won't go narrower).

Benchmark after the change (Release, 185 built-in Live achievements, engine only, run alone):

| Darts left | Default budget | Near-complete (2M) |
|---|---|---|
| 1 | 2–23 ms, exact, always 64 simulations | same |
| 2 | 13–71 ms, 58–75 unknown (as before) | 118–569 ms, exact |
| 3 | 21–180 ms, mostly unknown | 0.9–5 s |

## Goal

After a player has thrown 2 darts in a round, show which achievements their **last dart** can still unlock, and what to hit for each one. For example: "Ton-80 (Diamond): T20". Show the top 3, plus "+N more".

- Only the last dart. With 2–3 darts left the search is slow and mostly inconclusive (see Findings), so hints with more than one dart left are out of scope.
- Hints come from the server, as part of game state. The client sends no extra request. Every client (player and spectators) sees the same hints.
- The display must not shift the layout and must not cover the scoreboards.

## Findings this builds on

- The engine already exists: `Core/AchievementBuilder/AchievementPredictionService.cs` + `AchievementPredictionAnalyzer.cs`. The anonymous endpoint `POST achievement-builder/predict-next-throw` exposes it. The client has `achievementBuilderService.predictRemainingThrows()` but never calls it.
- Benchmark over the 185 built-in Live achievements (Release build, engine only, no database):

| Darts left | Default budget (10k) | Near-complete search (2M) |
|---|---|---|
| 1 | 3–25 ms, exact, nothing truncated | same |
| 2 | 15–70 ms, 70–79 of ~85 results "unknown" | 165–540 ms |
| 3 | 20–80 ms, more than 100 unknown | 1.5–5.3 s |

- Time grows with game length. Each simulated sequence clones and reprocesses the whole round history.
- Achievements that can't be narrowed down get their own group. Each group simulates the same sequences again.
- A truncated result with no sequences means "couldn't decide". Nothing in the response says that explicitly.
- `Predict` loads instances from the database on every call (`GetActivePublishedInstances`). It skips `AchievementSnapshotCache`, and it uses the latest published versions, not the game's version snapshot (`GameTracker.V2AchievementVersionSnapshotIds`). Hints must use the snapshot, so they match what the game will actually award.

## Design overview

```
throw POST ─► GameController.UpdateDartThrow (under MutationGate)
                 │  candidate rounds (copy)
                 ▼
          AchievementBuilderRuntimeService.EvaluateLiveThrow
                 ├─ projection (as today)
                 └─ last-dart hints, only if LastDartWindow says the player has 2 darts down
                        └─ AchievementPredictionService (1 throw) + LastDartHintRanker (top N)
                 ▼
          GameTracker.NextDartHintsByPlayer[playerId] = hints | removed
                 ▼
          GameTrackerDelta.NextDartHintsByPlayer (changed players only; null clears)
                 ▼
client: applyGameTrackerDelta ─► game-page state ─► <aa-last-dart-hints> in a fixed dock
```

Hints are **derived state**: a pure function of (player rounds, season, the game's catalog snapshot, the player's unlocks). Each time a throw for player P changes, P's hints are recomputed from scratch, or cleared. No incremental bookkeeping, so corrections, busts and out-of-order entry can't leave stale hints.

## Phase 1: Engine improvements (backend)

Not strictly needed for 1 dart (already 3–25 ms), but it keeps the throw path cheap in long games. It also makes the existing endpoint useful for 2 darts.

1. **Explicit outcome per achievement.** Replace `IsTruncated` + empty sequences with an enum `PredictionOutcome { Reachable, ReachableTruncated, Unknown }` on `AchievementSequencePrediction` (and on the API contract `PredictedAchievementSequences`). Consumers must never treat `Unknown` as unlockable. Update the client schema in `src/models/achievementBuilderApi.ts`.
2. **One simulation per sequence.** Replace the per-group enumeration in `Search` with:
   - enumerate the product of the union masks once;
   - simulate each sequence once;
   - evaluate every still-open candidate whose own per-throw masks admit that sequence (a bitmask test).

   Budget accounting stays as it is: one unit per simulation plus one per evaluation. For 1 dart that is at most 64 simulations for the whole catalog.
3. **Cheaper simulation.** `CreateSimulation` clones and reprocesses every round. Check whether `RoundValidatorUtility.ProcessRounds` can start from `roundIndex`: earlier rounds are fixed, so cumulative points carry over from round `roundIndex - 1`. Check score modifiers and win conditions that look back across rounds before relying on it. If it's safe:
   - add `ProcessRounds(rounds, season, fromRoundIndex)`;
   - share the unchanged earlier `Round` objects read-only, and clone only from `roundIndex` on.

   If it isn't safe, skip this step. Steps 2 and 4 already give most of the speed-up.
4. **Upper-bound pruning in the analyzer.** Mark an achievement `Impossible` when a score/count threshold can't be reached even with the maximum points per remaining dart. Example: "score at least 180 in a round" after 20 + 5. Do this in `AnalyzeRequirement` for `sum`/`count` nodes compared with a constant or bound parameter, and only for monotone comparisons (`>=`, `>`). Anything else stays opaque, as today.
5. **Use the cache in the endpoint.** `AchievementBuilderService.Predict` should load instances through `AchievementSnapshotCache`, the same way the runtime service does.
6. **Guard test without timing.** Add a test that runs a 1-dart prediction over the full built-in catalog with a 15-round history. Assert:
   - no `Unknown` outcomes;
   - the simulation count is ≤ 64;
   - the result equals a brute-force reference (simulate all 64 hits and evaluate every instance directly).

   Use counters, not stopwatch thresholds, so the test isn't flaky.

## Phase 2: Last-dart hints in game state (backend)

1. **`LastDartWindow`** (pure static, `Core/AchievementBuilder/LastDartWindow.cs`). Rules: `TryGet(PlayerRounds player, out int roundIndex)`:
   - The current round is the **first** round with a placeholder slot (`AchievementDartRules.IsPlaceholderThrow`). It is not necessarily the last round, because `synchronizePlayerRoundCounts` pads players who are behind with empty rounds.
   - The window is open only if slots 0 and 1 are played, slot 2 is a placeholder, and `RoundStatus` isn't `Overshoot`, `Victory` or `WinConditionFailed`. Check in `RoundValidatorUtility` what status a round has after 2 darts, and which statuses end the round early.
   - Test cases:
     - 0, 1 or 3 darts thrown;
     - dart 3 entered before dart 2;
     - bust after 2;
     - victory after 2;
     - a player who is behind and has padded rounds;
     - a correction to an earlier round.
2. **`LastDartHintRanker`** (pure static). Order:
   1. tier, highest first (Diamond to Bronze; this matches the MMR value);
   2. number of winning hits, most first (easier first);
   3. `RenderedName`, ordinal.

   Keep the top `MaximumHints` and also return `TotalCount`. The ranking lives in one place, so changing it later touches one file. Possible later change: weight by the player's own hit rates (the heatmap data already exists).
3. **Contracts** (`Models`):
   ```csharp
   public sealed class LastDartHints {
       public int RoundIndex { get; set; }
       public int TotalCount { get; set; }
       public List<LastDartHint> Hints { get; set; } = [];   // ranked, at most MaximumHints
   }
   public sealed class LastDartHint {
       public AchievementInstanceResponse Achievement { get; set; } = new();
       public List<LegalDartHit> WinningHits { get; set; } = [];
   }
   ```
   - `GameTracker.NextDartHintsByPlayer: Dictionary<Guid, LastDartHints>` (players with an open window only).
   - `GameTrackerDelta.NextDartHintsByPlayer: Dictionary<Guid, LastDartHints?>` (changed players only; `null` clears). This follows the precedent of `ProjectedV2AchievementsByPlayer`, comparing by `RoundIndex` + ordered instance ids + hits.
   - Snapshots (`GetGame`) include the map, so a reload or a new spectator sees current hints.
4. **Options**: `LastDartHintOptions` via `IOptions` (`appsettings`). Fields: `Enabled` (default true) and `MaximumHints` (default 5). The server sends 5 and the client shows 3, so the client can change its limit without a backend change.
5. **Runtime service**: rename/extend `EvaluateLiveProjection` into `EvaluateLiveThrow(...)`, returning `(List<AchievementInstanceResponse> Projection, LastDartHints? Hints)`.
   - One cached instance load and one unlock query, shared by both results.
   - Use the game's `V2AchievementVersionSnapshotIds`, not the latest published versions.
   - Filter out unlocked achievements by **identity** (`AchievementIdentity.Of`), as the projection does today, before calling the predictor.
   - Call the predictor with `throwsRemaining: 1` and the `roundIndex` from `LastDartWindow`.
   - Drop achievements whose `WinningHits` cover **all** legal hits: they unlock whatever is thrown, so a hint adds nothing.
6. **Throw endpoint** (`GameController.UpdateDartThrow`):
   - Compute the hints together with the projection, on `candidateRounds`, under `MutationGate` and outside `SyncRoot`.
   - Write them in the second `SyncRoot` block next to `ReplaceV2Projection`, through a `GameTracker.ReplaceNextDartHints(playerId, hints)` that removes the entry when `hints` is null.
   - **Failure isolation:** catch around the hint computation only. On failure, log, clear that player's hints, and record the throw anyway. A missing hint is harmless; a failed throw is not (compare R1 in the release plan).
   - Also clear hints for a removed player and when the tracker is finalized.
7. **Tests** (backend):
   - window rules;
   - ranker order and cap;
   - delta carries set, change, clear and unchanged-omitted;
   - a real throw sequence: dart 2 sets hints, dart 3 clears them, correcting dart 2 recomputes them, a bust clears them;
   - hint computation that throws still records the throw;
   - snapshot ids are respected (a newer published version doesn't leak into an old game).

## Phase 3: Client data flow

1. `src/models/schemas.ts`: add `LastDartHintsSchema`. Add `nextDartHintsByPlayer` to the tracker schema (record, default `{}`) and to the delta schema (record of nullable).
2. `src/helpers/applyGameTrackerDelta.ts`: merge it, deleting keys whose value is `null`. Extend the existing tests.
3. `game-page.ts`: `@state() protected nextDartHintsByPlayer`. Set it in `updateGameState` and on the delta path, the same as `projectedV2AchievementsByPlayer`.
4. **Client staleness guard.** Show hints for a player only if `hints.roundIndex` is that player's current round and slot 2 is still a placeholder locally. Also hide that player's hints as soon as a local `throw-updated` fires for them, before the server answers. This prevents a flash of outdated hints while dart 3 is saving.
5. **Pure helpers** in `src/helpers/lastDartHints.ts`, with vitest tests:
   - `selectVisibleHints(hints, limit = 3)`: slice only. The server already ranked them.
   - `formatHit(hit)`: `T20`, `D16`, `S5`, `25`, `Bull`, `Miss`.
   - `describeWinningHits(hits)`: one hit, its label; all the same number, "Any 20"; all the same type, "Any double"; 3 or fewer, "T20 / T19"; otherwise "12 targets". Show the full list in a tooltip.

## Phase 4: Visualization

### Component: `src/components/aa-last-dart-hints/`

`aa-last-dart-hints.ts` + `.css`, a Lit component like the other `aa-*` components. It has no service access and only takes props:
- `playerAlias: string`
- `hints: LastDartHint[]` (already sliced to 3)
- `totalCount: number`

Content, in **one row**:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 🎯 Atle · last dart │ [💎 Ton-80  T20] [🥇 Shanghai 16  T16] [🥈 Fish  D1] │ +4 │
└─────────────────────────────────────────────────────────────────────────┘
```

- Each chip shows the tier icon (`getAchievementTierIcon`), the name (truncated with ellipsis) and the target label. The `title` or `aa-info-tooltip` shows the full name, description and full target list.
- "+N more" shows only when `totalCount > hints.length`. Its tooltip lists the next names (from the extra hints the server sent).
- **Fixed geometry.**
  - Fixed height (one chip row, about 52px), and always 3 chip slots of fixed width. Unused slots are empty, not removed.
  - When hints change, only the content crossfades (opacity, 150 ms). Height and width never animate.
  - Honour `prefers-reduced-motion`.
- Hidden state uses `visibility: hidden` plus `opacity: 0`, not `display: none`, so showing and hiding never reflows anything.
- Use the existing design tokens (`--color-surface-raised`, `--color-border-strong`, `--shadow-brutal-sm`), matching `.sync-status`.
- Accessibility:
  - `role="status"` with `aria-live="polite"`, so a screen reader announces "3 achievements in reach with the last dart" once per change, not per chip.
  - Chips are plain text, not buttons. They aren't interactive, so the focus order between dart inputs is untouched. This matters because keyboard entry drives the game.

### Placement (decision needed; recommendation first)

**A. Bottom dock in the existing overlay zone (recommended).**
- `.floating-controls` is already absolutely positioned at the bottom, and `.player-container` already reserves `padding-bottom: 88px` for it.
- Put the dock in that zone: bottom-centre on wide screens, to the right of the sync status. It is absolutely positioned, so the layout never shifts.
- It sits in space the scoreboards already leave free, so it covers none of them at rest.
- On narrow screens (the existing `@media` block that stretches `.floating-controls`), stack it above the sync status. Raise `padding-bottom` there to match.
- Trade-off: it isn't visually attached to the player's column. The leading "🎯 Atle · last dart" label solves that, together with a small marker on that player's slot 3 (see below).
- Caveat: when the player grid scrolls (more than one row of players), the dock floats over the lower cards, just as the sync status does today. Check with 5–8 players.

**B. Fixed slot inside every player column** (in `.rank-container` or a new grid row).
- Attached to the player, but it must reserve the height in **every** column all the time, or the rounds list (`1fr`) jumps.
- With 4 or more players at the 250–300px minimum width there's only room for about 1 chip.
- Choose this only if A tests poorly.

**C. Top strip in `.player-header`.** Stable, but it takes about 52px of scoreboard height permanently, and the spectate page already uses that row.

**Marker on slot 3 (both A and B):** while a player's window is open, `aa-dart-throw` for slot 3 gets a `hasHints` boolean. It shows a small 🎯 corner badge (absolutely positioned, fixed size, no layout effect), so it's clear which input the hints belong to. *(Removed 2026-11-08: the user found it ugly; the strip already names the player.)*

### Where it renders

- In `GamePage`, so the index and spectate pages both get it.
- Render the dock once, for the player whose window is open. Normally that's one player. If several have an open window (for example while correcting older rounds), prefer the active/focused player (`isPlayerActive`), otherwise the most recently updated player.
- Add the player's hints to the `guard([...])` dependency list only for the slot-3 marker, so other columns don't re-render.

## Phase 5: Verification

- Backend: `dotnet test` (all, plus the new tests). Run the benchmark from the findings again as a throwaway test, before and after Phase 1, and record the numbers here.
- Client: `npx tsc --noEmit`, `npx vitest run`, `pnpm build`.
- Manual / screenshots (`run` skill or browser):
  - 2, 4 and 8 players, wide and narrow viewport;
  - throw 2 darts and see the dock fill with no layout shift (compare the scoreboard bounding boxes before and after);
  - throw dart 3 and see it clear;
  - correct dart 2 and see it update;
  - bust after 2 darts and see no hints;
  - spectator view shows the same hints;
  - a reload during an open window restores the hints.

## Order and size

| Phase | Depends on | Size |
|---|---|---|
| 2 Backend hints in game state | — | M |
| 3 Client data flow | 2 | S |
| 4 Component + placement | 3 | M |
| 1 Engine improvements | — (can run in parallel) | M |
| 5 Verification | all | S |

Phase 2 first gives a working feature, because the current engine is already exact and fast enough for 1 dart. Phase 1 is hardening and makes the 2-dart endpoint usable.

## Open decisions for the user

1. Placement: A (recommended), B or C.
2. Hints visible to spectators too? The default in this plan is yes, because it is shared game state. Hiding it is a client flag on the spectate page.
3. Ranking: tier, then easiest. Or should "easiest" use the player's personal hit rates later?
4. Show achievements that any dart would unlock? This plan hides them.
5. `MaximumHints` sent by the server: 5 (client shows 3).
