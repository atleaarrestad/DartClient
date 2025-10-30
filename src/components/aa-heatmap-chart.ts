import { html, css, LitElement } from "lit";
import { customElement, property, query } from "lit/decorators.js";
import Chart from "chart.js/auto";
import type { HitCount } from "../models/schemas.js";
import { ThrowType } from "../models/enums.js";

@customElement("aa-hit-count-chart")
export class HitCountBarChart extends LitElement {
  @property({ type: Array }) hits: HitCount[] = [];

  @query("canvas") private _canvas!: HTMLCanvasElement;
  private _chart?: Chart;

  static override styles = css`
    :host {
      display: block;
      position: relative;
      width: 100%;
      height: 100%;
    }
    canvas {
      width: 100% !important;
      height: 100% !important;
    }
  `;

  override render() {
    return html`<canvas></canvas>`;
  }

  override firstUpdated() {
    this._renderChart();
  }

  override updated(changed: Map<string, unknown>) {
    if (changed.has("hits")) {
      this._renderChart();
    }
  }

  private _renderChart() {
    if (!this._canvas) return;

    const labels = [
      "Miss",
      "Rim",
      "1","2","3","4","5","6","7","8","9","10","11","12","13","14","15","16","17","18","19","20",
      "25",
      "50",
    ];

    const idxByLabel = new Map(labels.map((l, i) => [l, i]));

    const single = new Array<number>(labels.length).fill(0);
    const dbl = new Array<number>(labels.length).fill(0);
    const triple = new Array<number>(labels.length).fill(0);
    const miss = new Array<number>(labels.length).fill(0);
    const rim = new Array<number>(labels.length).fill(0);

    const locToLabel = (n: number): string => {
      if (n === 25) return "25";
      if (n === 50) return "50";
      if (n >= 1 && n <= 20) return String(n);
      return "";
    };

    for (const { hitLocation, throwType, count } of this.hits) {
      if (throwType === ThrowType.Miss) {
        const i = idxByLabel.get("Miss");
        if (i !== undefined) miss[i] += count;
        continue;
      }
      if (throwType === ThrowType.Rim) {
        const i = idxByLabel.get("Rim");
        if (i !== undefined) rim[i] += count;
        continue;
      }

      const label = locToLabel(hitLocation);
      const i = label ? idxByLabel.get(label) : undefined;
      if (i === undefined) continue;

      if (throwType === ThrowType.Single) {
        single[i] += count;
      } else if (throwType === ThrowType.Double) {
		if (hitLocation >= 1 && hitLocation <= 20) dbl[i] += count;
      } else if (throwType === ThrowType.Triple) {
        if (hitLocation >= 1 && hitLocation <= 20) triple[i] += count;
      }
    }

    // If chart exists, update in place
    if (this._chart) {
      this._chart.data.labels = labels;
      // Maintain dataset order/colors while replacing the data arrays
      this._chart.data.datasets[0].data = miss;
      this._chart.data.datasets[1].data = rim;
      this._chart.data.datasets[2].data = single;
      this._chart.data.datasets[3].data = dbl;
      this._chart.data.datasets[4].data = triple;
      this._chart.update();
      return;
    }

    const ctx = this._canvas.getContext("2d");
    if (!ctx) return;

    this._chart = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Miss",
            data: miss,
            backgroundColor: "#7f7f7f",
            borderWidth: 1,
            stack: "stack",
          },
          {
            label: "Rim",
            data: rim,
            backgroundColor: "#c7c7c7",
            borderWidth: 1,
            stack: "stack",
          },

          {
            label: "Single",
            data: single,
            backgroundColor: "#1f77b4",
            borderWidth: 1,
            stack: "stack",
          },
          {
            label: "Double",
            data: dbl,
            backgroundColor: "#ff7f0e",
            borderWidth: 1,
            stack: "stack",
          },
          {
            label: "Triple",
            data: triple,
            backgroundColor: "#d62728",
            borderWidth: 1,
            stack: "stack",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            stacked: true,
            title: { display: true, text: "Hit location" },
          },
          y: {
            stacked: true,
            beginAtZero: true,
            title: { display: true, text: "Hit Count" },
            ticks: { stepSize: 1 },
          },
        },
        plugins: {
          tooltip: {
            mode: "index",
            intersect: false,
            callbacks: {
              label: (ctx) => {
                const v = ctx.parsed.y ?? 0;
                if (!v) return "";
                const name = ctx.dataset.label || "";
                return `${name}: ${v}`;
              },
            },
          },
          legend: {
            labels: { filter: (item) => true },
          },
        },
      },
    });
  }
}
