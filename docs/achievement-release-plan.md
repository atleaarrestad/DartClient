# Achievement Builder Release Plan

As of 2026-10-19. Covers both repos:
- client: `C:\Users\Atle\git\dartClient`, branch `main`
- backend: `C:\Users\Atle\git\dartBackend`, branch `master`

## Summary

**Update 2026-10-19 (implementation pass):** steps 1–7 and 9 are done in the working trees, all unstaged and nothing committed. Checks: backend 311/311, client tsc clean, vitest 78/78, `pnpm build` passes. Open for the user:
1. Review, then `git add` the 5 `UU` files in the backend to conclude the B1 merge, and commit.
2. Re-create the local DB (B2).
3. Decide R1 and M3 (recommendations in their status notes).
4. Run the prod dry run with `docs/achievement-dry-run-checks.sql` (step 8).
5. Deploy (step 10).

Not ready to push yet. Four blockers must be fixed first: the SignalR backend branch, wrong score tiers, a draft-overwrite bug, and an untested production migration. Everything else is hardening.

### Where things stand (local only, nothing pushed)

| Repo | Branch now | Commit | What happened |
| --- | --- | --- | --- |
| dartClient | `main` | `bbeacc1` | Staged work committed on `signal-r-improvevemtns`, then fast-forwarded into `main` |
| dartBackend | `master` | `b903367` | Uncommitted + 4 untracked files committed on `achievement_builder`, then fast-forwarded into `master` |
| dartBackend | `signal-r-improvevemtns` | **not merged** | Conflicts in 5 files and uses deleted legacy types; merging it is step B1 |

All further work happens on client `main` and backend `master`.

## Ground rules for Claude (set by the user)

- **Claude only fixes code. All changes are left unstaged in the working tree.**
- **Never** `git add`, `git commit`, `git push`, merge to a remote, or deploy anything. The user reviews, commits, pushes and deploys everything themselves.
- Exception: step B1 needs a local `git merge` of the backend SignalR branch. Start it with `git merge --no-commit --no-ff`, resolve the conflicts, and leave the result uncommitted for the user. Or ask the user first.
- Claude has no access to prod. The prod dry run and the deploy (steps 8 and 10) are the user's. Claude only prepares the check scripts and the runbook.

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

**Status (2026-10-19, done, merge in progress and uncommitted):**
- Ran `git merge --no-commit --no-ff signal-r-improvevemtns` on backend `master` and resolved all 5 conflicts.
- **Merge state for the user:** git staged the cleanly merged files itself. The 5 resolved files still show `UU` because Claude does not run `git add`. Run `git add` on them (after review) to mark them resolved, then commit. The B2 files (`BuiltInAchievementCatalog.cs`, `LegacyBuilderParityTests.cs`) and the edits to `RuntimeCutoverTests.cs` are unstaged, so they only go into the merge commit if you stage them. A backup of the B2 diff from before the merge is at `%TEMP%\claude\...\scratchpad\backend-step1.patch`.
- Correction to the plan: `MutationGate`/`IsFinalized` came from the SignalR branch; master had `ThrowUpdateLock`. The two locks are now one, `GameTracker.MutationGate`. Throws, add/remove player, `GetGame` snapshots and submit all go through it.
- `UpdateDartThrow` keeps master's order (evaluate the projection on a copy, then apply and replace the projection). It returns 409 when the tracker is finalized, and increments `Revision`. It returns and broadcasts a `GameTrackerDelta` (`SaveSessionDeltaAsync`) instead of the full tracker. A failed delta broadcast is logged and doesn't fail the throw, because clients resync on the next revision gap.
- `SubmitGame` keeps master's submission claim, transaction and duplicate handling. The work now runs as `SubmitFinalizedGame` inside `MutationGate` with `IsFinalized = true` (reset if it throws). `OnActiveGamesChanged` goes out after the session is removed; new session and add/remove player also broadcast it.
- `GameController` constructor: `ActiveGamesNotifier` is a required parameter after `AchievementNotifier`. All 8 test constructions were updated.
- `GameTrackerDelta.ProjectedV2AchievementsByPlayer` (`List<AchievementInstanceResponse>` per player) replaces the legacy field. It only carries changed players, comparing by instance-id sequence; an empty list clears a projection. `ISignalRClient` has `OnActiveGamesChanged`, `OnGameDelta` and `OnV2AchievementProjectionAdded`, and no `OnSessionAchievementUnlocked`.
- Tests: the branch's `GameTrackerDeltaTests` were ported, with new tests for projection revoke, swap and unchanged-is-omitted, the projection carried by a real throw, and a 409 on a finalized tracker. `RuntimeCutoverTests.RecordingProjectionClient` now counts delta broadcasts as state broadcasts, so the "failed projection does not broadcast" test still means something. Backend: 302/302.
- Client: `GameTrackerDeltaSchema.projectedV2AchievementsByPlayer` (defaults to `{}`), merged in `applyGameTrackerDelta`, stored by `GamePage.applyGameDelta`. New tests cover the merge/clear and schema parsing. Client: 65/65.
- Not changed: `GameService.AddPlayerToSession`/`RemovePlayerFromSession` (sync, no gate) are still there from both sides. Only tests use them now; delete them in U6/R4 cleanup. **Update 2026-10-19 (maintenance pass):** outdated, because only the gated async versions exist, and the controller and client use them. See `docs/maintenance-plan.md`.

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

**Status (2026-10-19, done, unstaged):**
- `ScoreThresholdFamilies` now has separate `rawGroups` and `modifiedGroups` tier tables. The modified family was already correct and is unchanged. New SourceKey `legacy.scoreThreshold.raw.diamond`; `raw.platinum` now holds 150/160 instead of 180.
- Correction to the plan: the legacy definition classes and `AchievementUtility` are **not** deleted on `master`. So `LegacyBuilderParityTests` now compares the tier of every one of the 185 session and 9 progress instances directly against the legacy definitions. It also keeps a hard-coded 14-row score tier table (still works after the legacy code is deleted). Both fail on the old catalog with exactly the 7 errors above.
- New `EverySessionAchievement_MatchesLegacyAcrossFixtureBattery` runs all 185 session achievements (except the R5 differences `TaskFailedSuccessfully`, `TrippleSixty`, `TrippleForty`) over about 450 fixtures (targeted plus 200 seeded random games) × placements 1/2/null. It asserts that each achievement unlocks at least once, so the test doesn't pass only because both sides always say no. No new parity differences were found.
- **Local DB re-seed is still open (user):** the seed is idempotent per SourceKey and the local DB has already run the cutover (legacy columns dropped, `Down()` throws), so it can't be re-seeded in place. No pre-cutover dump was found. Re-create `dart-postgres` from a pre-cutover copy (or a fresh prod dump; see step 8) and let the migrations run again.

### B3. Saving an old published version overwrites the newer draft

**Problem:** The template library lists every version. Suppose a user opens published v1 while v2 is a draft, and clicks "Create editable draft":
1. That button only flips `readOnlyVersion` (`src/components/achievement-builder/achievement-builder.ts:819-825`).
2. On save, `seasons-page.ts:1167-1168` calls `updateTemplate(template.id)`.
3. The backend `Update` (`Web/Services/AchievementBuilderService.cs:232-259`) finds the existing draft via `FindDraft` and runs `ApplyRequest`, writing v1's content into it.

All of v2's work is lost without a warning.

**Fix:** Before enabling editing, check whether the template already has a Draft version. If it does, show a confirm: "Open existing draft" (default) or "Replace draft with vN". Add a test for the builder state machine around this.

**Status (2026-10-19, done, unstaged):**
- New pure helper `getConflictingDraftVersion(template, versionId)` in `achievement-draft.ts`.
- "Create editable draft" now calls `createEditableDraft()`. With no other draft it unlocks as before. Otherwise it opens a `DialogService` dialog: "Open existing draft" (primary, autofocus) loads the draft, "Replace draft with vN" (danger) unlocks the old version, and closing the dialog (×, Esc, backdrop) does nothing.
- Tests: 3 cases in `achievement-draft.test.ts`. The client has no DOM test environment (vitest runs in node; no jsdom or happy-dom), so the Lit element itself is not tested. A full builder state-machine test needs a DOM environment; noted for U7.
- Not covered: a stale template list (another admin creates a draft after the list loaded) still overwrites without warning. Closing that needs a backend check, e.g. sending the expected base version with `Update`.

### B4. Deploy ordering, config and in-flight games

**Problem:** The old client can't read the new backend's JSON:
- `unlockedSessionAchievements`/`unlockedProgressAchievements` became `unlockedV2Achievements`.
- `projectedSessionAchievementsByPlayer` became `projectedV2AchievementsByPlayer`.
- `GET api/achievement/definitions` is removed.
- SignalR `OnSessionAchievementUnlocked` became `OnV2AchievementProjectionAdded`.

The old client's user, season and game pages break. `SubmitGame` shows "Unable to parse game result" even though the game was saved. In-progress games held in memory are lost on the restart.

**Fix (the user does the deploy; Claude only documents it):**
- Deploy both together while no games are in progress, then ask everyone to hard-refresh.
- Confirm `SEASON_ADMIN_KEY` is set in prod, or every builder write returns 401 (`Web/Security/SeasonAdminKeyAttribute.cs:48-54`).
- Rollback = restore the DB backup. The cutover migration's `Down()` throws.

## Migration risks and the prod dry run

None of the migration SQL has run against real production data. The tests only check the generated SQL strings, and the local DB has only 123 games. A data problem doesn't lose data: the transaction rolls back, but the app crash-loops on startup.

**Dry-run procedure (required before deploy; the user runs it, and Claude prepares the SQL in `docs/` if asked):**
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

**Status M2/M3 (2026-10-19, M2 fixed in code, unstaged; M3 still a decision):**
- **M2 fixed without needing the deploy time.** History check: the stable-range enum (dadf5b9) had no values between 5 and 99 until 0427039 (`2026-08-24 14:41:35Z`) added Rimmer, RimReaper and PerfectlyBalanced as 5–7. Code before that commit could never produce 5–99 in the new numbering, and the old implicit numbering ran 0–76. So any value 5–76 in a game dated before the 0427039 commit is old numbering. Games between that commit and its deploy still ran code without 5–99.
- `LegacySessionAchievementEncodingSqlBuilder` now uses `OldNumberingCutoffUtc = "2026-08-24 14:41:35Z"` instead of `2026-01-04 14:37:24Z` in all 10 places. Games from the dadf5b9-commit-to-deploy gap are therefore remapped instead of aborting the preflight (values 8–76) or being read as Rimmer and the others (5–7). They also no longer count as "new meaning" evidence for season statistics.
- Tests pin the cutoff, and that only Rimmer, RimReaper and PerfectlyBalanced lie in 5–99.
- **M3 (your decision) is narrower now:** a season-statistics value of 5–7 with no game evidence on either side is still kept under both meanings, but only for seasons that span 2026-08-24. A season spanning that date can only hold an old-meaning 5–7 if it also has games from before the 2026-01-04 deploy. The dry-run check M3 in `docs/achievement-dry-run-checks.sql` lists such rows.
- Check M2 in the dry run is still worth running: it shows how many gap games the old timestamp would have mishandled.

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

**Status R1–R3 (2026-10-19, unstaged):**
- **R1, not changed (needs your call):** throws still fail when the projection fails (strict consistency, covered by `RuntimeCutoverTests`). Recommendation: keep it. With R3 a throw makes one DB query (the player's unlocks) on a warm cache, so the failure window is much smaller, and a failed throw is visible and retryable, whereas a silently missing projection is not. Switching means: apply the throw, log the failure, keep the old projection.
- **R2, done:** `GameController.SubmitFinalizedGame` retries the whole finalize up to 3 times on `DbUpdateConcurrencyException` or a Postgres unique violation, relational DB only. Each attempt rolls back and clears the change tracker, so the retry re-reads users and progression states and re-evaluates. Test: `SubmitGame_ConcurrentFinalizeConflictIsRetriedAndCompletesOnce` (SQLite). It fails with 1 attempt and passes with 3, ending with exactly 1 result, 1 unlock and 1 snapshot. Client: `DataService.SubmitGame` retries 5xx responses and network errors twice (750 ms, 1500 ms), which is safe because a repeated submit returns the stored result (`dataService.test.ts`).
- **R3, done:**
    - Correction to the plan: compiled definitions were already cached by content hash in the singleton compiler. What a throw still did was re-read the parameters and SHA-256 every version's JSON. `CompileVersion` now also caches **published** versions by id; drafts are never cached by id.
    - New singleton `AchievementSnapshotCache` (IMemoryCache, 30 min sliding) caches a game's snapshot instance graph per season and version set. Published versions and instances are immutable, so only category rename and archive/restore invalidate it (they change `CategoryName`/`CategoryIsArchived` in responses). A load that races an invalidation expires immediately.
    - `PersistFinalize` loads all progression states it may update in one tracked query (unique index on (instance, subject)) instead of one `FirstOrDefaultAsync` per player per instance.
    - Tests: `AchievementRuntimeCacheTests` (cache keys, season invalidation, invalidation during a load, published-only compile cache) and `CategoryRenameAndArchive_InvalidateCachedGameSnapshots`.
- Backend: 308/308.

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

**Status U6/R4/R5 (2026-10-19, unstaged):**
- **U6 done:**
    - User page: errors opening an achievement template now show a notification.
    - `aa-dialog`: × now calls `close()` with no result instead of passing the MouseEvent.
    - Template library: "Edit" only for non-built-in drafts in an editable builder, otherwise "View". New `readOnly` property, set from the builder's `viewOnly`.
    - Logic editor: only the node bodies (the editing controls) are `inert` when read-only, so viewers can expand and collapse blocks. The summary button says "View" when read-only.
    - Dead code: `LogicCanvasController` no longer registers as a reactive controller (its only hook was the empty `hostConnected`); `getDefaultVersion` was replaced by the now-exported `getEditableVersion`.
    - The seasons page keeps the `@achievement-builder-workspace-change` literal, because Lit event bindings need a literal name; the exported constant is for `addEventListener` callers.
- **R4 done:**
    - `RequestNewGameSession` captures the version snapshot before creating the session, and returns 409 with a clear message when the season has no published achievements. Before, it returned a 500 and left an unusable game in the active-games list. Test added.
    - After the submit transaction commits, the controller evicts the user output cache again (`UserService.EvictCachedUsersAsync`); the test fails without it.
    - The never-failing projection revision check is gone: `GameTracker.ReplaceV2Projection(playerId, projection)` returns the added instances, because the `MutationGate` already orders projections.
    - The builder's Tier field explains that the tier sets the MMR reward and cap increase.
    - The ungated sync `GameService.AddPlayerToSession`/`RemovePlayerFromSession` were removed.
- **R5 accepted as documented above** (no code change). Neither repo has a changelog; put the four differences in the release notes if you announce the update.
- Checks: backend 311/311, tsc clean, vitest 78/78.

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

**Status U1–U5 (2026-10-19, done, unstaged):**
- **U1:** the builder's workspace-change event now carries `{ tab, readOnlyReason }`. It fires on workspace tab, read-only or template changes, and once on first render. The seasons page hides Save/Publish while browsing and disables them, with the reason as a tooltip, on read-only versions. `getValidatedDraft()` also shows the reason inline instead of returning silently.
- **U2:** server validation errors appear inline under "Saved as a draft, but it can't be published yet:", plus an info toast. `setTemplates()` keeps the current editor tab when it reloads the same template (or the one just created).
- **U3:** `validateDraft` now takes `limits` (the builder gets `catalog.limits` instead of only `maximumGeneratedInstances`) and checks:
    - unknown `{tokens}` and stray braces;
    - rendered text length;
    - number-only places (hit locations, counts, offsets) rejecting text or yes/no parameters;
    - comparison sides having the same type, and yes/no values only with equal/not equal;
    - the int32 range for constants, set values, range min/max/step and offsets;
    - AST nodes, depth and quantifier depth, measured on the compiled AST with the new `measureAchievementAst`.
  The AST measure was cross-checked once against the backend compiler on 4 fixtures covering every rule type, with identical node count and depth, and the quantifier limit failing at 1 and passing at 2. The check used throwaway tests that were deleted afterwards. A test pins those numbers. No permanent cross-repo contract test: the repos can't read each other's fixtures without coupling paths.
- **U4:** `AchievementProgressionDraft.raw` keeps progression logic the target editor can't represent; `compileAchievementTemplate` writes it back verbatim. The logic editor shows it read-only, with an explicit, confirmed "Replace with target set". The old silent reset to the default progression can no longer happen.
- **U5:** the user page loads the user and the instances with `allSettled`. Stats still render if the instances call fails, and the achievement summary shows "Achievements are unavailable right now." with a retry. A failed user load shows a notification instead of an unhandled rejection.
- Lint: files that were warning-free at HEAD still are. Files that already had many `key-spacing` warnings have a few more on new lines written in their existing style.

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

Work on client `main` and backend `master`. Leave every change **unstaged**: no add, commit, push or deploy (see Ground rules). Tick the boxes in this file as steps finish.

- [x] 1. **B2** score tiers: fix the catalog, add the full tier parity test, extend the parity tests. Re-seed the local DB. *(Code and tests done. The local DB re-create is left to the user; see B2 status.)*
- [x] 2. **B3** draft overwrite: guard plus confirm, with a test.
- [x] 3. **B1** merge backend `signal-r-improvevemtns` into `master` locally with `--no-commit`, leaving it uncommitted, port the delta to V2 projections, update the client delta schema and apply step, with tests. If this is blocked, use the fallback: remove active-games live updates from the client.
- [x] 4. **U1–U5** UI fixes (validation parity U3 is the largest).
- [x] 5. **R2** finalize retry and **R3** compile/instance cache. Decide on **R1**. *(R1 left as is with a recommendation; it's the user's call.)*
- [x] 6. **M2/M3** fix the cutover timestamp or the ambiguity rule, if the dry run shows affected data. *(M2 fixed from git history, independent of prod data. M3 is narrowed but remains your decision; see the M2/M3 status.)*
- [x] 7. Full checks. *(2026-10-19: tsc clean, vitest 78/78, `pnpm build` passes (existing chunk-size warning), backend builds and 310/310 pass. `has-pending-model-changes` not run because the running Web process locks `Web/bin`; no entity or model changed.)*
    - client: `npx tsc --noEmit`, `npx vitest run`, `pnpm build`
    - backend: `dotnet test`
- [x] 8. **(USER) Prod dry run.** Claude may write the check SQL to `docs/`. The user will restore a dump, run checks M1/M2/M4, start the backend, spot-check users and MMR.
    - *Claude's part is done:* `docs/achievement-dry-run-checks.sql` (read-only; run it on the restored copy **before** starting the new backend). It covers table sizes, M1 (0 rows expected), M2 (the gap games plus an invariant that must return 0 rows), M3 (the rows that would get both meanings), M4 (unmappable values after the same normalization as the migration; 0 rows expected), and a spot-check baseline. Section E (commented) is for after the migration: unlocks, tiers, progression bars and MMR for the same users.
    - Verified by running it on a throwaway Postgres 16 with a stand-in schema and planted rows, where each check fired on exactly the planted cases. Section E was checked read-only against the local migrated `dart-postgres`. All table and column names were checked against the pre-cutover EF model.
    - Before the dry run, replace the `<player N>` placeholders.
    - **Dry run done 2026-10-19 on a prod dump** (pgAdmin backup taken 10:39 UTC, restored into the local container `dart-postgres-prodcopy`, port 5434; untouched copy in database `dartprodcopy_pristine`). Prod was at `game-constraints`, with 559 games, 1842 player results, 29 users and 2 seasons.
        - Checks: M1, M2 and M3 returned 0 rows, and M4 returned 0 unmappable values.
        - All 8 new migrations applied at startup in about 7 s total; no command took ≥100 ms, and the in-migration verifications passed.
        - All 40 player-seasons kept the same MMR and rank, and the same number of session and progression achievements.
        - Smoke game via the API: live projection, delta, submit, and a repeated submit all worked. New unlocks carry the B2-corrected tiers.
        - Remaining for the user: the real deploy (step 10), and redoing the dump right before it if prod has changed since.
- [x] 9. **U6/R4/R5** low-priority cleanup (can follow after release). *(See the U6/R4/R5 status.)*
- [ ] 10. **(USER ONLY, never Claude)** Commit, push and deploy. Runbook for the user:
    1. Confirm no games are in progress.
    2. Back up the DB.
    3. Confirm `SEASON_ADMIN_KEY` is set.
    4. Push backend `master` and client `main` together.
    5. Watch the startup migration logs.
    6. Hard-refresh the clients.
    7. Smoke test: start a game, throw, see a live projection, finish, check the unlocks and the MMR change, then open the user page and the builder.
