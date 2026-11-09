import type { PropertyValues } from 'lit';
import { html, LitElement, nothing, svg, SVGTemplateResult, TemplateResult, unsafeCSS } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { ref } from 'lit/directives/ref.js';

import { getAchievementTierIcon } from '../../helpers/achievementHelper.js';
import { dartboardNumbers } from '../../helpers/dartboard.js';
import {
	buildHintTargets,
	describeHit,
	formatHit,
	getHeatLevel,
	getHighestTier,
	getHitKind,
	getMissFallback,
	groupByName,
	HintSegment,
	rankThrows,
	ThrowPayoff,
	TierRewards,
} from '../../helpers/lastDartHints.js';
import type { AchievementLegalHit, LastDartHint, LastDartHints } from '../../models/achievementBuilderApi.js';
import { AchievementTier } from '../../models/enums.js';
import { visuallyHiddenStyles } from '../../styles/shared-styles.js';
import { arcPath, circlePath, polar, wedgeAngle, wedgeSpan } from '../../ui/dartboard/dartboardGeometry.js';
import lastDartHintsStyles from './aa-last-dart-hints.css?inline';

/** How many throws the list under the chosen one offers, besides the best. */
const otherThrowCount = 3;

/**
 * The hint board's rings from the centre out, in millimetres: a regulation board (the view
 * box is the 451mm board), so every target has the size and place it has on the wall.
 */
const radii = {
	bull:      6.35,
	outerBull: 15.9,
	treble:    [ 99, 107 ],
	double:    [ 162, 170 ],
	numbers:   196,
	edge:      225.5,
} as const;

/** A dartboard's colours: black and cream singles, red and green rings; grey off the board. */
type TargetColour = 'black' | 'cream' | 'red' | 'green' | 'off';

/** Where a target sits on the board: its areas, its colour and where the marker goes. */
interface TargetShape {
	key:          string;
	paths:        readonly string[];
	colour:       TargetColour;
	/** The middle of the target (of its outer area, for a single): a marker circles it. */
	centre:       readonly [ number, number ];
	markerRadius: number;
}

/** Whether the wedge at `index` is a black one (the 20's is); the others are cream. */
const isBlackWedge = (index: number): boolean => index % 2 === 0;

const boardShapes: readonly TargetShape[] = [
	...dartboardNumbers.flatMap((number, index): TargetShape[] => {
		const [ start, end ] = wedgeSpan(index);
		const middle = index * wedgeAngle;
		const black = isBlackWedge(index);
		const [ trebleInner, trebleOuter ] = radii.treble;
		const [ doubleInner, doubleOuter ] = radii.double;

		return [
			{
				key:   `S${ number }`,
				paths: [
					arcPath(radii.outerBull, trebleInner, start, end),
					arcPath(trebleOuter, doubleInner, start, end),
				],
				colour:       black ? 'black' : 'cream',
				centre:       polar((trebleOuter + doubleInner) / 2, middle),
				markerRadius: 30,
			},
			{
				key:          `T${ number }`,
				paths:        [ arcPath(trebleInner, trebleOuter, start, end) ],
				colour:       black ? 'red' : 'green',
				centre:       polar((trebleInner + trebleOuter) / 2, middle),
				markerRadius: 19,
			},
			{
				key:          `D${ number }`,
				paths:        [ arcPath(doubleInner, doubleOuter, start, end) ],
				colour:       black ? 'red' : 'green',
				centre:       polar((doubleInner + doubleOuter) / 2, middle),
				markerRadius: 21,
			},
		];
	}),
	{
		key:          '25',
		paths:        [ `${ circlePath(radii.outerBull) } ${ circlePath(radii.bull) }` ],
		colour:       'green',
		centre:       [ 0, 0 ],
		markerRadius: 27,
	},
	{ key: 'Bull', paths: [ circlePath(radii.bull) ], colour: 'red', centre: [ 0, 0 ], markerRadius: 14 },
];

const shapesByKey = new Map(boardShapes.map(shape => [ shape.key, shape ]));

/** The targets off the board, shown as chips under it. */
const offBoardKeys = [ 'Rim', 'Miss' ] as const;

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

/** A tile's text: the throw in big type, the double bull as two words on two lines. */
const renderTileText = (hit: AchievementLegalHit): TemplateResult => {
	const [ first, second ] = describeHit(hit).split(' ');

	return second
		? html`<span class="tile-small">${ first }</span><span>${ second }</span>`
		: html`<span>${ first }</span>`;
};

/** The colour a target has on a dartboard, so its tile matches what the player aims at. */
const colourOf = (hit: AchievementLegalHit): TargetColour => {
	switch (getHitKind(hit)) {
	case 'off-board':
		return 'off';
	case 'bull':
		return 'red';
	case 'outer-bull':
		return 'green';
	case 'single':
		return isBlackWedge(dartboardNumbers.indexOf(hit.hitLocation)) ? 'black' : 'cream';
	default:
		return isBlackWedge(dartboardNumbers.indexOf(hit.hitLocation)) ? 'red' : 'green';
	}
};

const colourClass = (hit: AchievementLegalHit): string => `colour-${ colourOf(hit) }`;

/**
 * The last-dart hints, docked beside the game: a regulation dartboard in its own colours,
 * where the targets the last dart can unlock achievements with light up and the rest dims.
 * A lit target keeps its colour and gets a yellow edge, thicker the more it unlocks (a heat
 * map against the most on the board). The rim and a miss are chips under the board. The throw
 * worth the most (MMR weighed by how hard it is to hit) is ringed, and shown below the board,
 * on a tile in its board colour, with what it unlocks; pointing at another lit target, or at
 * one of the other throws listed under it, shows that one instead.
 *
 * In a tall box (the side dock) everything stacks; in a wide one (under the game on a narrow
 * screen) the board goes on the left. Either way it is always there and always the same size:
 * between darts it rests unlit, so nothing on the page moves or pops up. While hints are on
 * their way it stays unlit too; only if they take a while does a quiet note say so. Takes data
 * only; the game page decides whose hints to show and fetches them.
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

	/** The target under the pointer, shown instead of the best throw. */
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
		const targets = buildHintTargets(hints);
		const most = Math.max(0, ...[ ...targets.values() ].map(target => target.count));
		const summary = best
			? `${ this.playerName }: best last dart ${ describeHit(best.hit) }, `
				+ describeWorth(best.hintIndexes.length, best).join(' ')
			: '';

		return html`
			<span class="visually-hidden" role="status" aria-live="polite">${ summary }</span>
			<section class="dock" aria-label="Last-dart achievement hints" aria-busy=${ this.loading ? 'true' : 'false' }>
				<div class="who">
					<span class="eyebrow">Last dart</span>
					<strong>${ this.playerName || '—' }</strong>
				</div>
				<div class="board-area" aria-hidden="true" @mouseleave=${ this.clearPoint }>
					${ this.renderBoard(targets, best?.key, shown?.key, most) }
					${ this.renderOffBoard(targets, best?.key, shown?.key, most) }
				</div>
				${ shown ? this.renderThrow(shown, shown === best) : this.renderIdle() }
				${ this.renderOthers(throws.slice(1, 1 + otherThrowCount), targets, shown?.key) }
				<div class="legend" aria-hidden="true">
					<span><i class="legend__lit"></i>Unlocks achievements; thicker edge, more</span>
					<span><i class="legend__ring"></i>Best throw</span>
				</div>
			</section>
		`;
	}

	/**
	 * The board in its own colours. Once something is lit, the rest dims; lit targets are drawn
	 * last, so their edges show over their neighbours. The best throw is ringed in white, and a
	 * target under the pointer gets a dashed ring.
	 */
	private renderBoard(
		targets: ReadonlyMap<string, HintSegment>,
		bestKey: string | undefined,
		shownKey: string | undefined,
		most: number,
	): TemplateResult {
		const levelOf = (shape: TargetShape): number => getHeatLevel(targets.get(shape.key)?.count ?? 0, most);
		const unlit = boardShapes.filter(shape => levelOf(shape) === 0);
		const lit = boardShapes.filter(shape => levelOf(shape) > 0);
		const pointed = shownKey !== bestKey ? shapesByKey.get(shownKey ?? '') : undefined;
		const best = shapesByKey.get(bestKey ?? '');

		return html`
			<svg class=${ classMap({ 'board': true, 'board--lit': lit.length > 0 }) } viewBox="-226 -226 452 452">
				<circle class="board__edge" r=${ radii.edge }></circle>
				${ unlit.map(shape => this.renderShape(shape, 0)) }
				${ lit.map(shape => this.renderShape(shape, levelOf(shape))) }
				${ dartboardNumbers.map((number, index) => {
					const [ x, y ] = polar(radii.numbers, index * wedgeAngle);

					return svg`<text class="board__number" x=${ x } y=${ y }>${ number }</text>`;
				}) }
				${ pointed ? this.renderMarker(pointed, 'pointed') : nothing }
				${ best ? this.renderMarker(best, 'best') : nothing }
			</svg>
		`;
	}

	private renderShape(shape: TargetShape, level: number): SVGTemplateResult {
		const single = shape.key.startsWith('S') ? ' area--single' : '';
		const classes = level > 0
			? `area${ single } colour-${ shape.colour } lit heat-${ level }`
			: `area${ single } colour-${ shape.colour }`;

		return svg`${ shape.paths.map(path => svg`
			<path
				class=${ classes }
				d=${ path }
				@mouseenter=${ level > 0 ? () => this.point(shape.key) : nothing }
			></path>
		`) }`;
	}

	/** A ring round the target (and an outline of it), white on a black halo to show on any colour. */
	private renderMarker(shape: TargetShape, kind: 'best' | 'pointed'): SVGTemplateResult {
		const [ x, y ] = shape.centre;

		return svg`
			<g class="marker marker--${ kind }">
				${ shape.paths.map(path => svg`<path class="marker__outline" d=${ path }></path>`) }
				<circle class="marker__halo" cx=${ x } cy=${ y } r=${ shape.markerRadius }></circle>
				<circle class="marker__ring" cx=${ x } cy=${ y } r=${ shape.markerRadius }></circle>
			</g>
		`;
	}

	/** The rim and a miss: chips under the board, lit and marked like the segments. */
	private renderOffBoard(
		targets: ReadonlyMap<string, HintSegment>,
		bestKey: string | undefined,
		shownKey: string | undefined,
		most: number,
	): TemplateResult {
		return html`
			<div class="off-board">
				${ offBoardKeys.map(key => {
					const count = targets.get(key)?.count ?? 0;
					const level = getHeatLevel(count, most);

					return html`
						<span
							class=${ classMap({
								'chip':              true,
								'colour-off':        true,
								'lit':               level > 0,
								[`heat-${ level }`]: level > 0,
								'chip--best':        key === bestKey,
								'chip--pointed':     key === shownKey && key !== bestKey,
							}) }
							@mouseenter=${ level > 0 ? () => this.point(key) : nothing }
						>${ key }${ level > 0 ? html`<b>${ count }</b>` : nothing }</span>
					`;
				}) }
			</div>
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
				<span class="pick__tile ${ colourClass(chosen.hit) }">${ renderTileText(chosen.hit) }</span>
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

	/**
	 * The next best throws after the best one, with what they are worth and where a miss
	 * usually lands. The rows keep their space when there are fewer, so nothing moves.
	 */
	private renderOthers(
		others: readonly ThrowPayoff[],
		targets: ReadonlyMap<string, HintSegment>,
		shownKey: string | undefined,
	): TemplateResult {
		return html`
			<div class="others" aria-hidden="true" @mouseleave=${ this.clearPoint }>
				<span class=${ classMap({ 'eyebrow': true, 'is-empty': others.length === 0 }) }>Also worth aiming at</span>
				<ol>
					${ others.map(item => html`
						<li
							class=${ classMap({ 'other': true, 'other--pointed': item.key === shownKey }) }
							@mouseenter=${ () => this.point(item.key) }
						>
							<span class="other__tile ${ colourClass(item.hit) }">${ renderTileText(item.hit) }</span>
							<span class="other__worth">${ describeWorth(item.hintIndexes.length, item).join(' ') }</span>
							<span class="other__miss">${ this.describeMiss(item.hit, targets) }</span>
						</li>
					`) }
				</ol>
			</div>
		`;
	}

	/** Where a dart aimed at `hit` mostly lands when it misses, and what that still gets. */
	private describeMiss(hit: AchievementLegalHit, targets: ReadonlyMap<string, HintSegment>): string {
		const fallback = getMissFallback(hit);
		if (!fallback)
			return '';

		const key = formatHit(fallback);
		const count = targets.get(key)?.count ?? 0;
		const where = `A miss in ${ describeHit(fallback) }`;
		if (this.hints?.victoryHits?.includes(key))
			return `${ where } still wins`;

		return count > 0 ? `${ where } still gets ${ count }` : `${ where } gets nothing`;
	}

	private point(key: string | undefined): void {
		this.pointedKey = key;
	}

	private readonly clearPoint = (): void => this.point(undefined);

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
