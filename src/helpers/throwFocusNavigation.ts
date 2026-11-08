import { RoundStatus } from '../models/enums.js';

/**
 * Pure focus navigation over the throw grid of the play page: players are columns,
 * rounds are rows and each round holds three throws.
 */

export type FocusDirection = 'forward' | 'backward' | 'upward' | 'downward';

export interface ThrowPosition {
	playerIndex: number;
	roundIndex:  number;
	throwIndex:  number;
}

export interface FocusGridPlayer {
	readonly rounds: readonly { readonly roundStatus: RoundStatus; }[];
}

const lastThrowIndex = 2;
const defaultRoundLimit = 15;

/** Element id of the throw input at a position, e.g. `throw-1-4-2`. */
export function getThrowElementId({ playerIndex, roundIndex, throwIndex }: ThrowPosition): string {
	return `throw-${ playerIndex }-${ roundIndex }-${ throwIndex }`;
}

/** Reads a position back from a throw element id; anything else gives `undefined`. */
export function parseThrowElementId(id: string | undefined): ThrowPosition | undefined {
	if (!id)
		return undefined;

	const idParts = id.split('-');
	if (idParts[0] !== 'throw')
		return undefined;

	const throwIndex = parseInt(idParts.pop()!, 10);
	const roundIndex = parseInt(idParts.pop()!, 10);
	const playerIndex = parseInt(idParts.pop()!, 10);

	return { playerIndex, roundIndex, throwIndex };
}

export function getArrowKeyDirection(code: string): FocusDirection | undefined {
	switch (code) {
	case 'ArrowUp':    return 'upward';
	case 'ArrowDown':  return 'downward';
	case 'ArrowRight': return 'forward';
	case 'ArrowLeft':  return 'backward';
	default:           return undefined;
	}
}

/**
 * The next player in `direction`. In turn order it wraps around and skips players who
 * have won; with `ignoreRestrictions` it is simply the neighbouring column, if any.
 */
export function getNextFocusablePlayer(
	players: readonly FocusGridPlayer[],
	currentPlayerIndex: number,
	direction: 'forward' | 'backward',
	ignoreRestrictions = false,
): number | undefined {
	const playerCount = players.length;
	if (playerCount <= 1)
		return undefined;

	const step = direction === 'forward' ? 1 : -1;

	if (ignoreRestrictions) {
		const nextPlayerIndex = currentPlayerIndex + step;
		if (nextPlayerIndex < 0 || nextPlayerIndex >= playerCount)
			return undefined;

		return nextPlayerIndex;
	}

	for (let i = 1; i < playerCount; i++) {
		const nextPlayerIndex = (currentPlayerIndex + step * i + playerCount) % playerCount;
		const nextPlayerHasWon = players[nextPlayerIndex]!.rounds
			.some(round => round.roundStatus === RoundStatus.Victory);

		if (!nextPlayerHasWon)
			return nextPlayerIndex;
	}

	return undefined;
}

/**
 * Where focus goes from `position`. Forward and backward follow the turn order
 * (Tab / Shift+Tab / Enter); with `ignoreRestrictions` all four directions move freely
 * around the grid (Shift+arrows). `null` means there is nowhere to go.
 */
export function getNextThrowFocus(
	players: readonly FocusGridPlayer[],
	maximumRounds: number | null,
	direction: FocusDirection,
	{ playerIndex, roundIndex, throwIndex }: ThrowPosition,
	ignoreRestrictions = false,
): ThrowPosition | null {
	if (direction === 'forward') {
		if (throwIndex !== lastThrowIndex)
			return { playerIndex, roundIndex, throwIndex: throwIndex + 1 };

		const nextFocusablePlayer = getNextFocusablePlayer(players, playerIndex, 'forward', ignoreRestrictions);
		let target: ThrowPosition;
		if (nextFocusablePlayer === undefined) {
			if (ignoreRestrictions)
				return null;

			target = { playerIndex, roundIndex: roundIndex + 1, throwIndex: 0 };
		}
		else {
			target = {
				playerIndex: nextFocusablePlayer,
				roundIndex:  nextFocusablePlayer < playerIndex ? roundIndex + 1 : roundIndex,
				throwIndex:  0,
			};
		}

		if (maximumRounds !== null && target.roundIndex >= maximumRounds)
			return null;

		return target;
	}

	if (direction === 'backward') {
		if (playerIndex === 0 && roundIndex === 0 && throwIndex === 0)
			return null;

		if (throwIndex !== 0)
			return { playerIndex, roundIndex, throwIndex: throwIndex - 1 };

		const previousFocusablePlayer = getNextFocusablePlayer(players, playerIndex, 'backward', ignoreRestrictions);
		if (previousFocusablePlayer === undefined) {
			if (ignoreRestrictions)
				return null;

			return { playerIndex, roundIndex: roundIndex - 1, throwIndex: lastThrowIndex };
		}

		const previousRoundIndex = roundIndex !== 0 && previousFocusablePlayer > playerIndex
			? roundIndex - 1
			: roundIndex;

		return { playerIndex: previousFocusablePlayer, roundIndex: previousRoundIndex, throwIndex: lastThrowIndex };
	}

	if (!ignoreRestrictions)
		return null;

	if (direction === 'upward') {
		if (roundIndex === 0)
			return null;

		return { playerIndex, roundIndex: roundIndex - 1, throwIndex };
	}

	const lastRoundIndex = (players[playerIndex]?.rounds.length ?? 0) - 1;
	if (roundIndex >= lastRoundIndex)
		return null;

	return { playerIndex, roundIndex: roundIndex + 1, throwIndex };
}

/** First throw of the next player's turn after `playerIndex` finishes `roundIndex`. */
export function getNextTurnStart(
	players: readonly FocusGridPlayer[],
	maximumRounds: number | null,
	playerIndex: number,
	roundIndex: number,
): ThrowPosition | null {
	return getNextThrowFocus(
		players,
		maximumRounds,
		'forward',
		{ playerIndex, roundIndex, throwIndex: lastThrowIndex },
	);
}

/** Round by round, the first throw of the first unplayed round; the top-left throw otherwise. */
export function getFirstUnplayedThrow(
	players: readonly FocusGridPlayer[],
	maximumRounds: number | null,
): ThrowPosition {
	const roundLimit = maximumRounds ?? Math.max(
		defaultRoundLimit,
		...players.map(player => player.rounds.length),
	);

	for (let roundIndex = 0; roundIndex < roundLimit; roundIndex++) {
		for (let playerIndex = 0; playerIndex < players.length; playerIndex++) {
			if (players[playerIndex]?.rounds[roundIndex]?.roundStatus === RoundStatus.Unplayed)
				return { playerIndex, roundIndex, throwIndex: 0 };
		}
	}

	return { playerIndex: 0, roundIndex: 0, throwIndex: 0 };
}

/**
 * The same cell after the focused player is removed; the column shifts left when the
 * last player goes. `undefined` when nobody is left.
 */
export function getFocusAfterPlayerRemoval(
	playerCount: number,
	position: ThrowPosition,
): ThrowPosition | undefined {
	const remainingPlayerCount = playerCount - 1;
	if (remainingPlayerCount <= 0)
		return undefined;

	return {
		...position,
		playerIndex: Math.min(position.playerIndex, remainingPlayerCount - 1),
	};
}

/** `position`, clamped to the rounds and throws the player actually has. */
export function clampThrowPosition(
	players: readonly { readonly rounds: readonly { readonly dartThrows: readonly unknown[]; }[]; }[],
	{ playerIndex, roundIndex, throwIndex }: ThrowPosition,
): ThrowPosition | undefined {
	const player = players[playerIndex];
	if (!player)
		return undefined;

	const safeRoundIndex = Math.min(roundIndex, Math.max(player.rounds.length - 1, 0));
	const round = player.rounds[safeRoundIndex];
	const safeThrowIndex = Math.min(throwIndex, Math.max((round?.dartThrows.length ?? 1) - 1, 0));

	return { playerIndex, roundIndex: safeRoundIndex, throwIndex: safeThrowIndex };
}
