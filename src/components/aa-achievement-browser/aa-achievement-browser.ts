import '../aa-tabs/aa-tabs.js';
import '../../ui/badge/aa-badge.js';
import '../../ui/empty-state/aa-empty-state.js';

import { html, LitElement, TemplateResult, unsafeCSS } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import {
	getAchievementTierIcon,
	getAchievementTypeLabel,
} from '../../helpers/achievementHelper.js';
import {
	AchievementTier,
	ProgressAchievement,
	SessionAchievement,
	ThrowType,
} from '../../models/enums.js';
import {
	AchievementDefinitionsResponse,
	ProgressionAchievementDefinition,
	ProgressionAchievementProgress,
	ProgressionAchievementTarget,
	SeasonStatistics,
	SessionsAchievementDefinition,
} from '../../models/schemas.js';
import { sharedStyles } from '../../styles/shared-styles.js';
import achievementBrowserStyles from './aa-achievement-browser.css?inline';
import type { AaTabItem } from '../aa-tabs/aa-tabs.js';

type AchievementDefinition =
	| SessionsAchievementDefinition
	| ProgressionAchievementDefinition;

interface AchievementEntry {
	definition: AchievementDefinition;
	unlocked:   boolean;
	progress?:  ProgressionAchievementProgress;
}

interface TierProgress {
	earned:       number;
	total:        number;
	earnedItems:  AchievementEntry[];
	missingItems: AchievementEntry[];
}

export type AchievementGrouping = 'type' | 'tier';

@customElement('aa-achievement-browser')
export class AaAchievementBrowser extends LitElement {

	@property({ attribute: false }) stats?:       SeasonStatistics;
	@property({ attribute: false }) definitions?: AchievementDefinitionsResponse;

	@state() private grouping: AchievementGrouping = 'type';
	@state() private selectedTab = '';

	setGrouping(grouping: AchievementGrouping): void {
		if (grouping === this.grouping)
			return;

		this.grouping = grouping;
		this.selectedTab = '';
	}

	private handleTabChange(event: CustomEvent<{ id: string; }>): void {
		this.selectedTab = event.detail.id;
	}

	private renderAchievementBoard(
		achievements: AchievementEntry[],
		badge: 'tier' | 'type',
	): TemplateResult {
		if (achievements.length === 0)
			return html`<aa-empty-state compact>No achievements in this category.</aa-empty-state>`;

		const compareAchievements = (left: AchievementEntry, right: AchievementEntry): number =>
			left.definition.achievementTier - right.definition.achievementTier
			|| left.definition.name.localeCompare(right.definition.name);
		const unlocked = achievements
			.filter(achievement => achievement.unlocked)
			.sort(compareAchievements);
		const locked = achievements
			.filter(achievement => !achievement.unlocked)
			.sort(compareAchievements);

		return html`
			<div class="status-columns">
				${ this.renderStatusColumn('unlocked', 'Completed', unlocked, badge) }
				${ this.renderStatusColumn('locked', 'Remaining', locked, badge) }
			</div>
		`;
	}

	private renderStatusColumn(
		status: 'unlocked' | 'locked',
		title: string,
		achievements: AchievementEntry[],
		badge: 'tier' | 'type',
	): TemplateResult {
		return html`
			<section class="status-column status-column--${ status }">
				<header class="status-heading">
					<h3>${ title }</h3>
					<strong class="status-count">${ achievements.length }</strong>
				</header>

				${ achievements.length
					? html`
						<ul class="achievement-cards">
							${ achievements.map(achievement =>
								this.renderAchievementCard(achievement, badge)) }
						</ul>
					`
					: html`
						<aa-empty-state compact>
							${ status === 'unlocked'
								? 'Nothing completed in this category yet.'
								: 'Everything in this category is complete.' }
						</aa-empty-state>
					` }
			</section>
		`;
	}

	private renderAchievementCard(
		achievement: AchievementEntry,
		badge: 'tier' | 'type',
	): TemplateResult {
		const item = achievement.definition;
		const tier = item.achievementTier as AchievementTier;

		return html`
			<li class="achievement-card">
				<div class="achievement-card__heading">
					<strong>${ item.name }</strong>
					${ badge === 'type'
						? html`
							<aa-badge pill>
								${ getAchievementTypeLabel(item.achievementType) }
							</aa-badge>
						`
						: html`
							<aa-badge pill>
								<img src=${ getAchievementTierIcon(tier) } alt="" />
								${ AchievementTier[tier] }
							</aa-badge>
						` }
				</div>
				<p>${ item.description }</p>
				${ achievement.progress
					? this.renderProgressionProgress(achievement.progress)
					: null }
			</li>
		`;
	}

	private renderProgressionProgress(progress: ProgressionAchievementProgress): TemplateResult {
		const percentage = progress.requiredTargets > 0
			? Math.round((progress.completedTargets / progress.requiredTargets) * 100)
			: 0;

		return html`
			<div class="progression-progress">
				<div class="progression-progress__label">
					<span>Target progress</span>
					<strong>${ progress.completedTargets }/${ progress.requiredTargets }</strong>
				</div>
				<div
					class="progression-progress__track"
					role="progressbar"
					aria-label="Progression achievement target progress"
					aria-valuemin="0"
					aria-valuemax=${ progress.requiredTargets }
					aria-valuenow=${ progress.completedTargets }
				>
					<span style="width: ${ percentage }%"></span>
				</div>
				${ progress.remainingTargets.length > 0
					? html`
						<details class="remaining-targets">
							<summary>
								Remaining targets
								<strong>${ progress.remainingTargets.length }</strong>
							</summary>
							<div class="remaining-targets__list">
								${ progress.remainingTargets.map(target => html`
									<span title=${ this.getProgressionTargetDescription(target) }>
										${ this.getProgressionTargetLabel(target) }
									</span>
								`) }
							</div>
						</details>
					`
					: html`<span class="progression-complete">All targets completed</span>` }
			</div>
		`;
	}

	private getProgressionTargetLabel(target: ProgressionAchievementTarget): string {
		if (target.hitLocation === 25)
			return 'Outer bull';
		if (target.hitLocation === 50)
			return 'Bull';

		switch (target.throwType) {
		case ThrowType.Double:
			return `D${ target.hitLocation }`;
		case ThrowType.Triple:
			return `T${ target.hitLocation }`;
		default:
			return String(target.hitLocation);
		}
	}

	private getProgressionTargetDescription(target: ProgressionAchievementTarget): string {
		if (target.hitLocation === 25)
			return 'Outer bull';
		if (target.hitLocation === 50)
			return 'Bullseye';

		switch (target.throwType) {
		case ThrowType.Double:
			return `Double ${ target.hitLocation }`;
		case ThrowType.Triple:
			return `Triple ${ target.hitLocation }`;
		default:
			return `Single ${ target.hitLocation }`;
		}
	}

	private getTypeAchievements(
		tiers: Map<AchievementTier, TierProgress> | undefined,
		tierOrder: AchievementTier[],
	): AchievementEntry[] {
		if (!tiers)
			return [];

		return tierOrder.flatMap(tier => {
			const progress = tiers.get(tier);
			if (!progress)
				return [];

			return [
				...progress.earnedItems,
				...progress.missingItems,
			];
		});
	}

	override render(): TemplateResult {
		if (!this.stats || !this.definitions)
			return html``;

		const unlockedSession = new Set(
			this.stats.unlockedSessionAchievements.filter(
				(achievement): achievement is SessionAchievement => achievement !== 'unknown',
			),
		);
		const unlockedProgress = new Set(
			this.stats.unlockedProgressAchievements.filter(
				(achievement): achievement is ProgressAchievement => achievement !== 'unknown',
			),
		);
		const achievements: AchievementEntry[] = [];
		const progressByAchievement = new Map(
			this.stats.progressAchievementProgress
				.filter(progress => progress.achievement !== 'unknown')
				.map(progress => [ progress.achievement, progress ]),
		);

		for (const [ id, definition ] of this.definitions.sessionAchievementDefinitions.entries()) {
			achievements.push({
				definition,
				unlocked: unlockedSession.has(id),
			});
		}

		for (const [ id, definition ] of this.definitions.progressionAchievementDefinitions.entries()) {
			achievements.push({
				definition,
				unlocked: unlockedProgress.has(id),
				progress: progressByAchievement.get(id),
			});
		}

		const byType: Map<number, Map<AchievementTier, TierProgress>> = new Map();
		const ensureTier = (type: number, tier: AchievementTier): TierProgress => {
			const tiers = byType.get(type) ?? new Map<AchievementTier, TierProgress>();
			const progress = tiers.get(tier) ?? {
				earned:       0,
				total:        0,
				earnedItems:  [],
				missingItems: [],
			};

			tiers.set(tier, progress);
			byType.set(type, tiers);

			return progress;
		};

		for (const achievement of achievements) {
			const progress = ensureTier(
				achievement.definition.achievementType,
				achievement.definition.achievementTier as AchievementTier,
			);

			progress.total += 1;
			if (achievement.unlocked) {
				progress.earned += 1;
				progress.earnedItems.push(achievement);
			}
			else {
				progress.missingItems.push(achievement);
			}
		}

		const tierOrder = [
			AchievementTier.bronze,
			AchievementTier.silver,
			AchievementTier.gold,
			AchievementTier.platinum,
			AchievementTier.diamond,
		];
		const typeEntries = [ ...byType.entries() ].sort(([ left ], [ right ]) => left - right);
		const typeTabs: AaTabItem[] = typeEntries.map(([ type, tiers ]) => {
			const total = tierOrder.reduce(
				(sum, tier) => sum + (tiers.get(tier)?.total ?? 0),
				0,
			);
			const earned = tierOrder.reduce(
				(sum, tier) => sum + (tiers.get(tier)?.earned ?? 0),
				0,
			);

			return {
				id:    `type:${ type }`,
				label: getAchievementTypeLabel(type),
				count: `${ earned }/${ total }`,
			};
		});
		const tierTabs: AaTabItem[] = tierOrder
			.map(tier => {
				const tierAchievements = achievements
					.filter(achievement => achievement.definition.achievementTier === tier);
				const earned = tierAchievements
					.filter(achievement => achievement.unlocked)
					.length;

				return {
					id:      `tier:${ tier }`,
					label:   AchievementTier[tier],
					count:   `${ earned }/${ tierAchievements.length }`,
					iconSrc: getAchievementTierIcon(tier),
					iconAlt: AchievementTier[tier],
				};
			})
			.filter((tab, index) => {
				const tier = tierOrder[index];

				return achievements.some(
					achievement => achievement.definition.achievementTier === tier,
				);
			});
		const tabs = this.grouping === 'type' ? typeTabs : tierTabs;
		const activeTabId = tabs.some(tab => tab.id === this.selectedTab)
			? this.selectedTab
			: tabs[0]?.id ?? '';
		const activeTab = tabs.find(tab => tab.id === activeTabId);
		const activeValue = Number(activeTabId.split(':')[1]);
		const hasUnknown =
			this.stats.unlockedSessionAchievements.includes('unknown') ||
			this.stats.unlockedProgressAchievements.includes('unknown');
		const activeAchievements = this.grouping === 'type'
			? this.getTypeAchievements(byType.get(activeValue), tierOrder)
			: achievements.filter(
				achievement => achievement.definition.achievementTier === activeValue,
			);

		return html`
			<div class="browser">
				<div class="sticky-controls">
					<aa-tabs
						label="Achievement categories"
						.items=${ tabs }
						.selected=${ activeTabId }
						@tab-change=${ this.handleTabChange }
					></aa-tabs>
				</div>

				<section
					class="tab-panel"
					role="tabpanel"
					aria-label=${ activeTab?.label ?? 'Achievements' }
				>
					${ this.renderAchievementBoard(
						activeAchievements,
						this.grouping === 'type' ? 'tier' : 'type',
					) }
				</section>

				${ hasUnknown
					? html`<p class="unknown">Some achievements were unknown to this client version and were ignored.</p>`
					: null }
			</div>
		`;
	}

	static override styles = [
		sharedStyles,
		unsafeCSS(achievementBrowserStyles),
	];

}
