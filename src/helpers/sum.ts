export const sum = <T>(items: readonly T[], fn: (item: T) => number): number =>
	items.reduce((total, item) => total + fn(item), 0);
