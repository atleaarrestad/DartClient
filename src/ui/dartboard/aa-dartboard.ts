import { html, LitElement, nothing, svg, SVGTemplateResult, TemplateResult, unsafeCSS } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import { bullLocation, dartboardNumbers, doubleBullLocation } from '../../helpers/dartboard.js';
import dartboardStyles from './aa-dartboard.css?inline';

/** A part of one wedge; `single` is both single areas, `segment` the whole wedge. */
export type DartboardRing = 'inner' | 'triple' | 'outer' | 'double' | 'single' | 'segment';

/** Which highlight colour a zone gets. */
export type DartboardTone = 'primary' | 'secondary' | 'tertiary' | 'soft';

export interface DartboardZone {
	/** 1–20, or 25 / 50 for the bulls (the ring is ignored for bulls). */
	number: number;
	ring:   DartboardRing;
	tone?:  DartboardTone;
}

export interface DartboardMarker {
	number: number;
	ring:   'inner' | 'triple' | 'outer' | 'double';
	label:  string;
}

/** What was clicked on an interactive board. */
export interface DartboardPick {
	number: number;
	ring:   'single' | 'double' | 'triple' | 'bull';
}

export const dartboardPickEventName = 'dartboard-pick';

type Area = 'inner' | 'triple' | 'outer' | 'double';

const areaRadii: Record<Area, readonly [ number, number ]> = {
	inner:  [ 7, 36 ],
	triple: [ 36, 41 ],
	outer:  [ 41, 60 ],
	double: [ 60, 65 ],
};
const markerRadii: Record<DartboardMarker['ring'], number> = { inner: 22, triple: 38.5, outer: 50, double: 62.5 };
const areas = Object.keys(areaRadii) as Area[];
const step = (Math.PI * 2) / dartboardNumbers.length;

const polar = (radius: number, angle: number): [ number, number ] =>
	[ radius * Math.sin(angle), -radius * Math.cos(angle) ];

const arcPath = (inner: number, outer: number, start: number, end: number): string => {
	const [ x1, y1 ] = polar(outer, start);
	const [ x2, y2 ] = polar(outer, end);
	const [ x3, y3 ] = polar(inner, end);
	const [ x4, y4 ] = polar(inner, start);

	const outerArc = `A${ outer } ${ outer } 0 0 1 ${ x2 } ${ y2 }`;
	const innerArc = `A${ inner } ${ inner } 0 0 0 ${ x4 } ${ y4 }`;

	return `M${ x1 } ${ y1 } ${ outerArc } L${ x3 } ${ y3 } ${ innerArc } Z`;
};

const ringAreas: Record<DartboardRing, readonly Area[]> = {
	inner:   [ 'inner' ],
	triple:  [ 'triple' ],
	outer:   [ 'outer' ],
	double:  [ 'double' ],
	single:  [ 'inner', 'outer' ],
	segment: areas,
};

const pickRing = (area: Area): DartboardPick['ring'] =>
	area === 'triple' ? 'triple' : area === 'double' ? 'double' : 'single';

/**
 * A dartboard drawn in SVG. Zones are highlighted by tone, markers show numbered points, and
 * an interactive board reports clicks on segments and bulls.
 */
@customElement('aa-dartboard')
export class AaDartboard extends LitElement {

	@property({ attribute: false }) zones:   readonly DartboardZone[] = [];
	@property({ attribute: false }) markers: readonly DartboardMarker[] = [];
	/** Replaces a number's label, e.g. `{ 7: 'n' }`. */
	@property({ attribute: false }) labels:  Readonly<Record<number, string>> = {};
	@property({ type: Boolean, reflect: true }) interactive = false;
	@property({ type: String }) label = 'Dartboard';

	private toneFor(number: number, area: Area): DartboardTone | undefined {
		let tone: DartboardTone | undefined;
		for (const zone of this.zones) {
			if (zone.number === number && ringAreas[zone.ring].includes(area))
				tone = zone.tone ?? 'primary';
		}

		return tone;
	}

	private bullTone(location: number): DartboardTone | undefined {
		const zone = [ ...this.zones ].reverse().find(item => item.number === location);

		return zone ? zone.tone ?? 'primary' : undefined;
	}

	private pick(number: number, ring: DartboardPick['ring']): void {
		if (!this.interactive)
			return;

		this.dispatchEvent(new CustomEvent<DartboardPick>(dartboardPickEventName, {
			detail:   { number, ring },
			bubbles:  true,
			composed: true,
		}));
	}

	private renderWedge(number: number, index: number): SVGTemplateResult {
		const start = (index - 0.5) * step;
		const end = (index + 0.5) * step;

		return svg`${ areas.map(area => {
			const [ inner, outer ] = areaRadii[area];
			const tone = this.toneFor(number, area);
			const base = area === 'triple' || area === 'double' ? `ring-${ index % 2 }` : `wedge-${ index % 2 }`;

			return svg`
				<path
					class="area ${ tone ? `tone-${ tone }` : base }"
					d=${ arcPath(inner, outer, start, end) }
					@click=${ () => this.pick(number, pickRing(area)) }
				>
					${ this.interactive ? svg`<title>${ pickRing(area) } ${ number }</title>` : nothing }
				</path>
			`;
		}) }`;
	}

	private renderNumber(number: number, index: number): SVGTemplateResult {
		const [ x, y ] = polar(72.5, index * step);
		const label = this.labels[number];

		return svg`
			<text class="number ${ label ? 'number--custom' : '' }" x=${ x } y=${ y + 3 }>${ label ?? number }</text>
		`;
	}

	private renderMarker(marker: DartboardMarker): SVGTemplateResult | typeof nothing {
		const index = dartboardNumbers.indexOf(marker.number);
		if (index < 0)
			return nothing;

		const [ x, y ] = polar(markerRadii[marker.ring], index * step);

		return svg`
			<circle class="marker" cx=${ x } cy=${ y } r="7.5"></circle>
			<text class="marker-label" x=${ x } y=${ y + 3 }>${ marker.label }</text>
		`;
	}

	override render(): TemplateResult {
		const outerBull = this.bullTone(bullLocation);
		const innerBull = this.bullTone(doubleBullLocation);

		return html`
			<svg viewBox="-82 -82 164 164" role="img" aria-label=${ this.label }>
				<circle class="rim" r="80"></circle>
				${ dartboardNumbers.map((number, index) => this.renderWedge(number, index)) }
				${ dartboardNumbers.map((number, index) => this.renderNumber(number, index)) }
				<circle
					class="area ${ outerBull ? `tone-${ outerBull }` : 'bull' }"
					r="7"
					@click=${ () => this.pick(bullLocation, 'bull') }
				></circle>
				<circle
					class="area ${ innerBull ? `tone-${ innerBull }` : 'double-bull' }"
					r="3.2"
					@click=${ () => this.pick(doubleBullLocation, 'bull') }
				></circle>
				${ this.markers.map(marker => this.renderMarker(marker)) }
			</svg>
		`;
	}

	static override styles = unsafeCSS(dartboardStyles);

}

declare global {
	interface HTMLElementTagNameMap {
		'aa-dartboard': AaDartboard;
	}

	interface HTMLElementEventMap {
		[dartboardPickEventName]: CustomEvent<DartboardPick>;
	}
}
