import {
	BarController,
	BarElement,
	CategoryScale,
	Chart,
	Colors,
	Filler,
	Legend,
	LinearScale,
	LineController,
	LineElement,
	PointElement,
	SubTitle,
	Tooltip,
} from 'chart.js';

/**
 * Only the Chart.js parts the app's charts use. A chart that needs anything
 * else (a new chart type, scale or plugin) must register it here, otherwise
 * Chart.js fails at runtime ("… is not a registered controller") or silently
 * ignores the plugin options. `chart-registry.test.ts` builds every chart
 * config against this registry.
 */
export const chartComponents = [
	BarController,
	BarElement,
	LineController,
	LineElement,
	PointElement,
	CategoryScale,
	LinearScale,
	Colors,
	Filler,
	Legend,
	SubTitle,
	Tooltip,
];

Chart.register(...chartComponents);

export { Chart };
