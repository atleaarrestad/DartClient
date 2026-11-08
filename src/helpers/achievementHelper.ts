import { html, type TemplateResult } from 'lit';

import { getAbsoluteBase } from '../getAbsoluteBase.js';
import { AchievementTier, achievementTiersAscending } from '../models/enums.js';
import type { PlayerResult } from '../models/schemas.js';
import { sum } from './sum.js';

interface TierGroup {
	tier:  AchievementTier;
	count: number;
	items: { name: string; description: string; }[];
}

/** Unlocked achievements grouped by tier, highest tier first, empty tiers left out. */
function groupUnlockedByTier(pr: PlayerResult): TierGroup[] {
	const byTier = new Map<AchievementTier, TierGroup>();

	for (const achievement of pr.unlockedV2Achievements) {
		const tier = achievement.achievementTier as AchievementTier;
		const group = byTier.get(tier) ?? { tier, count: 0, items: [] };
		group.count += 1;
		group.items.push({
			name:        achievement.renderedName,
			description: achievement.renderedDescription,
		});
		byTier.set(tier, group);
	}

	return [ ...achievementTiersAscending ]
		.reverse()
		.flatMap(tier => byTier.get(tier) ?? []);
}

export function renderAchievementSummary(pr: PlayerResult): TemplateResult {
	const grouped = groupUnlockedByTier(pr);
	const total = sum(grouped, group => group.count);
	if (total === 0)
		return html``;

	return html`
		<details class="achievements">
			<summary class="ach-summary" title="Click to view unlocked achievements">
				<span class="ach-label">
					Achievements <span class="ach-hint">(click)</span>
				</span>

				<span class="ach-total">${ total }</span>

				<span class="ach-badges">
					${ grouped.map(g => html`
						<span class="ach-badge" title="${ AchievementTier[g.tier] } ×${ g.count }">
							<img class="ach-icon" src="${ getAchievementTierIcon(g.tier) }" alt="${ AchievementTier[g.tier] }" />
							<span class="ach-count">×${ g.count }</span>
						</span>
					`) }
				</span>
			</summary>

			<div class="ach-list">
				${ grouped.map(g => html`
					<div class="ach-tier-group">
						<div class="ach-tier-header">
							<img class="ach-icon" src="${ getAchievementTierIcon(g.tier) }" alt="${ AchievementTier[g.tier] }" />
							<span>${ AchievementTier[g.tier] } (${ g.count })</span>
						</div>
						<ul>
							${ g.items.map(i => html`
								<li>
									<strong>${ i.name }</strong>
									<span class="muted"> — ${ i.description }</span>
								</li>
							`) }
						</ul>
					</div>
				`) }
			</div>
		</details>
	`;
}

const achievementTierIconFiles: Record<AchievementTier, string> = {
	[AchievementTier.bronze]:   'bronze_achievement.png',
	[AchievementTier.silver]:   'silver_achievement.png',
	[AchievementTier.gold]:     'gold_achievement.png',
	[AchievementTier.platinum]: 'platinum_achievement.png',
	[AchievementTier.diamond]:  'diamond_achievement.png',
};

export function getAchievementTierIcon(achievementTier: AchievementTier): string {
	const file = achievementTierIconFiles[achievementTier] as string | undefined;

	return `${ getAbsoluteBase() }icons/${ file ?? 'rank_unranked.png' }`;
}
