import type { ChartConfiguration } from 'chart.js';
import { describe, expect, it } from 'vitest';

import { createFinishCountChartConfig } from '../../components/aa-finish-count-chart/finish-count-chart-config.js';
import { createHitCountChartConfig } from '../../components/aa-heatmap-chart/hit-count-chart-config.js';
import { createMatchSnapshotChartConfig } from '../../components/aa-match-snapshot-chart/match-snapshot-chart-config.js';
import {
	createOutcomeChartConfig,
	createPressureChartConfig,
} from '../../components/aa-mmr-configuration-editor/mmr-chart-config.js';
import { ThrowType } from '../../models/enums.js';
import { defaultMmrConfiguration } from '../../models/mmr.js';
import { Rank } from '../../models/rank.js';
import { Chart } from './chart-registry.js';


/** A canvas whose 2D context accepts every call; Chart.js uses its basic platform in node. */
const createFakeCanvas = (): HTMLCanvasElement => {
	const values = new Map<PropertyKey, unknown>();
	const canvas = { width: 600, height: 300, style: {} } as Record<string, unknown>;
	const context: object = new Proxy({}, {
		get: (_, key) => {
			if (key === 'canvas')
				return canvas;
			if (key === 'measureText')
				return (text: string) => ({ width: text.length * 6 });
			if (values.has(key))
				return values.get(key);

			return () => undefined;
		},
		set: (_, key, value) => {
			values.set(key, value);

			return true;
		},
	});
	canvas['getContext'] = () => context;

	return canvas as unknown as HTMLCanvasElement;
};

const hits = [
	{ id: 1, throwType: ThrowType.Single, hitLocation: 20, count: 4, seasonStatisticsId: 1 },
	{ id: 2, throwType: ThrowType.Triple, hitLocation: 20, count: 2, seasonStatisticsId: 1 },
	{ id: 3, throwType: ThrowType.Double, hitLocation: 25, count: 9, seasonStatisticsId: 1 },
	{ id: 4, throwType: ThrowType.Single, hitLocation: 50, count: 1, seasonStatisticsId: 1 },
	{ id: 5, throwType: ThrowType.Miss, hitLocation: 0, count: 3, seasonStatisticsId: 1 },
];

const configs: [ string, ChartConfiguration<any, any, any> ][] = [
	[ 'finish count', createFinishCountChartConfig([ { id: 1, roundNumber: 3, count: 2, seasonStatisticsId: 1 } ]) ],
	[ 'hit count', createHitCountChartConfig(hits) ],
	[
		'match snapshot',
		createMatchSnapshotChartConfig([ 1500, 1550, 1525 ].map((mmr, index) => ({
			id:                 index,
			seasonStatisticsId: 1,
			date:               new Date(2026, 0, index + 1),
			mmr,
			rank:               Rank.Bronze,
			playerCount:        4,
		}))),
	],
	[
		'MMR outcome',
		createOutcomeChartConfig({
			configuration: defaultMmrConfiguration,
			goal:          501,
			playerMmr:     1750,
			placement:     1,
			overshoots:    0,
		}, Chart),
	],
	[ 'MMR pressure', createPressureChartConfig(defaultMmrConfiguration) ],
];

/** Plugins whose options a config relies on; unregistered plugins are silently ignored. */
const getRequiredPluginIds = (config: ChartConfiguration<any, any, any>): string[] => {
	const ids = new Set<string>(Object.keys(config.options?.plugins ?? {}));
	const datasets = config.data.datasets as { fill?: unknown; backgroundColor?: unknown; borderColor?: unknown; }[];
	if (datasets.some(dataset => dataset.fill))
		ids.add('filler');
	if (datasets.every(dataset => dataset.backgroundColor === undefined && dataset.borderColor === undefined))
		ids.add('colors');

	// Chart.js core options, not plugins.
	ids.delete('peakMmrMarker');

	return [ ...ids ];
};

describe('chart registry', () => {
	it.each(configs)('builds the %s chart with the registered components', (_, config) => {
		const chart = new Chart(createFakeCanvas(), config);

		try {
			for (const pluginId of getRequiredPluginIds(config))
				expect(Chart.registry.plugins.get(pluginId), `plugin "${ pluginId }"`).toBeDefined();

			chart.update();
		}
		finally {
			chart.destroy();
		}
	});

	it('rejects chart types that are not registered', () => {
		expect(() => new Chart(createFakeCanvas(), { type: 'pie', data: { datasets: [ { data: [ 1 ] } ] } }))
			.toThrow(/not a registered controller/u);
	});
});

describe('hit count chart config', () => {
	it('counts bulls only as singles and misses regardless of location', () => {
		const config = createHitCountChartConfig(hits);
		const labels = config.data.labels!;
		const byLabel = (series: string, label: string): number => {
			const dataset = config.data.datasets.find(item => item.label === series)!;

			return dataset.data[labels.indexOf(label)]!;
		};

		expect(byLabel('Single', '20')).toBe(4);
		expect(byLabel('Triple', '20')).toBe(2);
		expect(byLabel('Double', '25')).toBe(0);
		expect(byLabel('Single', '50')).toBe(1);
		expect(byLabel('Miss', 'Miss')).toBe(3);
	});
});
