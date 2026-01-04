import { html, type TemplateResult } from "lit";
import { AchievementDefinitionsResponse, PlayerResult } from "../models/schemas.js";
import { AchievementTier } from "../models/enums.js";
import { getAbsoluteBase } from '../getAbsoluteBase.js';

function groupUnlockedByTier(
  pr: PlayerResult,
  defs: AchievementDefinitionsResponse
) {
  const byTier = new Map<AchievementTier, { count: number; items: { name: string; description: string }[] }>();

  const add = (def?: { name: string; description: string; achievementTier: number }) => {
    if (!def) return;
    const tier = def.achievementTier as AchievementTier;
    const entry = byTier.get(tier) ?? { count: 0, items: [] };
    entry.count += 1;
    entry.items.push({ name: def.name, description: def.description });
    byTier.set(tier, entry);
  };

  pr.unlockedSessionAchievements.forEach(a =>
    add(defs.sessionAchievementDefinitions.get(a))
  );
  pr.unlockedProgressAchievements.forEach(a =>
    add(defs.progressionAchievementDefinitions.get(a))
  );

  const order: AchievementTier[] = [
	  AchievementTier.diamond,
	  AchievementTier.platinum,
	  AchievementTier.gold,
	  AchievementTier.silver,
	  AchievementTier.bronze,
  ];

  return order
    .map(t => ({ tier: t, ...(byTier.get(t) ?? { count: 0, items: [] }) }))
    .filter(x => x.count > 0);
}

export function renderAchievementSummary(
  pr: PlayerResult,
  defs: AchievementDefinitionsResponse
): TemplateResult {
  const grouped = groupUnlockedByTier(pr, defs);
  const total = grouped.reduce((sum, g) => sum + g.count, 0);
  if (total === 0) return html``;

  return html`
    <details class="achievements">
      <summary class="ach-summary" title="Click to view unlocked achievements">
        <span class="ach-label">
          Achievements <span class="ach-hint">(click)</span>
        </span>

        <span class="ach-total">${total}</span>

        <span class="ach-badges">
          ${grouped.map(g => html`
            <span class="ach-badge" title="${AchievementTier[g.tier]} ×${g.count}">
              <img class="ach-icon" src="${getAchievementTierIcon(g.tier)}" alt="${AchievementTier[g.tier]}" />
              <span class="ach-count">×${g.count}</span>
            </span>
          `)}
        </span>
      </summary>

      <div class="ach-list">
        ${grouped.map(g => html`
          <div class="ach-tier-group">
            <div class="ach-tier-header">
              <img class="ach-icon" src="${getAchievementTierIcon(g.tier)}" alt="${AchievementTier[g.tier]}" />
              <span>${AchievementTier[g.tier]} (${g.count})</span>
            </div>
            <ul>
              ${g.items.map(i => html`
                <li>
                  <strong>${i.name}</strong>
                  <span class="muted"> — ${i.description}</span>
                </li>
              `)}
            </ul>
          </div>
        `)}
      </div>
    </details>
  `;
}

export function getAchievementTierIcon(achievementTier: AchievementTier): string {
	const base = getAbsoluteBase();

	const url = (() => {
		switch (achievementTier) {
		case AchievementTier.bronze:
			return './icons/bronze_achievement.png';
		case AchievementTier.silver:
			return './icons/silver_achievement.png';
		case AchievementTier.gold:
			return './icons/gold_achievement.png';
		case AchievementTier.platinum:
			return './icons/platinum_achievement.png';
		case AchievementTier.diamond:
			return './icons/diamond_achievement.png';
		
		default:
			return './icons/rank_unranked.png';
		}
	})();

	return `${ base }${ url }`;
}