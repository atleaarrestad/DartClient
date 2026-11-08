import {
	bullLocation,
	doubleBullLocation,
	getBoardNeighbor,
} from '../../../helpers/dartboard.js';
import {
	AchievementThrowType,
	AchievementValueDraft,
	throwTypeHasHitLocation,
} from '../../../models/achievementBuilder.js';
import type { ParameterBinding } from '../achievement-draft.js';

/** Every throw type a target can have across the blocks that use targets. */
export type TargetThrowType = 'any' | 'anyScoring' | AchievementThrowType;

/** Where a throw lands: a throw type and, unless it is rim or miss, an optional location. */
export interface HitTarget {
	throwType:    TargetThrowType;
	hitLocation?: AchievementValueDraft;
}

export type HitTargetContextId = 'throw' | 'throwCount' | 'winningThrow' | 'sequence' | 'progression';

export interface HitTargetContext {
	id:               HitTargetContextId;
	/** The types this block accepts, in the order the picker shows them. */
	throwTypes:       readonly TargetThrowType[];
	/** The type a target written without S/D/T gets. */
	defaultType:      TargetThrowType;
	/** Whether a location is required for the types that have one. */
	locationRequired: boolean;
}

const scoringAndOffBoard = [ 'single', 'double', 'triple', 'rim', 'miss' ] as const;

export const hitTargetContexts: Readonly<Record<HitTargetContextId, HitTargetContext>> = {
	throw:        { id: 'throw', throwTypes: [ 'any', ...scoringAndOffBoard ], defaultType: 'any', locationRequired: false },
	throwCount:   { id: 'throwCount', throwTypes: [ 'any', ...scoringAndOffBoard ], defaultType: 'any', locationRequired: false },
	winningThrow: {
		id:               'winningThrow',
		throwTypes:       [ 'any', 'single', 'double', 'triple' ],
		defaultType:      'any',
		locationRequired: false,
	},
	sequence: {
		id:               'sequence',
		throwTypes:       [ 'anyScoring', ...scoringAndOffBoard ],
		defaultType:      'anyScoring',
		locationRequired: true,
	},
	progression: {
		id:               'progression',
		throwTypes:       [ 'single', 'double', 'triple' ],
		defaultType:      'single',
		locationRequired: true,
	},
};

/**
 * Whether a location is the bull (25) or double bull (50). Darts on either are recorded as
 * singles, so a bull target always has the block's default type, never Double or Triple.
 */
export const isBullLocation = (value: AchievementValueDraft | undefined): boolean =>
	value?.source === 'constant'
	&& (value.value === String(bullLocation) || value.value === String(doubleBullLocation));

/** Rim and miss have no location; every other type can have one. */
export const targetTypeHasLocation = (throwType: TargetThrowType): boolean =>
	throwType === 'any' || throwType === 'anyScoring' || throwTypeHasHitLocation(throwType);

/**
 * The number a value stands for with the given parameter values, or undefined when it
 * depends on a parameter without a value (or isn't a number).
 */
export const resolveValueNumber = (
	value: AchievementValueDraft | undefined,
	binding: ParameterBinding | undefined,
): number | undefined => {
	if (!value)
		return undefined;

	const parameterNumber = (): number | undefined => {
		const bound = binding?.[value.value];

		return typeof bound === 'number' ? bound : undefined;
	};

	switch (value.source) {
	case 'constant': {
		const number = Number(value.value);

		return value.value.trim() !== '' && Number.isInteger(number) ? number : undefined;
	}
	case 'parameter':
		return parameterNumber();
	case 'parameter.offset': {
		const number = parameterNumber();

		return number === undefined ? undefined : number + (value.offset ?? 0);
	}
	case 'board.leftNeighbor':
	case 'board.rightNeighbor': {
		const number = parameterNumber();

		return number === undefined
			? undefined
			: getBoardNeighbor(number, value.source === 'board.leftNeighbor' ? 'left' : 'right');
	}
	default:
		return undefined;
	}
};

const typeLetters: Partial<Record<TargetThrowType, string>> = { single: 'S', double: 'D', triple: 'T' };

const typeNouns: Record<TargetThrowType, string> = {
	any:        'throw',
	anyScoring: 'scoring throw',
	single:     'single',
	double:     'double',
	triple:     'triple',
	rim:        'rim hit',
	miss:       'miss',
};

/**
 * A target as darts players say it, resolved for the preview values: "T7", "the bull",
 * "a double", "a rim hit". Unresolved parameters stay as "{n}".
 */
export const describeTarget = (target: HitTarget, binding?: ParameterBinding): string => {
	if (!target.hitLocation || !targetTypeHasLocation(target.throwType)) {
		const noun = typeNouns[target.throwType];

		return target.throwType === 'any' ? 'any throw' : `a ${ noun }`;
	}

	const resolved = resolveValueNumber(target.hitLocation, binding);
	const letter = typeLetters[target.throwType] ?? '';
	if (resolved === bullLocation)
		return letter === 'D' ? 'the double bull' : 'the bull';
	if (resolved === doubleBullLocation)
		return 'the double bull';

	const location = resolved === undefined ? formatUnresolvedLocation(target.hitLocation) : String(resolved);

	return `${ letter }${ location }`;
};

/** A location that depends on a parameter without a preview value. */
const formatUnresolvedLocation = (value: AchievementValueDraft): string => {
	switch (value.source) {
	case 'parameter':
		return `{${ value.value }}`;
	case 'parameter.offset': {
		const offset = value.offset ?? 0;

		return `{${ value.value }${ offset < 0 ? '-' : '+' }${ Math.abs(offset) }}`;
	}
	case 'board.leftNeighbor':
		return `{left ${ value.value }}`;
	case 'board.rightNeighbor':
		return `{right ${ value.value }}`;
	default:
		return value.value;
	}
};

const typeWords: Record<TargetThrowType, string> = {
	any:        '',
	anyScoring: '',
	single:     'single',
	double:     'double',
	triple:     'triple',
	rim:        'the rim',
	miss:       'a miss',
};

const formatLocationLabel = (value: AchievementValueDraft): string => {
	if (value.source === 'constant') {
		if (value.value === String(bullLocation))
			return 'Bull';
		if (value.value === String(doubleBullLocation))
			return 'D-Bull';
	}
	if (value.source === 'board.leftNeighbor')
		return `left of {${ value.value }}`;
	if (value.source === 'board.rightNeighbor')
		return `right of {${ value.value }}`;

	return formatUnresolvedLocation(value);
};

/** The label on a target chip: "triple {n}", "20", "any double", "Bull", "the rim". */
export const formatTargetLabel = (target: HitTarget): string => {
	const word = typeWords[target.throwType];
	if (!targetTypeHasLocation(target.throwType))
		return word;
	if (!target.hitLocation)
		return word ? `any ${ word }` : 'anything';

	const location = formatLocationLabel(target.hitLocation);
	// "Bull" already says what is hit; "single Bull" would only confuse.
	if (isBullLocation(target.hitLocation))
		return location;

	return word ? `${ word } ${ location }` : location;
};

/** One highlighted area of the board, in the shape `aa-dartboard` takes. */
export interface TargetBoardZone {
	number: number;
	ring:   'single' | 'double' | 'triple' | 'segment';
	tone?:  'primary' | 'secondary' | 'tertiary' | 'soft';
}

const ringFor = (throwType: TargetThrowType): TargetBoardZone['ring'] =>
	throwType === 'single' || throwType === 'double' || throwType === 'triple' ? throwType : 'segment';

/**
 * The board areas a target covers with the preview values. A target without a location covers
 * its ring on every number; a parameter without a preview value covers nothing.
 */
export const getTargetBoardZones = (
	target: HitTarget,
	binding: ParameterBinding | undefined,
	tone: TargetBoardZone['tone'] = 'primary',
): TargetBoardZone[] => {
	if (!targetTypeHasLocation(target.throwType))
		return [];

	const ring = ringFor(target.throwType);
	if (!target.hitLocation) {
		return ring === 'segment'
			? []
			: Array.from({ length: 20 }, (_, index) => ({ number: index + 1, ring, tone }));
	}

	const number = resolveValueNumber(target.hitLocation, binding);

	return number === undefined ? [] : [ { number, ring, tone } ];
};
