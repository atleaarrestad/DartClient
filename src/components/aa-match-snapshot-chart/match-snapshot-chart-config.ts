import type { ChartConfiguration, Plugin } from 'chart.js';

import type { MatchSnapshot } from '../../models/schemas.js';

// Canvas drawing can't read CSS custom properties; these mirror tokens.css.
const peakLineColor = '#ed807f'; // --color-status-danger
const peakPointColor = '#dff362'; // --color-status-success
const peakLabelColor = '#fff3cf'; // --color-surface-highlight
const inkColor = '#000'; // --color-border-strong

const peakMmrMarker: Plugin<'line'> = {
	id: 'peakMmrMarker',
	afterDatasetsDraw(chart): void {
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
		ctx.strokeStyle = peakLineColor;
		ctx.lineWidth = 2;
		ctx.setLineDash([ 6, 4 ]);
		ctx.beginPath();
		ctx.moveTo(point.x, chartArea.top);
		ctx.lineTo(point.x, chartArea.bottom);
		ctx.stroke();
		ctx.setLineDash([]);

		ctx.fillStyle = peakPointColor;
		ctx.strokeStyle = inkColor;
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

		ctx.fillStyle = peakLabelColor;
		ctx.strokeStyle = inkColor;
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.roundRect(labelX, labelY, labelWidth, labelHeight, 8);
		ctx.fill();
		ctx.stroke();

		ctx.fillStyle = inkColor;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(label, labelX + labelWidth / 2, labelY + labelHeight / 2);
		ctx.restore();
	},
};

export const createMatchSnapshotChartConfig = (
	snapshots: readonly MatchSnapshot[],
): ChartConfiguration<'line', number[], string> => {
	const labels = snapshots.map(snapshot => new Date(snapshot.date)
		.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
	const data = snapshots.map(snapshot => snapshot.mmr);
	const movingAverageWindow = Math.min(5, data.length);
	const movingAverageData = data.map((_, index) => {
		const windowStart = Math.max(0, index - movingAverageWindow + 1);
		const window = data.slice(windowStart, index + 1);

		return Math.round(window.reduce((total, mmr) => total + mmr, 0) / window.length);
	});

	return {
		type: 'line',
		data: {
			labels,
			datasets: [
				{
					label:       'MMR over Time',
					data,
					tension:     0.2,
					fill:        {
						target: 1,
						above:  'rgba(115, 209, 61, 0.18)',
						below:  'rgba(237, 128, 127, 0.14)',
					},
					borderColor: '#2f9ee5',
					borderWidth: 2,
				},
				{
					label:       `${ movingAverageWindow }-match moving average`,
					data:        movingAverageData,
					tension:     0.3,
					borderColor: '#f28c28',
					borderDash:  [ 8, 6 ],
					borderWidth: 2,
					pointRadius: 0,
					fill:        false,
				},
			],
		},
		options: {
			responsive:          true,
			maintainAspectRatio: false, // fill the container height
			scales:              {
				x: { title: { display: true, text: 'Date' } },
				y: { title: { display: true, text: 'MMR' }, beginAtZero: false },
			},
			plugins: {
				tooltip: {
					mode:      'index',
					intersect: false,
				},
			},
		},
		plugins: [ peakMmrMarker ],
	};
};
