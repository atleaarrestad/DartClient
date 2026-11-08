import type { PropertyValues } from 'lit';
import { html, LitElement, nothing, TemplateResult, unsafeCSS } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { ref } from 'lit/directives/ref.js';

import { getAchievementTierIcon } from '../../helpers/achievementHelper.js';
import {
	buildHintStrip,
	describeHit,
	getHeatLevel,
	getHighestTier,
	getHitKind,
	groupByName,
	HintColumn,
	HintSegment,
	rankThrows,
	ThrowPayoff,
	TierRewards,
} from '../../helpers/lastDartHints.js';
import type { AchievementLegalHit, LastDartHint, LastDartHints } from '../../models/achievementBuilderApi.js';
import { AchievementTier } from '../../models/enums.js';
import { visuallyHiddenStyles } from '../../styles/shared-styles.js';
import lastDartHintsStyles from './aa-last-dart-hints.css?inline';

const rowLabels = [ 'T', 'D', 'S' ];

/**
 * What the throw gets, as parts that read as one line: "Win + 4 achievements (+65 MMR)",
 * "4 achievements (+65 MMR)" or "Win". The win leads: it matters most.
 */
const describeWorth = (count: number, chosen: ThrowPayoff): string[] => {
	if (count === 0)
		return chosen.wins ? [ 'Win' ] : [];

	return [
		...chosen.wins ? [ 'Win +' ] : [],
		`${ count } ${ count === 1 ? 'achievement' : 'achievements' }`,
		`(+${ chosen.mmr } MMR)`,
	];
};

/** The tile's text: the throw in big type, the double bull as two words on two lines. */
const renderTileText = (hit: AchievementLegalHit): TemplateResult => {
	const [ first, second ] = describeHit(hit).split(' ');

	return second
		? html`<span class="pick__tile-small">${ first }</span><span>${ second }</span>`
		: html`<span>${ first }</span>`;
};

/** The class that colours a segment (or the tile for it) by its ring. */
const ringClass = (hit: AchievementLegalHit): string => `segment--${ getHitKind(hit) }`;

/**
 * The board unrolled into a strip along the bottom of the game: every number with its
 * treble, double and single, plus the bulls, the rim and a miss. Segments the last dart can
 * unlock an achievement with light up in their ring's colour, with how many it unlocks;
 * the more, the stronger the colour (a heat map against the most on the board). The
 * throw worth the most (MMR weighed by how hard it is to hit) is marked, and the side shows
 * what it unlocks; pointing at another lit segment shows that one instead.
 *
 * It sits along the bottom of the game (`placement="strip"`), or in the free cells at the end
 * of the last player row (`"panel"`), where it gets a bigger board and a longer list. Either
 * way it is always there and always the same size: between darts it rests unlit, so nothing
 * on the page moves or pops up. The list shows as many achievements as fit. While hints are on their way it stays unlit too; only if they
 * take a while does a quiet note say so. Takes data only; the game page decides whose hints
 * to show and fetches them.
 */
@customElement('aa-last-dart-hints')
export class AaLastDartHints extends LitElement {

	@property({ type: String }) playerName = '';
	@property({ attribute: false }) hints:       LastDartHints | null = null;
	/** The season's MMR per achievement tier. */
	@property({ attribute: false }) tierRewards: TierRewards = {};
	/** What winning the game with this dart is worth to the player, in MMR. */
	@property({ type: Number }) victoryValue = 0;
	/** Hints for `playerName`'s last dart are on their way. */
	@property({ type: Boolean }) loading = false;
	/** Where the game page put it; see the class comment. */
	@property({ reflect: true }) placement:      'strip' | 'panel' = 'strip';

	/** The lit segment under the pointer, shown instead of the best throw. */
	@state() private pointedKey?: string;
	/** How many achievement lines fit under the chosen throw, measured from the list. */
	@state() private visibleLines = 3;

	private listResizeObserver?: ResizeObserver;
	private observedList?:       Element;

	override disconnectedCallback(): void {
		super.disconnectedCallback();
		this.listResizeObserver?.disconnect();
		this.observedList = undefined;
	}

	protected override willUpdate(changedProperties: PropertyValues<this>): void {
		if (changedProperties.has('hints'))
			this.pointedKey = undefined;
	}

	private get list(): readonly LastDartHint[] {
		return this.hints?.hints ?? [];
	}

	override render(): TemplateResult {
		const hints = this.list;
		const throws = rankThrows(hints, {
			tierRewards:  this.tierRewards,
			victoryHits:  this.hints?.victoryHits,
			victoryValue: this.victoryValue,
		});
		const best = throws[0];
		const shown = throws.find(item => item.key === this.pointedKey) ?? best;
		const strip = buildHintStrip(hints);
		const most = Math.max(0, ...strip.flatMap(column => column.segments.map(segment => segment?.count ?? 0)));
		const summary = best
			? `${ this.playerName }: best last dart ${ describeHit(best.hit) }, `
				+ describeWorth(best.hintIndexes.length, best).join(' ')
			: '';

		return html`
			<span class="visually-hidden" role="status" aria-live="polite">${ summary }</span>
			<section class="strip" aria-label="Last-dart achievement hints" aria-busy=${ this.loading ? 'true' : 'false' }>
				<div class="who">
					<span class="eyebrow">Last dart</span>
					<strong>${ this.playerName || '—' }</strong>
				</div>
				<div class="board" aria-hidden="true" @mouseleave=${ () => this.point(undefined) }>
					<span class="rows">
						${ rowLabels.map(label => html`<span>${ label }</span>`) }
						${ this.loading ? html`<i class="waiting-dot"></i>` : nothing }
					</span>
					${ strip.map(column => this.renderColumn(column, best?.key, shown?.key, most)) }
				</div>
				${ shown ? this.renderThrow(shown, shown === best) : this.renderIdle() }
			</section>
		`;
	}

	private renderColumn(
		column: HintColumn,
		bestKey: string | undefined,
		shownKey: string | undefined,
		most: number,
	): TemplateResult {
		const tiers = column.segments.flatMap(segment => segment?.highestTier ?? []);
		const tier = tiers.length > 0 ? Math.max(...tiers) as AchievementTier : undefined;

		return html`
			<span class="column">
				<span class="cap">
					${ tier === undefined ? nothing : html`<img src=${ getAchievementTierIcon(tier) } alt="" />` }
				</span>
				${ column.segments.map(segment => this.renderSegment(segment, bestKey, shownKey, most)) }
				<b class="label">${ column.label }</b>
			</span>
		`;
	}

	private renderSegment(
		segment: HintSegment | undefined,
		bestKey: string | undefined,
		shownKey: string | undefined,
		most: number,
	): TemplateResult {
		if (!segment)
			return html`<span class="segment segment--none"></span>`;

		const { count, key } = segment;
		const state = [
			count > 0 ? `segment--lit heat-${ getHeatLevel(count, most) }` : '',
			key === bestKey ? 'segment--best' : '',
			key === shownKey && key !== bestKey ? 'segment--pointed' : '',
		].join(' ');

		return html`
			<span
				class="segment ${ ringClass(segment.hit) } ${ state }"
				title=${ count > 0
					? `${ describeHit(segment.hit) }: ${ count } ${ count === 1 ? 'achievement' : 'achievements' }`
					: describeHit(segment.hit) }
				@mouseenter=${ count > 0 ? () => this.point(key) : nothing }
			>${ count > 0 ? count : nothing }</span>
		`;
	}

	/**
	 * The chosen throw: a big tile in its ring's colour, the first thing to see, then what it
	 * is worth and which achievements it unlocks.
	 */
	private renderThrow(chosen: ThrowPayoff, isBest: boolean): TemplateResult {
		const hints = chosen.hintIndexes.map(index => this.list[index]!);
		const lines = groupByName(hints);
		// When not all fit, the last line that fits says how many are left out.
		const visible = lines.length > this.visibleLines ? lines.slice(0, Math.max(1, this.visibleLines - 1)) : lines;
		const hidden = lines.slice(visible.length).reduce((count, line) => count + line.hints.length, 0);

		return html`
			<div class="pick pick--throw">
				<span class="pick__tile ${ ringClass(chosen.hit) }">${ renderTileText(chosen.hit) }</span>
				<span class="eyebrow pick__label">${ isBest ? 'Best throw' : 'If you hit' }</span>
				<span class="pick__worth">
					${ describeWorth(hints.length, chosen)
						.map((part, index) => html`${ index > 0 ? ' ' : '' }<span>${ part }</span>`) }
				</span>
				<ul ${ ref(this.observeList) }>
					${ visible.map(line => html`
						<li title=${ line.name }>
							<img src=${ getAchievementTierIcon(getHighestTier(line.hints) ?? AchievementTier.bronze) } alt="" />
							<span class="name">${ line.name }</span>
						</li>
					`) }
					${ hidden > 0 ? html`<li class="more">+${ hidden } more</li>` : nothing }
				</ul>
			</div>
		`;
	}

	/**
	 * No throw to show: empty between last darts, keeping its space. While hints are on their
	 * way a quiet note appears only if they take a while; if none come, it says so.
	 */
	private renderIdle(): TemplateResult {
		let text: TemplateResult | typeof nothing = nothing;
		if (this.loading)
			text = html`<p class="idle"><span class="waiting__note">Looking for throws…</span></p>`;
		else if (this.playerName)
			text = html`<p class="idle">Nothing to unlock with this dart.</p>`;

		return html`<div class="pick">${ text }</div>`;
	}

	private point(key: string | undefined): void {
		this.pointedKey = key;
	}

	/** Keeps the line count in step with the list's height, which the box's size decides. */
	private readonly observeList = (list?: Element): void => {
		if (list === this.observedList)
			return;

		if (this.observedList)
			this.listResizeObserver?.unobserve(this.observedList);

		this.observedList = list;
		if (!list)
			return;

		this.listResizeObserver ??= new ResizeObserver(entries => {
			for (const entry of entries)
				this.fitLines(entry.target as HTMLElement);
		});
		this.listResizeObserver.observe(list);
	};

	private fitLines(list: HTMLElement): void {
		const line = list.querySelector<HTMLElement>('li:not(.more)');
		if (!line || line.offsetHeight === 0)
			return;

		const gap = Number.parseFloat(getComputedStyle(list).rowGap) || 0;
		const fit = Math.max(1, Math.floor((list.clientHeight + gap) / (line.offsetHeight + gap)));
		if (fit !== this.visibleLines)
			this.visibleLines = fit;
	}

	static override styles = [
		visuallyHiddenStyles,
		unsafeCSS(lastDartHintsStyles),
	];

}

declare global {
	interface HTMLElementTagNameMap {
		'aa-last-dart-hints': AaLastDartHints;
	}
}
