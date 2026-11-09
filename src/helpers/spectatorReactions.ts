import { getAbsoluteBase } from '../getAbsoluteBase.js';

/**
 * Spectator reactions. The server knows only the keys (`SpectatorReactionRegistry` in the
 * backend); this file gives them their look. The artwork is Fluent Emoji Flat (MIT,
 * `public/emoji/LICENSE`), shipped with the app so every device shows the same picture.
 */
export interface SpectatorReactionDefinition {
	readonly key:      string;
	/** What the reaction says, for the tooltip and screen readers. */
	readonly label:    string;
	/** A darts call shown as a text sticker instead of a picture. */
	readonly sticker?: string;
	/** A darts call on a small tag stuck to the picture's corner. */
	readonly tag?:     string;
}

/** In the order the picker shows them: cheers first, then laughs and groans, then calls. */
export const spectatorReactions: readonly SpectatorReactionDefinition[] = [
	{ key: 'fire', label: 'On fire' },
	{ key: 'clap', label: 'Applause' },
	{ key: 'party', label: 'Party' },
	{ key: 'bullseye', label: 'Bullseye' },
	{ key: 'wow', label: 'Wow' },
	{ key: 'haha', label: 'Haha' },
	{ key: 'mind-blown', label: 'Mind blown' },
	{ key: 'oof', label: 'Oof' },
	{ key: '180', label: '180', sticker: '180!' },
	// Can't watch: the monkey covering its eyes over the classic poor round, 20 + 5 + 1.
	{ key: '26', label: 'Bed and breakfast (26)', tag: '26' },
];

const reactionsByKey = new Map(spectatorReactions.map(reaction => [ reaction.key, reaction ]));

/** The reaction for a key, or undefined for one this client doesn't know (a newer server). */
export const getSpectatorReaction = (key: string): SpectatorReactionDefinition | undefined =>
	reactionsByKey.get(key);

export const getReactionImageUrl = (key: string): string =>
	`${ getAbsoluteBase() }emoji/reactions/${ key }.svg`;

/** The animals the server names spectators after, by key. */
export const spectatorAnimals: ReadonlyMap<string, string> = new Map([
	[ 'giraffe', 'Giraffe' ],
	[ 'elephant', 'Elephant' ],
	[ 'hippo', 'Hippo' ],
	[ 'lion', 'Lion' ],
	[ 'tiger', 'Tiger' ],
	[ 'panda', 'Panda' ],
	[ 'koala', 'Koala' ],
	[ 'penguin', 'Penguin' ],
	[ 'owl', 'Owl' ],
	[ 'fox', 'Fox' ],
	[ 'zebra', 'Zebra' ],
	[ 'kangaroo', 'Kangaroo' ],
	[ 'sloth', 'Sloth' ],
	[ 'otter', 'Otter' ],
	[ 'hedgehog', 'Hedgehog' ],
	[ 'flamingo', 'Flamingo' ],
	[ 'parrot', 'Parrot' ],
	[ 'peacock', 'Peacock' ],
	[ 'dolphin', 'Dolphin' ],
	[ 'octopus', 'Octopus' ],
	[ 'turtle', 'Turtle' ],
	[ 'crocodile', 'Crocodile' ],
	[ 'frog', 'Frog' ],
	[ 'rabbit', 'Rabbit' ],
	[ 'bear', 'Bear' ],
	[ 'monkey', 'Monkey' ],
	[ 'gorilla', 'Gorilla' ],
	[ 'llama', 'Llama' ],
	[ 'rhino', 'Rhino' ],
	[ 'bison', 'Bison' ],
	[ 'beaver', 'Beaver' ],
	[ 'raccoon', 'Raccoon' ],
	[ 'badger', 'Badger' ],
	[ 'seal', 'Seal' ],
	[ 'swan', 'Swan' ],
	[ 'polar-bear', 'Polar bear' ],
	[ 'orangutan', 'Orangutan' ],
	[ 'hamster', 'Hamster' ],
	[ 'unicorn', 'Unicorn' ],
	[ 'dodo', 'Dodo' ],
	[ 'mammoth', 'Mammoth' ],
	[ 'camel', 'Camel' ],
	[ 'wolf', 'Wolf' ],
	[ 'eagle', 'Eagle' ],
	[ 'chipmunk', 'Chipmunk' ],
	[ 'butterfly', 'Butterfly' ],
]);

/** "polar-bear" → "Polar bear"; an animal this client doesn't know still gets a readable name. */
export const getAnimalName = (key: string): string => {
	const known = spectatorAnimals.get(key);
	if (known)
		return known;

	const words = key.replaceAll('-', ' ').trim();

	return words ? words[0]!.toUpperCase() + words.slice(1) : 'Spectator';
};

/** The animal's picture, or undefined for one this client has no artwork for. */
export const getAnimalImageUrl = (key: string): string | undefined =>
	spectatorAnimals.has(key) ? `${ getAbsoluteBase() }emoji/animals/${ key }.svg` : undefined;

/** A used reaction: when it was sent, and how far through its wait it is (0–1). */
export interface UsedReaction {
	readonly sentAt:   number;
	readonly progress: number;
}

/**
 * A spectator may send `limit` reactions in any `windowMs`: five at once, then each comes
 * back a window after it was sent. The server keeps the same rule, with a window 250 ms
 * shorter, so network jitter never rejects a reaction this limiter let through.
 */
export class ReactionRateLimiter {

	private sentAt: number[] = [];

	constructor(
		readonly limit = 5,
		readonly windowMs = 5000,
		private readonly now: () => number = () => performance.now(),
	) {}

	/** Uses one reaction, if there is one. */
	tryTake(): boolean {
		this.forgetExpired();
		if (this.sentAt.length >= this.limit)
			return false;

		this.sentAt.push(this.now());

		return true;
	}

	/** How many reactions can go out now. */
	available(): number {
		this.forgetExpired();

		return this.limit - this.sentAt.length;
	}

	/** The reactions still inside the window, the one that comes back first first. */
	used(): UsedReaction[] {
		this.forgetExpired();
		const now = this.now();

		return this.sentAt.map(sentAt => ({ sentAt, progress: (now - sentAt) / this.windowMs }));
	}

	/** How long until the next used reaction comes back; 0 when none is used. */
	msUntilRefill(): number {
		this.forgetExpired();
		const oldest = this.sentAt[0];

		return oldest === undefined ? 0 : Math.max(0, Math.ceil(oldest + this.windowMs - this.now()));
	}

	private forgetExpired(): void {
		const now = this.now();
		while (this.sentAt.length > 0 && now - this.sentAt[0]! >= this.windowMs)
			this.sentAt.shift();
	}

}
