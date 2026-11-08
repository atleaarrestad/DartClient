import { describe, expect, it } from 'vitest';

import { RoundStatus } from '../models/enums.js';
import {
	clampThrowPosition,
	type FocusGridPlayer,
	getArrowKeyDirection,
	getFirstUnplayedThrow,
	getFocusAfterPlayerRemoval,
	getNextFocusablePlayer,
	getNextThrowFocus,
	getNextTurnStart,
	getThrowElementId,
	parseThrowElementId,
	type ThrowPosition,
} from './throwFocusNavigation.js';

const { Valid, Victory, Unplayed } = RoundStatus;

type TestPlayer = FocusGridPlayer & { rounds: { roundStatus: RoundStatus; dartThrows: number[]; }[]; };

function player(...statuses: RoundStatus[]): TestPlayer {
	return { rounds: statuses.map(roundStatus => ({ roundStatus, dartThrows: [ 0, 0, 0 ] })) };
}

function at(playerIndex: number, roundIndex: number, throwIndex: number): ThrowPosition {
	return { playerIndex, roundIndex, throwIndex };
}

const threePlayers = [
	player(Valid, Unplayed),
	player(Valid, Unplayed),
	player(Valid, Unplayed),
];

describe('throw element ids', () => {
	it('round-trips a position', () => {
		expect(getThrowElementId(at(1, 12, 2))).toBe('throw-1-12-2');
		expect(parseThrowElementId('throw-1-12-2')).toEqual(at(1, 12, 2));
	});

	it('ignores missing and non-throw ids', () => {
		expect(parseThrowElementId(undefined)).toBeUndefined();
		expect(parseThrowElementId('')).toBeUndefined();
		expect(parseThrowElementId('combobox-0')).toBeUndefined();
	});
});

describe('getArrowKeyDirection', () => {
	it.each([
		[ 'ArrowUp', 'upward' ],
		[ 'ArrowDown', 'downward' ],
		[ 'ArrowRight', 'forward' ],
		[ 'ArrowLeft', 'backward' ],
		[ 'KeyA', undefined ],
	])('%s -> %s', (code, direction) => {
		expect(getArrowKeyDirection(code)).toBe(direction);
	});
});

describe('getNextFocusablePlayer', () => {
	it('has no next player with one or zero players', () => {
		expect(getNextFocusablePlayer([], 0, 'forward')).toBeUndefined();
		expect(getNextFocusablePlayer([ player(Valid) ], 0, 'forward')).toBeUndefined();
	});

	it('wraps around in turn order', () => {
		expect(getNextFocusablePlayer(threePlayers, 2, 'forward')).toBe(0);
		expect(getNextFocusablePlayer(threePlayers, 0, 'backward')).toBe(2);
	});

	it('skips players who have won', () => {
		const players = [ player(Valid), player(Victory), player(Valid) ];
		expect(getNextFocusablePlayer(players, 0, 'forward')).toBe(2);
		expect(getNextFocusablePlayer(players, 2, 'backward')).toBe(0);
	});

	it('has no next player when everyone else has won', () => {
		const players = [ player(Valid), player(Victory), player(Victory) ];
		expect(getNextFocusablePlayer(players, 0, 'forward')).toBeUndefined();
	});

	it('moves to the neighbouring column without wrapping when ignoring restrictions', () => {
		const players = [ player(Valid), player(Victory), player(Valid) ];
		expect(getNextFocusablePlayer(players, 0, 'forward', true)).toBe(1);
		expect(getNextFocusablePlayer(players, 2, 'forward', true)).toBeUndefined();
		expect(getNextFocusablePlayer(players, 0, 'backward', true)).toBeUndefined();
	});
});

describe('getNextThrowFocus in turn order', () => {
	it('steps through the throws of a round', () => {
		expect(getNextThrowFocus(threePlayers, null, 'forward', at(0, 0, 0))).toEqual(at(0, 0, 1));
		expect(getNextThrowFocus(threePlayers, null, 'backward', at(0, 0, 2))).toEqual(at(0, 0, 1));
	});

	it('passes the turn to the next player after the third throw', () => {
		expect(getNextThrowFocus(threePlayers, null, 'forward', at(0, 0, 2))).toEqual(at(1, 0, 0));
	});

	it('starts the next round after the last player', () => {
		expect(getNextThrowFocus(threePlayers, null, 'forward', at(2, 0, 2))).toEqual(at(0, 1, 0));
	});

	it('stays with a lone player for the next round', () => {
		expect(getNextThrowFocus([ player(Valid) ], null, 'forward', at(0, 0, 2))).toEqual(at(0, 1, 0));
	});

	it('stops at the round limit', () => {
		expect(getNextThrowFocus(threePlayers, 1, 'forward', at(2, 0, 2))).toBeNull();
		expect(getNextThrowFocus(threePlayers, 1, 'forward', at(1, 0, 2))).toEqual(at(2, 0, 0));
	});

	it('goes back to the previous player', () => {
		expect(getNextThrowFocus(threePlayers, null, 'backward', at(1, 1, 0))).toEqual(at(0, 1, 2));
	});

	it('goes back to the last player of the previous round', () => {
		expect(getNextThrowFocus(threePlayers, null, 'backward', at(0, 1, 0))).toEqual(at(2, 0, 2));
	});

	it('wraps to the last player within the first round', () => {
		expect(getNextThrowFocus(threePlayers, null, 'backward', at(1, 0, 0))).toEqual(at(0, 0, 2));
	});

	it('has nowhere to go back to from the first throw', () => {
		expect(getNextThrowFocus(threePlayers, null, 'backward', at(0, 0, 0))).toBeNull();
	});

	it('goes back a round for a lone player', () => {
		expect(getNextThrowFocus([ player(Valid, Valid) ], null, 'backward', at(0, 1, 0))).toEqual(at(0, 0, 2));
	});

	it('skips winners', () => {
		const players = [ player(Valid, Unplayed), player(Victory), player(Valid, Unplayed) ];
		expect(getNextThrowFocus(players, null, 'forward', at(0, 1, 2))).toEqual(at(2, 1, 0));
		expect(getNextThrowFocus(players, null, 'backward', at(2, 1, 0))).toEqual(at(0, 1, 2));
	});

	it('does not move up or down', () => {
		expect(getNextThrowFocus(threePlayers, null, 'upward', at(0, 1, 0))).toBeNull();
		expect(getNextThrowFocus(threePlayers, null, 'downward', at(0, 0, 0))).toBeNull();
	});
});

describe('getNextThrowFocus moving freely', () => {
	it('moves across columns without wrapping', () => {
		expect(getNextThrowFocus(threePlayers, null, 'forward', at(0, 1, 2), true)).toEqual(at(1, 1, 0));
		expect(getNextThrowFocus(threePlayers, null, 'forward', at(2, 1, 2), true)).toBeNull();
		expect(getNextThrowFocus(threePlayers, null, 'backward', at(1, 1, 0), true)).toEqual(at(0, 1, 2));
		expect(getNextThrowFocus(threePlayers, null, 'backward', at(0, 1, 0), true)).toBeNull();
	});

	it('moves into winners', () => {
		const players = [ player(Valid), player(Victory), player(Valid) ];
		expect(getNextThrowFocus(players, null, 'forward', at(0, 0, 2), true)).toEqual(at(1, 0, 0));
	});

	it('moves up and down within the existing rounds', () => {
		expect(getNextThrowFocus(threePlayers, null, 'upward', at(1, 1, 2), true)).toEqual(at(1, 0, 2));
		expect(getNextThrowFocus(threePlayers, null, 'upward', at(1, 0, 2), true)).toBeNull();
		expect(getNextThrowFocus(threePlayers, null, 'downward', at(1, 0, 1), true)).toEqual(at(1, 1, 1));
		expect(getNextThrowFocus(threePlayers, null, 'downward', at(1, 1, 1), true)).toBeNull();
	});

	it('keeps the round limit going forward', () => {
		expect(getNextThrowFocus(threePlayers, 1, 'forward', at(0, 1, 2), true)).toBeNull();
	});
});

describe('getNextTurnStart', () => {
	it('matches moving forward from the third throw', () => {
		for (let playerIndex = 0; playerIndex < threePlayers.length; playerIndex++) {
			expect(getNextTurnStart(threePlayers, null, playerIndex, 0))
				.toEqual(getNextThrowFocus(threePlayers, null, 'forward', at(playerIndex, 0, 2)));
		}
	});

	it('is null past the round limit', () => {
		expect(getNextTurnStart(threePlayers, 1, 2, 0)).toBeNull();
	});
});

describe('getFirstUnplayedThrow', () => {
	it('finds the first unplayed round, round by round', () => {
		const players = [ player(Valid, Valid, Unplayed), player(Valid, Unplayed) ];
		expect(getFirstUnplayedThrow(players, null)).toEqual(at(1, 1, 0));
	});

	it('falls back to the first throw', () => {
		expect(getFirstUnplayedThrow([ player(Valid) ], null)).toEqual(at(0, 0, 0));
		expect(getFirstUnplayedThrow([], null)).toEqual(at(0, 0, 0));
	});

	it('looks only within the round limit', () => {
		const players = [ player(Valid, Unplayed) ];
		expect(getFirstUnplayedThrow(players, 1)).toEqual(at(0, 0, 0));
	});
});

describe('getFocusAfterPlayerRemoval', () => {
	it('keeps the cell, shifting left when the last column goes', () => {
		expect(getFocusAfterPlayerRemoval(3, at(1, 4, 2))).toEqual(at(1, 4, 2));
		expect(getFocusAfterPlayerRemoval(3, at(2, 4, 2))).toEqual(at(1, 4, 2));
	});

	it('has no target when the last player is removed', () => {
		expect(getFocusAfterPlayerRemoval(1, at(0, 0, 0))).toBeUndefined();
	});
});

describe('clampThrowPosition', () => {
	it('clamps to the rounds the player has', () => {
		expect(clampThrowPosition([ player(Valid, Valid) ], at(0, 5, 2))).toEqual(at(0, 1, 2));
	});

	it('keeps a position that exists', () => {
		expect(clampThrowPosition([ player(Valid, Valid) ], at(0, 1, 1))).toEqual(at(0, 1, 1));
	});

	it('uses the first throw of a player without rounds', () => {
		expect(clampThrowPosition([ player() ], at(0, 3, 2))).toEqual(at(0, 0, 0));
	});

	it('has no target for a missing player', () => {
		expect(clampThrowPosition([ player(Valid) ], at(1, 0, 0))).toBeUndefined();
	});
});
