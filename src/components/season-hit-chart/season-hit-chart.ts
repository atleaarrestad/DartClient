import '../../ui/segmented-control/aa-segmented-control.js';
import '../aa-dartboard-heatmap/aa-dartboard-heatmap.js';
import '../aa-heatmap-chart/aa-heatmap-chart.js';

import { html, LitElement, nothing, TemplateResult, unsafeCSS } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { faIcons } from '../../faIcons.js';
import type { HitCount } from '../../models/schemas.js';
import type { SegmentedControlChangeEvent } from '../../ui/segmented-control/aa-segmented-control.js';
import seasonHitChartStyles from './season-hit-chart.css?inline';

type SeasonHitView = 'bars' | 'board';

const seasonHitViews = [
	{ value: 'bars', label: 'Bars' },
	{ value: 'board', label: 'Board' },
];

@customElement('aa-season-hit-chart')
export class SeasonHitChart extends LitElement {

	@property({ attribute: false }) hits: HitCount[] = [];
	@state() private selectedView:        SeasonHitView = 'bars';

	override render(): TemplateResult | typeof nothing {
		if (!this.hits.length)
			return nothing;

		return html`
			<section class="season-hits-section" aria-labelledby="season-hits-title">
				<div class="season-hits-card">
					<div class="season-hits-header">
						<div class="season-hits-title-wrap">
							<div class="season-hits-icon" aria-hidden="true">
								<i class="fas fa-chart-bar"></i>
							</div>
							<div>
								<h3 id="season-hits-title" class="section-title">Season hit distribution</h3>
								<p class="season-hits-subtitle">All tracked hits combined across all players in this season</p>
							</div>
						</div>
						<aa-segmented-control
							label="Season hit distribution view"
							.items=${ seasonHitViews }
							.selected=${ this.selectedView }
							@segmented-control-change=${ (event: SegmentedControlChangeEvent) => {
								this.selectedView = event.detail as SeasonHitView;
							} }
						></aa-segmented-control>
					</div>

					<div class="season-hits-chart-frame">
						${ this.selectedView === 'bars'
							? html`<aa-hit-count-chart .hits=${ this.hits }></aa-hit-count-chart>`
							: html`<aa-dartboard-heatmap .hits=${ this.hits }></aa-dartboard-heatmap>` }
					</div>
				</div>
			</section>
		`;
	}

	static override styles = [ faIcons, unsafeCSS(seasonHitChartStyles) ];

}

declare global {
	interface HTMLElementTagNameMap {
		'aa-season-hit-chart': SeasonHitChart;
	}
}
