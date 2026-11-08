/** Board numbers clockwise from the top, in the order the backend's DartBoardHelper uses. */
export const dartboardNumbers: readonly number[] = [
	20,
	1,
	18,
	4,
	13,
	6,
	10,
	15,
	2,
	17,
	3,
	19,
	7,
	16,
	8,
	11,
	14,
	9,
	12,
	5,
];

/** The hit location of a single bull. */
export const bullLocation = 25;
/** The hit location of a double bull. */
export const doubleBullLocation = 50;

export type BoardSide = 'left' | 'right';

/** Whether a hit location exists on the board: 1–20, the bull or the double bull. */
export const isBoardLocation = (location: number): boolean =>
	(Number.isInteger(location) && location >= 1 && location <= 20)
	|| location === bullLocation
	|| location === doubleBullLocation;

/**
 * The number next to a board number. Left is the previous number clockwise, matching the
 * backend's `ResolveBoardNeighbor` (left of 20 is 5, right of 20 is 1).
 */
export const getBoardNeighbor = (number: number, side: BoardSide): number | undefined => {
	const index = dartboardNumbers.indexOf(number);
	if (index < 0)
		return undefined;

	const count = dartboardNumbers.length;
	const offset = side === 'left' ? -1 : 1;

	return dartboardNumbers[(index + offset + count) % count];
};

/**
 * The dart ladder: board numbers in counting order, 1–20, then the bull and the double bull.
 * Matches the backend's AchievementLadder: one up from 20 is 25, one down from 25 is 20.
 */
export const dartLadder: readonly number[] = [
	...Array.from({ length: 20 }, (_, index) => index + 1),
	bullLocation,
	doubleBullLocation,
];

/** "1–20, 25, 50", for messages. */
export const dartLadderDescription = '1–20, 25, 50';

/** The number `offset` steps along the ladder from `number`, or undefined off the ladder. */
export const getLadderStep = (number: number, offset: number): number | undefined => {
	const index = dartLadder.indexOf(number);

	return index < 0 || !Number.isInteger(offset) ? undefined : dartLadder[index + offset];
};
