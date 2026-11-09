import { describe, expect, it } from 'vitest';

import {
	getAnimalImageUrl,
	getAnimalName,
	getSpectatorReaction,
	ReactionRateLimiter,
	spectatorAnimals,
	spectatorReactions,
} from './spectatorReactions.js';

// Only the file names are used: Vite lists the files without loading them.
const shippedEmoji = new Set(Object.keys(import.meta.glob('/public/emoji/**/*'))
	.map(path => path.replace('/public/emoji/', '')));

describe('spectator reactions', () => {
	it('ships a picture for every picture reaction and every animal', () => {
		const missing = [
			...spectatorReactions
				.filter(reaction => !reaction.sticker)
				.map(reaction => `reactions/${ reaction.key }.svg`),
			...[ ...spectatorAnimals.keys() ].map(animal => `animals/${ animal }.svg`),
		].filter(path => !shippedEmoji.has(path));

		expect(missing).toEqual([]);
		expect(shippedEmoji.has('LICENSE')).toBe(true);
	});

	it('names animals, including ones this client has no artwork for', () => {
		expect(getAnimalName('polar-bear')).toBe('Polar bear');
		expect(getAnimalName('red-panda')).toBe('Red panda');
		expect(getAnimalName('')).toBe('Spectator');
		expect(getAnimalImageUrl('giraffe')).toMatch(/emoji\/animals\/giraffe\.svg$/u);
		expect(getAnimalImageUrl('red-panda')).toBeUndefined();
	});

	it('ignores reactions it does not know', () => {
		expect(getSpectatorReaction('fire')?.label).toBe('On fire');
		expect(getSpectatorReaction('constructor')).toBeUndefined();
	});
});

describe('ReactionRateLimiter', () => {
	const createLimiter = () => {
		let now = 0;
		const limiter = new ReactionRateLimiter(5, 5000, () => now);

		return { limiter, advance: (ms: number) => { now += ms; } };
	};

	it('allows five at once, then waits for the window', () => {
		const { limiter, advance } = createLimiter();

		for (let index = 0; index < 5; index++)
			expect(limiter.tryTake()).toBe(true);
		expect(limiter.tryTake()).toBe(false);
		expect(limiter.available()).toBe(0);
		expect(limiter.msUntilRefill()).toBe(5000);

		advance(4999);
		expect(limiter.tryTake()).toBe(false);

		advance(1);
		expect(limiter.available()).toBe(5);
		expect(limiter.msUntilRefill()).toBe(0);
	});

	it('gives each reaction back a window after it was sent', () => {
		const { limiter, advance } = createLimiter();
		for (let index = 0; index < 5; index++) {
			limiter.tryTake();
			advance(1000);
		}

		// At 5 s the first (sent at 0 s) is back; the second comes back at 6 s.
		expect(limiter.available()).toBe(1);
		expect(limiter.msUntilRefill()).toBe(1000);
		expect(limiter.used().map(used => used.progress)).toEqual([ 0.8, 0.6, 0.4, 0.2 ]);
		expect(limiter.tryTake()).toBe(true);
		expect(limiter.tryTake()).toBe(false);
	});
});
