import { html, LitElement, unsafeCSS } from 'lit';
import { customElement, property, query } from 'lit/decorators.js';

import type { HitCount } from '../../models/schemas.js';
import { ChartController } from '../../ui/chart/chart-controller.js';
import chartHostStyles from '../../ui/chart/chart-host.css?inline';
import { createHitCountChartConfig } from './hit-count-chart-config.js';


@customElement('aa-hit-count-chart')
export class HitCountBarChart extends LitElement {

	@property({ type: Array }) hits: HitCount[] = [];

	@query('canvas') private canvas?: HTMLCanvasElement;

	private readonly chart = new ChartController(this, {
		canvas:       () => this.canvas,
		config:       () => createHitCountChartConfig(this.hits),
		dependencies: () => [ this.hits ],
	});

	override render(): unknown {
		return html`<canvas role="img" aria-label="Hits by board location and throw type"></canvas>`;
	}

	static override styles = unsafeCSS(chartHostStyles);

}
