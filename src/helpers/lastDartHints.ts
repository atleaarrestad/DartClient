import type {
	AchievementLegalHit,
	LastDartHint,
	LastDartHints,
} from '../models/achievementBuilderApi.js';
import { RoundStatus, ThrowType } from '../models/enums.js';
import type { PlayerRounds, Round } from '../models/schemas.js';

export const VISIBLE_LAST_DART_HINTS = 3;
export const VISIBLE_TARGETS = 3;

const LAST_THROW_INDEX = 2;
const BULL = 25;
const DOUBLE_BULL = 50;

const throwTypeOrder: Record<ThrowType, number> = {
	[ThrowType.Triple]: 0,
	[ThrowType.Double]: 1,
	[ThrowType.Single]: 2,
	[ThrowType.Rim]:    3,
	[ThrowType.Miss]:   4,
};

const throwTypeNames: Partial<Record<ThrowType, string>> = {
	[ThrowType.Triple]: 'treble',
	[ThrowType.Double]: 'double',
	[ThrowType.Single]: 'single',
};

/** An unthrown dart slot, as the server defines it. */
export function isPlaceholderThrow(dartThrow: Round['dartThrows'][number]): boolean {
	return dartThrow.hitLocation === 0
		&& dartThrow.throwType === ThrowType.Single
		&& dartThrow.finalPoints === 0
		&& dartThrow.activatedModifiers.length === 0;
}

/**
 * Mirrors the server's last-dart window for the round the hints were computed for, so
 * hints are hidden as soon as the local state moves on (dart 3 entered, a correction, a
 * bust) instead of waiting for the server to clear them.
 */
export function isLastDartWindowOpen(player: PlayerRounds, roundIndex: number): boolean {
	if (player.rounds.some(round => round.roundStatus === RoundStatus.Victory))
		return false;

	const current = player.rounds.find(round => round.dartThrows.some(isPlaceholderThrow));
	if (!current || current.roundIndex !== roundIndex || current.dartThrows.length !== 3)
		return false;

	if (current.roundStatus === RoundStatus.Overshoot
		|| current.roundStatus === RoundStatus.WinConditionFailed)
		return false;

	const throws = [ ...current.dartThrows ].sort((a, b) => a.throwIndex - b.throwIndex);

	return throws.every((dartThrow, index) =>
		index === LAST_THROW_INDEX ? isPlaceholderThrow(dartThrow) : !isPlaceholderThrow(dartThrow));
}

export function selectVisibleHints(
	hints: LastDartHints,
	limit = VISIBLE_LAST_DART_HINTS,
): LastDartHint[] {
	return hints.hints.slice(0, limit);
}

/** Dart notation: T20, D16, S5, 25, Bull, Rim, Miss. */
export function formatHit(hit: AchievementLegalHit): string {
	switch (hit.throwType) {
	case ThrowType.Rim:
		return 'Rim';
	case ThrowType.Miss:
		return 'Miss';
	}

	if (hit.hitLocation === DOUBLE_BULL)
		return 'Bull';

	if (hit.hitLocation === BULL)
		return '25';

	const prefix = hit.throwType === ThrowType.Triple
		? 'T'
		: hit.throwType === ThrowType.Double ? 'D' : 'S';

	return `${ prefix }${ hit.hitLocation }`;
}

/** Best targets first: trebles before doubles before singles, higher numbers first. */
export function sortHits(hits: readonly AchievementLegalHit[]): AchievementLegalHit[] {
	return [ ...hits ].sort((a, b) =>
		throwTypeOrder[a.throwType] - throwTypeOrder[b.throwType]
		|| b.hitLocation - a.hitLocation);
}

/** A short target label for a hint chip, for example "T20", "Any 20" or "12 targets". */
export function describeWinningHits(hits: readonly AchievementLegalHit[]): string {
	const sorted = sortHits(hits);
	if (sorted.length === 0)
		return '';

	const isBoardNumber = (hit: AchievementLegalHit) =>
		hit.hitLocation >= 1 && hit.hitLocation <= 20
		&& throwTypeNames[hit.throwType] !== undefined;

	const firstLocation = sorted[0]!.hitLocation;
	if (sorted.length === 3
		&& sorted.every(hit => isBoardNumber(hit) && hit.hitLocation === firstLocation))
		return `Any ${ firstLocation }`;

	if (sorted.length <= 3)
		return sorted.map(formatHit).join(' / ');

	const firstType = sorted[0]!.throwType;
	const typeName = throwTypeNames[firstType];
	if (typeName && sorted.every(hit => isBoardNumber(hit) && hit.throwType === firstType))
		return sorted.length === 20 ? `Any ${ typeName }` : `${ sorted.length } ${ typeName }s`;

	return `${ sorted.length } targets`;
}

/** Every target, in the server's order (easiest first), for tooltips. */
export function listWinningHits(hits: readonly AchievementLegalHit[]): string {
	return hits.map(formatHit).join(', ');
}

/** The easiest targets; the server already sends winning hits easiest first. */
export function easiestTargets(
	hits: readonly AchievementLegalHit[],
	limit = VISIBLE_TARGETS,
): AchievementLegalHit[] {
	return hits.slice(0, limit);
}

export type HitKind = 'single' | 'double' | 'treble' | 'outer-bull' | 'bull' | 'off-board';

/** Which part of the board a hit is, for colouring targets like the board itself. */
export function getHitKind(hit: AchievementLegalHit): HitKind {
	if (hit.throwType === ThrowType.Miss || hit.throwType === ThrowType.Rim)
		return 'off-board';

	if (hit.hitLocation === DOUBLE_BULL)
		return 'bull';

	if (hit.hitLocation === BULL)
		return 'outer-bull';

	return hit.throwType === ThrowType.Triple
		? 'treble'
		: hit.throwType === ThrowType.Double ? 'double' : 'single';
}
