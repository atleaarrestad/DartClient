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
