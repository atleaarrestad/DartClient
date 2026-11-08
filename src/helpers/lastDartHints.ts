import type {
	AchievementLegalHit,
	LastDartHint,
} from '../models/achievementBuilderApi.js';
import { AchievementTier, RoundStatus, ThrowType } from '../models/enums.js';
import type { MmrConfiguration, PlayerRounds, Round } from '../models/schemas.js';
import { bullLocation, doubleBullLocation } from './dartboard.js';
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

/**
 * The round whose last dart the player is about to throw, or undefined when that isn't the
 * case (fewer than two darts down, the round over, the game won). Hints are asked for then.
 */
export function getLastDartRoundIndex(player: PlayerRounds): number | undefined {
	const current = player.rounds.find(round => round.dartThrows.some(isPlaceholderThrow));

	return current && isLastDartWindowOpen(player, current.roundIndex) ? current.roundIndex : undefined;
}

/**
 * Whether the dart at this position is the player's last dart and it is up now: the third
 * dart of the round whose first two are down. Hints are only ever for such a dart.
 */
export function isLastDartUp(player: PlayerRounds, position: { roundIndex: number; throwIndex: number; }): boolean {
	return position.throwIndex === 2 && getLastDartRoundIndex(player) === position.roundIndex;
}

/**
 * How a hit reads to a player, where dart notation would mislead: the notation's "Bull" (50)
 * is the double bull, since players call the 25 the bull. Everything else reads as notation.
 */
export function describeHit(hit: AchievementLegalHit): string {
	return hit.hitLocation === doubleBullLocation && hit.throwType === ThrowType.Single
		? 'Double Bull'
		: formatHit(hit);
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

const throwTypesByLetter: Readonly<Record<string, ThrowType>> = {
	S: ThrowType.Single,
	D: ThrowType.Double,
	T: ThrowType.Triple,
};

/** Reads dart notation back (the server sends hits this way), or undefined for anything else. */
export function parseHit(code: string): AchievementLegalHit | undefined {
	switch (code) {
	case 'Rim':
		return { hitLocation: 0, throwType: ThrowType.Rim };
	case 'Miss':
		return { hitLocation: 0, throwType: ThrowType.Miss };
	case 'Bull':
		return { hitLocation: doubleBullLocation, throwType: ThrowType.Single };
	case String(bullLocation):
		return { hitLocation: bullLocation, throwType: ThrowType.Single };
	}

	const match = /^([SDT])(\d{1,2})$/.exec(code);
	const hitLocation = Number(match?.[2]);

	return match && hitLocation >= 1 && hitLocation <= 20
		? { hitLocation, throwType: throwTypesByLetter[match[1]!]! }
		: undefined;
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

/** Which hints (by position in the list) each hit unlocks, by dart notation. Unknown codes are skipped. */
const indexHintsByHit = (hints: readonly LastDartHint[]): Map<string, { hit: AchievementLegalHit; hintIndexes: number[]; }> => {
	const byKey: Map<string, { hit: AchievementLegalHit; hintIndexes: number[]; }> = new Map();
	hints.forEach((hint, index) => hint.hits.forEach(code => {
		const hit = parseHit(code);
		if (!hit)
			return;

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

/** How many steps the colour of a lit segment has, from pale to strong. */
export const heatLevels = 4;

/**
 * How strongly to colour a segment that unlocks `count` achievements, from 1 (pale) to
 * `heatLevels` (strong), against `most`, the most any segment on the board unlocks.
 */
export function getHeatLevel(count: number, most: number): number {
	if (count <= 0 || most <= 0)
		return 0;

	return Math.min(heatLevels, Math.max(1, Math.ceil(count / most * heatLevels)));
}

// ── The best throw ───────────────────────────────────────────────────────────

/**
 * How likely a throw aimed at a kind of segment lands, relative to a single: easiest first,
 * single, treble, 25, bull, double. A single is big and forgiving; a treble is small but sits
 * inside the board; the bulls are small targets; a double is the hardest. Its risk is also in
 * where misses go (see `missFallbackChance`): a missed treble still lands in its number on
 * either side, a missed double only on the inside, otherwise on the wire or off the board.
 */
export const throwDifficulty: Readonly<Record<HitKind, number>> = {
	'single':     1,
	'treble':     0.3,
	'outer-bull': 0.25,
	'bull':       0.2,
	'double':     0.18,
	'off-board':  0.1,
};

/**
 * Where a dart that misses a treble, a double or the bull mostly lands instead, and how often
 * (on the same scale as `throwDifficulty`): a treble or double that misses usually stays in
 * the single of the same number, a missed bull often lands in the 25. Aiming there is also
 * worth that share of what the fallback unlocks.
 */
export const missFallbackChance: Readonly<Partial<Record<HitKind, number>>> = {
	treble: 0.55,
	double: 0.35,
	bull:   0.35,
};

const getMissFallback = (hit: AchievementLegalHit): AchievementLegalHit | undefined => {
	switch (getHitKind(hit)) {
	case 'treble':
	case 'double':
		return { hitLocation: hit.hitLocation, throwType: ThrowType.Single };
	case 'bull':
		return { hitLocation: bullLocation, throwType: ThrowType.Single };
	default:
		return undefined;
	}
};

/** MMR per achievement tier; the season's own rewards, or the defaults. */
export type TierRewards = Readonly<Partial<Record<AchievementTier, number>>>;

/** What the outcomes of a dart are worth, besides the achievements in the hints. */
export interface ThrowValues {
	tierRewards?:  TierRewards;
	/** The darts that win the game, in dart notation. */
	victoryHits?:  readonly string[];
	/** What winning the game with this dart is worth, in MMR; see `getFinishValue`. */
	victoryValue?: number;
}

export interface ThrowPayoff {
	hit:         AchievementLegalHit;
	key:         string;
	/** The hints (by position in the list) this throw unlocks. */
	hintIndexes: number[];
	/** What the achievements it unlocks are worth. */
	mmr:         number;
	/** It wins the game. */
	wins:        boolean;
	/**
	 * What aiming at it is worth: what hitting it is worth (achievements, and the win) times
	 * the chance of hitting it, plus the same for where a miss mostly lands instead.
	 */
	payoff:      number;
}

/**
 * Every throw worth aiming at, best first: the highest expected payoff, then the one that
 * unlocks more, then the easier one. A single that unlocks a few bronzes beats a double that
 * unlocks a gold; but a double that unlocks everything its single does and much more, or that
 * wins the game, is worth going for, since a miss usually still lands in that single.
 */
export function rankThrows(hints: readonly LastDartHint[], values: ThrowValues = {}): ThrowPayoff[] {
	const { tierRewards = {}, victoryHits = [], victoryValue = 0 } = values;
	const reward = (hint: LastDartHint): number => {
		const tier = hint.tier as AchievementTier;

		return tierRewards[tier] ?? defaultAchievementRewards[tier] ?? 0;
	};

	const byKey = indexHintsByHit(hints);
	for (const code of victoryHits) {
		const hit = parseHit(code);
		if (hit && !byKey.has(code))
			byKey.set(code, { hit, hintIndexes: [] });
	}

	const outcomes = new Map([ ...byKey ].map(([ key, { hit, hintIndexes } ]) => {
		const mmr = hintIndexes.reduce((total, index) => total + reward(hints[index]!), 0);
		const wins = victoryHits.includes(key);

		return [ key, { hit, hintIndexes, mmr, wins, worth: mmr + (wins ? victoryValue : 0) } ];
	}));
	const worthOf = (hit: AchievementLegalHit | undefined): number =>
		hit ? outcomes.get(formatHit(hit))?.worth ?? 0 : 0;

	return [ ...outcomes ]
		.map(([ key, { hit, hintIndexes, mmr, wins, worth } ]) => {
			const kind = getHitKind(hit);
			const payoff = worth * throwDifficulty[kind]
				+ worthOf(getMissFallback(hit)) * (missFallbackChance[kind] ?? 0);

			return { hit, key, hintIndexes, mmr, wins, payoff };
		})
		.sort((left, right) =>
			right.payoff - left.payoff
			|| right.hintIndexes.length - left.hintIndexes.length
			|| throwDifficulty[getHitKind(right.hit)] - throwDifficulty[getHitKind(left.hit)]);
}

/**
 * What finishing the game is worth in the season's match MMR: the placement bonus for the
 * place it would take, plus the finish bonus less the round penalty for every round played
 * (as the server works it out, before the opponent factor).
 */
export function getFinishValue(
	{ placementBonus, finishBonus, roundPenalty }: Pick<MmrConfiguration, 'placementBonus' | 'finishBonus' | 'roundPenalty'>,
	roundsPlayed: number,
	placement: number,
): number {
	const finish = Math.min(Math.max(finishBonus - roundPenalty * roundsPlayed, 0), finishBonus);

	return Math.floor(placementBonus / Math.max(1, placement)) + finish;
}

export function getHighestTier(hints: readonly LastDartHint[]): AchievementTier | undefined {
	return hints.reduce<AchievementTier | undefined>((highest, hint) => {
		const tier = hint.tier as AchievementTier;

		return highest === undefined || tier > highest ? tier : highest;
	}, undefined);
}

export interface HintGroup {
	/** "Score At Least 50 (Modified, Raw)" for achievements that differ only in brackets. */
	name:  string;
	hints: LastDartHint[];
}

const bracketPattern = /^(.*?)\s*\(([^)]*)\)$/;

/** Achievements as lines, joining names that differ only in brackets, in the server's order. */
export function groupByName(hints: readonly LastDartHint[]): HintGroup[] {
	const groups: Map<string, { kinds: string[]; hints: LastDartHint[]; }> = new Map();
	hints.forEach(hint => {
		const match = bracketPattern.exec(hint.name);
		const base = match?.[1] ?? hint.name;
		const group = groups.get(base) ?? { kinds: [], hints: [] };
		if (match)
			group.kinds.push(match[2]!);

		group.hints.push(hint);
		groups.set(base, group);
	});

	return [ ...groups.entries() ].map(([ base, group ]) => ({
		name: group.hints.length > 1 && group.kinds.length === group.hints.length
			? `${ base } (${ group.kinds.join(', ') })`
			: group.hints.length > 1 ? `${ base } ×${ group.hints.length }` : group.hints[0]!.name,
		hints: group.hints,
	}));
}
