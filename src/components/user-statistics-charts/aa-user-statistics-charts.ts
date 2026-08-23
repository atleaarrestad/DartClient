import '../../ui/segmented-control/aa-segmented-control.js';
import '../aa-dartboard-heatmap/aa-dartboard-heatmap.js';
import '../aa-finish-count-chart/aa-finish-count-chart.js';
import '../aa-heatmap-chart/aa-heatmap-chart.js';
import '../aa-match-snapshot-chart/aa-match-snapshot-chart.js';

import { html, LitElement, TemplateResult, unsafeCSS } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import { SeasonStatistics } from '../../models/schemas.js';
import { sharedStyles } from '../../styles/shared-styles.js';
import type { SegmentedControlChangeEvent } from '../../ui/segmented-control/aa-segmented-control.js';
import userStatisticsChartsStyles from './aa-user-statistics-charts.css?inline';

export type HitDistributionView = 'bars' | 'board';
export type HitDistributionViewChangedEvent = CustomEvent<HitDistributionView>;

export const hitDistributionViewChangedEventName = 'hit-distribution-view-changed';
const hitDistributionViews = [
	{ value: 'bars', label: 'Bars' },
	{ value: 'board', label: 'Board' },
];

@customElement('aa-user-statistics-charts')
export class AaUserStatisticsCharts extends LitElement {

	@property({ attribute: false }) statistics?: SeasonStatistics;
	@property({ type: String }) hitDistributionView: HitDistributionView = 'bars';

	private selectHitDistributionView(view: HitDistributionView): void {
		if (view === this.hitDistributionView)
			return;

		this.dispatchEvent(new CustomEvent<HitDistributionView>(
			hitDistributionViewChangedEventName,
			{
				detail:   view,
				bubbles:  true,
				composed: true,
			},
		));
	}

	override render(): TemplateResult {
		const stats = this.statistics;
		if (!stats)
			return html``;

		const trackedHits = stats.hitCounts.reduce((total, hit) => total + hit.count, 0);

		return html`
			<section class="stats-grid">
				<div class="panel chart-panel">
					<div class="panel-header">
						<h3>MMR History</h3>
						<p>${stats.matchSnapshots.length} rated matches tracked this season.</p>
					</div>
					<div class="chart-slot">
						<aa-match-snapshot-chart .snapshots=${stats.matchSnapshots}></aa-match-snapshot-chart>
					</div>
				</div>

				<div class="panel chart-panel chart-panel-wide">
					<div class="panel-header chart-panel-header">
						<div>
							<h3>Hit Distribution</h3>
							<p>${trackedHits.toLocaleString()} recorded hits this season.</p>
						</div>
						<aa-segmented-control
							label="Hit distribution view"
							.items=${ hitDistributionViews }
							.selected=${ this.hitDistributionView }
							@segmented-control-change=${ (event: SegmentedControlChangeEvent) =>
								this.selectHitDistributionView(event.detail as HitDistributionView) }
						></aa-segmented-control>
					</div>
					<div class="chart-slot">
						${this.hitDistributionView === 'bars'
							? html`<aa-hit-count-chart .hits=${stats.hitCounts}></aa-hit-count-chart>`
							: html`
								<aa-dartboard-heatmap .hits=${stats.hitCounts}></aa-dartboard-heatmap>
							`}
					</div>
				</div>

				<div class="panel chart-panel">
					<div class="panel-header">
						<h3>Finishes by Round</h3>
					</div>
					<div class="chart-slot">
						<aa-finish-count-chart .finishCounts=${stats.finishCount}></aa-finish-count-chart>
					</div>
				</div>
			</section>
		`;
	}

	static override styles = [
		sharedStyles,
		unsafeCSS(userStatisticsChartsStyles),
	];
}

declare global {

	interface HTMLElementTagNameMap {
		'aa-user-statistics-charts': AaUserStatisticsCharts;
	}

	interface HTMLElementEventMap {
		'hit-distribution-view-changed': HitDistributionViewChangedEvent;
	}
}
