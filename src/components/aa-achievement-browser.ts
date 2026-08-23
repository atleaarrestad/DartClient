import './aa-tabs.js';

import { css, html, LitElement, TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import {
	getAchievementTierIcon,
	getAchievementTypeLabel,
} from '../helpers/achievementHelper.js';
import {
	AchievementTier,
	ProgressAchievement,
	SessionAchievement,
	ThrowType,
} from '../models/enums.js';
import {
	AchievementDefinitionsResponse,
	ProgressionAchievementDefinition,
	ProgressionAchievementProgress,
	ProgressionAchievementTarget,
	SeasonStatistics,
	SessionsAchievementDefinition,
} from '../models/schemas.js';
import { sharedStyles } from '../styles.js';
import type { AaTabItem } from './aa-tabs.js';

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
			return html`<p class="empty">No achievements in this category.</p>`;

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
						<p class="status-empty">
							${ status === 'unlocked'
								? 'Nothing completed in this category yet.'
								: 'Everything in this category is complete.' }
						</p>
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
						? html`<span class="type-badge">${ getAchievementTypeLabel(item.achievementType) }</span>`
						: html`
							<span class="tier-badge">
								<img src=${ getAchievementTierIcon(tier) } alt="" />
								${ AchievementTier[tier] }
							</span>
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
		css`
			.browser {
				display: grid;
				grid-template-rows: auto minmax(0, 1fr) auto;
				gap: 0.8rem;
				height: 100%;
				min-height: 0;
			}

			.sticky-controls {
				position: sticky;
				top: 0;
				z-index: 5;
				display: grid;
				padding-bottom: 0.25rem;
				background: #f5f3ff;
			}

			.tab-panel {
				min-height: 0;
				overflow: hidden;
			}

			.status-count {
				padding: 0.1rem 0.45rem;
				background: #fff;
				border: 1.5px solid #000;
				border-radius: 999px;
			}

			.status-columns {
				display: grid;
				grid-template-columns: repeat(2, minmax(0, 1fr));
				align-items: stretch;
				gap: 0.75rem;
				height: 100%;
				min-height: 0;
			}

			.status-column {
				display: grid;
				grid-template-rows: auto minmax(0, 1fr);
				gap: 0.65rem;
				min-height: 0;
				overflow: hidden;
				padding: 0.7rem;
				border: 2px solid #000;
				border-radius: 14px;
			}

			.status-column--unlocked {
				background: #dff5bd;
				box-shadow: 4px 4px 0 #367c2b;
			}

			.status-column--locked {
				background: #ffd7e5;
				box-shadow: 4px 4px 0 #9b3d68;
			}

			.status-heading {
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: 0.75rem;
			}

			.status-heading h3 {
				font-size: 1rem;
			}

			.achievement-cards {
				display: grid;
				gap: 0.55rem;
				min-height: 0;
				overflow-y: auto;
				padding-right: 0.3rem;
				scrollbar-color: rgba(0, 0, 0, 0.4) transparent;
				scrollbar-width: thin;
			}

			.achievement-cards::-webkit-scrollbar {
				width: 4px;
			}

			.achievement-cards::-webkit-scrollbar-track {
				background: transparent;
			}

			.achievement-cards::-webkit-scrollbar-thumb {
				background: rgba(0, 0, 0, 0.4);
				border-radius: 999px;
			}

			.achievement-cards::-webkit-scrollbar-thumb:hover {
				background: rgba(0, 0, 0, 0.65);
			}

			.achievement-card {
				padding: 0.6rem 0.65rem;
				background: #fffefb;
				border: 2px solid #000;
				border-radius: 10px;
				box-shadow: 2px 2px 0 rgba(0, 0, 0, 0.8);
			}

			.achievement-card__heading {
				display: flex;
				align-items: flex-start;
				justify-content: space-between;
				gap: 0.65rem;
			}

			.achievement-card p {
				margin-top: 0.25rem;
				font-size: 0.82rem;
				line-height: 1.3;
				opacity: 0.75;
			}

			.progression-progress {
				display: grid;
				gap: 0.4rem;
				margin-top: 0.65rem;
				padding-top: 0.55rem;
				border-top: 1.5px dashed rgba(0, 0, 0, 0.3);
			}

			.progression-progress__label {
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: 0.75rem;
				font-size: 0.72rem;
				font-weight: 900;
			}

			.progression-progress__track {
				height: 10px;
				overflow: hidden;
				background: #eee;
				border: 1.5px solid #000;
				border-radius: 999px;
			}

			.progression-progress__track span {
				display: block;
				height: 100%;
				background: #73d13d;
			}

			.remaining-targets {
				font-size: 0.72rem;
			}

			.remaining-targets summary {
				display: grid;
				grid-template-columns: auto minmax(0, 1fr) auto;
				align-items: center;
				gap: 0.75rem;
				padding: 0.25rem 0;
				font-weight: 900;
				cursor: pointer;
				list-style: none;
			}

			.remaining-targets summary::-webkit-details-marker {
				display: none;
			}

			.remaining-targets summary::before {
				content: '+';
				display: grid;
				width: 18px;
				height: 18px;
				place-items: center;
				background: #fff;
				border: 1px solid #000;
				border-radius: 50%;
				line-height: 1;
			}

			.remaining-targets[open] summary::before {
				content: '−';
			}

			.remaining-targets summary strong {
				padding: 0.05rem 0.35rem;
				background: #fff;
				border: 1px solid #000;
				border-radius: 999px;
			}

			.remaining-targets__list {
				display: flex;
				flex-wrap: wrap;
				gap: 0.3rem;
				padding-top: 0.35rem;
			}

			.remaining-targets__list span,
			.progression-complete {
				width: fit-content;
				padding: 0.15rem 0.4rem;
				background: #fff;
				border: 1px solid #000;
				border-radius: 999px;
				font-size: 0.68rem;
				font-weight: 800;
			}

			.progression-complete {
				background: #e5fbe7;
			}

			.type-badge,
			.tier-badge {
				display: inline-flex;
				align-items: center;
				gap: 0.25rem;
				flex: 0 0 auto;
				padding: 0.12rem 0.4rem;
				background: #fff;
				border: 1.5px solid #000;
				border-radius: 999px;
				font-size: 0.65rem;
				font-weight: 900;
				text-transform: capitalize;
			}

			.tier-badge img {
				width: 16px;
				height: 16px;
			}

			.status-empty {
				padding: 1rem 0.75rem;
				background: rgba(255, 255, 255, 0.58);
				border: 2px dashed rgba(0, 0, 0, 0.45);
				border-radius: 10px;
				font-size: 0.82rem;
				font-weight: 800;
				text-align: center;
			}

			.empty,
			.unknown {
				margin: 0;
				font-size: 0.85rem;
				opacity: 0.65;
			}

			@media (max-width: 600px) {
				.status-columns {
					grid-template-columns: 1fr;
					grid-template-rows: repeat(2, minmax(0, 1fr));
				}

				.achievement-card__heading {
					flex-direction: column;
					gap: 0.35rem;
				}
			}
		`,
	];

}
