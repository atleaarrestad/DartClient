import type { PropertyValues } from 'lit';
import { html, LitElement, nothing, svg, SVGTemplateResult, TemplateResult, unsafeCSS } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';

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
	LastDartPlan,
	planLastDart,
	ThrowPayoff,
	TierRewards,
} from '../../helpers/lastDartHints.js';
import type { AchievementLegalHit, LastDartHint, LastDartHints } from '../../models/achievementBuilderApi.js';
import { achievementTiersAscending } from '../../models/enums.js';
import { visuallyHiddenStyles } from '../../styles/shared-styles.js';
import { arcPath, circlePath, polar, wedgeAngle, wedgeSpan } from '../../ui/dartboard/dartboardGeometry.js';
import lastDartHintsStyles from './aa-last-dart-hints.css?inline';

/** How many throws the list suggests, the one to make first. */
const suggestionCount = 4;

/** How a target is marked on the board, from the most to the least focus. */
type MarkerKind = 'main' | 'second' | 'sixty-nine' | 'pointed';

/**
 * A suggested throw: the main one, the second choice, the dart to 69, another throw for
 * achievements, or one pointed at on the board that the list doesn't have.
 */
interface Suggestion {
	item: ThrowPayoff;
	kind: MarkerKind | 'other';
}

/** The tiers, highest first, for the icon counts of a suggestion. */
const tiersHighestFirst = [ ...achievementTiersAscending ].reverse();

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

// ── Callouts: what a ring means, in a badge just outside the board ──────────

/** The board's view box reaches this far, leaving room for callouts round the board. */
const viewRadius = 290;

/** One part of a callout: a word on a pill ("WIN", "69"), or a tier icon with a count. */
type CalloutPart =
	| { kind: 'pill'; text: string; tone: 'win' | 'sixty-nine'; }
	| { kind: 'icon'; href: string; count: number; };

interface CalloutBox {
	left:   number;
	top:    number;
	width:  number;
	height: number;
}

/** A callout to place: the target it explains, its ring and what it says. */
interface CalloutItem {
	shape: TargetShape;
	kind:  MarkerKind;
	parts: readonly CalloutPart[];
}

/** A callout placed on the board, with the leader line from its target's ring to its box. */
interface PlacedCallout {
	kind:  MarkerKind;
	parts: readonly CalloutPart[];
	box:   CalloutBox;
	/** Smaller for less focus: the second choice. */
	scale: number;
	from:  readonly [ number, number ];
	to:    readonly [ number, number ];
}

/** Callout sizes in board millimetres, at full scale. */
const callout = {
	font:        22,
	icon:        30,
	gap:         6,
	padding:     9,
	height:      46,
	pill:        30,
	pillPadding: 7,
	/** Between the board's edge and a callout, and between two callouts. */
	clearance:   6,
} as const;

const partWidth = (part: CalloutPart): number => part.kind === 'pill'
	? part.text.length * callout.font * 0.68 + 2 * callout.pillPadding
	: callout.icon + 3 + String(part.count).length * callout.font * 0.62;

/** The angle (clockwise from the top) a target sits at; the bulls' callout goes below the board. */
const angleOf = ([ x, y ]: readonly [ number, number ]): number =>
	x === 0 && y === 0 ? Math.PI : Math.atan2(x, -y);

/** A box of this size just outside the board at `angle`, and where a leader line meets it. */
const boxAt = (angle: number, width: number, height: number): { box: CalloutBox; to: [ number, number ]; } => {
	const [ dx, dy ] = polar(1, angle);
	const extent = Math.abs(dx) * width / 2 + Math.abs(dy) * height / 2;
	const distance = radii.edge + callout.clearance + extent;

	return {
		box: { left: dx * distance - width / 2, top: dy * distance - height / 2, width, height },
		to:  [ dx * (distance - extent), dy * (distance - extent) ],
	};
};

const overlaps = (a: CalloutBox, b: CalloutBox): boolean =>
	a.left < b.left + b.width + callout.clearance
	&& b.left < a.left + a.width + callout.clearance
	&& a.top < b.top + b.height + callout.clearance
	&& b.top < a.top + a.height + callout.clearance;

/** Whether a box (and its shadow) stays inside the board's view box. */
const fitsView = ({ left, top, width, height }: CalloutBox): boolean =>
	left >= -viewRadius && top >= -viewRadius
	&& left + width + 4 <= viewRadius && top + height + 4 <= viewRadius;

/**
 * Where round the board a callout may go, as offsets from its target's angle, nearest first.
 * Never straight out: the leader line would cross the target's own number. Twelve degrees to
 * either side puts it between that number and the next; further spots keep to the gaps.
 */
const calloutOffsets = [ 12, -12, 30, -30, 48, -48, 66, -66, 84, -84, 102, -102 ]
	.map(degrees => degrees * Math.PI / 180);

/**
 * Puts each callout just outside the board beside its target, in order of focus: the nearest
 * spot that stays in view and covers no earlier callout.
 */
const placeCallouts = (items: readonly CalloutItem[]): PlacedCallout[] => {
	const placed: CalloutBox[] = [];

	return items.map(({ shape, kind, parts }) => {
		const scale = kind === 'second' ? 0.85 : 1;
		const width = (parts.reduce((total, part) => total + partWidth(part), 0)
			+ callout.gap * (parts.length - 1) + 2 * callout.padding) * scale;
		const height = callout.height * scale;
		const base = angleOf(shape.centre);
		const spots = calloutOffsets.map(offset => boxAt(base + offset, width, height));
		const spot = spots.find(candidate => fitsView(candidate.box) && !placed.some(box => overlaps(box, candidate.box)))
			?? spots.find(candidate => fitsView(candidate.box))
			?? spots[0]!;
		placed.push(spot.box);

		// The leader starts on the target's ring, pointing at the box.
		const [ cx, cy ] = shape.centre;
		const [ tx, ty ] = spot.to;
		const length = Math.hypot(tx - cx, ty - cy) || 1;
		const from: [ number, number ] = [
			cx + (tx - cx) / length * shape.markerRadius,
			cy + (ty - cy) / length * shape.markerRadius,
		];

		return { kind, parts, box: spot.box, scale, from, to: spot.to };
	});
};

/** The targets off the board, shown as chips under it. */
const offBoardKeys = [ 'Rim', 'Miss' ] as const;

/**
 * What the throw gets, as parts that read as one line: "Win + 4 achievements (+65 MMR)",
 * "4 achievements (+65 MMR)", "Win", or "Lands on 69 + 1 achievement (+5 MMR)" for the dart
 * to 69. The win leads: it matters most.
 */
const describeWorth = (count: number, chosen: ThrowPayoff, isSixtyNine = false): string[] => {
	const goal = chosen.wins ? 'Win' : isSixtyNine ? 'Lands on 69' : undefined;
	if (count === 0)
		return goal ? [ goal ] : [];

	return [
		...goal ? [ `${ goal } +` ] : [],
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
 * map against the most on the board). The rim and a miss are chips under the board.
 *
 * What to throw (`planLastDart`) is ringed on the board, with a callout saying what it gets,
 * and listed below it: up to four suggestions, the one to make first on top, each on a tile in
 * its board colour with the tiers it unlocks as icons and counts. First the easiest dart that
 * wins, or without one the throw worth the most in achievements (MMR weighed by how hard it is
 * to hit). When it wins, the throw worth the most in achievements, if another dart, is the
 * second choice: a fainter ring. The easiest dart to 69, when the season plays the 69 rule,
 * gets a ring of its own colour. Then the next throws for achievements. Pointing at a lit
 * target the list doesn't have puts it in the last row for as long as it is pointed at.
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
	/** Hints for `playerName`'s last dart are on their way. */
	@property({ type: Boolean }) loading = false;

	/** The target under the pointer, marked on the board and in the list. */
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
		const plan = planLastDart(hints, {
			tierRewards:   this.tierRewards,
			victoryHits:   this.hints?.victoryHits,
			sixtyNineHits: this.hints?.sixtyNineHits,
		});
		const { main, sixtyNine } = plan;
		const candidates = [ main, plan.second, sixtyNine, ...plan.others ].flatMap(item => item ? [ item ] : []);
		const pointed = candidates.find(item => item.key === this.pointedKey);
		const targets = buildHintTargets(hints);
		const most = Math.max(0, ...[ ...targets.values() ].map(target => target.count));
		const markers = this.getMarkers(plan, pointed?.key);
		const summary = main
			? `${ this.playerName }: ${ main.wins ? 'easiest win' : 'best last dart' } ${ describeHit(main.hit) }, `
				+ describeWorth(main.hintIndexes.length, main, main.key === sixtyNine?.key).join(' ')
			: '';

		return html`
			<span class="visually-hidden" role="status" aria-live="polite">${ summary }</span>
			<section class="dock" aria-label="Last-dart hints" aria-busy=${ this.loading ? 'true' : 'false' }>
				<div class="who">
					<span class="eyebrow">Last dart</span>
					<strong>${ this.playerName || '—' }</strong>
				</div>
				<div class="board-area" aria-hidden="true" @mouseleave=${ this.clearPoint }>
					${ this.renderBoard(targets, markers, most, placeCallouts(this.getCallouts(plan))) }
					${ this.renderOffBoard(targets, markers, most) }
				</div>
				${ this.renderSuggestions(
					this.getSuggestions(plan, pointed),
					plan,
					new Map(candidates.map(item => [ item.key, item ])),
				) }
			</section>
		`;
	}

	/**
	 * Which target gets which ring: the main throw, the second choice and the dart to 69 each
	 * their own, and the throw pointed at a dashed one unless it has one already. A target
	 * has one ring at most, the one with the most focus.
	 */
	private getMarkers(plan: LastDartPlan, shownKey: string | undefined): ReadonlyMap<string, MarkerKind> {
		const markers: Map<string, MarkerKind> = new Map();
		const mark = (key: string | undefined, kind: MarkerKind): void => {
			if (key && !markers.has(key))
				markers.set(key, kind);
		};
		mark(plan.main?.key, 'main');
		mark(plan.second?.key, 'second');
		mark(plan.sixtyNine?.key, 'sixty-nine');
		mark(shownKey, 'pointed');

		return markers;
	}

	/**
	 * What each ring on the board means, for its callout: "WIN" when it wins, "69" when it
	 * lands on 69, and the highest tier it unlocks with how many achievements. The main throw
	 * first, then the second choice, then the dart to 69; the rim and a miss have none (their
	 * chips say what they are).
	 */
	private getCallouts({ main, second, sixtyNine }: LastDartPlan): CalloutItem[] {
		const ringed: [ ThrowPayoff | undefined, MarkerKind ][] = [
			[ main, 'main' ],
			[ second, 'second' ],
			[ sixtyNine, 'sixty-nine' ],
		];
		const seen: Set<string> = new Set();

		return ringed.flatMap(([ item, kind ]) => {
			const shape = item && shapesByKey.get(item.key);
			if (!item || !shape || seen.has(item.key))
				return [];

			seen.add(item.key);
			const hints = item.hintIndexes.map(index => this.list[index]!);
			const tier = getHighestTier(hints);
			const parts: CalloutPart[] = [
				...item.wins ? [ { kind: 'pill', text: 'WIN', tone: 'win' } as const ] : [],
				...item.key === sixtyNine?.key ? [ { kind: 'pill', text: '69', tone: 'sixty-nine' } as const ] : [],
				...tier === undefined ? [] : [ { kind: 'icon', href: getAchievementTierIcon(tier), count: hints.length } as const ],
			];

			return parts.length > 0 ? [ { shape, kind, parts } ] : [];
		});
	}

	/**
	 * The board in its own colours. Once something is lit, the rest dims, except the ringed
	 * targets; lit targets are drawn last, so their edges show over their neighbours, then the
	 * rings, the most focused on top, and the callouts round the board.
	 */
	private renderBoard(
		targets: ReadonlyMap<string, HintSegment>,
		markers: ReadonlyMap<string, MarkerKind>,
		most: number,
		callouts: readonly PlacedCallout[],
	): TemplateResult {
		const levelOf = (shape: TargetShape): number => getHeatLevel(targets.get(shape.key)?.count ?? 0, most);
		const unlit = boardShapes.filter(shape => levelOf(shape) === 0);
		const lit = boardShapes.filter(shape => levelOf(shape) > 0);
		const focus: readonly MarkerKind[] = [ 'pointed', 'sixty-nine', 'second', 'main' ];
		const ringed = [ ...markers ]
			.flatMap(([ key, kind ]) => shapesByKey.has(key) ? [ { shape: shapesByKey.get(key)!, kind } ] : [])
			.sort((left, right) => focus.indexOf(left.kind) - focus.indexOf(right.kind));

		return html`
			<svg
				class=${ classMap({ 'board': true, 'board--lit': lit.length > 0 }) }
				viewBox="${ -viewRadius } ${ -viewRadius } ${ 2 * viewRadius } ${ 2 * viewRadius }"
			>
				<circle class="board__edge" r=${ radii.edge }></circle>
				${ unlit.map(shape => this.renderShape(shape, 0, markers.has(shape.key))) }
				${ lit.map(shape => this.renderShape(shape, levelOf(shape), markers.has(shape.key))) }
				${ dartboardNumbers.map((number, index) => {
					const [ x, y ] = polar(radii.numbers, index * wedgeAngle);

					return svg`<text class="board__number" x=${ x } y=${ y }>${ number }</text>`;
				}) }
				${ ringed.map(({ shape, kind }) => this.renderMarker(shape, kind)) }
				${ callouts.map(item => this.renderCallout(item)) }
			</svg>
		`;
	}

	/**
	 * A badge like the rank changes on the statistics charts: white with a black edge and an
	 * offset shadow, on a leader line in its ring's colour from the target's ring.
	 */
	private renderCallout({ kind, parts, box, scale, from, to }: PlacedCallout): SVGTemplateResult {
		const { left, top, width, height } = box;
		const middle = top + height / 2;
		let x = left + callout.padding * scale;
		const content = parts.map(part => {
			const at = x;
			const partSize = partWidth(part) * scale;
			x += partSize + callout.gap * scale;
			if (part.kind === 'pill') {
				const pill = callout.pill * scale;

				return svg`
					<rect class="callout__pill callout__pill--${ part.tone }" x=${ at } y=${ middle - pill / 2 }
						width=${ partSize } height=${ pill } rx=${ 8 * scale }></rect>
					<text class="callout__text" x=${ at + partSize / 2 } y=${ middle } text-anchor="middle"
						font-size=${ callout.font * scale }>${ part.text }</text>
				`;
			}

			const icon = callout.icon * scale;

			return svg`
				<image href=${ part.href } x=${ at } y=${ middle - icon / 2 } width=${ icon } height=${ icon }></image>
				<text class="callout__text" x=${ at + icon + 3 * scale } y=${ middle }
					font-size=${ callout.font * scale }>${ part.count }</text>
			`;
		});

		return svg`
			<g class="callout callout--${ kind }">
				<line class="callout__halo" x1=${ from[0] } y1=${ from[1] } x2=${ to[0] } y2=${ to[1] }></line>
				<line class="callout__leader" x1=${ from[0] } y1=${ from[1] } x2=${ to[0] } y2=${ to[1] }></line>
				<rect class="callout__shadow" x=${ left + 4 * scale } y=${ top + 4 * scale }
					width=${ width } height=${ height } rx=${ 10 * scale }></rect>
				<rect class="callout__box" x=${ left } y=${ top } width=${ width } height=${ height } rx=${ 10 * scale }></rect>
				${ content }
			</g>
		`;
	}

	/** `shown` keeps an unlit target in its full colour when the rest of the board dims. */
	private renderShape(shape: TargetShape, level: number, shown: boolean): SVGTemplateResult {
		const classes = [
			'area',
			`colour-${ shape.colour }`,
			shape.key.startsWith('S') ? 'area--single' : '',
			level > 0 ? `lit heat-${ level }` : '',
			shown ? 'area--shown' : '',
		].join(' ');

		return svg`${ shape.paths.map(path => svg`
			<path
				class=${ classes }
				d=${ path }
				@mouseenter=${ level > 0 ? () => this.point(shape.key) : nothing }
			></path>
		`) }`;
	}

	/** A ring round the target (and an outline of it), on a black halo to show on any colour. */
	private renderMarker(shape: TargetShape, kind: MarkerKind): SVGTemplateResult {
		const [ x, y ] = shape.centre;

		return svg`
			<g class="marker marker--${ kind }">
				${ shape.paths.map(path => svg`<path class="marker__outline" d=${ path }></path>`) }
				<circle class="marker__halo" cx=${ x } cy=${ y } r=${ shape.markerRadius }></circle>
				<circle class="marker__ring" cx=${ x } cy=${ y } r=${ shape.markerRadius }></circle>
			</g>
		`;
	}

	/** The rim and a miss: chips under the board, lit and ringed like the segments. */
	private renderOffBoard(
		targets: ReadonlyMap<string, HintSegment>,
		markers: ReadonlyMap<string, MarkerKind>,
		most: number,
	): TemplateResult {
		return html`
			<div class="off-board">
				${ offBoardKeys.map(key => {
					const count = targets.get(key)?.count ?? 0;
					const level = getHeatLevel(count, most);
					const marker = markers.get(key);

					return html`
						<span
							class=${ classMap({
								'chip':                true,
								'colour-off':          true,
								'lit':                 level > 0,
								[`heat-${ level }`]:   level > 0,
								[`chip--${ marker }`]: marker !== undefined,
							}) }
							@mouseenter=${ level > 0 ? () => this.point(key) : nothing }
						>${ key }${ level > 0 ? html`<b>${ count }</b>` : nothing }</span>
					`;
				}) }
			</div>
		`;
	}

	/**
	 * Up to four throws, the one to make first on top: the main throw, the second choice, the
	 * dart to 69 (unless it is one of those), then the next throws for achievements. A lit
	 * target pointed at on the board that isn't listed takes the last row while pointed at.
	 */
	private getSuggestions({ main, second, sixtyNine, others }: LastDartPlan, pointed: ThrowPayoff | undefined): Suggestion[] {
		const listed: Suggestion[] = [];
		const add = (item: ThrowPayoff | undefined, kind: Suggestion['kind']): void => {
			if (item && !listed.some(entry => entry.item.key === item.key))
				listed.push({ item, kind });
		};
		add(main, 'main');
		add(second, 'second');
		add(sixtyNine, 'sixty-nine');
		others.forEach(item => add(item, 'other'));

		const suggestions = listed.slice(0, suggestionCount);
		if (pointed && !suggestions.some(entry => entry.item.key === pointed.key))
			suggestions.splice(Math.min(suggestions.length, suggestionCount - 1), 1, { item: pointed, kind: 'pointed' });

		return suggestions;
	}

	/**
	 * The suggested throws as one list. The rows keep their space when there are fewer, so
	 * nothing moves; with none, the first says why (or, while hints are on their way and only
	 * if they take a while, that they are coming).
	 */
	private renderSuggestions(
		suggestions: readonly Suggestion[],
		plan: LastDartPlan,
		throwsByKey: ReadonlyMap<string, ThrowPayoff>,
	): TemplateResult {
		let idle: TemplateResult | typeof nothing = nothing;
		if (this.loading)
			idle = html`<li class="idle"><span class="waiting__note">Looking for throws…</span></li>`;
		else if (this.playerName)
			idle = html`<li class="idle">Nothing to aim for with this dart.</li>`;

		return html`
			<div class="suggestions" aria-hidden="true" @mouseleave=${ this.clearPoint }>
				<ol>
					${ suggestions.length === 0
						? idle
						: suggestions.map(suggestion => this.renderSuggestion(suggestion, plan, throwsByKey)) }
				</ol>
			</div>
		`;
	}

	/**
	 * One suggestion: the throw on a tile in its board colour, ringed like on the board; what
	 * it gets; and what it is. When a treble or double that misses usually still gets something,
	 * a quieter third of the row shows where the miss lands and what that gets. The
	 * achievements' names are the tooltips.
	 */
	private renderSuggestion(
		{ item, kind }: Suggestion,
		plan: LastDartPlan,
		throwsByKey: ReadonlyMap<string, ThrowPayoff>,
	): TemplateResult {
		const hints = item.hintIndexes.map(index => this.list[index]!);
		const landsOnSixtyNine = item.key === plan.sixtyNine?.key;
		const miss = this.renderMiss(item.hit, throwsByKey);
		const labels: Record<Suggestion['kind'], string> = {
			'main':       item.wins ? 'Easiest win' : 'Best throw',
			'second':     'Second choice',
			'sixty-nine': 'Next round scores double',
			'pointed':    'If you hit',
			'other':      '',
		};

		return html`
			<li
				class=${ classMap({
					'suggestion':              true,
					[`suggestion--${ kind }`]: true,
					'suggestion--with-miss':   miss !== nothing,
					'suggestion--pointed':     item.key === this.pointedKey,
				}) }
				@mouseenter=${ () => this.point(item.key) }
			>
				<span class="suggestion__main" title=${ groupByName(hints).map(line => line.name).join('\n') }>
					<span class="suggestion__tile ${ colourClass(item.hit) }">${ renderTileText(item.hit) }</span>
					<span class="suggestion__worth">
						${ this.renderWorth(hints, item.mmr, item.wins, landsOnSixtyNine) }
					</span>
					<span class="suggestion__note">${ labels[kind] }</span>
				</span>
				${ miss }
			</li>
		`;
	}

	/** What a throw gets: a pill for a win or 69, each tier's icon with a count, the MMR. */
	private renderWorth(
		hints: readonly LastDartHint[],
		mmr: number,
		wins: boolean,
		landsOnSixtyNine: boolean,
	): TemplateResult {
		const tiers = tiersHighestFirst.flatMap(tier => {
			const count = hints.filter(hint => hint.tier === tier).length;

			return count > 0 ? [ { tier, count } ] : [];
		});

		return html`
			${ wins ? html`<span class="pill pill--win">WIN</span>` : nothing }
			${ landsOnSixtyNine ? html`<span class="pill pill--sixty-nine">69</span>` : nothing }
			${ tiers.map(({ tier, count }) => html`
				<span class="tier"><img src=${ getAchievementTierIcon(tier) } alt="" />${ count }</span>
			`) }
			${ mmr > 0 ? html`<span class="mmr">+${ mmr } MMR</span>` : nothing }
		`;
	}

	/**
	 * Where a treble or double usually lands when it misses (the single of its number), and
	 * what that still gets: a small version of the throw beside it, its tile with what it gets
	 * on top (achievements, a win or 69) and the MMR below. Nothing when it gets nothing, or
	 * for the other targets.
	 */
	private renderMiss(hit: AchievementLegalHit, throwsByKey: ReadonlyMap<string, ThrowPayoff>): TemplateResult | typeof nothing {
		const kind = getHitKind(hit);
		const fallback = kind === 'treble' || kind === 'double' ? getMissFallback(hit) : undefined;
		if (!fallback)
			return nothing;

		const key = formatHit(fallback);
		const payoff = throwsByKey.get(key);
		const hints = payoff?.hintIndexes.map(index => this.list[index]!) ?? [];
		const wins = this.hints?.victoryHits?.includes(key) ?? false;
		const landsOnSixtyNine = this.hints?.sixtyNineHits?.includes(key) ?? false;
		if (hints.length === 0 && !wins && !landsOnSixtyNine)
			return nothing;

		return html`
			<span class="suggestion__miss" title=${ groupByName(hints).map(line => line.name).join('\n') }>
				<span class="miss__tile ${ colourClass(fallback) }">${ describeHit(fallback) }</span>
				<span class="miss__worth">${ this.renderWorth(hints, 0, wins, landsOnSixtyNine) }</span>
				<span class="miss__mmr">${ payoff && payoff.mmr > 0 ? `+${ payoff.mmr } MMR` : '' }</span>
			</span>
		`;
	}

	private point(key: string | undefined): void {
		this.pointedKey = key;
	}

	private readonly clearPoint = (): void => this.point(undefined);

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
