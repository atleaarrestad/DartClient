import { html, LitElement, nothing, unsafeCSS } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';

import {
	getAnimalImageUrl,
	getAnimalName,
	getReactionImageUrl,
	ReactionRateLimiter,
	SpectatorReactionDefinition,
	spectatorReactions,
} from '../../helpers/spectatorReactions.js';
import { placePopover } from '../../ui/anchored-popover.js';
import reactionPickerStyles from './aa-reaction-picker.css?inline';

export interface ReactionPickDetail {
	reaction: string;
}

/**
 * The spectator's React button and its tray: who they are (their animal) and their allowance,
 * then the reactions. The tray stays open for repeated taps and closes on a tap outside, on
 * Escape or on the button. A spectator may send 5 reactions in any 5 seconds, like on the
 * server: five dots show what is left, a used dot fills up again over its 5 seconds, and
 * with none left the grid dims. Emits `reaction-pick`; the page sends it.
 */
@customElement('aa-reaction-picker')
export class AaReactionPicker extends LitElement {

	/** The spectator's animal key; undefined until the server names them. */
	@property() animal?: string;
	/** Whether live sync is up, so a reaction can go out. */
	@property({ type: Boolean }) available = false;

	@state() private open = false;
	/** Bumped whenever the allowance changes, so the dots and the grid follow it. */
	@state() private allowanceChanges = 0;
	@query('.toggle') private toggleButton!: HTMLButtonElement;
	@query('.tray') private tray!:           HTMLElement;

	private readonly limiter = new ReactionRateLimiter();
	private refillTimer?: ReturnType<typeof setTimeout>;
	private openedFromKeyboard = false;
	private readonly onWindowResize = () => this.placeTray();

	override disconnectedCallback(): void {
		super.disconnectedCallback();
		clearTimeout(this.refillTimer);
		this.refillTimer = undefined;
		window.removeEventListener('resize', this.onWindowResize);
	}

	private onToggleClick(event: MouseEvent): void {
		// A click from Enter or Space has no pointer detail; the tray then takes focus.
		this.openedFromKeyboard = event.detail === 0;
	}

	private onTrayToggle(event: ToggleEvent): void {
		this.open = event.newState === 'open';
		if (!this.open) {
			window.removeEventListener('resize', this.onWindowResize);

			return;
		}

		this.placeTray();
		window.addEventListener('resize', this.onWindowResize);
		if (this.openedFromKeyboard)
			this.renderRoot.querySelector<HTMLButtonElement>('.reaction')?.focus();
	}

	private placeTray(): void {
		placePopover(this.tray, this.toggleButton, 8, 'center');
	}

	private pick(reaction: SpectatorReactionDefinition): void {
		if (!this.available || !this.limiter.tryTake())
			return;

		this.dispatchEvent(new CustomEvent<ReactionPickDetail>('reaction-pick', {
			detail:   { reaction: reaction.key },
			bubbles:  true,
			composed: true,
		}));
		this.onAllowanceChanged();
	}

	/** Redraws the allowance now, and again when the next used reaction comes back. */
	private onAllowanceChanged(): void {
		this.allowanceChanges++;
		clearTimeout(this.refillTimer);
		this.refillTimer = undefined;

		const wait = this.limiter.msUntilRefill();
		if (wait > 0)
			this.refillTimer = setTimeout(() => this.onAllowanceChanged(), wait);
	}

	/**
	 * Five dots: ready ones full, used ones filling up again over their 5 seconds, the one
	 * that comes back first nearest the ready ones.
	 */
	private renderAllowance(): unknown {
		const { limit, windowMs } = this.limiter;
		const ready = this.limiter.available();
		const dots = [
			...Array.from({ length: ready }, (_, index) => ({ key: `ready-${ index }`, progress: undefined })),
			...this.limiter.used().map(used => ({ key: `used-${ used.sentAt }`, progress: used.progress })),
		];

		return html`
			<span
				class="allowance"
				role="img"
				aria-label=${ `${ ready } of ${ limit } reactions ready` }
				title=${ `${ limit } reactions every ${ windowMs / 1000 } seconds` }
			>
				${ repeat(dots, dot => dot.key, dot => dot.progress === undefined
					? html`<span class="dot dot--ready"></span>`
					: html`<span
						class="dot dot--refilling"
						style=${ styleMap({
							'--refill-duration': `${ windowMs }ms`,
							'--refill-delay':    `${ -Math.round(dot.progress * windowMs) }ms`,
						}) }
					></span>`) }
			</span>
		`;
	}

	/** Who the spectator is. Offline it says so instead: a reconnect brings a new animal. */
	private renderIdentity(): unknown {
		if (!this.available || !this.animal) {
			return html`
				<p class="identity identity--pending">
					<span class="identity__avatar" aria-hidden="true"></span>
					${ this.available ? 'Picking your animal…' : 'Reconnecting…' }
				</p>
			`;
		}

		const avatar = getAnimalImageUrl(this.animal);

		return html`
			<p class="identity">
				${ avatar
					? html`<img class="identity__avatar" src=${ avatar } alt="" width="28" height="28">`
					: html`<span class="identity__avatar" aria-hidden="true"></span>` }
				<span>You're the <strong>${ getAnimalName(this.animal) }</strong></span>
			</p>
		`;
	}

	private renderReaction(reaction: SpectatorReactionDefinition, exhausted: boolean): unknown {
		return html`
			<button
				class=${ classMap({
					'reaction':                      true,
					[`reaction--${ reaction.key }`]: !!reaction.sticker,
				}) }
				type="button"
				title=${ reaction.label }
				aria-label=${ reaction.label }
				aria-disabled=${ exhausted ? 'true' : 'false' }
				?disabled=${ !this.available }
				@click=${ () => this.pick(reaction) }
			>
				${ reaction.sticker
					? html`<span class="reaction__sticker">${ reaction.sticker }</span>`
					: html`<img class="reaction__picture" src=${ getReactionImageUrl(reaction.key) } alt="" width="34" height="34">` }
				${ reaction.tag ? html`<span class="reaction__tag">${ reaction.tag }</span>` : nothing }
			</button>
		`;
	}

	override render(): unknown {
		const exhausted = this.limiter.available() === 0;

		return html`
			<button
				class="toggle"
				type="button"
				popovertarget="reaction-tray"
				aria-expanded=${ this.open ? 'true' : 'false' }
				aria-controls="reaction-tray"
				@click=${ this.onToggleClick }
			>
				<img class="toggle__icon" src=${ getReactionImageUrl('wow') } alt="" width="20" height="20">
				React
			</button>

			<div
				id="reaction-tray"
				class="tray"
				popover="auto"
				role="dialog"
				aria-label="Send a reaction"
				@toggle=${ this.onTrayToggle }
			>
				<div class="tray__header">
					${ this.renderIdentity() }
					${ this.renderAllowance() }
				</div>
				<div
					class=${ classMap({ 'grid': true, 'grid--exhausted': exhausted }) }
					role="group"
					aria-label="Reactions"
				>
					${ spectatorReactions.map(reaction => this.renderReaction(reaction, exhausted)) }
				</div>
			</div>
		`;
	}

	static override styles = unsafeCSS(reactionPickerStyles);

}

declare global {
	interface HTMLElementTagNameMap {
		'aa-reaction-picker': AaReactionPicker;
	}

	interface HTMLElementEventMap {
		'reaction-pick': CustomEvent<ReactionPickDetail>;
	}
}
