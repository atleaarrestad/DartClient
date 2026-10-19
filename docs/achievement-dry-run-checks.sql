-- Achievement builder cutover: prod dry-run checks (release plan step 8).
--
-- Run against a RESTORED COPY of the prod dump, BEFORE starting the new backend on it
-- (these read the legacy columns that the cutover migration drops):
--   psql "postgresql://.../<restored copy>" -v ON_ERROR_STOP=1 -f docs/achievement-dry-run-checks.sql
-- Everything runs inside one READ ONLY transaction, so nothing is changed.
--
-- Expected results are written above each query. Section E is for the spot checks after
-- the new backend has migrated the copy.
--
-- Constants used below (keep in sync with the backend):
--   old cutover literal   2026-01-04 14:37:24Z  (dadf5b9 commit; the timestamp the migration used before the M2 fix)
--   numbering cutoff      2026-08-24 14:41:35Z  (0427039 commit; LegacySessionAchievementEncodingSqlBuilder.OldNumberingCutoffUtc)
--   old implicit numbering: session values 0-76; remap 5-32 +95, 33-54 +167, 55-68 +245, 69-76 +331

BEGIN TRANSACTION READ ONLY;

\echo '=== Size (migration timing estimate; the default command timeout is 30 s) ==='
SELECT
    (SELECT count(*) FROM "GameResults")       AS game_results,
    (SELECT count(*) FROM "PlayerResults")     AS player_results,
    (SELECT count(*) FROM "SeasonStatistics")  AS season_statistics,
    (SELECT count(*) FROM "AchievementTrackers") AS achievement_trackers,
    (SELECT count(*) FROM "Seasons")           AS seasons;

SELECT "Id", "Name", "StartDate", "EndDate" FROM "Seasons" ORDER BY "StartDate";

-- ---------------------------------------------------------------------------------------
\echo '=== M1: duplicate season statistics (must return 0 rows) ==='
-- ProgressionTrackerBackfillSqlBuilder joins AchievementTrackers to SeasonStatistics by Id
-- and inserts one state per (instance, user). Two statistics rows for the same user and
-- season make one INSERT ... ON CONFLICT DO UPDATE touch the same row twice, and the
-- migration aborts ("ON CONFLICT DO UPDATE command cannot affect row a second time").
SELECT ss."UserId", ss."SeasonId", count(*) AS statistics_rows,
    count(at."Id") AS rows_with_tracker,
    array_agg(ss."Id" ORDER BY ss."Id") AS statistics_ids
FROM "SeasonStatistics" ss
LEFT JOIN "AchievementTrackers" at ON at."Id" = ss."Id"
GROUP BY ss."UserId", ss."SeasonId"
HAVING count(*) > 1;

-- ---------------------------------------------------------------------------------------
\echo '=== M2: old-numbering games saved after the old cutover literal ==='
-- Games between the dadf5b9 commit and its deploy still used the old numbering. With the
-- old literal they were read as new numbering (8-76 aborts the preflight, 5-7 became
-- Rimmer/RimReaper/PerfectlyBalanced). The M2 fix remaps them. Informational: shows what
-- the fix changes, and last_game ~ when dadf5b9 actually reached prod.
SELECT count(DISTINCT gr."Id") AS games, min(gr."Date") AS first_game, max(gr."Date") AS last_game
FROM "PlayerResults" pr
JOIN "GameResults" gr ON gr."Id" = pr."GameResultId"
WHERE gr."Date" >= TIMESTAMPTZ '2026-01-04 14:37:24Z'
    AND gr."Date" < TIMESTAMPTZ '2026-08-24 14:41:35Z'
    AND EXISTS (SELECT 1 FROM unnest(pr."UnlockedSessionAchievements") v WHERE v BETWEEN 5 AND 76);

SELECT gr."Id", gr."Date", pr."UserId", pr."UnlockedSessionAchievements"
FROM "PlayerResults" pr
JOIN "GameResults" gr ON gr."Id" = pr."GameResultId"
WHERE gr."Date" >= TIMESTAMPTZ '2026-01-04 14:37:24Z'
    AND gr."Date" < TIMESTAMPTZ '2026-08-24 14:41:35Z'
    AND EXISTS (SELECT 1 FROM unnest(pr."UnlockedSessionAchievements") v WHERE v BETWEEN 5 AND 76)
ORDER BY gr."Date";

\echo '=== M2 invariant: old-numbering-only values after the numbering cutoff (must return 0 rows) ==='
-- Values 8-76 do not exist in the stable enum. If any game after the cutoff has them, the
-- assumption behind the M2 fix is wrong: stop and investigate.
SELECT gr."Id", gr."Date", pr."UserId", pr."UnlockedSessionAchievements"
FROM "PlayerResults" pr
JOIN "GameResults" gr ON gr."Id" = pr."GameResultId"
WHERE gr."Date" >= TIMESTAMPTZ '2026-08-24 14:41:35Z'
    AND EXISTS (SELECT 1 FROM unnest(pr."UnlockedSessionAchievements") v WHERE v BETWEEN 8 AND 99);

-- ---------------------------------------------------------------------------------------
\echo '=== M3: season statistics values 5-7 kept under both meanings ==='
-- For a season spanning the numbering cutoff, a statistics value 5-7 with no game evidence
-- of either meaning becomes both the old achievement (Score 50/60/70 range) and the new one
-- (Rimmer/RimReaper/PerfectlyBalanced). Rows here mean some players gain an unlock they did
-- not earn. 0 rows: nothing to decide.
WITH candidates AS (
    SELECT ss."Id", ss."UserId", ss."SeasonId", v AS value
    FROM "SeasonStatistics" ss
    JOIN "Seasons" s ON s."Id" = ss."SeasonId"
    CROSS JOIN LATERAL unnest(ss."UnlockedSessionAchievements") v
    WHERE v BETWEEN 5 AND 7
        AND s."StartDate" < TIMESTAMPTZ '2026-08-24 14:41:35Z'
        AND s."EndDate" >= TIMESTAMPTZ '2026-08-24 14:41:35Z'
)
SELECT c.*
FROM candidates c
WHERE NOT EXISTS (
        SELECT 1 FROM "PlayerResults" pr JOIN "GameResults" gr ON gr."Id" = pr."GameResultId"
        WHERE pr."UserId" = c."UserId" AND gr."SeasonId" = c."SeasonId"
            AND gr."Date" < TIMESTAMPTZ '2026-08-24 14:41:35Z'
            AND c.value = ANY(pr."UnlockedSessionAchievements"))
    AND NOT EXISTS (
        SELECT 1 FROM "PlayerResults" pr JOIN "GameResults" gr ON gr."Id" = pr."GameResultId"
        WHERE pr."UserId" = c."UserId" AND gr."SeasonId" = c."SeasonId"
            AND gr."Date" >= TIMESTAMPTZ '2026-08-24 14:41:35Z'
            AND c.value = ANY(pr."UnlockedSessionAchievements"));

-- ---------------------------------------------------------------------------------------
\echo '=== M4: legacy values the preflight cannot map (must return 0 rows) ==='
-- The preflight aborts on any value without a built-in mapping. This applies the same
-- normalization as the migration first (old-numbering remap), then diffs against the
-- current enums. Retired 2, 3 and 500 should already be gone (remove-retired-achievements).
WITH session_enum(value) AS (
    SELECT unnest(ARRAY[
        0,1,4,5,6,7,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,
        118,119,120,121,122,123,124,125,126,127,200,201,202,203,204,205,206,207,208,209,210,
        211,212,213,214,215,216,217,218,219,220,221,300,301,302,303,304,305,306,307,308,309,
        310,311,312,313,400,401,402,403,404,405,406,407,408,409,410,411,600,601,602,603,604,
        605,606,607,608,609,610,611,612,613,614,615,616,617,618,619,620,621,622,623,624,625,
        626,627,628,629,630,631,632,633,634,635,636,637,638,639,700,701,702,703,704,705,706,
        707,708,709,710,711,712,713,714,715,716,717,718,719,720,800,801,802,803,804,805,806,
        807,808,809,810,811,812,813,814,815,816,817,818,819,820,821,822,823,824,825,826,827,
        828,829,830,831,832,833,834,835,836,837,838,839,840,841])
),
progress_enum(value) AS (
    SELECT unnest(ARRAY[0,1,2,3,4,5,6,7,8])
),
remap(old_value, new_value) AS (
    SELECT v, CASE
        WHEN v BETWEEN 5 AND 32 THEN v + 95
        WHEN v BETWEEN 33 AND 54 THEN v + 167
        WHEN v BETWEEN 55 AND 68 THEN v + 245
        WHEN v BETWEEN 69 AND 76 THEN v + 331
    END
    FROM generate_series(5, 76) v
),
session_values AS (
    -- Game results: dated, so the remap is exact.
    SELECT 'PlayerResults' AS source, CASE
            WHEN gr."Date" < TIMESTAMPTZ '2026-08-24 14:41:35Z'
                THEN COALESCE((SELECT new_value FROM remap WHERE old_value = v), v)
            ELSE v
        END AS value
    FROM "PlayerResults" pr
    JOIN "GameResults" gr ON gr."Id" = pr."GameResultId"
    CROSS JOIN LATERAL unnest(pr."UnlockedSessionAchievements") v
    UNION ALL
    -- Season statistics: 8-76 are always old numbering; 5-7 map either way.
    SELECT 'SeasonStatistics', CASE
            WHEN v BETWEEN 8 AND 76 THEN (SELECT new_value FROM remap WHERE old_value = v)
            ELSE v
        END
    FROM "SeasonStatistics" ss
    CROSS JOIN LATERAL unnest(ss."UnlockedSessionAchievements") v
)
SELECT 'session' AS kind, source, value, count(*) AS occurrences
FROM session_values
WHERE value NOT IN (SELECT value FROM session_enum)
GROUP BY source, value
UNION ALL
SELECT 'progress', 'PlayerResults', v, count(*)
FROM "PlayerResults" pr CROSS JOIN LATERAL unnest(pr."UnlockedProgressAchievements") v
WHERE v NOT IN (SELECT value FROM progress_enum)
GROUP BY v
UNION ALL
SELECT 'progress', 'SeasonStatistics', v, count(*)
FROM "SeasonStatistics" ss CROSS JOIN LATERAL unnest(ss."UnlockedProgressAchievements") v
WHERE v NOT IN (SELECT value FROM progress_enum)
GROUP BY v
ORDER BY kind, source, value;

\echo '=== M4 detail: distinct raw values per source (for eyeballing) ==='
SELECT 'PlayerResults.session' AS source, array_agg(DISTINCT v ORDER BY v)
FROM "PlayerResults" pr CROSS JOIN LATERAL unnest(pr."UnlockedSessionAchievements") v
UNION ALL
SELECT 'SeasonStatistics.session', array_agg(DISTINCT v ORDER BY v)
FROM "SeasonStatistics" ss CROSS JOIN LATERAL unnest(ss."UnlockedSessionAchievements") v
UNION ALL
SELECT 'PlayerResults.progress', array_agg(DISTINCT v ORDER BY v)
FROM "PlayerResults" pr CROSS JOIN LATERAL unnest(pr."UnlockedProgressAchievements") v
UNION ALL
SELECT 'SeasonStatistics.progress', array_agg(DISTINCT v ORDER BY v)
FROM "SeasonStatistics" ss CROSS JOIN LATERAL unnest(ss."UnlockedProgressAchievements") v;

-- ---------------------------------------------------------------------------------------
\echo '=== Spot-check baseline: pick 3-5 known users, note these BEFORE migrating ==='
-- Replace the names. Keep the output to compare with section E after the migration.
SELECT u."Name", s."Name" AS season, ss."Mmr", ss."CurrentRank",
    cardinality(ss."UnlockedSessionAchievements") AS session_unlocks,
    cardinality(ss."UnlockedProgressAchievements") AS progress_unlocks,
    ss."UnlockedSessionAchievements", ss."UnlockedProgressAchievements"
FROM "Users" u
JOIN "SeasonStatistics" ss ON ss."UserId" = u."Id"
JOIN "Seasons" s ON s."Id" = ss."SeasonId"
WHERE u."Name" IN ('<player 1>', '<player 2>', '<player 3>')
ORDER BY u."Name", s."StartDate";

ROLLBACK;

-- =======================================================================================
-- E. AFTER the new backend has started and migrated the copy (run separately).
-- =======================================================================================
-- BEGIN TRANSACTION READ ONLY;
--
-- -- Migration history: the cutover migrations are applied.
-- SELECT "MigrationId" FROM "__EFMigrationsHistory" ORDER BY "MigrationId" DESC LIMIT 10;
--
-- -- Unlock counts per user and season (compare with session_unlocks + progress_unlocks above;
-- -- M3 rows can add one, gap games from M2 can change the count).
-- SELECT u."Name", s."Name" AS season, count(*) AS unlocks,
--     count(*) FILTER (WHERE au."Source" = 1) AS from_games,
--     count(*) FILTER (WHERE au."Source" = 2) AS from_season_statistics
-- FROM "AchievementUnlocks" au
-- JOIN "Users" u ON u."Id" = au."PlayerId"
-- JOIN "Seasons" s ON s."Id" = au."SeasonId"
-- WHERE u."Name" IN ('<player 1>', '<player 2>', '<player 3>')
-- GROUP BY u."Name", s."Name", s."StartDate"
-- ORDER BY u."Name", s."StartDate";
--
-- -- What they unlocked, by tier (the tier drives the MMR reward and cap).
-- SELECT u."Name", ai."RenderedName", ai."AchievementTier", au."UnlockedAtUtc"
-- FROM "AchievementUnlocks" au
-- JOIN "Users" u ON u."Id" = au."PlayerId"
-- JOIN "AchievementInstances" ai ON ai."Id" = au."AchievementInstanceId"
-- WHERE u."Name" = '<player 1>'
-- ORDER BY ai."AchievementTier" DESC, ai."RenderedName";
--
-- -- Progression bars.
-- SELECT u."Name", ai."RenderedName", ps."IsSatisfied",
--     jsonb_array_length(ps."StateJson"->'hitSegments') AS segments_hit
-- FROM "AchievementProgressionStates" ps
-- JOIN "Users" u ON u."Id" = ps."SubjectId"
-- JOIN "AchievementInstances" ai ON ai."Id" = ps."AchievementInstanceId"
-- WHERE u."Name" = '<player 1>';
--
-- -- MMR must be unchanged by the migration.
-- SELECT u."Name", s."Name" AS season, ss."Mmr", ss."CurrentRank"
-- FROM "Users" u JOIN "SeasonStatistics" ss ON ss."UserId" = u."Id"
-- JOIN "Seasons" s ON s."Id" = ss."SeasonId"
-- WHERE u."Name" IN ('<player 1>', '<player 2>', '<player 3>');
--
-- ROLLBACK;
