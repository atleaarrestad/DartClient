import type {
	Chart,
	ChartConfiguration,
	ChartType,
	DefaultDataPoint,
} from 'chart.js';
import type { ReactiveController, ReactiveControllerHost } from 'lit';

export type ChartClass = typeof Chart;

export interface ChartControllerOptions<
	TType extends ChartType,
	TData,
	TLabel,
> {
	/** The canvas to draw on. It may change between renders (for example behind a tab). */
	canvas:       () => HTMLCanvasElement | null | undefined;
	/** Builds the full chart configuration from the host's current state. */
	config:       (chart: ChartClass) => ChartConfiguration<TType, TData, TLabel>;
	/** The chart is updated only when one of these values changes (compared by identity). */
	dependencies: () => readonly unknown[];
}

type ChartRegistryModule = typeof import('./chart-registry.js');

let chartRegistry: ChartRegistryModule | undefined;
let chartRegistryLoad: Promise<ChartRegistryModule> | undefined;

/** Chart.js is only downloaded when the first chart is shown. */
const loadChartRegistry = (): Promise<ChartRegistryModule> =>
	chartRegistryLoad ??= import('./chart-registry.js').then(module => {
		chartRegistry = module;

		return module;
	});

const sameDependencies = (left: readonly unknown[], right: readonly unknown[]): boolean =>
	left.length === right.length
	&& left.every((value, index) => Object.is(value, right[index]));


/**
 * Owns one Chart.js instance for a Lit host:
 * - creates it lazily once the canvas is rendered (and loads Chart.js on first use);
 * - updates the existing chart in place when a dependency changes;
 * - destroys it on disconnect and recreates it on reconnect, or when the canvas is replaced.
 */
export class ChartController<
	TType extends ChartType = ChartType,
	TData = DefaultDataPoint<TType>,
	TLabel = unknown,
> implements ReactiveController {

	private chart?:            Chart<TType, TData, TLabel>;
	private lastDependencies?: readonly unknown[];

	constructor(
		private readonly host: ReactiveControllerHost & HTMLElement,
		private readonly options: ChartControllerOptions<TType, TData, TLabel>,
	) {
		host.addController(this);
	}

	hostConnected(): void {
		// Reconnected after a disconnect destroyed the chart: render again to rebuild it.
		if (!this.chart)
			this.host.requestUpdate();
	}

	hostUpdated(): void {
		this.sync();
	}

	hostDisconnected(): void {
		this.destroy();
	}

	private sync(): void {
		const canvas = this.options.canvas() ?? undefined;
		if (this.chart && this.chart.canvas !== canvas)
			this.destroy();

		if (!canvas || !this.host.isConnected)
			return;

		const dependencies = this.options.dependencies();

		if (this.chart) {
			if (this.lastDependencies && sameDependencies(dependencies, this.lastDependencies))
				return;

			this.lastDependencies = dependencies;
			this.update(this.chart);

			return;
		}

		if (!chartRegistry) {
			loadChartRegistry().then(
				() => this.sync(),
				(error: unknown) => console.error('Failed to load Chart.js', error),
			);

			return;
		}

		this.lastDependencies = dependencies;
		this.chart = new chartRegistry.Chart(canvas, this.options.config(chartRegistry.Chart));
	}

	private update(chart: Chart<TType, TData, TLabel>): void {
		const config = this.options.config(chartRegistry!.Chart);

		chart.data.labels = config.data.labels;
		chart.data.datasets = config.data.datasets;
		if (config.options)
			chart.options = config.options;

		chart.update();
	}

	private destroy(): void {
		this.chart?.destroy();
		this.chart = undefined;
		this.lastDependencies = undefined;
	}

}
