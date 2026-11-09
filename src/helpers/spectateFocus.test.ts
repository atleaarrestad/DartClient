import { describe, expect, it } from 'vitest';

import { RoundStatus, ThrowType } from '../models/enums.js';
import { createPlayer, createRound } from '../test/gameFixtures.js';
import {
	findLivePlayerId,
	findNextPlayerId,
	getCurrentRoundIndex,
	isMidRound,
	isStillPlaying,
} from './spectateFocus.js';

const single = (location: number): [ number, ThrowType ] => [ location, ThrowType.Single ];
const fullRound = (roundIndex: number) => createRound(roundIndex, { darts: [ single(1), single(1), single(1) ] });

/** A player with `full` rounds thrown and, when given, `inCurrent` darts of the next one. */
const player = (id: string, full: number, inCurrent?: number) => createPlayer(id, [
	...Array.from({ length: full }, (_, roundIndex) => fullRound(roundIndex)),
	...inCurrent === undefined
		? []
		: [ createRound(full, { darts: Array.from({ length: inCurrent }, () => single(5)) }) ],
]);

describe('getCurrentRoundIndex', () => {
	it('is the round with a dart still to throw', () => {
		expect(getCurrentRoundIndex(player('a', 5, 2))).toBe(5);
		expect(getCurrentRoundIndex(player('a', 5, 0))).toBe(5);
	});

	it('is a new round when every round is thrown', () => {
		expect(getCurrentRoundIndex(player('a', 5))).toBe(5);
		expect(getCurrentRoundIndex(player('a', 0))).toBe(0);
	});
});

describe('isMidRound', () => {
	it('needs some darts of the round down, not all', () => {
		expect(isMidRound(player('a', 5, 1))).toBe(true);
		expect(isMidRound(player('a', 5, 2))).toBe(true);
		expect(isMidRound(player('a', 5, 0))).toBe(false);
		expect(isMidRound(player('a', 5))).toBe(false);
	});
});

describe('isStillPlaying', () => {
	it('stops at the round limit', () => {
		expect(isStillPlaying(player('a', 11), 12)).toBe(true);
		expect(isStillPlaying(player('a', 12), 12)).toBe(false);
		expect(isStillPlaying(player('a', 40), null)).toBe(true);
	});

	it('stops after a win', () => {
		const won = createRound(0, {
			darts:       [ single(20), single(20), single(10) ],
			roundStatus: RoundStatus.Victory,
		});
		const winner = createPlayer('a', [ won ]);

		expect(isStillPlaying(winner, 12)).toBe(false);
	});
});

describe('findLivePlayerId', () => {
	it('follows the player whose dart came in last while their round is under way', () => {
		const players = [ player('a', 5, 1), player('b', 5, 2), player('c', 5) ];

		expect(findLivePlayerId(players, 'b', 12)).toBe('b');
	});

	it('takes anyone mid-round when the last dart in is unknown or that round is over', () => {
		const players = [ player('a', 6), player('b', 5, 2), player('c', 5) ];

		expect(findLivePlayerId(players, undefined, 12)).toBe('b');
		expect(findLivePlayerId(players, 'a', 12)).toBe('b');
	});

	it('between darts is the first in turn of those furthest behind', () => {
		const players = [ player('a', 6), player('b', 6), player('c', 5), player('d', 5) ];

		expect(findLivePlayerId(players, 'b', 12)).toBe('c');
	});

	it('starts a new round with the first player once everyone has thrown', () => {
		const players = [ player('a', 6), player('b', 6) ];

		expect(findLivePlayerId(players, 'b', 12)).toBe('a');
	});

	it('is nobody once nobody plays on', () => {
		expect(findLivePlayerId([ player('a', 12), player('b', 12) ], 'b', 12)).toBeUndefined();
	});
});

describe('findNextPlayerId', () => {
	it('is the next in turn, round to the first after the last', () => {
		const players = [ player('a', 6), player('b', 5, 1), player('c', 5) ];

		expect(findNextPlayerId(players, 'b', 12)).toBe('c');
		expect(findNextPlayerId(players, 'c', 12)).toBe('a');
	});

	it('skips players who are done', () => {
		const players = [ player('a', 12), player('b', 11, 2), player('c', 12) ];

		expect(findNextPlayerId(players, 'b', 12)).toBeUndefined();
		expect(findNextPlayerId([ player('a', 11), player('b', 11, 1), player('c', 12) ], 'b', 12)).toBe('a');
	});
});
