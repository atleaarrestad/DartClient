export const sum = <T extends any[]>(arr: T, fn: (item: T[number]) => number): number =>
	arr.reduce((acc, item) => acc + fn(item), 0);
