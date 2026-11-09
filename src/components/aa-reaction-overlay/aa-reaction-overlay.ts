import { html, LitElement, nothing, unsafeCSS } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';

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
 * Spectators' reactions rising over the side column, out of the watch panel at its foot
 * (where the crowd is, see `aa-watch-panel`). A reaction floats up: the picture (or a sticker
 * for a darts call) with the spectator's animal under it. Each float pops in, rises with a
 * sway and fades out after a few seconds. Everything animates transform and opacity only, and
 * the overlay owns its state, so reactions never re-render the board.
 */
@customElement('aa-reaction-overlay')
export class AaReactionOverlay extends LitElement {

	@state() private floats:        readonly ReactionFloat[] = [];
	private nextFloatId = 0;
	/** Where the last float started across the lane (0–1); the next one starts well apart. */
	private lastLane = Math.random();
	private readonly removalTimers: Set<ReturnType<typeof setTimeout>> = new Set();

	override connectedCallback(): void {
		super.connectedCallback();
		preloadReactionImages();
	}

	override disconnectedCallback(): void {
		super.disconnectedCallback();
		this.removalTimers.forEach(timer => clearTimeout(timer));
		this.removalTimers.clear();
		this.floats = [];
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

		const timer = setTimeout(() => {
			this.removalTimers.delete(timer);
			this.floats = this.floats.filter(other => other.id !== float.id);
		}, duration);
		this.removalTimers.add(timer);
	}

	override render(): unknown {
		return this.renderFloats();
	}

	private renderFloats(): unknown {
		return repeat(this.floats, float => float.id, float => {
			const { key, sticker, tag } = float.reaction;
			const avatar = getAnimalImageUrl(float.animal);
			const picture = html`<img class="picture" src=${ getReactionImageUrl(key) } alt="" width="72" height="72">`;

			return html`
				<div class="float" style=${ styleMap(float.style) }>
					<div class="float__body">
						${ sticker
							? html`<span class="sticker sticker--${ key }">${ sticker }</span>`
							: tag
								? html`<span class="tagged">${ picture }<span class="tag">${ tag }</span></span>`
								: picture }
						<span class="name">
							${ avatar ? html`<img class="name__avatar" src=${ avatar } alt="" width="20" height="20">` : nothing }
							${ getAnimalName(float.animal) }
						</span>
					</div>
				</div>
			`;
		});
	}

	static override styles = unsafeCSS(reactionOverlayStyles);

}

declare global {
	interface HTMLElementTagNameMap {
		'aa-reaction-overlay': AaReactionOverlay;
	}
}
