import { html, LitElement, svg, unsafeCSS } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import { ThrowType } from '../../models/enums.js';
import type { HitCount } from '../../models/schemas.js';
import dartboardHeatmapStyles from './aa-dartboard-heatmap.css?inline';

const boardNumbers = [
	20,
	1,
	18,
	4,
	13,
	6,
	10,
	15,
	2,
	17,
	3,
	19,
	7,
	16,
	8,
	11,
	14,
	9,
	12,
	5,
];

@customElement('aa-dartboard-heatmap')
export class AaDartboardHeatmap extends LitElement {

	@property({ type: Array }) hits: HitCount[] = [];

	private readonly center = 165;

	private getCount(hitLocation: number, throwType?: ThrowType): number {
		return this.hits
			.filter(hit =>
				hit.hitLocation === hitLocation
				&& (
					throwType === undefined
						? hit.throwType !== ThrowType.Rim && hit.throwType !== ThrowType.Miss
						: hit.throwType === throwType
				))
			.reduce((total, hit) => total + hit.count, 0);
	}

	private getThrowTypeTotal(throwType: ThrowType): number {
		return this.hits
			.filter(hit => hit.throwType === throwType)
			.reduce((total, hit) => total + hit.count, 0);
	}

	private getMaximumBoardCount(): number {
		const counts = boardNumbers.flatMap(number => [
			this.getCount(number, ThrowType.Single),
			this.getCount(number, ThrowType.Double),
			this.getCount(number, ThrowType.Triple),
		]);

		counts.push(this.getCount(25), this.getCount(50));

		return Math.max(...counts, 0);
	}

	private getHeatColor(count: number, maximum: number): string {
		if (count <= 0 || maximum <= 0)
			return '#f5f1e8';

		const intensity = Math.sqrt(count / maximum);
		const hue = 48 - (46 * intensity);
		const lightness = 92 - (36 * intensity);

		return `hsl(${ hue } 90% ${ lightness }%)`;
	}

	private getPoint(radius: number, angle: number): { x: number; y: number; } {
		const radians = angle * Math.PI / 180;

		return {
			x: this.center + radius * Math.cos(radians),
			y: this.center + radius * Math.sin(radians),
		};
	}

	private getRingPath(innerRadius: number, outerRadius: number, startAngle: number, endAngle: number): string {
		const outerStart = this.getPoint(outerRadius, startAngle);
		const outerEnd = this.getPoint(outerRadius, endAngle);
		const innerEnd = this.getPoint(innerRadius, endAngle);
		const innerStart = this.getPoint(innerRadius, startAngle);

		return [
			`M ${ outerStart.x } ${ outerStart.y }`,
			`A ${ outerRadius } ${ outerRadius } 0 0 1 ${ outerEnd.x } ${ outerEnd.y }`,
			`L ${ innerEnd.x } ${ innerEnd.y }`,
			`A ${ innerRadius } ${ innerRadius } 0 0 0 ${ innerStart.x } ${ innerStart.y }`,
			'Z',
		].join(' ');
	}

	private renderRing(
		innerRadius: number,
		outerRadius: number,
		throwType: ThrowType,
		label: string,
		maximum: number,
	) {
		return boardNumbers.map((number, index) => {
			const startAngle = -99 + index * 18;
			const endAngle = startAngle + 18;
			const count = this.getCount(number, throwType);
			const description = `${ label } ${ number }: ${ count.toLocaleString() } hits`;

			return svg`
				<path
					class="board-zone"
					d=${ this.getRingPath(innerRadius, outerRadius, startAngle, endAngle) }
					fill=${ this.getHeatColor(count, maximum) }
					tabindex="0"
					aria-label=${ description }
				>
					<title>${ description }</title>
				</path>
			`;
		});
	}

	private renderNumberLabels() {
		return boardNumbers.map((number, index) => {
			const point = this.getPoint(150, -90 + index * 18);

			return svg`
				<text
					x=${ point.x }
					y=${ point.y }
					text-anchor="middle"
					dominant-baseline="middle"
				>${ number }</text>
			`;
		});
	}

	override render(): unknown {
		const maximum = this.getMaximumBoardCount();
		const outerBullCount = this.getCount(25);
		const bullCount = this.getCount(50);
		const outerBullDescription = `Outer bull: ${ outerBullCount.toLocaleString() } hits`;
		const bullDescription = `Bullseye: ${ bullCount.toLocaleString() } hits`;

		return html`
			<div class="heatmap-layout">
				<svg
					class="dartboard"
					viewBox="0 0 330 330"
					role="img"
					aria-label="Dartboard heatmap of recorded hits"
				>
					<circle class="board-edge" cx="165" cy="165" r="137"></circle>
					${ this.renderRing(123, 135, ThrowType.Double, 'Double', maximum) }
					${ this.renderRing(86, 122, ThrowType.Single, 'Single', maximum) }
					${ this.renderRing(78, 86, ThrowType.Triple, 'Triple', maximum) }
					${ this.renderRing(18, 77, ThrowType.Single, 'Single', maximum) }
					<circle
						class="board-zone"
						cx="165"
						cy="165"
						r="18"
						fill=${ this.getHeatColor(outerBullCount, maximum) }
						tabindex="0"
						aria-label=${ outerBullDescription }
					>
						<title>${ outerBullDescription }</title>
					</circle>
					<circle
						class="board-zone"
						cx="165"
						cy="165"
						r="8"
						fill=${ this.getHeatColor(bullCount, maximum) }
						tabindex="0"
						aria-label=${ bullDescription }
					>
						<title>${ bullDescription }</title>
					</circle>
					${ this.renderNumberLabels() }
				</svg>

				<div class="heatmap-key">
					<div>
						<strong>Hit density</strong>
						<div class="heat-scale" aria-label="Heat scale from fewer to more hits">
							<span></span>
							<span></span>
							<span></span>
							<span></span>
							<span></span>
						</div>
						<div class="heat-scale-labels"><span>Fewer</span><span>More</span></div>
					</div>
					<div class="outside-counts">
						<span><strong>${ this.getThrowTypeTotal(ThrowType.Rim).toLocaleString() }</strong> Rim</span>
						<span><strong>${ this.getThrowTypeTotal(ThrowType.Miss).toLocaleString() }</strong> Miss</span>
					</div>
				</div>
			</div>
		`;
	}

	static override styles = unsafeCSS(dartboardHeatmapStyles);

}
