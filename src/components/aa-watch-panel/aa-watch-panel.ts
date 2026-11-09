import type { PropertyValues } from 'lit';
import { html, LitElement, nothing, unsafeCSS } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { repeat } from 'lit/directives/repeat.js';
import { encode } from 'uqr';

import { faIcons } from '../../faIcons.js';
import { getAnimalImageUrl, getAnimalName } from '../../helpers/spectatorReactions.js';
import watchPanelStyles from './aa-watch-panel.css?inline';

/** The white margin round the code, in modules, that scanners need to find its edges. */
const quietZone = 2;
/** The crowd shows this many avatars, the newest arrivals; the rest are counted. */
const maximumCrowdAvatars = 5;
/** How long a spectator's avatar hops after they react. */
const cheerMs = 450;

const listFormat = new Intl.ListFormat('en', { type: 'conjunction' });

/**
 * Watching the game, in one panel at the foot of the side column: a QR code of the game's
 * spectate link (on the players' page), so someone in the room points their phone at the
 * screen and the game opens for them, and the crowd already watching, as the animals the
 * server names spectators after. A spectator's avatar hops when they react, so the players
 * see who cheered without reading. Without a link (the spectate page) it is the crowd alone.
 *
 * The page hands it the spectators directly (`spectators`), not through a render, so a
 * spectator arriving never re-renders the board.
 */
@customElement('aa-watch-panel')
export class AaWatchPanel extends LitElement {

	/** The link the QR code opens; none shows no code. */
	@property({ type: String }) url = '';
	/** The animals watching, in arrival order. */
	@property({ attribute: false }) spectators: readonly string[] = [];
	/** Spectators whose avatar is hopping because they just reacted. */
	@state() private cheering:                  ReadonlySet<string> = new Set();

	/** The dark modules as one SVG path, and the code's width in modules. */
	private modules = '';
	private size = 0;
	private readonly cheerTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

	override disconnectedCallback(): void {
		super.disconnectedCallback();
		this.cheerTimers.forEach(timer => clearTimeout(timer));
		this.cheerTimers.clear();
		this.cheering = new Set();
	}

	/** The spectator's avatar hops: they just reacted. */
	cheer(animal: string): void {
		if (!this.spectators.includes(animal))
			return;

		clearTimeout(this.cheerTimers.get(animal));
		this.cheering = new Set([ ...this.cheering, animal ]);
		this.cheerTimers.set(animal, setTimeout(() => {
			this.cheerTimers.delete(animal);
			this.cheering = new Set([ ...this.cheering ].filter(other => other !== animal));
		}, cheerMs));
	}

	protected override willUpdate(changedProperties: PropertyValues<this>): void {
		if (!changedProperties.has('url'))
			return;

		if (!this.url) {
			this.modules = '';
			this.size = 0;

			return;
		}

		// Medium error correction: glare on the screen or a slanted phone still scans.
		const { data, size } = encode(this.url, { ecc: 'M', border: 0 });
		this.size = size;
		this.modules = data
			.flatMap((row, y) => row.flatMap((dark, x) => dark ? [ `M${ x } ${ y }h1v1h-1z` ] : []))
			.join('');
	}

	override render(): unknown {
		if (!this.url && this.spectators.length === 0)
			return nothing;

		return html`
			<section class=${ classMap({ 'panel': true, 'panel--code': !!this.url }) } aria-label="Watching this game">
				${ this.url ? this.renderCode() : nothing }
				<div class="panel__text">
					${ this.url ? html`<span class="panel__title">Scan to watch</span>` : nothing }
					${ this.renderCrowd() }
				</div>
			</section>
		`;
	}

	private renderCode(): unknown {
		const extent = this.size + 2 * quietZone;

		return html`
			<svg
				class="code"
				viewBox="${ -quietZone } ${ -quietZone } ${ extent } ${ extent }"
				role="img"
				aria-label="QR code that opens this game for watching on a phone"
			>
				<rect class="code__paper" x=${ -quietZone } y=${ -quietZone } width=${ extent } height=${ extent }></rect>
				<path class="code__modules" d=${ this.modules }></path>
			</svg>
		`;
	}

	/** The eye, the newest arrivals' avatars, and how many watch. */
	private renderCrowd(): unknown {
		const count = this.spectators.length;
		if (count === 0) {
			return html`
				<span class="crowd crowd--empty"><i class="fa-solid fa-eye" aria-hidden="true"></i>No one watching yet</span>
			`;
		}

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
			<span class="crowd" role="img" aria-label=${ label } title=${ label }>
				<i class="fa-solid fa-eye" aria-hidden="true"></i>
				<span class="crowd__avatars">
					${ repeat(keyed, ({ key }) => key, ({ animal }) => this.renderAvatar(animal)) }
				</span>
				<span class="crowd__count">${ count } watching</span>
			</span>
		`;
	}

	private renderAvatar(animal: string): unknown {
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

	static override styles = [ faIcons, unsafeCSS(watchPanelStyles) ];

}

declare global {
	interface HTMLElementTagNameMap {
		'aa-watch-panel': AaWatchPanel;
	}
}
