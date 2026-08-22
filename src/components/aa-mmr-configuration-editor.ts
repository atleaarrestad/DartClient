import Chart from 'chart.js/auto';
import { css, html, LitElement, type PropertyValues } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';

import {
	calculateMmrChange,
	defaultMmrConfiguration,
	validateMmrConfiguration,
} from '../models/mmr.js';
import { getRankDisplayValue, getRankIcon, Rank } from '../models/rank.js';
import type { MmrConfiguration, RankThreshold } from '../models/schemas.js';
import './aa-info-tooltip.js';

interface MmrField {
	key: keyof MmrConfiguration;
	label: string;
	description: string;
	min: number;
	max: number;
	step: number;
}

interface RankGuidePlacement {
	placement: number;
	label: string;
	color: string;
	strongLobbyScore: number | null;
	evenLobbyScore: number | null;
	weakLobbyScore: number | null;
}

interface RankGuideRow {
	threshold: RankThreshold;
	placements: RankGuidePlacement[];
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
			{
				key: 'existingAchievementCapBonus', label: 'Existing achievement cap bonus',
				description: 'Extra gain cap per achievement already owned before the game.',
				min: 0, max: 100, step: 1,
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

	private outcomeChart?: Chart;
	private pressureChart?: Chart;

	override willUpdate(changed: PropertyValues): void {
		if (changed.has('configuration')) {
			this.working = { ...this.configuration };
			this.playerMmr = this.configuration.startingMmr;
		}
	}

	override firstUpdated(): void {
		this.renderCharts();
	}

	override updated(changed: PropertyValues): void {
		if (
			changed.has('working')
			|| changed.has('playerMmr')
			|| changed.has('placement')
			|| changed.has('overshoots')
			|| changed.has('goal')
			|| changed.has('activePreview')
		)
			this.renderCharts();
	}

	override disconnectedCallback(): void {
		this.outcomeChart?.destroy();
		this.pressureChart?.destroy();
		super.disconnectedCallback();
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

	private renderCharts(): void {
		this.renderOutcomeChart();
		this.renderPressureChart();
	}

	private getEstimatedRounds(averageScore: number): number {
		if (averageScore <= 0)
			return Number.MAX_SAFE_INTEGER;

		return Math.max(1, Math.round(this.goal / averageScore));
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
				roundsPlayed: this.getEstimatedRounds(score),
			});
			if (change >= 1)
				return score;
		}

		return null;
	}

	private getRankGuideRows(): RankGuideRow[] {
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
				threshold,
				placements: placements.map(placement => ({
					...placement,
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

	private formatRequiredScore(score: number | null): string {
		if (score === null)
			return '>180';

		return Number.isInteger(score) ? String(score) : score.toFixed(1);
	}

	private getRankGuideAxis(rows: RankGuideRow[]): {
		maximum: number;
		tickStep: number;
		ticks: number[];
	} {
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

	private getPaddedAxisBounds(values: number[]): {
		min: number;
		max: number;
		stepSize: number;
	} {
		const minimum = Math.min(...values);
		const maximum = Math.max(...values);
		const range = maximum - minimum;
		const stepSize = range <= 500 ? 50 : range <= 1000 ? 100 : 250;

		return {
			min: Math.floor(minimum / stepSize) * stepSize - stepSize,
			max: Math.ceil(maximum / stepSize) * stepSize + stepSize,
			stepSize,
		};
	}

	private renderOutcomeChart(): void {
		const context = this.outcomeCanvas?.getContext('2d');
		if (!context)
			return;

		const allScores = Array.from({ length: 37 }, (_, index) => index * 5);
		const lobbyOffsets = [
			{ value: -2000, color: '#7f1d1d' },
			{ value: -1000, color: '#b91c1c' },
			{ value: -500, color: '#ef6c63' },
			{ value: 0, color: '#2563eb' },
			{ value: 500, color: '#4caf70' },
			{ value: 1000, color: '#218739' },
			{ value: 2000, color: '#14532d' },
		];
		const candidateDatasets = lobbyOffsets.map(lobby => ({
			offsets: [ lobby.value ],
			data: allScores.map(averageScore => calculateMmrChange(this.working, {
				playerMmr:       this.playerMmr,
				averageLobbyMmr: Math.max(0, this.playerMmr + lobby.value),
				averageScore,
				overshoots:      this.overshoots,
				placement:       this.placement,
				roundsPlayed:    this.getEstimatedRounds(averageScore),
			})),
			borderColor: lobby.color,
			backgroundColor: lobby.color,
			borderWidth: lobby.value === 0 ? 4 : 2.5,
			borderDash: lobby.value < 0 ? [ 7, 4 ] : [],
			pointRadius: 0,
			tension: 0.18,
		}));
		const allDatasets = candidateDatasets.reduce<typeof candidateDatasets>(
			(datasets, candidate) => {
				const duplicate = datasets.find(dataset =>
					dataset.data.every((value, index) => value === candidate.data[index]));
				if (duplicate) {
					duplicate.offsets.push(...candidate.offsets);

					return datasets;
				}

				datasets.push(candidate);

				return datasets;
			},
			[],
		).map(dataset => ({
			...dataset,
			label: dataset.offsets
				.map(offset => offset > 0 ? `+${ offset }` : String(offset))
				.join(' / '),
		}));
		let lastChangingIndex = -1;
		for (const dataset of allDatasets) {
			const finalValue = dataset.data.at(-1);
			for (let index = dataset.data.length - 2; index >= 0; index--) {
				if (dataset.data[index] !== finalValue) {
					lastChangingIndex = Math.max(lastChangingIndex, index);
					break;
				}
			}
		}
		const finalScoreIndex = Math.min(
			allScores.length - 1,
			Math.max(12, lastChangingIndex + 3),
		);
		const scores = allScores.slice(0, finalScoreIndex + 1);
		const datasets = allDatasets.map(dataset => ({
			...dataset,
			data: dataset.data.slice(0, finalScoreIndex + 1),
		}));
		const yBounds = this.getPaddedAxisBounds(
			datasets.flatMap(dataset => dataset.data),
		);

		this.outcomeChart?.destroy();
		this.outcomeChart = new Chart(context, {
			type: 'line',
			data: { labels: scores, datasets },
			options: {
				responsive: true,
				maintainAspectRatio: false,
				animation: false,
				interaction: { mode: 'index', intersect: false },
				plugins: {
					subtitle: {
						display: this.placement > 0,
						text: `Finish rounds are estimated from the ${ this.goal }-point goal`,
						font: { weight: 'bold' },
					},
					tooltip: {
						callbacks: {
							footer: items => {
								if (this.placement <= 0)
									return '';

								const averageScore = Number(items[0]?.label);
								if (averageScore <= 0)
									return 'Estimated finish: not possible at this score';

								return `Estimated finish: ${ this.getEstimatedRounds(averageScore) } rounds`;
							},
						},
					},
					legend: {
						labels: {
							boxWidth: 10,
							boxHeight: 10,
							padding: 12,
							usePointStyle: true,
							font: { size: 11, weight: 'bold' },
							generateLabels: chart => Chart.defaults.plugins.legend.labels
								.generateLabels(chart)
								.map(label => ({
									...label,
									text: `Lobby ${ label.text }`,
								})),
						},
					},
				},
				scales: {
					x: {
						title: {
							display: true,
							text: this.placement > 0
								? 'Average round score (higher score means fewer rounds)'
								: 'Average round score',
						},
					},
					y: {
						min: yBounds.min,
						max: yBounds.max,
						title: { display: true, text: 'MMR change' },
						ticks: { stepSize: yBounds.stepSize },
					},
				},
			},
		});
	}

	private renderPressureChart(): void {
		const context = this.pressureCanvas?.getContext('2d');
		if (!context)
			return;

		const allRatings = Array.from({ length: 41 }, (_, index) => index * 250);
		const allValues = allRatings.map(rating => Math.min(
			this.working.maximumGain,
			Math.max(
				-this.working.maximumLoss,
				Math.trunc(
					(this.working.ratingPivot - rating)
					/ this.working.ratingPullDivisor,
				),
			),
		));
		const finalValue = allValues.at(-1);
		let lastChangingIndex = -1;
		for (let index = allValues.length - 2; index >= 0; index--) {
			if (allValues[index] !== finalValue) {
				lastChangingIndex = index;
				break;
			}
		}
		const finalRatingIndex = Math.min(
			allRatings.length - 1,
			Math.max(12, lastChangingIndex + 3),
		);
		const ratings = allRatings.slice(0, finalRatingIndex + 1);
		const values = allValues.slice(0, finalRatingIndex + 1);
		const yBounds = this.getPaddedAxisBounds(values);

		this.pressureChart?.destroy();
		this.pressureChart = new Chart(context, {
			type: 'line',
			data: {
				labels: ratings,
				datasets: [
					{
						label: 'Baseline MMR pressure',
						data: values,
						borderColor: '#7a4bc2',
						backgroundColor: '#7a4bc2',
						borderWidth: 3,
						pointRadius: 0,
						tension: 0.12,
					},
				],
			},
			options: {
				responsive: true,
				maintainAspectRatio: false,
				animation: false,
				scales: {
					x: { title: { display: true, text: 'Player MMR' } },
					y: {
						min: yBounds.min,
						max: yBounds.max,
						title: { display: true, text: 'MMR added by rating pivot' },
						ticks: { stepSize: yBounds.stepSize },
					},
				},
			},
		});
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
		const guideStyle = `--axis-step: ${ axis.tickStep / axis.maximum * 100 }%`;

		return html`
			<div class="rank-guide" style=${ guideStyle }>
				<div class="rank-guide-toolbar">
					<div class="heading-with-info">
						<strong>Score needed to keep climbing</strong>
						<aa-info-tooltip
							text="The minimum average round score that still earns at least 1 MMR just below each rank threshold. Each range compares a +2000 stronger lobby with an even lobby and a -2000 weaker lobby. Assumes zero overshoots and excludes achievement rewards."
						></aa-info-tooltip>
					</div>
					<button
						type="button"
						aria-pressed=${ this.showAllRanks }
						@click=${ () => { this.showAllRanks = !this.showAllRanks; } }
					>
						${ this.showAllRanks ? 'Main tiers only' : 'Show divisions' }
					</button>
				</div>
				<div class="rank-guide-legend">
					<span><i class="range-example"></i> +2000 to -2000 lobby</span>
					<span><i class="even-example"></i> Even lobby</span>
				</div>
				<div class="rank-axis" aria-hidden="true">
					<span></span>
					<div class="rank-axis-scale">
						<strong>Required average round score</strong>
						<div class="rank-axis-ticks">
							${ axis.ticks.map(value => html`<span>${ value }</span>`) }
						</div>
					</div>
				</div>
				<div class="rank-guide-chart">
					${ rows.map(row => html`
						<div class="rank-guide-row">
							<div class="rank-guide-label">
								<img src=${ getRankIcon(row.threshold.rank) } alt="" />
								<span>
									<strong>${ getRankDisplayValue(row.threshold.rank) }</strong>
									<small>${ row.threshold.minimumMmr } MMR</small>
								</span>
							</div>
							<div class="rank-placement-list">
								${ row.placements.map(placement => {
									const scores = [
										placement.strongLobbyScore,
										placement.evenLobbyScore,
										placement.weakLobbyScore,
									];
									const finiteScores = scores.filter(
										(score): score is number => score !== null,
									);
									const minimum = finiteScores.length > 0
										? Math.min(...finiteScores)
										: axis.maximum;
									const maximum = scores.some(score => score === null)
										? axis.maximum
										: Math.max(...finiteScores);
									const even = placement.evenLobbyScore ?? axis.maximum;
									const style = [
										`--placement-color: ${ placement.color }`,
										`--range-start: ${ minimum / axis.maximum * 100 }%`,
										`--range-width: ${ Math.max(
											0.8,
											(maximum - minimum) / axis.maximum * 100,
										) }%`,
										`--even-position: ${ even / axis.maximum * 100 }%`,
									].join('; ');
									const title = [
										`${ placement.label } place`,
										`Strong lobby: ${ this.formatRequiredScore(placement.strongLobbyScore) }`,
										`Even lobby: ${ this.formatRequiredScore(placement.evenLobbyScore) }`,
										`Weak lobby: ${ this.formatRequiredScore(placement.weakLobbyScore) }`,
									].join(' | ');

									return html`
										<div class="rank-placement">
											<strong>${ placement.label }</strong>
											<div class="rank-range-track" style=${ style } title=${ title }>
												<span class="rank-range-fill"></span>
												<span class="rank-even-marker"></span>
											</div>
											<span class="rank-score-summary">
												${ this.formatRequiredScore(minimum) }–${ this.formatRequiredScore(
													scores.some(score => score === null) ? null : maximum,
												) }
												<small>(${ this.formatRequiredScore(placement.evenLobbyScore) })</small>
											</span>
										</div>
									`;
								}) }
							</div>
						</div>
					`) }
				</div>
			</div>
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
						<button type="button" @click=${ this.resetDefaults }>Reset defaults</button>
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

	static override styles = css`
		:host {
			display: block;
			height: 100%;
			min-height: 0;
			font-family: inherit;
		}
		.editor {
			display: grid;
			grid-template-columns: minmax(0, 1.35fr) minmax(300px, 0.9fr);
			gap: 1rem;
			height: 100%;
			min-height: 0;
		}
		.preview,
		.parameters {
			min-height: 0;
			overflow: visible;
			padding: 0.15rem 0.4rem 0.4rem 0.15rem;
		}
		.preview {
			display: flex;
			flex-direction: column;
			gap: 0.65rem;
			height: 100%;
		}
		.preview-heading {
			display: flex;
			justify-content: space-between;
			gap: 0.75rem;
			align-items: flex-start;
		}
		.preview-tabs {
			display: flex;
			gap: 0.35rem;
		}
		.preview-tabs button {
			background: #fff;
		}
		.preview-tabs button.active {
			background: #7df9ff;
			box-shadow: 2px 2px 0 #000;
		}
		.curve-preview {
			display: grid;
			grid-template-rows:
				auto
				auto
				minmax(320px, 2fr)
				auto
				minmax(160px, 1fr);
			gap: 0.65rem;
			flex: 1;
			min-height: 0;
		}
		.curve-heading {
			font-size: 0.9rem;
		}
		.heading-with-info {
			display: flex;
			align-items: center;
			gap: 0.4rem;
		}
		h3 {
			margin: 0;
			font-size: 1rem;
		}
		button {
			border: 2px solid #000;
			border-radius: 8px;
			background: #fff3cf;
			padding: 0.45rem 0.65rem;
			font: inherit;
			font-weight: 800;
			cursor: pointer;
			white-space: nowrap;
		}
		.scenario-grid {
			display: grid;
			grid-template-columns: repeat(3, minmax(0, 1fr));
			gap: 0.55rem 0.8rem;
			margin: 0;
		}
		.scenario-control {
			display: grid;
			gap: 0.25rem;
			font-size: 0.75rem;
			font-weight: 700;
		}
		.scenario-control span {
			display: flex;
			justify-content: space-between;
			gap: 0.5rem;
		}
		.scenario-control input {
			width: 100%;
		}
		.chart-frame {
			border: 2px solid #000;
			border-radius: 12px;
			background: #fff;
			padding: 0.5rem;
		}
		.chart-frame--large {
			height: auto;
			min-height: 320px;
		}
		.chart-frame--small {
			height: auto;
			min-height: 160px;
		}
		.pressure-heading {
			margin: 0;
		}
		.rank-guide {
			display: flex;
			flex: 1;
			flex-direction: column;
			min-height: 0;
			border: 2px solid #000;
			border-radius: 12px;
			background: #fff;
			padding: 0.65rem;
		}
		.rank-guide-toolbar,
		.rank-guide-legend {
			display: flex;
			align-items: center;
			justify-content: space-between;
			gap: 0.75rem;
		}
		.rank-guide-toolbar {
			margin-bottom: 0.45rem;
		}
		.rank-guide-legend {
			justify-content: flex-start;
			flex-wrap: wrap;
			padding: 0.35rem 0.5rem;
			border-radius: 8px;
			background: #f6f6f6;
			font-size: 0.7rem;
			font-weight: 800;
		}
		.rank-guide-legend span {
			display: flex;
			align-items: center;
			gap: 0.3rem;
		}
		.range-example {
			display: inline-block;
			width: 28px;
			height: 6px;
			border-radius: 999px;
			background: #7b8794;
		}
		.even-example {
			display: inline-block;
			width: 3px;
			height: 13px;
			background: #000;
		}
		.rank-axis,
		.rank-guide-row {
			display: grid;
			grid-template-columns: 126px minmax(332px, 1fr);
			gap: 0.5rem;
		}
		.rank-axis {
			align-items: end;
			padding: 0.45rem 0.3rem 0.2rem;
			font-size: 0.65rem;
			font-weight: 800;
		}
		.rank-axis-scale {
			display: grid;
			gap: 0.25rem;
			margin-right: 80px;
			margin-left: 29px;
			text-align: center;
		}
		.rank-axis-scale > strong {
			font-size: 0.75rem;
		}
		.rank-axis-ticks {
			display: flex;
			justify-content: space-between;
		}
		.rank-guide-chart {
			min-height: 0;
			overflow-y: auto;
			padding-right: 0.2rem;
		}
		.rank-guide-row {
			align-items: center;
			padding: 0.4rem 0.3rem;
			border-top: 1px solid #d5d5d5;
		}
		.rank-guide-row:nth-child(even) {
			background: #fffdf8;
		}
		.rank-guide-label {
			display: flex;
			align-items: center;
			gap: 0.45rem;
			min-width: 0;
		}
		.rank-guide-label img {
			width: 30px;
			height: 30px;
			object-fit: contain;
		}
		.rank-guide-label span {
			display: grid;
			min-width: 0;
		}
		.rank-guide-label strong {
			overflow: hidden;
			font-size: 0.72rem;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
		.rank-guide-label small {
			font-size: 0.62rem;
			opacity: 0.65;
		}
		.rank-placement-list {
			display: grid;
			gap: 0.28rem;
		}
		.rank-placement {
			display: grid;
			grid-template-columns: 25px minmax(0, 1fr) 76px;
			align-items: center;
			gap: 0.35rem;
			font-size: 0.64rem;
		}
		.rank-range-track {
			position: relative;
			height: 9px;
			border: 1px solid #aaa;
			border-radius: 999px;
			background:
				repeating-linear-gradient(
					to right,
					#f3f3f3 0,
					#f3f3f3 calc(var(--axis-step) - 1px),
					#d5d5d5 calc(var(--axis-step) - 1px),
					#d5d5d5 var(--axis-step)
				);
		}
		.rank-range-fill {
			position: absolute;
			top: 1px;
			bottom: 1px;
			left: var(--range-start);
			width: var(--range-width);
			border-radius: 999px;
			background: var(--placement-color);
		}
		.rank-even-marker {
			position: absolute;
			top: -3px;
			bottom: -3px;
			left: var(--even-position);
			width: 3px;
			border-radius: 2px;
			background: #000;
			transform: translateX(-1px);
		}
		.rank-score-summary {
			text-align: right;
			font-weight: 900;
			white-space: nowrap;
		}
		.rank-score-summary small {
			font-weight: 700;
			opacity: 0.62;
		}
		fieldset {
			border: 2px solid #000;
			border-radius: 12px;
			background: #fffdf8;
			margin: 0 0 0.55rem;
			padding: 0.6rem;
		}
		legend {
			padding: 0 0.35rem;
			font-weight: 900;
		}
		.field-grid {
			display: grid;
			grid-template-columns: repeat(2, minmax(0, 1fr));
			gap: 0.45rem 0.6rem;
		}
		.field {
			display: grid;
			align-content: start;
			gap: 0.18rem;
			min-width: 0;
		}
		.field-heading {
			display: flex;
			align-items: flex-start;
			justify-content: space-between;
			gap: 0.35rem;
			min-height: 2.1rem;
			min-width: 0;
		}
		.field-heading label {
			font-size: 0.78rem;
			font-weight: 900;
			line-height: 1.15;
		}
		.field input {
			min-width: 0;
			padding: 0.45rem 0.55rem;
			border: 2px solid #000;
			border-radius: 8px;
			background: #fff;
			font: inherit;
		}
		.errors {
			margin-bottom: 0.75rem;
			padding: 0.65rem;
			border: 2px solid #000;
			border-radius: 10px;
			background: #f08080;
			font-size: 0.78rem;
			font-weight: 800;
		}
		@media (max-width: 820px) {
			.editor {
				grid-template-columns: 1fr;
				overflow-y: auto;
			}
			.preview {
				height: auto;
			}
			.curve-preview {
				grid-template-rows: auto;
			}
			.preview,
			.parameters {
				overflow: visible;
			}
			.chart-frame--large {
				height: 320px;
			}
			.chart-frame--small {
				height: 180px;
			}
		}
		@media (max-width: 520px) {
			.scenario-grid,
			.field-grid {
				grid-template-columns: 1fr;
			}
			.rank-axis,
			.rank-guide-row {
				grid-template-columns: 88px minmax(262px, 1fr);
			}
		}
	`;
}
