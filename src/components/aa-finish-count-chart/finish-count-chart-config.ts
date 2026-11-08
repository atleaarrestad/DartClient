import type { ChartConfiguration } from 'chart.js';

import type { FinishCount } from '../../models/schemas.js';

const roundCount = 15;

export const createFinishCountChartConfig = (
	finishCounts: readonly FinishCount[],
): ChartConfiguration<'bar', number[], string> => {
	const rounds = Array.from({ length: roundCount }, (_, index) => index + 1);
	const labels = rounds.map(round => round === roundCount ? `>${ roundCount - 1 }` : String(round));
	const data = rounds.map(round =>
		finishCounts.find(finishCount => finishCount.roundNumber === round)?.count ?? 0);

	return {
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
	};
};
