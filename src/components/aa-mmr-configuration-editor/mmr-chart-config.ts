import type { ChartConfiguration } from 'chart.js';

import { calculateMmrChange } from '../../models/mmr.js';
import type { MmrConfiguration } from '../../models/schemas.js';
import type { ChartClass } from '../../ui/chart/chart-controller.js';

export interface MmrOutcomeScenario {
	configuration: MmrConfiguration;
	goal:          number;
	playerMmr:     number;
	placement:     number;
	overshoots:    number;
}

const lobbyOffsets = [
	{ value: -2000, color: '#7f1d1d' },
	{ value: -1000, color: '#b91c1c' },
	{ value: -500, color: '#ef6c63' },
	{ value: 0, color: '#2563eb' },
	{ value: 500, color: '#4caf70' },
	{ value: 1000, color: '#218739' },
	{ value: 2000, color: '#14532d' },
];

const pressureColor = '#7a4bc2';

export const getEstimatedRounds = (goal: number, averageScore: number): number => {
	if (averageScore <= 0)
		return Number.MAX_SAFE_INTEGER;

	return Math.max(1, Math.round(goal / averageScore));
};

export const getPaddedAxisBounds = (values: number[]): {
	min:      number;
	max:      number;
	stepSize: number;
} => {
	const minimum = Math.min(...values);
	const maximum = Math.max(...values);
	const range = maximum - minimum;
	const stepSize = range <= 500 ? 50 : range <= 1000 ? 100 : 250;

	return {
		min: Math.floor(minimum / stepSize) * stepSize - stepSize,
		max: Math.ceil(maximum / stepSize) * stepSize + stepSize,
		stepSize,
	};
};

/** Index after which every series stays flat, plus a little padding (at least 12 points). */
const getVisibleLength = (series: number[][], totalLength: number): number => {
	let lastChangingIndex = -1;
	for (const values of series) {
		const finalValue = values.at(-1);
		for (let index = values.length - 2; index >= 0; index--) {
			if (values[index] !== finalValue) {
				lastChangingIndex = Math.max(lastChangingIndex, index);
				break;
			}
		}
	}

	return Math.min(totalLength - 1, Math.max(12, lastChangingIndex + 3)) + 1;
};

export const createOutcomeChartConfig = (
	scenario: MmrOutcomeScenario,
	chart: ChartClass,
): ChartConfiguration<'line', number[], number> => {
	const { configuration, goal, playerMmr, placement, overshoots } = scenario;
	const allScores = Array.from({ length: 37 }, (_, index) => index * 5);
	const candidateDatasets = lobbyOffsets.map(lobby => ({
		offsets: [ lobby.value ],
		data:    allScores.map(averageScore => calculateMmrChange(configuration, {
			playerMmr,
			averageLobbyMmr: Math.max(0, playerMmr + lobby.value),
			averageScore,
			overshoots,
			placement,
			roundsPlayed:    getEstimatedRounds(goal, averageScore),
		})),
		borderColor:     lobby.color,
		backgroundColor: lobby.color,
		borderWidth:     lobby.value === 0 ? 4 : 2.5,
		borderDash:      lobby.value < 0 ? [ 7, 4 ] : [],
		pointRadius:     0,
		tension:         0.18,
	}));
	// Merge curves the opponent-factor limits clamp to the same result.
	const allDatasets = candidateDatasets.reduce<typeof candidateDatasets>(
		(datasets, candidate) => {
			const duplicate = datasets.find(dataset =>
				dataset.data.every((value, index) => value === candidate.data[index]));
			if (duplicate)
				duplicate.offsets.push(...candidate.offsets);
			else
				datasets.push(candidate);

			return datasets;
		},
		[],
	);
	const visibleLength = getVisibleLength(allDatasets.map(dataset => dataset.data), allScores.length);
	const scores = allScores.slice(0, visibleLength);
	const datasets = allDatasets.map(({ offsets, ...dataset }) => ({
		...dataset,
		label: offsets
			.map(offset => offset > 0 ? `+${ offset }` : String(offset))
			.join(' / '),
		data: dataset.data.slice(0, visibleLength),
	}));
	const yBounds = getPaddedAxisBounds(datasets.flatMap(dataset => dataset.data));

	return {
		type: 'line',
		data: { labels: scores, datasets },
		options: {
			responsive:          true,
			maintainAspectRatio: false,
			animation:           false,
			interaction:         { mode: 'index', intersect: false },
			plugins:             {
				subtitle: {
					display: placement > 0,
					text:    `Finish rounds are estimated from the ${ goal }-point goal`,
					font:    { weight: 'bold' },
				},
				tooltip: {
					callbacks: {
						footer: items => {
							if (placement <= 0)
								return '';

							const averageScore = Number(items[0]?.label);
							if (averageScore <= 0)
								return 'Estimated finish: not possible at this score';

							return `Estimated finish: ${ getEstimatedRounds(goal, averageScore) } rounds`;
						},
					},
				},
				legend: {
					labels: {
						boxWidth:       10,
						boxHeight:      10,
						padding:        12,
						usePointStyle:  true,
						font:           { size: 11, weight: 'bold' },
						generateLabels: instance => chart.defaults.plugins.legend.labels
							.generateLabels(instance)
							.map(label => ({
								...label,
								text: `Lobby ${ label.text }`,
							})),
					},
				},
			},
			scales: {
				x: {
					title: {
						display: true,
						text:    placement > 0
							? 'Average round score (higher score means fewer rounds)'
							: 'Average round score',
					},
				},
				y: {
					min:   yBounds.min,
					max:   yBounds.max,
					title: { display: true, text: 'MMR change' },
					ticks: { stepSize: yBounds.stepSize },
				},
			},
		},
	};
};

export const createPressureChartConfig = (
	configuration: MmrConfiguration,
): ChartConfiguration<'line', number[], number> => {
	const allRatings = Array.from({ length: 41 }, (_, index) => index * 250);
	const allValues = allRatings.map(rating => Math.min(
		configuration.maximumGain,
		Math.max(
			-configuration.maximumLoss,
			Math.trunc((configuration.ratingPivot - rating) / configuration.ratingPullDivisor),
		),
	));
	const visibleLength = getVisibleLength([ allValues ], allRatings.length);
	const ratings = allRatings.slice(0, visibleLength);
	const values = allValues.slice(0, visibleLength);
	const yBounds = getPaddedAxisBounds(values);

	return {
		type: 'line',
		data: {
			labels:   ratings,
			datasets: [
				{
					label:           'Baseline MMR pressure',
					data:            values,
					borderColor:     pressureColor,
					backgroundColor: pressureColor,
					borderWidth:     3,
					pointRadius:     0,
					tension:         0.12,
				},
			],
		},
		options: {
			responsive:          true,
			maintainAspectRatio: false,
			animation:           false,
			scales:              {
				x: { title: { display: true, text: 'Player MMR' } },
				y: {
					min:   yBounds.min,
					max:   yBounds.max,
					title: { display: true, text: 'MMR added by rating pivot' },
					ticks: { stepSize: yBounds.stepSize },
				},
			},
		},
	};
};
