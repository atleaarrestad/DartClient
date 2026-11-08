# Disable achievements and duplicate as new

Status: implemented 2026-11-08, unstaged in both repos (dartClient and dartBackend).

## Goals

1. **Duplicate as new achievement:** copy any achievement, built-in ones included, into a new
   unsaved achievement with the same text, tier, type, category, parameters and logic.
2. **Disable / enable achievements**, built-in ones included:
   - A disabled achievement is not checked in games, so nobody unlocks it while disabled.
   - Players keep their unlock rows; enabling it again restores everything.
   - While disabled it counts for nothing: not in achievement statistics, not in the player's
     achievements dialog, and not toward the MMR cap increase.
   - In the builder it stays listed, greyed out, and is enabled again from the inspector.

Typical use: duplicate a built-in, fix the copy, publish it, disable the built-in.

## What doesn't change

- **The one-time MMR reward is not taken back.** It is added once, in the game where the unlock
  happens, and is already part of the player's stored MMR; there is no per-achievement reward row
  to subtract. Disabling only stops future unlocks, and the cap increase, which is recomputed
  at every game finish.
- **Duplicate detection stays unfiltered.** "Already unlocked" checks keep using every unlock, so
  enabling an achievement again never awards it a second time.

## Backend (dartBackend)

| Area | Change |
|---|---|
| Model | `AchievementTemplate.DisabledAtUtc` (`DateTime?`); `IsDisabled` is derived from it (not mapped). Migration `achievement-template-disabled`: one nullable column. |
| Contract | `AchievementTemplateResponse.IsDisabled` and `DisabledAtUtc`. |
| Endpoints | `[SeasonAdminKey] POST achievement-builder/templates/{id}/disable` and `/enable`. They work for built-ins (no `EnsureEditable`), are idempotent, invalidate the season's snapshot cache and evict the user output cache. |
| Active set | `LatestPublishedVersionIds()` → `ActivePublishedVersionIds()`: latest published version of every **enabled** template. One place feeds new game snapshots, evaluation, prediction and progression progress. |
| Running games | `GetSnapshotInstances` drops instances of disabled templates (filtered in the cached load; the cache is invalidated on toggle), so games that started before the toggle stop unlocking it too. A snapshot whose templates are all disabled yields no instances instead of an error. |
| MMR cap | `LoadUnlockedIdentities` also returns whether each unlock's template is disabled; `ExistingUnlockedTiers` (the cap) skips those. The dedupe set is unchanged. |
| Player reads | `AchievementUnlockReadService.LoadUnlocks` skips unlocks of disabled templates, so season statistics and game results leave them out. `GET instances` skips disabled templates, so totals in the achievements dialog leave them out. |
| New games | With every achievement disabled, a season can't start games (the existing 409); the message now says "no enabled published achievements". |

Tests (MSTest), in a new `Tests/AchievementBuilder/TemplateDisableTests.cs`:
- built-ins can be disabled and enabled, and still can't be edited;
- a disabled template is left out of new snapshots, `GET instances` and evaluation;
- a game that started before disabling doesn't unlock it;
- a disabled template's unlock doesn't raise the cap, and counts again once enabled;
- statistics and game results hide the unlock while disabled and show it again when enabled.

The new endpoints are added to `AchievementBuilderControllerTests` (protected actions).

## Client (dartClient)

| Area | Change |
|---|---|
| Duplicate | Pure `duplicateDraft(draft, categories)` (new ids, "(copy)" name, active category), with tests. **Duplicate as new** in the inspector's Status section (unlocked only) opens the copy as a new unsaved achievement. |
| API | `isDisabled` / `disabledAtUtc` on the template schema; `setAchievementTemplateDisabled` in the data service and `setTemplateDisabled` in the builder service. |
| Builder | A **Status** section at the top of the inspector with Enable / Disable (works on published and built-in versions, since it doesn't edit the draft); greyed-out, struck-through rows in the library. The builder raises `achievement-template-disabled-change`; the page calls the API and updates its template list without touching the open draft. |
| Player views | No change needed: the server leaves disabled achievements out of what it sends. |

## Smoke test

1. Open a built-in achievement → **Duplicate** → a new "… (copy)" opens, unsaved, editable.
   Change it, Save draft, Publish.
2. Open the built-in → Status → **Disable** → it greys out in the library and shows "Disabled".
3. Play a game that would unlock it: nothing unlocks; the copy unlocks instead.
4. A player who had unlocked the built-in: it's gone from their achievements dialog and counts,
   and their cap doesn't include it. **Enable** it again: it's back.
