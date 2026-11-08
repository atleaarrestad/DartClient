import { html, LitElement, unsafeCSS } from 'lit';
import { customElement, property, query } from 'lit/decorators.js';

import type { MatchSnapshot } from '../../models/schemas.js';
import { ChartController } from '../../ui/chart/chart-controller.js';
import chartHostStyles from '../../ui/chart/chart-host.css?inline';
import { createMatchSnapshotChartConfig } from './match-snapshot-chart-config.js';


@customElement('aa-match-snapshot-chart')
export class MatchSnapshotChart extends LitElement {

	/** Array of MatchSnapshot objects with { date: Date | string, mmr: number } */
	@property({ type: Array }) snapshots: MatchSnapshot[] = [];

	@query('canvas') private canvas?: HTMLCanvasElement;

	private readonly chart = new ChartController(this, {
		canvas:       () => this.canvas,
		config:       () => createMatchSnapshotChartConfig(this.snapshots),
		dependencies: () => [ this.snapshots ],
	});

	override render(): unknown {
		return html`<canvas role="img" aria-label="MMR over time"></canvas>`;
	}

	static override styles = unsafeCSS(chartHostStyles);

}
