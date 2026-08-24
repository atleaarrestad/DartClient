import '../aa-info-tooltip/aa-info-tooltip.js';
import '../rank-display/aa-rank-display.js';

import { html, LitElement, TemplateResult, unsafeCSS } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import type { Rank } from '../../models/rank.js';
import rankGuideStyles from './aa-mmr-rank-guide.css?inline';

export interface MmrRankGuideAxis {
	maximum:  number;
	tickStep: number;
	ticks:    number[];
}

export interface MmrRankGuidePlacement {
	label:            string;
	color:            string;
	strongLobbyScore: number | null;
	evenLobbyScore:   number | null;
	weakLobbyScore:   number | null;
}

export interface MmrRankGuideRow {
	rank:       Rank;
	minimumMmr: number;
	placements: MmrRankGuidePlacement[];
}

const rankGuideTooltip = 'The minimum average round score that still earns at least 1 MMR '
	+ 'just below each rank threshold. Each range compares a +2000 stronger lobby with an '
	+ 'even lobby and a -2000 weaker lobby. Assumes zero overshoots and excludes '
	+ 'achievement rewards.';

@customElement('aa-mmr-rank-guide')
export class AaMmrRankGuide extends LitElement {

	@property({ attribute: false }) axis: MmrRankGuideAxis = {
		maximum:  180,
		tickStep: 30,
		ticks:    [],
	};

	@property({ attribute: false }) rows: MmrRankGuideRow[] = [];
	@property({ type: Boolean }) showAllRanks = false;

	override render(): TemplateResult {
		const guideStyle = `--axis-step: ${ this.axis.tickStep / this.axis.maximum * 100 }%`;

		return html`
			<div class="rank-guide" style=${ guideStyle }>
				<div class="rank-guide-toolbar">
					<div class="heading-with-info">
						<strong>Score needed to keep climbing</strong>
						<aa-info-tooltip
							.text=${ rankGuideTooltip }
						></aa-info-tooltip>
					</div>
					<button
						type="button"
						aria-pressed=${ this.showAllRanks }
						@click=${ this.handleToggleRanks }
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
							${ this.axis.ticks.map(value => html`<span>${ value }</span>`) }
						</div>
					</div>
				</div>
				<div class="rank-guide-chart">
					${ this.rows.map(row => html`
						<div class="rank-guide-row">
							<div class="rank-guide-label">
								<aa-rank-display compact .rank=${ row.rank }>
									<small>${ row.minimumMmr } MMR</small>
								</aa-rank-display>
							</div>
							<div class="rank-placement-list">
								${ row.placements.map(placement => this.renderPlacement(placement)) }
							</div>
						</div>
					`) }
				</div>
			</div>
		`;
	}

	private renderPlacement(placement: MmrRankGuidePlacement): TemplateResult {
		const scores = [
			placement.strongLobbyScore,
			placement.evenLobbyScore,
			placement.weakLobbyScore,
		];
		const finiteScores = scores.filter((score): score is number => score !== null);
		const minimum = finiteScores.length > 0
			? Math.min(...finiteScores)
			: this.axis.maximum;
		const maximum = scores.some(score => score === null)
			? this.axis.maximum
			: Math.max(...finiteScores);
		const even = placement.evenLobbyScore ?? this.axis.maximum;
		const style = [
			`--placement-color: ${ placement.color }`,
			`--range-start: ${ minimum / this.axis.maximum * 100 }%`,
			`--range-width: ${ Math.max(
				0.8,
				(maximum - minimum) / this.axis.maximum * 100,
			) }%`,
			`--even-position: ${ even / this.axis.maximum * 100 }%`,
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
	}

	private formatRequiredScore(score: number | null): string {
		if (score === null)
			return '>180';

		return Number.isInteger(score) ? String(score) : score.toFixed(1);
	}

	private handleToggleRanks(): void {
		this.dispatchEvent(new CustomEvent<boolean>('show-all-ranks-change', {
			bubbles:  true,
			composed: true,
			detail:   !this.showAllRanks,
		}));
	}

	static override styles = unsafeCSS(rankGuideStyles);

}

declare global {
	interface HTMLElementTagNameMap {
		'aa-mmr-rank-guide': AaMmrRankGuide;
	}
}
