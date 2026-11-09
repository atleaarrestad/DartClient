import { html, LitElement, nothing, unsafeCSS } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';

import { faIcons } from '../../faIcons.js';
import {
	getAnimalImageUrl,
	getAnimalName,
	getReactionImageUrl,
	getSpectatorReaction,
	SpectatorReactionDefinition,
	spectatorReactions,
} from '../../helpers/spectatorReactions.js';
import reactionOverlayStyles from './aa-reaction-overlay.css?inline';

/** More than this on screen at once and new reactions are dropped: the board stays readable. */
const maximumFloats = 12;
/** The crowd shows this many avatars, the newest arrivals; the rest are a "+N". */
const maximumCrowdAvatars = 5;
/** How long a spectator's avatar hops after they react. */
const cheerMs = 450;

const listFormat = new Intl.ListFormat('en', { type: 'conjunction' });

interface ReactionFloat {
	readonly id:       number;
	readonly reaction: SpectatorReactionDefinition;
	readonly animal:   string;
	readonly style:    Readonly<Record<string, string>>;
}

const between = (minimum: number, maximum: number): number =>
	minimum + Math.random() * (maximum - minimum);

const randomSign = (): number => Math.random() < 0.5 ? -1 : 1;

let reactionImagesPreloaded = false;

/** Fetches the reaction pictures while the browser is idle, so the first float isn't empty. */
const preloadReactionImages = (): void => {
	if (reactionImagesPreloaded)
		return;

	reactionImagesPreloaded = true;
	const preload = () => {
		for (const reaction of spectatorReactions) {
			if (!reaction.sticker)
				new Image().src = getReactionImageUrl(reaction.key);
		}
	};

	if ('requestIdleCallback' in window)
		window.requestIdleCallback(preload, { timeout: 5000 });
	else
		setTimeout(preload, 1500);
};

/**
 * The crowd in the board's bottom-right corner and its reactions rising out of it.
 *
 * The crowd is an eye and the watching spectators' animal avatars; it is not there when nobody
 * watches. A reaction floats up the right edge: the picture (or a sticker for a darts call)
 * with the spectator's animal under it, while their avatar in the crowd hops. Each float pops
 * in, rises with a sway and fades out after a few seconds. Everything animates transform and
 * opacity only, and the overlay owns its state, so neither reactions nor arrivals re-render
 * the board.
 */
@customElement('aa-reaction-overlay')
export class AaReactionOverlay extends LitElement {

	/** The animals watching, in arrival order. */
	@property({ attribute: false }) spectators: readonly string[] = [];
	@state() private floats:                    readonly ReactionFloat[] = [];
	/** Spectators whose avatar is hopping because they just reacted. */
	@state() private cheering:                  ReadonlySet<string> = new Set();
	private nextFloatId = 0;
	/** Where the last float started across the lane (0–1); the next one starts well apart. */
	private lastLane = Math.random();
	private readonly removalTimers:             Set<ReturnType<typeof setTimeout>> = new Set();
	private readonly cheerTimers:               Map<string, ReturnType<typeof setTimeout>> = new Map();

	override connectedCallback(): void {
		super.connectedCallback();
		preloadReactionImages();
	}

	override disconnectedCallback(): void {
		super.disconnectedCallback();
		this.removalTimers.forEach(timer => clearTimeout(timer));
		this.removalTimers.clear();
		this.cheerTimers.forEach(timer => clearTimeout(timer));
		this.cheerTimers.clear();
		this.floats = [];
		this.cheering = new Set();
	}

	/**
	 * Floats a reaction. Unknown reactions are ignored, and so are reactions while the page is
	 * hidden or the screen is full, so they never pile up into a burst.
	 */
	show(reactionKey: string, animal: string): void {
		const reaction = getSpectatorReaction(reactionKey);
		if (!reaction || document.visibilityState === 'hidden' || this.floats.length >= maximumFloats)
			return;

		const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		const duration = Math.round(reducedMotion ? 2800 : between(3200, 4000));
		const height = this.clientHeight || window.innerHeight;
		this.lastLane = (this.lastLane + between(0.3, 0.7)) % 1;
		const float: ReactionFloat = {
			id:    this.nextFloatId++,
			reaction,
			animal,
			style: {
				'--lane':          this.lastLane.toFixed(3),
				// Reduced motion fades in place, at a random height instead of rising.
				'--start':         `${ Math.round(reducedMotion ? between(12, 48) : between(2, 8)) }%`,
				'--rise':          `${ Math.round(height * between(0.42, 0.58)) }px`,
				'--sway':          `${ Math.round(between(8, 18) * randomSign()) }px`,
				'--tilt':          `${ between(4, 9).toFixed(1) }deg`,
				'--duration':      `${ duration }ms`,
				'--sway-duration': `${ Math.round(between(1600, 2200)) }ms`,
				'--sticker-tilt':  `${ (between(3, 8) * randomSign()).toFixed(1) }deg`,
			},
		};

		this.floats = [ ...this.floats, float ];
		this.cheer(animal);

		const timer = setTimeout(() => {
			this.removalTimers.delete(timer);
			this.floats = this.floats.filter(other => other.id !== float.id);
		}, duration);
		this.removalTimers.add(timer);
	}

	/** The reacting spectator's avatar hops, so players see who cheered without reading. */
	private cheer(animal: string): void {
		if (!this.spectators.includes(animal))
			return;

		clearTimeout(this.cheerTimers.get(animal));
		this.cheering = new Set([ ...this.cheering, animal ]);
		this.cheerTimers.set(animal, setTimeout(() => {
			this.cheerTimers.delete(animal);
			this.cheering = new Set([ ...this.cheering ].filter(other => other !== animal));
		}, cheerMs));
	}

	override render(): unknown {
		return html`${ this.renderFloats() }${ this.renderCrowd() }`;
	}

	private renderCrowd(): unknown {
		const count = this.spectators.length;
		if (count === 0)
			return nothing;

		const shown = this.spectators.slice(-maximumCrowdAvatars);
		const label = `${ count } watching: ${ listFormat.format(this.spectators.map(getAnimalName)) }`;
		// Keys stay stable for each avatar, so only a new arrival pops in. The same animal
		// twice (more spectators than animals) gets a key per occurrence.
		const seen: Map<string, number> = new Map();
		const keyed = shown.map(animal => {
			const occurrence = (seen.get(animal) ?? 0) + 1;
			seen.set(animal, occurrence);

			return { animal, key: `${ animal }:${ occurrence }` };
		});

		return html`
			<div class="crowd" role="img" aria-label=${ label } title=${ label }>
				<i class="crowd__eye fa-solid fa-eye" aria-hidden="true"></i>
				<span class="crowd__avatars">
					${ repeat(keyed, ({ key }) => key, ({ animal }) => this.renderCrowdAvatar(animal)) }
				</span>
				${ count > shown.length ? html`<span class="crowd__more">+${ count - shown.length }</span>` : nothing }
			</div>
		`;
	}

	private renderCrowdAvatar(animal: string): unknown {
		const avatar = getAnimalImageUrl(animal);
		const pictureClasses = classMap({
			'crowd__picture':           true,
			'crowd__picture--cheering': this.cheering.has(animal),
		});

		return html`
			<span class="crowd__avatar">
				${ avatar
					? html`<img class=${ pictureClasses } src=${ avatar } alt="" width="20" height="20">`
					: html`<span class="crowd__initial">${ getAnimalName(animal)[0] }</span>` }
			</span>
		`;
	}

	private renderFloats(): unknown {
		return repeat(this.floats, float => float.id, float => {
			const { key, sticker } = float.reaction;
			const avatar = getAnimalImageUrl(float.animal);

			return html`
				<div class="float" style=${ styleMap(float.style) }>
					<div class="float__body">
						${ sticker
							? html`<span class="sticker sticker--${ key }">${ sticker }</span>`
							: html`<img class="picture" src=${ getReactionImageUrl(key) } alt="" width="72" height="72">` }
						<span class="name">
							${ avatar ? html`<img class="name__avatar" src=${ avatar } alt="" width="20" height="20">` : nothing }
							${ getAnimalName(float.animal) }
						</span>
					</div>
				</div>
			`;
		});
	}

	static override styles = [ faIcons, unsafeCSS(reactionOverlayStyles) ];

}

declare global {
	interface HTMLElementTagNameMap {
		'aa-reaction-overlay': AaReactionOverlay;
	}
}
