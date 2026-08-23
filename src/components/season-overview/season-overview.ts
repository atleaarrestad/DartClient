import '../../ui/stat/aa-stat.js';

import { html, LitElement, TemplateResult, unsafeCSS } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import seasonOverviewStyles from './season-overview.css?inline';

export interface SeasonOverviewStat {
	label: string;
	value: string | number;
}

@customElement('aa-season-overview')
export class SeasonOverview extends LitElement {

	@property({ attribute: false }) stats: SeasonOverviewStat[] = [];

	override render(): TemplateResult {
		return html`
			<section class="overview-section" aria-labelledby="season-overview-title">
				<div class="overview-grid">
					<h3 id="season-overview-title" class="section-title">Season overview</h3>
					${ this.stats.map(
						stat => html`
							<aa-stat
								label=${ stat.label }
								value=${ stat.value }
							></aa-stat>
						`,
					) }
				</div>
			</section>
		`;
	}

	static override styles = unsafeCSS(seasonOverviewStyles);

}

declare global {
	interface HTMLElementTagNameMap {
		'aa-season-overview': SeasonOverview;
	}
}
