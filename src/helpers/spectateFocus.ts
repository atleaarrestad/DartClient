import { RoundStatus } from '../models/enums.js';
import type { PlayerRounds, Round } from '../models/schemas.js';
import { isPlaceholderThrow } from './lastDartHints.js';

/*
 * Who a spectator on a phone looks at: the player throwing now. Players throw in the order
 * the page lists them, a round each in turn.
 */

/** The round the player is in or throws next: the first with a dart still to throw, else a new one. */
export function getCurrentRoundIndex(player: PlayerRounds): number {
	return getOpenRound(player)?.roundIndex ?? player.rounds.length;
}

/** The darts down in a round. */
export function countThrownDarts(round: Round): number {
	return round.dartThrows.filter(dart => !isPlaceholderThrow(dart)).length;
}

/** The player's round with a dart still to throw, if they have one. */
export function getOpenRound(player: PlayerRounds): Round | undefined {
	return player.rounds.find(round => round.dartThrows.some(isPlaceholderThrow));
}

/** Some darts of the round down, not all: the player is throwing. */
export function isMidRound(player: PlayerRounds): boolean {
	const round = getOpenRound(player);

	return round !== undefined && countThrownDarts(round) > 0;
}

export function hasWon(player: PlayerRounds): boolean {
	return player.rounds.some(round => round.roundStatus === RoundStatus.Victory);
}

/** Has rounds left: hasn't won, and hasn't reached the round limit (when there is one). */
export function isStillPlaying(player: PlayerRounds, maximumRounds: number | null): boolean {
	return !hasWon(player) && (maximumRounds === null || getCurrentRoundIndex(player) < maximumRounds);
}

/**
 * Who throws now: the player whose dart came in last, while their round is under way; else
 * anyone mid-round (a spectator who just arrived has seen no dart come in yet); else whoever
 * is up: the first in turn of those furthest behind in rounds. None once nobody plays on.
 */
export function findLivePlayerId(
	players: readonly PlayerRounds[],
	lastThrowingPlayerId: string | undefined,
	maximumRounds: number | null,
): string | undefined {
	const last = players.find(player => player.playerId === lastThrowingPlayerId);
	if (last && isMidRound(last))
		return last.playerId;

	const midRound = players.find(isMidRound);
	if (midRound)
		return midRound.playerId;

	let upNext: PlayerRounds | undefined;
	for (const player of players) {
		if (isStillPlaying(player, maximumRounds)
			&& (!upNext || getCurrentRoundIndex(player) < getCurrentRoundIndex(upNext)))
			upNext = player;
	}

	return upNext?.playerId;
}

/** Who throws after the live player: the next in turn who still plays. */
export function findNextPlayerId(
	players: readonly PlayerRounds[],
	livePlayerId: string,
	maximumRounds: number | null,
): string | undefined {
	const start = players.findIndex(player => player.playerId === livePlayerId);
	if (start < 0)
		return undefined;

	for (let step = 1; step < players.length; step++) {
		const player = players[(start + step) % players.length]!;
		if (isStillPlaying(player, maximumRounds))
			return player.playerId;
	}

	return undefined;
}
