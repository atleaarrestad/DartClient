# Achievement variant rules: per-variant tiers and skip rules

Status: **implemented 2026-11-08, unstaged in both repos** (dartClient + dartBackend).

## What it does

A template makes one achievement per parameter combination ("variant"). Variant rules decide:

- **Tier per variant.** Tier rules are checked top to bottom; the first that matches gives the
  tier, otherwise the template's default tier applies. RangeKing 50–180 is now *one* template:
  bronze, silver from 80, gold from 100, platinum from 130, diamond from 150.
- **Skip rules.** A variant that matches any skip rule is not generated (e.g. `skip if {n} = 13`).

A rule matches when all of its conditions hold. A condition compares one parameter with a constant:
numbers with `= != < <= > >=`, text and yes/no with `=` and `!=` only.

## Where it lives

**Stored**: in the definition JSON under a top-level `variants` key, so there is no schema change:

```json
"variants": {
  "skip":  [ { "when": [ { "parameter": "n", "operator": "equal", "value": 13 } ] } ],
  "tiers": [ { "tier": "gold", "when": [ { "parameter": "n", "operator": "greaterThanOrEqual", "value": 15 } ] } ]
}
```

**Edited**: tiers moved out of the inspector (the "Tier & type" section is now "Type") into the
workspace:

- **Blocks / Split**: a *Tiers* panel above the canvas or progression board. It has skip rows,
  tier-rule rows (with move-up, because the first match wins) and the default tier ("Otherwise").
  Each row shows how many achievements it decides; 0 is highlighted. When folded, it shows a
  summary such as `4 Diamond · 2 Platinum · 3 Gold · 2 Silver · 3 Bronze`.
- **Text**: lines at the top of the document (rule and progression):

  ```
  skip if {n} = 13
  tier diamond if {threshold} >= 150
  tier gold if {threshold} >= 100 and {mode} = "hard"
  tier bronze otherwise
  ```

  Exactly one default `tier <name>` line is required; there is a quick fix to add it. Text values
  are quoted. Completion offers tier names, `if`/`otherwise`, parameters, and parameter values.
- The readout, the inspector preview and the library show each variant's tier. The library
  shows the lowest and highest medal for a mixed template.

## Code map

Backend (dartBackend):
- `Core/AchievementBuilder/AchievementVariantRules.cs`: parses, validates and evaluates.
- `AchievementInstanceGenerator.Generate`: filters out skipped variants and sets
  `AchievementTier` per instance. It is an error if every variant is skipped.
  `GetInstanceCount` (the generation limit) still counts before skipping.
- `AchievementDefinitionCompiler`: allows the `variants` property.
- `BuiltInAchievementCatalog`: merges the families that differed only by tier.
  - RangeKing: 5 → 1.
  - Score threshold raw: 5 → 1. Score threshold modified: 4 → 1.
  - Finish on round 2–5: 3 → 1.
  - So 55 → 42 templates per season, still 194 instances.
  - Families with different logic stay separate.
  - Built-ins must not use skip rules: the seed SQL builder pairs instances with
    `LegacyMappings` by index.
- Tests: `VariantRulesTests.cs`, updated golden seed SQL (length 242343).

Client (dartClient):
- `src/helpers/achievementVariantRules.ts`: evaluation (same semantics as the server),
  enumeration, summaries, compile/restore of the stored form.
- `achievement-draft.ts`:
  - `getPreviews` (skips variants, sets the tier);
  - `getVariantSummary`, `countAchievements`, `getVersionVariantSummary`;
  - validation; parameter renames.
- `variant-rules/aa-variant-rules-editor.ts` (panel), `variant-rule-edits.ts` (pure edits).
- `rule-text/*`: string literals in the lexer; `tier`/`skip` lines in the parser, printer,
  completions and highlighting. `aa-rule-text-editor` syncs them both ways.
- `AchievementLogicChangeDetail` carries `tier`, `tierRules` and `skipRules`.

## Verification (2026-11-08)

Both migration sets ran on two fresh copies of the pristine prod dump (`dartprodcopy_pristine`
in container `dart-postgres-prodcopy`, port 5434):
- `dartprodcopy_head` used the committed backend (old catalog).
- `dartprodcopy_variants` used the working tree (merged catalog).

What players see is identical between the two:

| Check | Rows | Result |
| --- | --- | --- |
| Instances (name, description, tier) | 388 | identical |
| Unlocks (player, achievement, tier, source, time) | 802 | identical |
| Progression states | 360 | identical |
| MMR / rank | 40 | identical |

Templates went from 55 to 42 per season. The merged templates carry `variants` and the
legacy tiers.

Note on running migrations by hand: `dotnet ef` defaults to `ASPNETCORE_ENVIRONMENT=Development`.
In that case the design-time factory loads the repo's `.env`, which **replaces**
`DB_CONNECTION_STRING`. Pass `ASPNETCORE_ENVIRONMENT=Production` to be sure which database is
migrated.

## Not done / follow-ups

- The panel's layout was not checked in a browser.
- The dev database (`dart-postgres`, 5432) still has the old split templates. Re-import the
  dump, or point the backend at `dartprodcopy_variants` (5434) to try it.
