import { html, css, LitElement } from "lit";
import { customElement, property, query } from "lit/decorators.js";
import Chart from "chart.js/auto";
import type { MatchSnapshot } from "../models/schemas.js";

@customElement("aa-match-snapshot-chart")
export class MatchSnapshotChart extends LitElement {
  /**
   * Array of MatchSnapshot objects with { date: Date | string, mmr: number }
   */
  @property({ type: Array }) snapshots: MatchSnapshot[] = [];

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
      display: block; /* avoid inline canvas baseline gap */
    }
  `;

  override render() {
    return html`<canvas></canvas>`;
  }

  override firstUpdated() {
    this._renderChart();
  }

  override updated(changed: Map<string, unknown>) {
    if (changed.has("snapshots")) {
      this._renderChart();
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    // Clean up to avoid memory leaks when element is removed
    if (this._chart) {
      this._chart.destroy();
      this._chart = undefined;
    }
  }

  private _renderChart() {
    if (!this._canvas) return;

    const labels = this.snapshots.map((s) => {
      const d = new Date(s.date as any);
      return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    });
    const data = this.snapshots.map((s) => s.mmr);

    if (this._chart) {
      this._chart.data.labels = labels;
      this._chart.data.datasets[0].data = data;
      this._chart.update();
      return;
    }

    const ctx = this._canvas.getContext("2d");
    if (!ctx) return;

    this._chart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "MMR over Time",
            data,
            tension: 0.2,
            fill: false,
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false, // <-- key for filling the container height
        scales: {
          x: { title: { display: true, text: "Date" } },
          y: { title: { display: true, text: "MMR" }, beginAtZero: false },
        },
        plugins: {
          // (optional) crisp tooltips without extra noise
          tooltip: {
            mode: "index",
            intersect: false,
          },
          legend: {
            labels: { filter: (item) => true },
          },
        },
      },
    });
  }
}
