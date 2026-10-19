# Achievement Builder Release Plan

As of 2026-10-19. Covers both repos:
- client: `C:\Users\Atle\git\dartClient`, branch `main`
- backend: `C:\Users\Atle\git\dartBackend`, branch `master`

## Summary

Not ready to push yet. Four blockers must be fixed first: the SignalR backend branch, wrong score tiers, a draft-overwrite bug, and an untested production migration. Everything else is hardening.

### Where things stand (local only, nothing pushed)

| Repo | Branch now | Commit | What happened |
| --- | --- | --- | --- |
| dartClient | `main` | `bbeacc1` | Staged work committed on `signal-r-improvevemtns`, then fast-forwarded into `main` |
| dartBackend | `master` | `b903367` | Uncommitted + 4 untracked files committed on `achievement_builder`, then fast-forwarded into `master` |
| dartBackend | `signal-r-improvevemtns` | **not merged** | Conflicts in 5 files and uses deleted legacy types; merging it is step B1 |

All further work happens on client `main` and backend `master`.

### Health checks at the time of review

- Client: `npx tsc --noEmit` clean, `npx vitest run` 60/60 pass, `vite build` passes.
- Backend: compiles, 271/271 tests pass, `dotnet ef migrations has-pending-model-changes` reports none.
- A local backend `Web` process may lock `Web/bin`. To test without stopping it, use `dotnet test Tests/Tests.csproj --artifacts-path <temp dir>`.
- Migration design: copies legacy data, verifies with a preflight, then drops. All 8 migrations run in one transaction at startup (`Web/Program.cs:113`, `db.Database.Migrate()`), so a failure rolls back cleanly.
- Catalog: 185 session and 9 progression achievements each map exactly once. Parity holds apart from the 7 tier errors in B2.

## Blockers

### B1. Client depends on an unmerged backend SignalR branch

**Problem:** Client `main` calls hub method `SubscribeActiveGames` and listens for `OnActiveGamesChanged` and `OnGameDelta`. These exist only on backend branch `signal-r-improvevemtns`, which is not in `master`.

- The sessions page shows a red "Live active-game updates are unavailable" message and retries every 5 s forever (`src/services/signalRService.ts:178-180, 418-427`, `sessions-page.ts:128-133`). There is no polling fallback.
- Spectating still works: it falls back to `OnGameUpdated`, and the throw POST falls back from the delta schema to the full tracker (`dataService.ts:202-208`).
- Merging the branch conflicts in:
    - `Models/Game/GameTracker.cs` (`ThrowUpdateLock` vs `MutationGate`/`IsFinalized`)
    - `Web/Controllers/GameController.cs` (6 hunks, the throw endpoint)
    - `Web/Services/GameService.cs`
    - `Tests/Games/GameControllerMaximumRoundsTests.cs`
    - `Tests/Games/GameControllerSeasonTests.cs`
- The SignalR branch also uses legacy types that the new system deleted: `SessionAchievementsByPlayer`, `PlayerSessionAchievementState`, and `GameTrackerDelta.ProjectedSessionAchievementsByPlayer` (`Models/Game/GameTrackerDelta.cs:12`, `GameTrackerDeltaFactory.cs:15,41,130`).
- `ISignalRClient.cs` merges cleanly, but it must end up with `OnV2AchievementProjectionAdded` (the new name) and no `OnSessionAchievementUnlocked`.

**Fix (recommended):** Merge it into `master` and port it to the new system.
1. `git merge signal-r-improvevemtns` on backend `master` and resolve the conflicts. Keep the new system's `MutationGate`/`IsFinalized` and the projection-before-apply order in the throw endpoint. Layer the delta broadcast on top of that.
2. Replace the legacy projection fields in `GameTrackerDelta` and `GameTrackerDeltaFactory` with `ProjectedV2AchievementsByPlayer` (an `AchievementInstanceResponse[]` per player, matching `GameTracker.projectedV2AchievementsByPlayer`).
3. Client: add that field to `GameTrackerDeltaSchema` and apply it in `src/helpers/applyGameTrackerDelta.ts`, with a test. Without this, a projected achievement stays on screen after a corrected throw.
4. Rerun backend tests, including the `GameTrackerDeltaTests` that come in with the branch.

**Fallback:** If B1 slips, remove the active-games subscription from the client (`activeGamesLiveService.ts`, sessions page) and ship without live updates.

### B2. Seven score achievements have the wrong tier, which changes MMR

**Problem:** `Core/AchievementBuilder/BuiltInAchievementCatalog.cs:174-179` (`ScoreThresholdFamilies`) gives the "raw" score family (no modifiers, mapped from the legacy enum `ScoreAtLeastXInOneRound`) the tiers of the legacy non-Raw classes. On legacy `master`, `Core/Utilities/AchievementUtility.cs:169-197` swapped them: enum `ScoreAtLeastXInOneRound` ran class `ScoreAtLeastXInOneRoundRaw`, and the reverse. So the effective legacy tier is the `*Raw` class's tier. Verified with `git show` on the old classes:

| Threshold | Legacy tier (Raw class) | New tier |
| --- | --- | --- |
| 90, 100 | silver | bronze |
| 130 | gold | silver |
| 150, 160 | platinum | gold |
| 170 | diamond | gold |
| 180 | diamond | platinum |

This changes the MMR reward per game and lowers the MMR cap for players who already hold these achievements, because the backfilled unlocks point at the new instances.

**Fix:**
1. Give the raw family its own tier table: 50-80 bronze, 90-120 silver, 130-140 gold, 150-160 platinum, 170-180 diamond. Verify each threshold against the old classes. The non-Raw enum value → Raw class mapping is in the old `AchievementUtility.cs`; read it with `git show <pre-branch master commit>:Core/Utilities/AchievementUtility.cs`; use `2052014` (the merge-base) for the old code.
2. Check the second score family (modifiers allowed, mapped from the `*Raw` enum values → non-Raw classes) the same way.
3. Add a test that, for every legacy enum value, compares the built-in instance's tier with the effective legacy tier. Hard-code the expected tiers in the test as a table, because the legacy classes are deleted.
4. Extend `Tests/AchievementBuilder/LegacyBuilderParityTests.cs` beyond the ~44 of 185 session values it runs now.
5. Do this **before prod migrates**. The seed migration (`20260830135603_seed-builtin-achievements`, via `BuiltInAchievementMigrationSqlBuilder`) builds its SQL from the catalog code when it runs. A fix after prod has migrated needs a new data migration.
6. Your local Postgres (`dart-postgres`) already has the seed applied, so re-create or re-seed it after the fix.

### B3. Saving an old published version overwrites the newer draft

**Problem:** The template library lists every version. Suppose a user opens published v1 while v2 is a draft, and clicks "Create editable draft":
1. That button only flips `readOnlyVersion` (`src/components/achievement-builder/achievement-builder.ts:819-825`).
2. On save, `seasons-page.ts:1167-1168` calls `updateTemplate(template.id)`.
3. The backend `Update` (`Web/Services/AchievementBuilderService.cs:232-259`) finds the existing draft via `FindDraft` and runs `ApplyRequest`, writing v1's content into it.

All of v2's work is lost without a warning.

**Fix:** Before enabling editing, check whether the template already has a Draft version. If it does, show a confirm: "Open existing draft" (default) or "Replace draft with vN". Add a test for the builder state machine around this.

### B4. Deploy ordering, config and in-flight games

**Problem:** The old client can't read the new backend's JSON:
- `unlockedSessionAchievements`/`unlockedProgressAchievements` became `unlockedV2Achievements`.
- `projectedSessionAchievementsByPlayer` became `projectedV2AchievementsByPlayer`.
- `GET api/achievement/definitions` is removed.
- SignalR `OnSessionAchievementUnlocked` became `OnV2AchievementProjectionAdded`.

The old client's user, season and game pages break. `SubmitGame` shows "Unable to parse game result" even though the game was saved. In-progress games held in memory are lost on the restart.

**Fix:**
- Deploy both together while no games are in progress, then ask everyone to hard-refresh.
- Confirm `SEASON_ADMIN_KEY` is set in prod, or every builder write returns 401 (`Web/Security/SeasonAdminKeyAttribute.cs:48-54`).
- Rollback = restore the DB backup. The cutover migration's `Down()` throws.

## Migration risks and the prod dry run

None of the migration SQL has run against real production data. The tests only check the generated SQL strings, and the local DB has only 123 games. A data problem doesn't lose data: the transaction rolls back, but the app crash-loops on startup.

**Dry-run procedure (required before deploy):**
1. Take a prod `pg_dump`.
2. Restore it into a throwaway Postgres 16 container.
3. Run the checks below against it.
4. Start the new backend against it and watch for the startup migration to succeed. Note how long it takes; the default command timeout is 30 s, and the preflight/normalization runs per-element `= ANY(array)` scans without an index.
5. Spot-check a few known users: unlocked achievements, progression bars and MMR look the same as on the live site.

**Checks (run against the restored prod copy):**

M1. Duplicate season stats abort the migration. `ProgressionTrackerBackfillSqlBuilder.cs:54-83` hits "ON CONFLICT DO UPDATE cannot affect row a second time". There's no unique index on (UserId, SeasonId). Must return 0 rows:
```sql
SELECT "UserId","SeasonId", count(*) FROM "SeasonStatistics" GROUP BY 1,2 HAVING count(*) > 1;
```
If any are found: merge or delete the duplicates in a migration step before the backfill, and consider adding a unique index.

M2. The enum renumbering cutover time is hard-coded. `LegacySessionAchievementEncodingSqlBuilder.cs` uses `2026-01-04 14:37:24Z`, which is the commit time of dadf5b9. Prod was redeployed about 8 minutes later (4a01a3b), so games saved in that gap used the old numbering:
- values 8–76 → preflight aborts;
- values 5–7 → read as Rimmer, RimReaper or PerfectlyBalanced (wrong unlocks).

Check the PlayerResults from games between 2026-01-04 and 2026-08-24 (Rimmer and the rest were added 2026-08-24 in 0427039) whose achievement arrays contain values 5–76. Adjust the column names to the actual schema:
```sql
SELECT gr."Id", gr."CreatedAt", pr."UnlockedSessionAchievements"
FROM "PlayerResults" pr JOIN "GameResults" gr ON gr."Id" = pr."GameResultId"
WHERE gr."CreatedAt" BETWEEN '2026-01-04' AND '2026-08-24'
  AND EXISTS (SELECT 1 FROM unnest(pr."UnlockedSessionAchievements") v WHERE v BETWEEN 5 AND 76);
```
Fix: replace the timestamp with the real prod deploy time, or a per-game detection rule.

M3. Users may get achievements they never earned. In the `normalized` CTE (around lines 150-160 of the same file), a season stat value of 5–7 with no game evidence is kept under both meanings. That happens for seasons that span 2026-01-04, so those users get both Score50 and a Rimmer they didn't earn. Nothing is lost. Decide: accept it, or prefer the old meaning when there is no evidence.

M4. The preflight aborts on any unmapped legacy value (`LegacyAchievementCutoverPreflightSqlBuilder.cs:68-103`). Find array values not in the current enum. History removed 2, 3 and 500, and `remove-retired-achievements` strips those. List the distinct values in `PlayerResults` and `SeasonStatistics` arrays and diff them against the enum.

M5. Accepted history losses (document, no fix needed):
- Unlocks backfilled from SeasonStatistics (Source=2) get `UnlockedAtUtc = season.StartDate` and no game link.
- `AchievementUnlocks.GameResultId` has no foreign key.

## Runtime behaviour changes and hardening

The MMR formula (`RankUtils.CalculateMMRGainForPlayer`) is unchanged. Duplicate-submit protection, single evaluation inside the submit transaction, broadcast after commit, and set-based read hydration all look solid. To harden:

R1. **Medium – a failed projection blocks the throw.** `GameController.UpdateDartThrow` evaluates the projection before applying the throw. A DB error returns 500 and the throw isn't recorded. Legacy only had that risk on a player's first throw. This is deliberate (`RuntimeCutoverTests.UpdateDartThrow_WhenProjectionFails_DoesNotApplyOrBroadcastThrow`). Option: apply the throw and skip the projection on failure (log it). Decide: availability or strict consistency.

R2. **Medium – an achievement failure blocks game submit.** `EvaluateForFinalize`/`PersistFinalize` run inside the submit transaction. Two games sharing a player that finish at the same moment can hit the progression `Revision` concurrency token or the unique unlock index. That gives `DbUpdateConcurrencyException`, then `GetPersistedBySessionId` returns null, then 500. A retry works because the session stays cached. Fix: retry the finalize once or twice on `DbUpdateConcurrencyException`/unique-violation, server side. Also have the client retry submit.

R3. **Medium/low – performance.**
- Each throw runs about 2 DB queries (every Live instance with includes, plus the player's unlocks) and recompiles every template version while holding the per-game lock.
- Fix: cache compiled definitions keyed by version id (immutable once published) and cache the Live instance set per season, invalidated on publish.
- `PersistFinalize` runs one `FirstOrDefaultAsync` per player per progression instance (`AchievementBuilderRuntimeService.cs:~262`): about 36 queries for 4 players. Load them in one query.

R4. **Low:**
- `RequestNewGameSession` throws if the season has no published catalog (`AchievementBuilderRuntimeService.cs:61-70`). This should not happen, because the migration seeds existing seasons and `SeasonService` seeds new ones. Add a clear error message.
- User cache eviction in `UserService.Update` runs before the commit; move it after.
- `GameTracker.TryReplaceV2Projection` revision check can never fail (dead code); remove it or make it work.
- Custom templates now feed MMR reward and cap through their tier. That's a design decision; document it for season admins.

R5. **Small parity differences (accept, or fix and note in the changelog):**
- The "has a Victory round" condition was dropped from `TaskFailedSuccessfully`; the parity test only passes because of that.
- Placeholder throws are skipped.
- `TrippleSixty`/`TrippleForty` now need 3 played throws.
- The bull-50 progression target only counts throws recorded as Single.

## Achievement builder UI fixes

Client files are under `src/`. B3 (draft overwrite) is in the Blockers section.

U1. **Medium – Save and Publish silently do nothing on read-only versions.** `achievement-builder.ts:169-171` `getValidatedDraft()` returns undefined without an error, and `seasons-page.ts:1162-1164`. Fix: hide or disable the footer buttons when read-only, with a tooltip saying why.

U2. **Medium – server validation shows only the first error.** `seasons-page.ts:1172-1179`: only `errors[0]` is shown, as a red toast, even though the draft was saved. `setTemplates()` → `resetDraft` then jumps back to the Details tab (`achievement-builder.ts:194`). Fix:
- show every error inline in the builder;
- say "Saved, but not valid yet: …";
- keep the current tab after `setTemplates` when the selected template is the same.

U3. **Medium – the client accepts drafts the server rejects.** `validateDraft` (`components/achievement-builder/achievement-draft.ts:582-647`) is missing these checks. Mirror the backend (`AchievementDefinitionCompiler.cs`, `AchievementBuilderLimits.cs`, `AchievementBuilderConstants.cs`):
- unknown `{token}` or stray braces in the name or description (backend `ValidateTokens`);
- rendered text length ≤ 500;
- types: a string or boolean parameter used as a hit location or comparison value (`getValueErrors:479-487`); the backend says "requires integer" / "operands must have the same type";
- int32 range on constants, `IntegerSet` values and range min/max. Right now `/^-?\d+$/` passes values too large for an int, and the backend returns a 400 with an obscure JSON message;
- AST depth 32, node count 2000, quantifier depth 8.

Add a contract test that feeds the same fixtures to both sides, or at least client tests per rule.

U4. **Medium – progression logic can be silently replaced.** `helpers/compileAchievementTemplate.ts:1367-1371, :522`: if the stored editor tree doesn't parse, `progression` becomes undefined. The next save then writes `createDefaultAchievementProgression()`. Fix: keep a raw fallback like session rules have, and block saving with an error instead of resetting.

U5. **Medium – user page fails completely when the instances call fails.** `components/pages/user-page/user-page.ts:114-117`: the `Promise.all([getUserById, getInstances])` has no catch, so the rejection goes unhandled. Fix: load instances separately (or `allSettled`), still show the stats, and show "achievements unavailable" instead.

U6. **Low:**
- `user-page.ts:~281`: errors from `openAchievementTemplate` are only logged with `console.error`. Show a notification instead.
- `aa-dialog.ts:~103`: `@click=${this.close}` passes the MouseEvent as the result. Wrap it as `() => this.close()`.
- Built-in templates show an "Edit" button in `achievement-template-library.ts`; show "View" when the template is built-in or read-only.
- `achievement-logic-editor.ts:914`: read-only graph is `inert`, so viewers can't expand nodes. Make only the editing controls inert.
- Dead code:
    - empty `LogicCanvasController.hostConnected()`;
    - `getDefaultVersion` (`achievement-builder.ts:200`), which duplicates `getEditableVersion` (`compileAchievementTemplate.ts:561`);
    - `seasons-page` uses a string literal instead of the exported `achievementBuilderWorkspaceChangeEventName`.

U7. **Tests to add:**
- builder state machine: `hasUnsavedChanges`, `setTemplates` after save, editable draft from a published version;
- compile → restore round trip for every rule type;
- the progression fallback;
- the seasons-page save → validate → publish sequence.

## Ordered work plan

Work on client `main` and backend `master`. Commit after each step; do not push until the final step.

- [ ] 1. **B2** score tiers: fix the catalog, add the full tier parity test, extend the parity tests. Re-seed the local DB.
- [ ] 2. **B3** draft overwrite: guard plus confirm, with a test.
- [ ] 3. **B1** merge backend `signal-r-improvevemtns` into `master`, port the delta to V2 projections, update the client delta schema and apply step, with tests. If this is blocked, use the fallback: remove active-games live updates from the client.
- [ ] 4. **U1–U5** UI fixes (validation parity U3 is the largest).
- [ ] 5. **R2** finalize retry and **R3** compile/instance cache. Decide on **R1**.
- [ ] 6. **M2/M3** fix the cutover timestamp or the ambiguity rule, if the dry run shows affected data.
- [ ] 7. Full checks.
    - client: `npx tsc --noEmit`, `npx vitest run`, `pnpm build`
    - backend: `dotnet test`
- [ ] 8. **Prod dry run:** restore a dump, run checks M1/M2/M4, start the backend, spot-check users and MMR.
- [ ] 9. **U6/R4/R5** low-priority cleanup (can follow after release).
- [ ] 10. Deploy runbook:
    1. Confirm no games are in progress.
    2. Back up the DB.
    3. Confirm `SEASON_ADMIN_KEY` is set.
    4. Push backend `master` and client `main` together.
    5. Watch the startup migration logs.
    6. Hard-refresh the clients.
    7. Smoke test: start a game, throw, see a live projection, finish, check the unlocks and the MMR change, then open the user page and the builder.
