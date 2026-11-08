import type { PropertyValues } from 'lit';
import { html, LitElement, nothing, TemplateResult, unsafeCSS } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { getAchievementTierIcon } from '../../helpers/achievementHelper.js';
import {
	BoardShade,
	buildHintStrip,
	getBoardShade,
	getHighestTier,
	getHitKind,
	groupByName,
	HintColumn,
	HintSegment,
	HitKind,
	rankThrows,
	ThrowPayoff,
	TierRewards,
} from '../../helpers/lastDartHints.js';
import type { AchievementLegalHit, LastDartHint, LastDartHints } from '../../models/achievementBuilderApi.js';
import { AchievementTier } from '../../models/enums.js';
import { visuallyHiddenStyles } from '../../styles/shared-styles.js';
import lastDartHintsStyles from './aa-last-dart-hints.css?inline';

/** How many achievement lines fit under the chosen throw. */
const VISIBLE_LINES = 3;

const rowLabels = [ 'T', 'D', 'S' ];

/** The classes that colour a segment (or a chip for it) like the board. */
const colourClasses = (hit: AchievementLegalHit): { kind: HitKind; shade: BoardShade | ''; } => {
	const kind = getHitKind(hit);
	const shade = kind === 'single' || kind === 'double' || kind === 'treble' ? getBoardShade(hit.hitLocation) : '';

	return { kind, shade };
};

/**
 * The board unrolled into a strip along the bottom of the game: every number with its
 * treble, double and single, plus the bulls, the rim and a miss. Segments the last dart can
 * unlock an achievement with light up in their board colours, with how many it unlocks. The
 * throw worth the most (MMR weighed by how hard it is to hit) is marked, and the side shows
 * what it unlocks; pointing at another lit segment shows that one instead.
 *
 * It is always there and always the same size: between darts it rests unlit, so nothing on
 * the page moves or pops up. Takes data only; the game page decides whose hints to show.
 */
@customElement('aa-last-dart-hints')
export class AaLastDartHints extends LitElement {

	@property({ type: String }) playerName = '';
	@property({ attribute: false }) hints:       LastDartHints | null = null;
	/** The season's MMR per achievement tier. */
	@property({ attribute: false }) tierRewards: TierRewards = {};

	/** The lit segment under the pointer, shown instead of the best throw. */
	@state() private pointedKey?: string;

	protected override willUpdate(changedProperties: PropertyValues<this>): void {
		if (changedProperties.has('hints'))
			this.pointedKey = undefined;
	}

	private get list(): readonly LastDartHint[] {
		return this.hints?.hints ?? [];
	}

	override render(): TemplateResult {
		const hints = this.list;
		const throws = rankThrows(hints, this.tierRewards);
		const best = throws[0];
		const shown = throws.find(item => item.key === this.pointedKey) ?? best;
		const summary = best
			? `${ this.playerName }: best last dart ${ best.key }, unlocks ${ best.hintIndexes.length } `
				+ `${ best.hintIndexes.length === 1 ? 'achievement' : 'achievements' }`
			: '';

		return html`
			<span class="visually-hidden" role="status" aria-live="polite">${ summary }</span>
			<section class="strip" aria-label="Last-dart achievement hints">
				<div class="who">
					<span class="eyebrow">Last dart</span>
					<strong>${ best ? this.playerName : '—' }</strong>
				</div>
				<div class="board" aria-hidden="true" @mouseleave=${ () => this.point(undefined) }>
					<span class="rows">${ rowLabels.map(label => html`<span>${ label }</span>`) }</span>
					${ buildHintStrip(hints).map(column => this.renderColumn(column, best?.key, shown?.key)) }
				</div>
				${ shown ? this.renderThrow(shown, shown === best) : this.renderIdle() }
			</section>
		`;
	}

	private renderColumn(column: HintColumn, bestKey: string | undefined, shownKey: string | undefined): TemplateResult {
		const tiers = column.segments.flatMap(segment => segment?.highestTier ?? []);
		const tier = tiers.length > 0 ? Math.max(...tiers) as AchievementTier : undefined;

		return html`
			<span class="column">
				<span class="cap">
					${ tier === undefined ? nothing : html`<img src=${ getAchievementTierIcon(tier) } alt="" />` }
				</span>
				${ column.segments.map(segment => this.renderSegment(segment, bestKey, shownKey)) }
				<b class="label">${ column.label }</b>
			</span>
		`;
	}

	private renderSegment(
		segment: HintSegment | undefined,
		bestKey: string | undefined,
		shownKey: string | undefined,
	): TemplateResult {
		if (!segment)
			return html`<span class="segment segment--none"></span>`;

		const { count, key } = segment;
		const { kind, shade } = colourClasses(segment.hit);
		const state = [
			count > 0 ? 'segment--lit' : '',
			key === bestKey ? 'segment--best' : '',
			key === shownKey && key !== bestKey ? 'segment--pointed' : '',
		].join(' ');

		return html`
			<span
				class="segment segment--${ kind } segment--${ shade } ${ state }"
				title=${ count > 0 ? `${ key }: ${ count } ${ count === 1 ? 'achievement' : 'achievements' }` : key }
				@mouseenter=${ count > 0 ? () => this.point(key) : nothing }
			>${ count > 0 ? count : nothing }</span>
		`;
	}

	/** The chosen throw: what it is, what it is worth, and which achievements it unlocks. */
	private renderThrow(chosen: ThrowPayoff, isBest: boolean): TemplateResult {
		const hints = chosen.hintIndexes.map(index => this.list[index]!);
		const lines = groupByName(hints);
		const visible = lines.length > VISIBLE_LINES ? lines.slice(0, VISIBLE_LINES - 1) : lines;
		const hidden = lines.slice(visible.length).reduce((count, line) => count + line.hints.length, 0);
		const { kind, shade } = colourClasses(chosen.hit);

		return html`
			<div class="pick">
				<span class="pick__head">
					<span class="eyebrow">${ isBest ? 'Best throw' : 'If you hit' }</span>
					<span class="chip segment--${ kind } segment--${ shade }">${ chosen.key }</span>
					<span class="pick__worth">
						${ hints.length } ${ hints.length === 1 ? 'achievement' : 'achievements' } · +${ chosen.mmr } MMR
					</span>
				</span>
				<ul>
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

	private renderIdle(): TemplateResult {
		return html`
			<div class="pick">
				<span class="eyebrow">Best throw</span>
				<p class="idle">Throws that unlock an achievement light up here before the last dart.</p>
			</div>
		`;
	}

	private point(key: string | undefined): void {
		this.pointedKey = key;
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
