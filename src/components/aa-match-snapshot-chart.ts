import Chart from 'chart.js/auto';
import { css, html, LitElement, type PropertyValues } from 'lit';
import { customElement, property, query } from 'lit/decorators.js';

import type { MatchSnapshot } from '../models/schemas.js';

const peakMmrMarker = {
	id: 'peakMmrMarker',
	afterDatasetsDraw(chart: Chart): void {
		const dataset = chart.data.datasets[0];
		if (!dataset?.data.length)
			return;

		const values = dataset.data.map(value => Number(value));
		const peakValue = Math.max(...values);
		const peakIndex = values.indexOf(peakValue);
		const point = chart.getDatasetMeta(0).data[peakIndex];
		if (!point)
			return;

		const { ctx, chartArea } = chart;
		const label = `Peak MMR: ${ peakValue }`;

		ctx.save();
		ctx.strokeStyle = '#ed807f';
		ctx.lineWidth = 2;
		ctx.setLineDash([ 6, 4 ]);
		ctx.beginPath();
		ctx.moveTo(point.x, chartArea.top);
		ctx.lineTo(point.x, chartArea.bottom);
		ctx.stroke();
		ctx.setLineDash([]);

		ctx.fillStyle = '#dff362';
		ctx.strokeStyle = '#000';
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.arc(point.x, point.y, 6, 0, Math.PI * 2);
		ctx.fill();
		ctx.stroke();

		ctx.font = '700 12px "Space Grotesk", sans-serif';
		const labelWidth = ctx.measureText(label).width + 16;
		const labelHeight = 26;
		const labelX = Math.min(
			Math.max(point.x - labelWidth / 2, chartArea.left),
			chartArea.right - labelWidth,
		);
		const labelY = chartArea.top + (chartArea.bottom - chartArea.top - labelHeight) / 2;

		ctx.fillStyle = '#fff3cf';
		ctx.strokeStyle = '#000';
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.roundRect(labelX, labelY, labelWidth, labelHeight, 8);
		ctx.fill();
		ctx.stroke();

		ctx.fillStyle = '#000';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(label, labelX + labelWidth / 2, labelY + labelHeight / 2);
		ctx.restore();
	},
};


@customElement('aa-match-snapshot-chart')
export class MatchSnapshotChart extends LitElement {

	/** Array of MatchSnapshot objects with { date: Date | string, mmr: number } */
	@property({ type: Array }) snapshots: MatchSnapshot[] = [];

	@query('canvas') private _canvas!: HTMLCanvasElement;

	private _chart?: Chart;


	override disconnectedCallback(): void {
		super.disconnectedCallback();
		// Clean up to avoid memory leaks when element is removed
		if (this._chart) {
			this._chart.destroy();
			this._chart = undefined;
		}
	}

	override firstUpdated(changeProperties: PropertyValues): void {
		super.firstUpdated(changeProperties);

		this._renderChart();
	}

	override updated(changed: PropertyValues): void {
		super.updated(changed);

		if (changed.has('snapshots'))
			this._renderChart();
	}

	private _renderChart() {
		if (!this._canvas)
			return;

		const labels = this.snapshots.map((s) => {
			const d = new Date(s.date as any);

			return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
		});
		const data = this.snapshots.map((s) => s.mmr);

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
			type: 'line',
			data: {
				labels,
				datasets: [
					{
						label:       'MMR over Time',
						data,
						tension:     0.2,
						fill:        false,
						borderWidth: 2,
					},
				],
			},
			options: {
				responsive:          true,
				maintainAspectRatio: false, // <-- key for filling the container height
				scales:              {
					x: { title: { display: true, text: 'Date' } },
					y: { title: { display: true, text: 'MMR' }, beginAtZero: false },
				},
				plugins: {
					// (optional) crisp tooltips without extra noise
					tooltip: {
						mode:      'index',
						intersect: false,
					},
					legend: {
						labels: { filter: (item) => true },
					},
				},
			},
			plugins: [ peakMmrMarker ],
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
			display: block; /* avoid inline canvas baseline gap */
		}
  `;

}
