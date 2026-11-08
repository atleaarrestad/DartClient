import { describe, expect, it } from 'vitest';

import { Rank } from '../../models/rank.js';
import {
	describeRankChange,
	findRankChanges,
	getLineExtent,
	layoutBadges,
} from './rank-change-markers.js';

describe('rank changes', () => {
	it('finds moves between tiers, not between steps of one tier', () => {
		const ranks = [ Rank.Platinum3, Rank.Diamond, Rank.Diamond2, Rank.Platinum3, Rank.Master ];

		expect(findRankChanges(ranks.map(rank => ({ rank })))).toEqual([
			{ index: 1, from: Rank.Platinum, tier: Rank.Diamond, direction: 'up' },
			{ index: 3, from: Rank.Diamond, tier: Rank.Platinum, direction: 'down' },
			{ index: 4, from: Rank.Platinum, tier: Rank.Master, direction: 'up' },
		]);
	});

	it('says what changed', () => {
		expect(describeRankChange({ index: 1, from: Rank.Diamond, tier: Rank.Master, direction: 'up' }))
			.toBe('▲ Promoted to Master');
		expect(describeRankChange({ index: 1, from: Rank.Grandmaster, tier: Rank.GlennMaster, direction: 'down' }))
			.toBe('▼ Dropped to Glenn Master');
	});
});

describe('line extent', () => {
	const line = [ { x: 0, y: 100 }, { x: 100, y: 0 }, { x: 200, y: 100 } ];

	it('follows the line between and through its points, with room for the curve', () => {
		expect(getLineExtent([ line ], 40, 60)).toEqual({ top: 40 - 4, bottom: 60 + 4 });
		expect(getLineExtent([ line ], 90, 110)).toEqual({ top: 0 - 4, bottom: 10 + 4 });
	});

	it('takes every line into account', () => {
		const flat = [ { x: 0, y: 150 }, { x: 200, y: 150 } ];

		expect(getLineExtent([ line, flat ], 40, 60).bottom).toBe(150 + 4);
	});
});

describe('badge layout', () => {
	const area = { left: 0, top: 0, right: 400, bottom: 200 };
	// A flat line across the middle.
	const flat = (): { top: number; bottom: number; } => ({ top: 100, bottom: 100 });
	const layout = { width: 40, height: 30, area, lineExtent: flat };

	it('puts a promotion above the line and a demotion below it', () => {
		const [ up, down ] = layoutBadges([ { x: 50, preferred: 'above' }, { x: 300, preferred: 'below' } ], layout);

		expect(up).toEqual({ side: 'above', box: { left: 30, right: 70, top: 62, bottom: 92 } });
		expect(down).toEqual({ side: 'below', box: { left: 280, right: 320, top: 108, bottom: 138 } });
	});

	it('moves a nearby badge to the other side, then one lane out', () => {
		const placements = layoutBadges([
			{ x: 100, preferred: 'above' },
			{ x: 110, preferred: 'above' },
			{ x: 120, preferred: 'above' },
		], layout);

		expect(placements.map(placement => placement && [ placement.side, placement.box.top ])).toEqual([
			[ 'above', 62 ],
			[ 'below', 108 ],
			[ 'above', 62 - 34 ],
		]);
	});

	it('keeps badges inside the chart and off other labels, or leaves them out', () => {
		const peakLabel = { left: 0, top: 0, right: 400, bottom: 99 };
		const [ first, second, third ] = layoutBadges(
			[ { x: 0, preferred: 'above' }, { x: 5, preferred: 'above' }, { x: 10, preferred: 'above' } ],
			{ ...layout, obstacles: [ peakLabel ] },
		);

		expect(first?.side).toBe('below');
		expect(first?.box.left).toBe(0);
		expect(second?.box.top).toBe(108 + 34);
		expect(third).toBeUndefined();
	});
});
