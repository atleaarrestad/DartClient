import type {
	AchievementLegalHit,
	LastDartHint,
} from '../models/achievementBuilderApi.js';
import { AchievementTier, RoundStatus, ThrowType } from '../models/enums.js';
import type { PlayerRounds, Round } from '../models/schemas.js';
import { bullLocation, dartboardNumbers, doubleBullLocation } from './dartboard.js';
import { defaultAchievementRewards } from './seasonDraft.js';

const LAST_THROW_INDEX = 2;

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

/** Dart notation: T20, D16, S5, 25, Bull, Rim, Miss. */
export function formatHit(hit: AchievementLegalHit): string {
	switch (hit.throwType) {
	case ThrowType.Rim:
		return 'Rim';
	case ThrowType.Miss:
		return 'Miss';
	}

	if (hit.hitLocation === doubleBullLocation)
		return 'Bull';

	if (hit.hitLocation === bullLocation)
		return '25';

	const prefix = hit.throwType === ThrowType.Triple
		? 'T'
		: hit.throwType === ThrowType.Double ? 'D' : 'S';

	return `${ prefix }${ hit.hitLocation }`;
}

/** Every target, in the server's order (easiest first), for tooltips and screen readers. */
export function listWinningHits(hits: readonly AchievementLegalHit[]): string {
	return hits.map(formatHit).join(', ');
}

export type HitKind = 'single' | 'double' | 'treble' | 'outer-bull' | 'bull' | 'off-board';

/** Which part of the board a hit is, for colouring targets like the board itself. */
export function getHitKind(hit: AchievementLegalHit): HitKind {
	if (hit.throwType === ThrowType.Miss || hit.throwType === ThrowType.Rim)
		return 'off-board';

	if (hit.hitLocation === doubleBullLocation)
		return 'bull';

	if (hit.hitLocation === bullLocation)
		return 'outer-bull';

	return hit.throwType === ThrowType.Triple
		? 'treble'
		: hit.throwType === ThrowType.Double ? 'double' : 'single';
}

export type BoardShade = 'dark' | 'light';

/**
 * The colour pair a number has on a real board: 20 has a black single and red rings, its
 * neighbour 1 a cream single and green rings, and so on around the board.
 */
export function getBoardShade(hitLocation: number): BoardShade {
	return dartboardNumbers.indexOf(hitLocation) % 2 === 0 ? 'dark' : 'light';
}

// ── The hint strip: the board unrolled into columns ─────────────────────────

export interface HintSegment {
	hit:          AchievementLegalHit;
	/** Dart notation, e.g. T20, Bull, Rim. */
	key:          string;
	/** How many achievements this segment unlocks. */
	count:        number;
	highestTier?: AchievementTier;
	/** The hints (by position in the list) this segment unlocks. */
	hintIndexes:  number[];
}

export interface HintColumn {
	label:    string;
	/** In the treble, double, single rows; the bulls skip the treble row, rim and miss only fill the single row. */
	segments: (HintSegment | undefined)[];
}

const legalHit = (hitLocation: number, throwType: ThrowType): AchievementLegalHit => ({ hitLocation, throwType });

/** Every hit the server can suggest, as columns: 1 to 20, the bulls, the rim and a miss. */
const stripLayout: readonly { label: string; hits: (AchievementLegalHit | undefined)[]; }[] = [
	...Array.from({ length: 20 }, (_, index) => ({
		label: String(index + 1),
		hits:  [ ThrowType.Triple, ThrowType.Double, ThrowType.Single ].map(type => legalHit(index + 1, type)),
	})),
	{
		label: 'Bull',
		hits:  [ undefined, legalHit(doubleBullLocation, ThrowType.Single), legalHit(bullLocation, ThrowType.Single) ],
	},
	{ label: 'Rim', hits: [ undefined, undefined, legalHit(0, ThrowType.Rim) ] },
	{ label: 'Miss', hits: [ undefined, undefined, legalHit(0, ThrowType.Miss) ] },
];

/** Which hints (by position in the list) each hit unlocks, by dart notation. */
const indexHintsByHit = (hints: readonly LastDartHint[]): Map<string, { hit: AchievementLegalHit; hintIndexes: number[]; }> => {
	const byKey: Map<string, { hit: AchievementLegalHit; hintIndexes: number[]; }> = new Map();
	hints.forEach((hint, index) => hint.winningHits.forEach(hit => {
		const key = formatHit(hit);
		const entry = byKey.get(key) ?? { hit, hintIndexes: [] };
		if (!entry.hintIndexes.includes(index))
			entry.hintIndexes.push(index);

		byKey.set(key, entry);
	}));

	return byKey;
};

/** The strip with every segment marked by the hints it unlocks. */
export function buildHintStrip(hints: readonly LastDartHint[]): HintColumn[] {
	const byKey = indexHintsByHit(hints);

	return stripLayout.map(column => ({
		label:    column.label,
		segments: column.hits.map(hit => {
			if (!hit)
				return undefined;

			const key = formatHit(hit);
			const hintIndexes = byKey.get(key)?.hintIndexes ?? [];

			return {
				hit,
				key,
				hintIndexes,
				count:       hintIndexes.length,
				highestTier: getHighestTier(hintIndexes.map(index => hints[index]!)),
			};
		}),
	}));
}

// ── The best throw ───────────────────────────────────────────────────────────

/**
 * How likely a throw aimed at a kind of segment lands, relative to a single. A single is big
 * and forgiving; a treble is small but sits inside the board; the bulls are small targets;
 * a double is the riskiest, since going for it so often ends on the wire or off the board.
 */
export const throwDifficulty: Readonly<Record<HitKind, number>> = {
	'single':     1,
	'treble':     0.3,
	'outer-bull': 0.22,
	'bull':       0.15,
	'double':     0.1,
	'off-board':  0.1,
};

/** MMR per achievement tier; the season's own rewards, or the defaults. */
export type TierRewards = Readonly<Partial<Record<AchievementTier, number>>>;

export interface ThrowPayoff {
	hit:         AchievementLegalHit;
	key:         string;
	/** The hints (by position in the list) this throw unlocks. */
	hintIndexes: number[];
	/** What the achievements it unlocks are worth. */
	mmr:         number;
	/** `mmr` weighed by how hard the throw is: what aiming for it is worth. */
	payoff:      number;
}

/**
 * Every throw that unlocks something, best first: the highest expected payoff, then the one
 * that unlocks more, then the easier one. A single that unlocks a few bronzes beats a double
 * that unlocks a gold.
 */
export function rankThrows(hints: readonly LastDartHint[], tierRewards: TierRewards = {}): ThrowPayoff[] {
	const reward = (hint: LastDartHint): number => {
		const tier = hint.achievement.achievementTier as AchievementTier;

		return tierRewards[tier] ?? defaultAchievementRewards[tier] ?? 0;
	};

	return [ ...indexHintsByHit(hints).entries() ]
		.map(([ key, { hit, hintIndexes } ]) => {
			const mmr = hintIndexes.reduce((total, index) => total + reward(hints[index]!), 0);

			return { hit, key, hintIndexes, mmr, payoff: mmr * throwDifficulty[getHitKind(hit)] };
		})
		.sort((left, right) =>
			right.payoff - left.payoff
			|| right.hintIndexes.length - left.hintIndexes.length
			|| throwDifficulty[getHitKind(right.hit)] - throwDifficulty[getHitKind(left.hit)]);
}

export function getHighestTier(hints: readonly LastDartHint[]): AchievementTier | undefined {
	return hints.reduce<AchievementTier | undefined>((highest, hint) => {
		const tier = hint.achievement.achievementTier as AchievementTier;

		return highest === undefined || tier > highest ? tier : highest;
	}, undefined);
}

export interface HintGroup {
	/** "Score At Least 50 (Modified · Raw)" for achievements that differ only in brackets. */
	name:  string;
	hints: LastDartHint[];
}

const bracketPattern = /^(.*?)\s*\(([^)]*)\)$/;

/** Achievements as lines, joining names that differ only in brackets, in the server's order. */
export function groupByName(hints: readonly LastDartHint[]): HintGroup[] {
	const groups: Map<string, { kinds: string[]; hints: LastDartHint[]; }> = new Map();
	hints.forEach(hint => {
		const name = hint.achievement.renderedName;
		const match = bracketPattern.exec(name);
		const base = match?.[1] ?? name;
		const group = groups.get(base) ?? { kinds: [], hints: [] };
		if (match)
			group.kinds.push(match[2]!);

		group.hints.push(hint);
		groups.set(base, group);
	});

	return [ ...groups.entries() ].map(([ base, group ]) => ({
		name: group.hints.length > 1 && group.kinds.length === group.hints.length
			? `${ base } (${ group.kinds.join(' · ') })`
			: group.hints.length > 1 ? `${ base } ×${ group.hints.length }` : group.hints[0]!.achievement.renderedName,
		hints: group.hints,
	}));
}
