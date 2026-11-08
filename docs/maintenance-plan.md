# Repo Maintenance Plan (client + backend)

As of 2026-10-19. Covers:
- client: `C:\Users\Atle\git\dartClient` (`main`)
- backend: `C:\Users\Atle\git\dartBackend` (`master`)

**Ground rule:** every change is left unstaged. Nothing is added, committed, pushed or deployed.

## Baseline before the cleanup

| Check | Client | Backend |
| --- | --- | --- |
| Tests | vitest 90/90 | MSTest 322/322 |
| Typecheck / build | `tsc` clean, but `*.test.ts` were never typechecked | builds; 9 nullability warnings and 1 MSTEST0032 warning outside migrations |
| Lint | 0 errors, 2652 warnings (almost all auto-fixable formatting) | n/a |

Ten read-only audits produced the findings below: 5 client slices, 4 backend slices and one cross-repo contract check. Every item names an owner, which is the workstream that implements it. Workstreams own disjoint files so they can run in parallel.

## Decisions taken (and why)

- **Data service lifetimes.** Every client service is a DI singleton now. A transient `DataService` meant `SubmitGame` waited on an empty throw queue that belonged to another instance (the race the queue exists to prevent).
- **Throw saves vs submit.** `SubmitGame(gameId)` waits only for saves of *that* game still in flight, and refuses to submit if one of those fails. Earlier failures were already shown to the player and resynced, so they no longer make a later submit (or a later game) fail.
- **Average score stays integer.** The backend computes `AverageScore` with integer division and it feeds MMR. The crash on a player with no played rounds is fixed, but the rounding is kept so MMR does not shift. Changing it is a balance decision for the user.
- **Unauthenticated destructive endpoints.** `PUT users/Update` and `DELETE users/Delete` get `[SeasonAdminKey]`, so admin tooling still works. They are not deleted.
- **Unused, unbounded public endpoints are deleted:** `games/GetAll`, `games/GetMostRecent/{amount}`, `games/GetMostRecentDateInUTC` and `users/GetByIds`. The client never calls them.
- **Legacy achievement classes are deleted** after their behaviour is frozen into a golden JSON file. The parity coverage is kept; the 130+ dead classes go. The enums and the `Legacy*SqlBuilder`s stay, because the seeder and the migrations use them.
- **Deferred: DB schema changes** (a concurrency token on `SeasonStatistics`, unique indexes on stats and hit counts). They need a new migration and a check of production data for duplicates first. See Follow-ups.
- **Deferred: large UI decompositions** (rule-editor dialogs into components, game-page controllers, an achievement registry). Only pure-logic extractions with unit tests are done now, because UI moves can't be verified without a browser.
- **Lint autofix is not run.** It would reformat about 2600 lines and bury the real diff. Run `pnpm lint:fix` as its own commit.
- **False positive dropped.** The audit flagged rank and achievement icons as broken on nested routes. They are not: both helpers prefix `getAbsoluteBase()`.

## Done by the coordinator (before the workstreams)

- `package.json`:
  - name `dart-client`, `private`, no `main`;
  - new scripts `typecheck`, `lint`, `check`; `lint:fix` now targets `.`;
  - removed the unused `highlight.js` and `tslib`.
- `tsconfig.json`:
  - `noEmit` instead of declaration emit into `dist`;
  - `include` limited to `src`, `types.d.ts` and `vite.config.ts`;
  - removed `importHelpers`.
- New `tsconfig.test.json` typechecks the tests.
- `vite.config.ts`: vitest block with `include`, `unstubGlobals`, `restoreMocks` and a test `VITE_SERVER_URL`.
- `eslint.config.js`: node globals for `scripts/` and `vite.config.ts` (fixes the one lint error).
- `src/index.ts`:
  - all services are singletons;
  - removed the highlight.js registration, the dead `aa-combobox` import and a no-op import;
  - removed `CacheService`'s overridden `@singleton`.
- `GameService.submitGame`, used by the index page.
- `DataService`:
  - per-game tracking of in-flight throw saves;
  - `AbortSignal.timeout(30s)` replaces the 500 s timer that was never cleared;
  - the body read moved inside the try;
  - 4 new tests.
- Shared helpers:
  - `achievementTiersAscending` in `models/enums.ts`;
  - `sum` retyped as `<T>(items: readonly T[], fn)`.

## Client workstreams

### C1: services, models, core helpers, their tests
Owns `src/services/**` (except `achievementBuilderService.ts`), `src/models/*` (except `achievementBuilder*.ts`), `src/api/**`, `src/helpers/{applyGameTrackerDelta,lastDartHints,sum,getErrorMessage,achievementHelper}.ts`, the tests of those files, and the new `src/test/**`.
1. One `send<T>()` helper in `DataService` replaces about 30 copies of the fetch, status and zod-parse boilerplate.
   - Keep the existing error prefixes.
   - Make `get`, `post`, `put` and `delete` private.
   - `Ping` currently reports "Failed to remove player": fix that message.
   - `GetAllSeasons` should parse `z.array(SeasonSchema)`.
   - Apply `encodeURIComponent` to the ids used in paths.
   - A list "not found" returns `[]`.
2. `SeasonService` and `UserService`:
   - `finally` clears a cached promise only if it is still the same promise;
   - `create` dispatches `seasonUpdatedEventName`.
3. SignalR:
   - group factories (`spectate(gameId)`, …) replace the literal that is repeated 3 times;
   - drop the speculative `hubUrl` parameter.
4. Dead code:
   - the `SessionAchievement`, `ProgressAchievement` and `AchievementType` enums;
   - `GameSubmissionSchema`;
   - the `PlayerRoundDelta` type;
   - `CacheService.removeLastPlayedUserIds`;
   - the unused imports.
   - Narrow `DialogService.open` to `TemplateResult`, which removes the `innerHTML +=` path.
   - Make the `notificationService` import relative and `import type`.
5. `getRankIcon` and `getAchievementTierIcon` become lookup tables. `achievementHelper` uses `achievementTiersAscending`.
6. Tests:
   - shared `src/test/gameFixtures.ts`, used by the `lastDartHints` and `applyGameTrackerDelta` tests;
   - new: `mmr.ts` golden cases and `validateMmrConfiguration`;
   - new: the `applyGameTrackerDelta` invalid and stale paths;
   - new: the `schemas.ts` `superRefine` rules, moving the misplaced schema tests in;
   - new: `users.requests`, `getErrorMessage`, SignalR `stop` and status.
   - Make the submit retry delay a constructor option instead of overriding a private field.
7. From the contract audit:
   - error details also read ValidationProblemDetails `errors` and a nested `value`;
   - "No active season" gives a clear error;
   - zod-validate SignalR payloads in `GameLiveService`;
   - remove the client-only `ScoreModifier.reserved`.

### C2a: game, play and user pages
Owns `pages/{game-page,index-page,spectate-game-page,sessions-page,users-page,user-page,changelog-page}`, `src/templates/dialogTemplates.ts`, `src/styles/dialog-templates.css` and the new `src/helpers/throwFocusNavigation.ts`.
1. Index page:
   - make `isActiveGame` `@state`;
   - `createGame` picks players before clearing the board, and confirms when a game is active;
   - the `rematch` catch is reactive.
2. `game-page.initialize`: try/catch, `aa-error-state` with retry, a generation check after each await, and handle a missing season.
3. Index page cleanup:
   - `disconnectedCallback` removes listeners synchronously;
   - catch errors in `addNewPlayer` and `removeFocusedPlayer`;
   - check the achievement-subscription generation.
4. Spectating does not overwrite the player's cached game id. `sessions-page` and `spectate-game-page` use `Router.go` instead of pushState plus popstate.
5. `users-page` and `user-page`: error state with retry, no spinner forever, load on route enter.
6. Dead code:
   - in `dialogTemplates`: `seasonRuleDialogTemplate`, `gameResultDummyData` and the unused imports;
   - CSS: `.rules-dialog*`, `.hljs*`, `.shortcut-help-intro`;
   - in the index page: the unreachable `renderBottomContent` branch, the rematch-callout CSS, `focusCombobox`, the `aa-combobox` type import and the always-true `if`;
   - `sessions-page`: no-op `onBeforeEnter`, `@property` to `@state`;
   - `spectate`: empty constructor;
   - `user-page`: unused `users`;
   - CSS: `.page-head`.
7. `newUserTemplate`:
   - require a name and an alias;
   - close through `closest('aa-dialog')`;
   - type the error with `getErrorMessage`.
8. Deduplicate:
   - a shared `renderPlayerChips` for the rematch chips;
   - `patchDartThrow` for the nested players, rounds and throws patch;
   - move the focus navigation into the pure `throwFocusNavigation.ts`, with tests;
   - use `achievementTiersAscending` and `sum`.

### C2b: season pages
Owns `pages/{season-page,seasons-page}`, `src/components/season-*/**` and the new `src/helpers/{seasonStatistics,seasonDraft}.ts` plus their tests.
1. `season-page`:
   - fix the podium with one player (a named `{first, second, third}`);
   - add an error state with retry;
   - respect the `/season/:id` route parameter.
2. Compute `seasonRows` once in `willUpdate`, not about 40 times per render. Move the pure statistics into `helpers/seasonStatistics.ts` (`getSeasonStatistics`, `createEmptySeasonStatistics`, …), with tests.
3. The 16 spotlight getters and 16 `open*Dialog` methods become one definitions table.
4. The leaderboard receives numbers instead of strings to re-parse.
5. `seasons-page`:
   - extract the pure draft normalization and validation into `helpers/seasonDraft.ts`, with tests;
   - use `getErrorMessage` (8 copies);
   - use `AaDialog.close` instead of hand-dispatched close events;
   - remove the trivial wrappers;
   - catch errors around `openUnlockSavingDialog`;
   - use `achievementTiersAscending`.
6. Delete the unused `aa-season-rules-summary` and its CSS.
7. Dead code:
   - the `champion` and `crowdedTableRegular` getters;
   - the unused row fields and icon cases;
   - the `.order-field` CSS.

### C3: achievement builder and browser
Owns `src/components/achievement-builder/**`, `aa-achievement-browser`, `achievement-category-manager`, `src/helpers/compileAchievementTemplate*.ts`, `src/models/achievementBuilder*.ts` and `src/services/achievementBuilderService.ts`.
1. **Blocker:**
   - **Problem:** the "existing draft" choice is opened through `DialogService` while the builder is already a dialog. That rejects, so the button does nothing.
   - **Fix:** render the choice inline in the builder.
2. Value editor: switching from a parameter to Number now starts the number at `0` instead of putting the parameter name in the field. Offer only parameters whose type fits the slot.
3. Add the 64 KB definition-size limit (the backend's limit) to draft validation, and stop storing `editor.progression.raw`, which is never read.
4. Restore safety: a restored editor rule is trusted only if it compiles back to the stored AST; otherwise show it as raw. Add golden snapshot tests per rule type.
5. Renaming a parameter key also renames the references to it in the logic, the name and the description.
6. One table says where each block type may appear; the draft, the compiler and validation all use it.
7. Deduplicate the label tables:
   - value sources (already drifted);
   - throw types;
   - round statuses;
   - operators.
   Other duplicates:
   - `throwTypeHasHitLocation`;
   - `sequenceTargetCount`;
   - `andOperands`;
   - `achievementTiersAscending`;
   - `z.infer` for `evaluationPhase`;
   - derive `AchievementDraftLimits` from the catalog schema.
8. Category manager: keep unsaved renames in other rows. Fix the misleading comment and remove the dead `.unknown` CSS and unused exports. **Keep `predictRemainingThrows`**, because the last-dart-hints plan references it.
9. Count progression reducer nodes in `measureAchievementAst`, as the backend does.
10. Tests:
   - fix the assertion that can never fail (`compileAchievementTemplate.test.ts:1025`);
   - replace JSON-substring asserts with an AST walker;
   - strengthen the weak `expect.any` and `toBeDefined` assertions;
   - shared `src/test/achievementFixtures.ts`;
   - `it.each` tables.

### C4: UI primitives, generic components, styles, assets
Owns `src/ui/**`, the generic components (charts, dialog, notification, user picker, tabs, navbar, rank display, player chip, tooltip, MMR editor, …), `src/styles/{tokens,global,shared-styles}`, `src/faIcons.ts`, `index.html` and `public/`.
1. One chart helper (a controller) for the four Chart.js components:
   - create lazily;
   - destroy on disconnect and recreate on reconnect;
   - register only the parts in use instead of `chart.js/auto`;
   - one shared chart-host CSS.
   - The MMR editor updates its charts instead of rebuilding them on every slider input.
2. `aa-notification`: no unhandled rejection; `role="status"`, or `role="alert"` for danger.
3. `aa-dialog`:
   - restore focus to the opener;
   - trap Tab;
   - `aria-labelledby`;
   - a labelled close button;
   - drop the no-op overflow save.
4. `aa-form-field` labels its slotted control. `aa-user-picker` gets proper combobox and option roles.
5. One `slotHasContent` (5 copies). Move `.visually-hidden` into the shared styles. Add tokens for the repeated hard-coded colours.
6. Delete:
   - `aa-combobox-cmp/`;
   - the unused icons (`bag`, `home`, `season_alpha`, `season_beta`; about 1.2 MB);
   - the navbar's dead `test` property and the fake disabled link.
   The navbar should also not render `season/undefined`, and should handle a failed load.
7. Inline only the Font Awesome class rules into shadow roots (the full CSS is currently bundled twice).
8. `index.html`: merge the font requests. Small accessibility fixes: rank alt text, empty-state `aria-labelledby`, dartboard pre-aggregation.

## Backend workstreams

### B1: game, season, user flow (Web, Database, Models)
1. Submit:
   - fix the crash for a player with no played rounds;
   - keep the integer average;
   - share the rule "rounds counted up to the win" (`PlayerRounds.GetCountedRounds()`).
2. Adding a player is idempotent. Return 404 for an unknown user and 409 when the game is finalized.
3. Concurrency and state:
   - `GET games/sessions` snapshots under the gate;
   - remove the session before the finish broadcast, and log broadcast failures;
   - the persisted-replay shortcut removes the session.
4. Validate `HitLocation`/`ThrowType` (400). Starting a game with no season returns 409.
5. `SeasonStatistics`:
   - set only `SeasonId`, not the detached `Season` navigation;
   - remove the duplicate rank lookup;
   - starting MMR comes from configuration.
6. `Repository.ExecuteWithErrorHandling` no longer hides `DbUpdateException`, so the finalize retry works.
7. Endpoints:
   - users Update/Delete require the admin key;
   - Update returns 404 for a missing user;
   - season delete returns 409 when the season is in use and 404 when it is missing;
   - delete the unused endpoints and their service/repository methods.
8. Nullability:
   - fix the 9 warnings properly;
   - delete `GameSubmission.cs`;
   - `NoWarn CS8981` for migration names.
9. `RoundValidatorUtility`:
   - reset `IndexOfVictoryThrow`;
   - fix the CS8600 warning;
   - one `DartThrow.IsPlaceholder`.
10. Deduplicate:
    - `Clone()` on `DartThrow`/`Round`/`PlayerRounds` replaces 3 copies;
    - `SeasonRepository.WithRules()`;
    - season constraint limits come from `SeasonRuleUtility`.
    Smaller fixes:
    - the `SeasonRuleUtility` message typo;
    - the new-session double save;
    - `CreatedAtAction`.
11. Cleanup:
    - CORS: one valid policy;
    - Swagger only in development;
    - remove `CookieUserIdProvider`, `AddHttpClient` and the no-op hub override.
12. Contract audit:
    - "No active season" returns a 404 ProblemDetails from both `season/latest` and new-game, not 204 and not a 500;
    - errors use one `Problem(...)` convention, including GameController's plain strings;
    - `AddProblemDetails()` and `UseExceptionHandler()`;
    - the idempotent submit replay loads the same graph as the first submit.
13. Tests:
    - `RoundValidatorUtility`;
    - win conditions;
    - placements and results (ties, placement 0, all-unplayed);
    - the new 4xx paths.

### B2: achievement builder core
1. Prediction analyzer:
   - an unknown or unconstrained node makes the result *opaque*, so it never under-approximates;
   - the sequence deficit applies only where the sequence is required in the current round.
2. Compiler:
   - reject unknown or misspelled node properties *when drafts are validated or published*, never when stored definitions are loaded;
   - reject comma-joined enum names;
   - `hasHitSegment` requires a `collectHitSegments` reducer;
   - a `sequence` needs at least 1 item.
3. Runtime:
   - a missing placement is `null`, not 0;
   - reject null `ActivatedModifiers`;
   - the `validate` endpoint requires the admin key.
4. Performance: last-dart hints and projection share one unlock query and one `Prepare`. Finalize uses dictionary lookups.
5. Deduplicate:
   - `IncludeResponseGraph()` (drop the unused `Template` join);
   - one state-picking helper with one tie-break;
   - `LegalDartHit` becomes an immutable record;
   - the seeder and the migration SQL builder share family expansion. Its output must be byte-identical.
6. Dead code: `CachedDefinitionCount` and the unreachable `TryResolveThrowType` parameter branch.
7. **Contract bug:**
   - **Problem:** `TryMapException` wraps `Problem()` in `NotFound`, `BadRequest` or `Conflict`, so the client receives `{value:{detail}}` and loses every builder error message.
   - **Fix:** return `Problem(statusCode: …)` directly, and test the response body.
   - The anonymous `evaluate` endpoint also gets the admin key.
8. Evict the user output cache when categories, publish or archive change.

### B3: legacy removal and test infrastructure
1. **Freeze first.** While the legacy classes still exist, generate `Tests/AchievementBuilder/Golden/legacy-parity.json`. It holds the serialized fixtures, the legacy unlocks per placement, the effective tiers and the progression results. Rewrite `LegacyBuilderParityTests` to use the file, and prove it matches.
2. Port `TrailingUnplayedRoundsTests` and the `IsSessionAchievementConditionsMet` expectations to a `BuiltInCatalogHarness` that asserts expected values.
3. Delete:
   - `Core/Achievements/`;
   - `AchievementUtility`;
   - `AchievementHelper`;
   - `Models/Achievements/{Interfaces,AchievementType,AchievementTracker,PlayerSessionAchievementState}`;
   - `DartBoardHelper` mask helpers;
   - `Tests/Achievements/**`;
   - the `Ignore<AchievementTracker>` calls.
   Then fix the crefs and verify with `dotnet ef migrations has-pending-model-changes`.
4. Test infrastructure:
   - `Tests/Infrastructure/` with shared fakes (6 copies of some), a `GameControllerHarness` (12 hand-built controllers) and `SqliteTestDb` on the real `ApplicationDbContext` (replacing 3 hand-written EF models);
   - fix the `TestHelper.Double`/`Tripple` points;
   - delete the duplicate snapshot test and the always-true assert;
   - merge the SQL-builder test files.
5. Split `AchievementBuilderV2Tests` and `Hardening` (3600 lines) by system under test.

B3 runs in two phases. The legacy freeze and deletion run alongside B1 and B2, because they touch different files. The fakes, harness and split run after B1 and B2, because those also touch controller construction in tests.

## Follow-ups for the user (not done)

1. **Duplicate users:** the client expects a 409, but the backend allows duplicates. Decide whether to add a unique index or drop the client branch.
2. **Schema hardening migration:**
   - a concurrency token on `SeasonStatistics`;
   - a unique index on `(UserId, SeasonId)`;
   - a unique index on `HitCount (SeasonStatisticsId, ThrowType, HitLocation)`.
   Check production for duplicates first.
3. `SetRoundAsUnplayed` permanently zeroes later rounds when a correction creates an earlier victory. This is a design choice; confirm it is intended.
4. `AverageScore` uses integer division (it feeds MMR). Decide whether to switch to real division.
5. Run `pnpm lint:fix` as a separate formatting-only commit.
6. Larger refactors:
   - the seasons-page rule editors as components;
   - game-page reactive controllers;
   - one achievement node registry on each side;
   - a `compilerVersion` stored on editor trees.

## Status (2026-10-19): all workstreams done, everything unstaged

| | Client | Backend |
| --- | --- | --- |
| Tests | 301/301 (from 90), 17 files | 385/385 (from 322) |
| Typecheck / build | `pnpm typecheck` clean, tests included; `pnpm build` OK | 0 warnings, 0 errors, migrations included |
| Other | lint 0 errors (1787 formatting warnings, down from 2652); main JS 938 → 700 kB plus a lazy 182 kB Chart.js chunk; CSS 93 → 15 kB | no pending EF model changes; migration seed SQL byte-identical (hash-pinned test) |
| Diff | 101 files changed, 25 new: +3952 / −6493 | 224 files changed, 27 new: +1980 / −12248 (158 legacy files deleted) |

Two independent review passes (client and backend) ran after implementation.

**Fixed after review:**
- `aa-error-state` never showed its message: whitespace in the slot hid the fallback.
- List endpoints treated 404 as `[]`, which hid missing endpoints. Restored the old behaviour except for active games.
- The active-games list waited on every game's mutation gate. It now snapshots under `SyncRoot` and skips finalized games.
- The prediction analyzer went fully opaque whenever `DoublePointsAt69` was active.
- The season-delete conflict message was misleading.

**Rejected as false positives:**
- Icons 404 on nested routes.
- The client sends `Double 25`: `aa-dart-throw-cmp` already resets Double and Triple to Single for 0, 25 and 50.

### Deploy notes (backend and client changes depend on each other)
- **Deploy the backend and client together.** The backend `achievement-builder/templates/{id}/validate` now requires the admin key; the new client sends it, the old one gets a 401.
- **Backend behaviour changes:**
  - illegal throws get a 400;
  - "No active season" is a 404 ProblemDetails, not a 204 or 500;
  - GameController errors are ProblemDetails, with the same text in `detail`;
  - users Update/Delete and builder `evaluate` need the admin key;
  - adding a player twice is a no-op 200, and an unknown user is a 404;
  - Swagger only runs in Development;
  - CORS has one policy, and the origins that could never match are removed.
- **Achievement builder:**
  - misspelled properties now fail draft validate and publish;
  - predictions for custom achievements are more conservative;
  - builder errors now reach the admin with their real message.
- **Client:**
  - spectating no longer replaces your own cached game;
  - starting a new game during an active one asks for confirmation;
  - Font Awesome ships only the solid and regular sets (add `brands.min.css` in `faIcons.ts` before using `fa-brands`).
- **Not verified in a browser.** Smoke test before deploying: throw entry and keyboard shortcuts, new game and rematch, spectate, the season, seasons and user pages, the charts, the achievement builder (save, validate, publish, existing-draft choice) and dialogs (focus, Escape).

### Left as follow-ups
See "Follow-ups for the user" above, plus these.

**Not done:**
- `EvaluateForFinalize` gives non-winners placement 0, not null. Legacy behaviour is pinned by the golden parity file.
- Caching prepared achievement instances across throws.

**Larger UI decompositions (deferred):**
- the seasons-page rule editors;
- game-page controllers;
- the MMR editor tablist.
