import { html, css, LitElement } from "lit";
import { customElement, property, query } from "lit/decorators.js";
import Chart, { BubbleDataPoint, ChartConfiguration, Plugin } from "chart.js/auto";
import type { HitCount } from "../models/schemas.js";
import { ThrowType } from "../models/enums.js";

// Plugin: draw dartboard rings beneath bubbles
const dartboardBackground: Plugin<"bubble"> = {
	id: "dartboardBackground",
	beforeDraw(chart) {
		const { ctx, chartArea: { left, top, width, height } } = chart;
		const centerX = left + width / 2;
		const centerY = top + height / 2;
		const radii = [0.25, 0.5, 0.75, 0.9].map(frac => Math.min(width, height) * frac / 2);

		ctx.save();
		ctx.strokeStyle = "#ccc";
		ctx.lineWidth = 1;
		radii.forEach((r) => {
			ctx.beginPath();
			ctx.arc(centerX, centerY, r, 0, 2 * Math.PI);
			ctx.stroke();
		});
		ctx.restore();
	},
};

@customElement("aa-hit-count-chart")
export class HitCountChart extends LitElement {
	/** Hit entries: { hitLocation, throwType, count } */
	@property({ type: Array }) hits: HitCount[] = [];

	/** Chart.js aspect ratio: width/height */
	@property({ type: Number }) aspectRatio = 2;

	@query("canvas") private canvas!: HTMLCanvasElement;
	private chart?: Chart<"bubble", BubbleDataPoint[]>;

	static styles = css`
    :host { display: block; width: 100%; }
    canvas { display: block; width: 100%; height: auto; }
  `;

	override render() {
		return html`<canvas></canvas>`;
	}

	override firstUpdated() {
		this.createChart();
	}

	override updated(changed: Map<string, any>) {
		if (changed.has("hits") && this.chart) {
			this.updateData();
		}
		if (changed.has("aspectRatio") && this.chart) {
			this.chart.options.maintainAspectRatio = true;
			this.chart.options.aspectRatio = this.aspectRatio;
			this.chart.update();
		}
	}

	private createChart() {
		const ctx = this.canvas.getContext("2d");
		if (!ctx) return;

		const config: ChartConfiguration<"bubble", BubbleDataPoint[]> = {
			type: "bubble",
			data: {
				datasets: [{
					label: "Hit Distribution",
					data: this.computePoints(),
					backgroundColor: "rgba(255, 0, 0, 0.6)",
				}],
			},
			options: {
				responsive: true,
				maintainAspectRatio: true,
				aspectRatio: this.aspectRatio,
				scales: {
					x: { min: -1, max: 1, display: false },
					y: { min: -1, max: 1, display: false },
				},
				plugins: {
					tooltip: {
						callbacks: {
							label: ({ raw }) => {
								const count = Math.round((raw.r / (Math.min(this.canvas.clientWidth, this.canvas.clientHeight) * 0.6 / 2)) ** 2 * this.totalCount());
								return `Count: ${count}`;
							},
						},
					},
				},
			},
			plugins: [dartboardBackground],
		};

		this.chart = new Chart(ctx, config);
	}

	private updateData() {
		if (!this.chart) return;
		this.chart.data.datasets[0].data = this.computePoints();
		this.chart.update();
	}

	private totalCount(): number {
		return this.hits.reduce((sum, h) => sum + h.count, 0) || 1;
	}

	private computePoints(): BubbleDataPoint[] {
		const segments = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17,
			3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
		const ringFrac: Record<ThrowType, number> = {
			[ThrowType.Single]: 0.5,
			[ThrowType.Triple]: 0.25,
			[ThrowType.Double]: 0.75,
			[ThrowType.Rim]: 0.9,
			[ThrowType.Miss]: 1.0,
		};

		// Only include single, double, triple in the dataset
		const validHits = this.hits.filter(
			({ throwType }) => throwType !== ThrowType.Miss && throwType !== ThrowType.Rim,
		);

		const total = this.totalCount();
		const diameter = Math.min(this.canvas.clientWidth, this.canvas.clientHeight);
		const scaleFactor = 0.2; // adjust circle size

		return validHits.map(({ hitLocation, throwType, count }) => {
			let x = 0, y = 0;

			if (![25, 50].includes(hitLocation)) {
				const idx = segments.indexOf(hitLocation);
				const angle = (2 * Math.PI * idx / segments.length) - Math.PI / 2;
				const frac = ringFrac[throwType];
				x = Math.cos(angle) * frac / 2;
				y = Math.sin(angle) * frac;
			}

			const rel = count / total;
			const r = Math.sqrt(rel) * (diameter * scaleFactor / 2);

			return { x, y, r };
		});
	};
}
