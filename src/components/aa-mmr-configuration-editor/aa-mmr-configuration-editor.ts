import '../../ui/button/aa-button.js';
import '../aa-info-tooltip/aa-info-tooltip.js';
import '../mmr-rank-guide/aa-mmr-rank-guide.js';

import { html, LitElement, type PropertyValues, unsafeCSS } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';

import {
	calculateMmrChange,
	defaultMmrConfiguration,
	validateMmrConfiguration,
} from '../../models/mmr.js';
import { Rank } from '../../models/rank.js';
import type { MmrConfiguration, RankThreshold } from '../../models/schemas.js';
import { ChartController } from '../../ui/chart/chart-controller.js';
import type {
	MmrRankGuideAxis,
	MmrRankGuideRow,
} from '../mmr-rank-guide/aa-mmr-rank-guide.js';
import mmrConfigurationEditorStyles from './aa-mmr-configuration-editor.css?inline';
import {
	createOutcomeChartConfig,
	createPressureChartConfig,
	getEstimatedRounds,
} from './mmr-chart-config.js';

interface MmrField {
	key: keyof MmrConfiguration;
	label: string;
	description: string;
	min: number;
	max: number;
	step: number;
}

const fieldGroups: { title: string; fields: MmrField[]; }[] = [
	{
		title:  'Season entry and limits',
		fields: [
			{
				key: 'startingMmr', label: 'Starting MMR',
				description: 'Initial rating for a player entering this season.',
				min: 0, max: 10000, step: 50,
			},
			{
				key: 'maximumGain', label: 'Maximum gain',
				description: 'Maximum normal MMR gained before new achievement rewards.',
				min: 0, max: 2000, step: 5,
			},
			{
				key: 'maximumLoss', label: 'Maximum loss',
				description: 'Maximum MMR that can be lost in one game.',
				min: 0, max: 2000, step: 5,
			},
		],
	},
	{
		title:  'Score performance',
		fields: [
			{
				key: 'averageScoreMultiplier', label: 'Average-score multiplier',
				description: 'MMR points contributed by each point of average round score.',
				min: 0, max: 100, step: 0.25,
			},
			{
				key: 'baseScore', label: 'Performance baseline',
				description: 'Subtracted from score, finish, and placement points.',
				min: 0, max: 2000, step: 5,
			},
			{
				key: 'overshootPenalty', label: 'Overshoot penalty',
				description: 'MMR points removed per overshoot.',
				min: 0, max: 200, step: 0.5,
			},
		],
	},
	{
		title:  'Finishing',
		fields: [
			{
				key: 'placementBonus', label: 'Placement bonus',
				description: 'Divided by placement: first gets all, second gets half.',
				min: 0, max: 1000, step: 5,
			},
			{
				key: 'finishBonus', label: 'Finish bonus',
				description: 'Maximum bonus available to a player who finishes.',
				min: 0, max: 2000, step: 5,
			},
			{
				key: 'roundPenalty', label: 'Per-round finish penalty',
				description: 'Removed from the finish bonus for every round played.',
				min: 0, max: 200, step: 1,
			},
		],
	},
	{
		title:  'Rating pressure and lobby strength',
		fields: [
			{
				key: 'ratingPivot', label: 'Rating pivot',
				description: 'Ratings below this receive upward pressure; ratings above lose some.',
				min: 0, max: 10000, step: 50,
			},
			{
				key: 'ratingPullDivisor', label: 'Rating-pull divisor',
				description: 'Higher values make the pivot pressure weaker.',
				min: 1, max: 1000, step: 1,
			},
			{
				key: 'minimumOpponentFactor', label: 'Minimum opponent factor',
				description: 'Floor used when the lobby is weaker than the player.',
				min: 0.1, max: 1, step: 0.05,
			},
			{
				key: 'maximumOpponentFactor', label: 'Maximum opponent factor',
				description: 'Ceiling used when the lobby is stronger than the player.',
				min: 1, max: 3, step: 0.05,
			},
		],
	},
];

@customElement('aa-mmr-configuration-editor')
export class AaMmrConfigurationEditor extends LitElement {
	@property({ attribute: false }) configuration: MmrConfiguration = {
		...defaultMmrConfiguration,
	};
	@property({ type: Number }) goal = 501;
	@property({ attribute: false }) rankThresholds: RankThreshold[] = [];

	@state() private working: MmrConfiguration = { ...defaultMmrConfiguration };
	@state() private playerMmr = 1750;
	@state() private placement = 1;
	@state() private overshoots = 0;
	@state() private activePreview: 'curves' | 'ranks' = 'curves';
	@state() private showAllRanks = false;

	@query('#outcome-chart') private outcomeCanvas?: HTMLCanvasElement;
	@query('#pressure-chart') private pressureCanvas?: HTMLCanvasElement;

	// Charts are updated in place; they are rebuilt only when the canvas is
	// re-rendered (switching back from the rank guide) or the editor reconnects.
	private readonly outcomeChart = new ChartController(this, {
		canvas:       () => this.outcomeCanvas,
		config:       chart => createOutcomeChartConfig({
			configuration: this.working,
			goal:          this.goal,
			playerMmr:     this.playerMmr,
			placement:     this.placement,
			overshoots:    this.overshoots,
		}, chart),
		dependencies: () => [ this.working, this.goal, this.playerMmr, this.placement, this.overshoots ],
	});

	private readonly pressureChart = new ChartController(this, {
		canvas:       () => this.pressureCanvas,
		config:       () => createPressureChartConfig(this.working),
		dependencies: () => [ this.working ],
	});

	override willUpdate(changed: PropertyValues): void {
		if (changed.has('configuration')) {
			this.working = { ...this.configuration };
			this.playerMmr = this.configuration.startingMmr;
		}
	}

	getConfiguration(): MmrConfiguration {
		return { ...this.working };
	}

	getErrors(): string[] {
		return validateMmrConfiguration(this.working);
	}

	private updateField(field: keyof MmrConfiguration, value: number): void {
		this.working = { ...this.working, [field]: value };
	}

	private resetDefaults(): void {
		this.working = { ...defaultMmrConfiguration };
		this.playerMmr = defaultMmrConfiguration.startingMmr;
	}

	private getRequiredAverageScore(
		playerMmr: number,
		placement: number,
		lobbyOffset: number,
	): number | null {
		const averageLobbyMmr = Math.max(0, playerMmr + lobbyOffset);
		for (let score = 0; score <= 180; score += 0.5) {
			const change = calculateMmrChange(this.working, {
				playerMmr,
				averageLobbyMmr,
				averageScore: score,
				overshoots: 0,
				placement,
				roundsPlayed: getEstimatedRounds(this.goal, score),
			});
			if (change >= 1)
				return score;
		}

		return null;
	}

	private getRankGuideRows(): MmrRankGuideRow[] {
		const thresholds = [ ...this.rankThresholds ]
			.sort((left, right) => left.minimumMmr - right.minimumMmr)
			.filter(threshold =>
				this.showAllRanks
				|| threshold.rank % 4 === 0
				|| threshold.rank === Rank.Grandmaster);
		const placements = [
			{ placement: 1, label: '1st', color: '#d7a900' },
			{ placement: 2, label: '2nd', color: '#7b8794' },
			{ placement: 3, label: '3rd', color: '#a85d28' },
		];

		return thresholds.map(threshold => {
			const playerMmr = Math.max(0, threshold.minimumMmr - 1);

			return {
				rank: threshold.rank,
				minimumMmr: threshold.minimumMmr,
				placements: placements.map(placement => ({
					label: placement.label,
					color: placement.color,
					strongLobbyScore: this.getRequiredAverageScore(
						playerMmr,
						placement.placement,
						2000,
					),
					evenLobbyScore: this.getRequiredAverageScore(
						playerMmr,
						placement.placement,
						0,
					),
					weakLobbyScore: this.getRequiredAverageScore(
						playerMmr,
						placement.placement,
						-2000,
					),
				})),
			};
		});
	}

	private getRankGuideAxis(rows: MmrRankGuideRow[]): MmrRankGuideAxis {
		const scores = rows.flatMap(row => row.placements.flatMap(placement => [
			placement.strongLobbyScore,
			placement.evenLobbyScore,
			placement.weakLobbyScore,
		]));
		if (scores.some(score => score === null)) {
			return {
				maximum: 180,
				tickStep: 30,
				ticks: Array.from({ length: 7 }, (_, index) => index * 30),
			};
		}

		const highestScore = Math.max(...scores as number[]);
		const paddedMaximum = highestScore * 1.2;
		const tickStep = paddedMaximum <= 60 ? 10 : paddedMaximum <= 140 ? 20 : 30;
		const maximum = Math.min(
			180,
			Math.max(tickStep * 3, Math.round(paddedMaximum / tickStep) * tickStep),
		);

		return {
			maximum,
			tickStep,
			ticks: Array.from(
				{ length: Math.floor(maximum / tickStep) + 1 },
				(_, index) => index * tickStep,
			),
		};
	}

	private renderScenarioSlider(
		label: string,
		value: number,
		min: number,
		max: number,
		step: number,
		onInput: (value: number) => void,
	): unknown {
		return html`
			<label class="scenario-control">
				<span>${ label } <strong>${ value }</strong></span>
				<input
					type="range"
					min=${ min }
					max=${ max }
					step=${ step }
					.value=${ String(value) }
					@input=${ (event: InputEvent) =>
						onInput(Number((event.currentTarget as HTMLInputElement).value)) }
				/>
			</label>
		`;
	}

	private renderRankGuide(): unknown {
		const rows = this.getRankGuideRows();
		const axis = this.getRankGuideAxis(rows);

		return html`
			<aa-mmr-rank-guide
				.axis=${ axis }
				.rows=${ rows }
				.showAllRanks=${ this.showAllRanks }
				@show-all-ranks-change=${ () => { this.showAllRanks = !this.showAllRanks; } }
			></aa-mmr-rank-guide>
		`;
	}

	override render(): unknown {
		const errors = validateMmrConfiguration(this.working);

		return html`
			<div class="editor">
				<section class="preview">
					<div class="preview-heading">
						<div class="preview-tabs" role="tablist" aria-label="MMR previews">
							<button
								type="button"
								role="tab"
								aria-selected=${ this.activePreview === 'curves' }
								class=${ this.activePreview === 'curves' ? 'active' : '' }
								@click=${ () => { this.activePreview = 'curves'; } }
							>
								Formula curves
							</button>
							<button
								type="button"
								role="tab"
								aria-selected=${ this.activePreview === 'ranks' }
								class=${ this.activePreview === 'ranks' ? 'active' : '' }
								@click=${ () => { this.activePreview = 'ranks'; } }
							>
								Rank guide
							</button>
						</div>
						<aa-button
							type="button"
							variant="secondary"
							size="small"
							@click=${ this.resetDefaults }
						>
							Reset defaults
						</aa-button>
					</div>
					${ this.activePreview === 'curves'
						? html`
							<div class="curve-preview">
								<div class="curve-heading heading-with-info">
									<strong>Outcome curve</strong>
									<aa-info-tooltip
										text="Shows MMR change for lobby differences from -2000 through +2000. Identical curves are merged when the configured opponent-factor limits clamp them to the same result. Dashed red lines are weaker lobbies, blue is even, and green lines are stronger. For finishers, rounds played are estimated from the season goal and each score on the horizontal axis. Newly unlocked achievement rewards are excluded, and the preview assumes no pre-existing achievement cap bonus."
									></aa-info-tooltip>
								</div>
								<div class="scenario-grid">
									${ this.renderScenarioSlider(
										'Player MMR',
										this.playerMmr,
										0,
										10000,
										50,
										value => { this.playerMmr = value; },
									) }
									${ this.renderScenarioSlider(
										'Placement (0 = no finish)',
										this.placement,
										0,
										16,
										1,
										value => { this.placement = value; },
									) }
									${ this.renderScenarioSlider(
										'Overshoots',
										this.overshoots,
										0,
										10,
										1,
										value => { this.overshoots = value; },
									) }
								</div>
								<div class="chart-frame chart-frame--large">
									<canvas id="outcome-chart"></canvas>
								</div>
								<div class="pressure-heading">
									<div class="heading-with-info">
										<h3>Baseline rating pressure</h3>
										<aa-info-tooltip
											text="Isolates the pull toward the rating pivot before performance, lobby strength, and achievements."
										></aa-info-tooltip>
									</div>
								</div>
								<div class="chart-frame chart-frame--small">
									<canvas id="pressure-chart"></canvas>
								</div>
							</div>
						`
						: this.renderRankGuide() }
				</section>

				<section class="parameters">
					${ errors.length > 0
						? html`<div class="errors">${ errors.map(error => html`<div>${ error }</div>`) }</div>`
						: '' }
					${ fieldGroups.map(group => html`
						<fieldset>
							<legend>${ group.title }</legend>
							<div class="field-grid">
								${ group.fields.map(field => html`
									<div class="field">
										<div class="field-heading">
											<label for=${ `mmr-${ field.key }` }>${ field.label }</label>
											<aa-info-tooltip .text=${ field.description }></aa-info-tooltip>
										</div>
										<input
											id=${ `mmr-${ field.key }` }
											type="number"
											min=${ field.min }
											max=${ field.max }
											step=${ field.step }
											.value=${ String(this.working[field.key]) }
											@input=${ (event: InputEvent) => this.updateField(
												field.key,
												Number((event.currentTarget as HTMLInputElement).value),
											) }
										/>
									</div>
								`) }
							</div>
						</fieldset>
					`) }
				</section>
			</div>
		`;
	}

	static override styles = unsafeCSS(mmrConfigurationEditorStyles);
}
