import type { ChartConfiguration } from 'chart.js';

import { ThrowType } from '../../models/enums.js';
import type { HitCount } from '../../models/schemas.js';

const labels = [
	'Miss',
	'Rim',
	...Array.from({ length: 20 }, (_, index) => String(index + 1)),
	'25',
	'50',
];

const labelIndex = new Map(labels.map((label, index) => [ label, index ]));

const series = [
	{ label: 'Miss', color: '#7f7f7f' },
	{ label: 'Rim', color: '#c7c7c7' },
	{ label: 'Single', color: '#1f77b4' },
	{ label: 'Double', color: '#ff7f0e' },
	{ label: 'Triple', color: '#d62728' },
] as const;

type SeriesLabel = typeof series[number]['label'];

const getSeriesLabel = (throwType: ThrowType): SeriesLabel | undefined => {
	switch (throwType) {
	case ThrowType.Miss: return 'Miss';
	case ThrowType.Rim: return 'Rim';
	case ThrowType.Single: return 'Single';
	case ThrowType.Double: return 'Double';
	case ThrowType.Triple: return 'Triple';
	default: return undefined;
	}
};

const getLocationLabel = (hit: HitCount): string | undefined => {
	if (hit.throwType === ThrowType.Miss)
		return 'Miss';
	if (hit.throwType === ThrowType.Rim)
		return 'Rim';
	if (hit.hitLocation >= 1 && hit.hitLocation <= 20)
		return String(hit.hitLocation);
	// Bulls only exist as singles.
	if ((hit.hitLocation === 25 || hit.hitLocation === 50) && hit.throwType === ThrowType.Single)
		return String(hit.hitLocation);

	return undefined;
};

export const createHitCountChartConfig = (
	hits: readonly HitCount[],
): ChartConfiguration<'bar', number[], string> => {
	const counts = new Map<SeriesLabel, number[]>(
		series.map(({ label }) => [ label, new Array<number>(labels.length).fill(0) ]),
	);

	for (const hit of hits) {
		const seriesLabel = getSeriesLabel(hit.throwType);
		const locationLabel = getLocationLabel(hit);
		const index = locationLabel === undefined ? undefined : labelIndex.get(locationLabel);
		if (seriesLabel === undefined || index === undefined)
			continue;

		counts.get(seriesLabel)![index]! += hit.count;
	}

	return {
		type: 'bar',
		data: {
			labels,
			datasets: series.map(({ label, color }) => ({
				label,
				data:            counts.get(label)!,
				backgroundColor: color,
				borderWidth:     1,
				stack:           'stack',
			})),
		},
		options: {
			responsive:          true,
			maintainAspectRatio: false,
			scales:              {
				x: {
					stacked: true,
					title:   { display: true, text: 'Hit location' },
				},
				y: {
					stacked:     true,
					beginAtZero: true,
					title:       { display: true, text: 'Hit Count' },
					ticks:       { stepSize: 1 },
				},
			},
			plugins: {
				tooltip: {
					mode:      'index',
					intersect: false,
					callbacks: {
						label: context => {
							const value = context.parsed.y ?? 0;
							if (!value)
								return '';

							return `${ context.dataset.label || '' }: ${ value }`;
						},
					},
				},
			},
		},
	};
};
