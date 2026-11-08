import { html, LitElement, unsafeCSS } from 'lit';
import { customElement, property, query } from 'lit/decorators.js';

import type { FinishCount } from '../../models/schemas.js';
import { ChartController } from '../../ui/chart/chart-controller.js';
import chartHostStyles from '../../ui/chart/chart-host.css?inline';
import { createFinishCountChartConfig } from './finish-count-chart-config.js';


@customElement('aa-finish-count-chart')
export class FinishCountChart extends LitElement {

	@property({ type: Array }) finishCounts: FinishCount[] = [];

	@query('canvas') private canvas?: HTMLCanvasElement;

	private readonly chart = new ChartController(this, {
		canvas:       () => this.canvas,
		config:       () => createFinishCountChartConfig(this.finishCounts),
		dependencies: () => [ this.finishCounts ],
	});

	override render(): unknown {
		return html`<canvas role="img" aria-label="Finishes by round"></canvas>`;
	}

	static override styles = unsafeCSS(chartHostStyles);

}
