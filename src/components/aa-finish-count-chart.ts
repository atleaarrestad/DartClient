import Chart from 'chart.js/auto';
import { css, html, LitElement, type PropertyValues } from 'lit';
import { customElement, property, query } from 'lit/decorators.js';

import type { FinishCount } from '../models/schemas.js';


@customElement('aa-finish-count-chart')
export class FinishCountChart extends LitElement {

	@property({ type: Array }) finishCounts: FinishCount[] = [];

	@query('canvas') private _canvas!: HTMLCanvasElement;

	private _chart?: Chart;

	override firstUpdated(changeProperties: PropertyValues): void {
		super.firstUpdated(changeProperties);

		this._renderChart();
	}

	override updated(changed: PropertyValues): void {
		super.updated(changed);

		if (changed.has('finishCounts'))
			this._renderChart();
	}

	private _renderChart() {
		if (!this._canvas)
			return;

		const labels = Array.from({ length: 15 }, (_, i) => String(i + 1));
		labels[14] = '>14';
		const data = labels.map((label) => {
			const num = parseInt(label, 10);
			const entry = this.finishCounts.find(fc => fc.roundNumber === num);

			return entry ? entry.count : 0;
		});

		if (this._chart) {
			this._chart.data.labels = labels;
			this._chart.data.datasets[0]!.data = data;
			this._chart.update();

			return;
		}

		const ctx = this._canvas.getContext('2d');
		if (!ctx)
			return;

		this._chart = new Chart(ctx, {
			type: 'bar',
			data: {
				labels,
				datasets: [
					{
						label:       'Finish by Round',
						data,
						borderWidth: 1,
					},
				],
			},
			options: {
				responsive:          true,
				maintainAspectRatio: false,
				scales:              {
					x: {
						title: { display: true, text: 'Round Number' },
					},
					y: {
						beginAtZero: true,
						title:       { display: true, text: 'Finish Count' },
						ticks:       { stepSize: 1 },
					},
				},
				plugins: {
					tooltip: {
						callbacks: {
							label: context => `${ context.dataset.label || '' }: ${ context.parsed.y }`,
						},
					},
				},
			},
		});
	}

	override render(): unknown {
		return html`<canvas></canvas>`;
	}

	static override styles = css`
		:host {
			display: block;
			position: relative;
			width: 100%;
			height: 100%;
		}
		canvas {
			width: 100% !important;
			height: 100% !important;
		}
  `;

}
