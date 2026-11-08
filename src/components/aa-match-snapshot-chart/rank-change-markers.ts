import type { Chart, Plugin } from 'chart.js';

import { getRankIcon, getRankTier, Rank, RankDisplayValues } from '../../models/rank.js';

// ── Finding the changes ─────────────────────────────────────────────────────

export interface RankChange {
	/** The snapshot, and chart point, where the player reached the new tier. */
	index:     number;
	from:      Rank;
	tier:      Rank;
	direction: 'up' | 'down';
}

/** Where the player moves into another tier: Platinum to Diamond, not Diamond I to Diamond II. */
export const findRankChanges = (snapshots: readonly { rank: Rank; }[]): RankChange[] =>
	snapshots.flatMap((snapshot, index) => {
		const previous = snapshots[index - 1];
		if (!previous || typeof previous.rank !== 'number' || typeof snapshot.rank !== 'number')
			return [];

		const from = getRankTier(previous.rank);
		const tier = getRankTier(snapshot.rank);

		return tier === from ? [] : [ { index, from, tier, direction: tier > from ? 'up' as const : 'down' as const } ];
	});

export const describeRankChange = (change: RankChange): string =>
	`${ change.direction === 'up' ? '▲ Promoted to' : '▼ Dropped to' } ${ RankDisplayValues[change.tier] }`;

// ── Placing the badges ──────────────────────────────────────────────────────

export interface Box {
	left:   number;
	top:    number;
	right:  number;
	bottom: number;
}

export type BadgeSide = 'above' | 'below';

export interface BadgeRequest {
	x:         number;
	preferred: BadgeSide;
}

export interface BadgePlacement {
	box:  Box;
	side: BadgeSide;
}

export interface BadgeLayout {
	width:      number;
	height:     number;
	area:       Box;
	/** The topmost and bottommost y any line reaches between two x positions. */
	lineExtent: (left: number, right: number) => { top: number; bottom: number; };
	/** Other things drawn on the chart that badges must not cover, such as the peak label. */
	obstacles?: readonly Box[];
}

/** Space between a line and a badge, and between two badges stacked on one side. */
const lineGap = 8;
const laneGap = 4;
/** How far out badges stack before one is left out (its point ring still shows). */
const maxLanes = 2;

const overlaps = (left: Box, right: Box): boolean =>
	left.left < right.right && right.left < left.right && left.top < right.bottom && right.top < left.bottom;

/**
 * Puts a badge next to each change without covering the lines or another badge: on its
 * preferred side (above for a promotion), else the other side, else one lane further out on
 * either side. Changes close together therefore end up alternating above and below the line.
 * A change with no free spot gets no badge.
 */
export const layoutBadges = (
	requests: readonly BadgeRequest[],
	layout: BadgeLayout,
): (BadgePlacement | undefined)[] => {
	const taken: Box[] = [ ...layout.obstacles ?? [] ];
	const { width, height, area } = layout;

	return requests.map(request => {
		const left = Math.min(Math.max(request.x - width / 2, area.left), area.right - width);
		const right = left + width;
		const extent = layout.lineExtent(left - lineGap, right + lineGap);
		const sides: BadgeSide[] = request.preferred === 'above' ? [ 'above', 'below' ] : [ 'below', 'above' ];

		for (let lane = 0; lane < maxLanes; lane++) {
			for (const side of sides) {
				const distance = lineGap + lane * (height + laneGap);
				const top = side === 'above' ? extent.top - distance - height : extent.bottom + distance;
				const box = { left, right, top, bottom: top + height };
				if (box.top >= area.top && box.bottom <= area.bottom && !taken.some(item => overlaps(item, box))) {
					taken.push(box);

					return { box, side };
				}
			}
		}

		return undefined;
	});
};

export interface LinePoint {
	x: number;
	y: number;
}

/** Room for the curve: a smoothed line bulges a little past the straight segment. */
const curveAllowance = 4;

/**
 * The topmost and bottommost y of the lines between `left` and `right`, following each line
 * through its points (straight between them, plus a little room for the curve).
 */
export const getLineExtent = (
	lines: readonly (readonly LinePoint[])[],
	left: number,
	right: number,
): { top: number; bottom: number; } => {
	let top = Number.POSITIVE_INFINITY;
	let bottom = Number.NEGATIVE_INFINITY;
	const include = (y: number): void => {
		top = Math.min(top, y);
		bottom = Math.max(bottom, y);
	};
	const yAt = (from: LinePoint, to: LinePoint, x: number): number =>
		to.x === from.x ? from.y : from.y + (to.y - from.y) * (x - from.x) / (to.x - from.x);

	for (const points of lines) {
		points.forEach((point, index) => {
			if (point.x >= left && point.x <= right)
				include(point.y);

			const next = points[index + 1];
			if (next && point.x < right && next.x > left) {
				include(yAt(point, next, Math.max(left, point.x)));
				include(yAt(point, next, Math.min(right, next.x)));
			}
		});
	}

	return Number.isFinite(top)
		? { top: top - curveAllowance, bottom: bottom + curveAllowance }
		: { top: Number.POSITIVE_INFINITY, bottom: Number.NEGATIVE_INFINITY };
};

// ── Drawing ─────────────────────────────────────────────────────────────────

// Canvas drawing can't read CSS custom properties; these mirror tokens.css.
const inkColor = '#000';
const badgeColor = '#fff';
const upColor = '#2e9e4f';
const downColor = '#d64545';

const badgeWidth = 46;
const badgeHeight = 32;
const iconSize = 26;
const ringRadius = 7;

/** Rank icons are drawn once loaded; a chart waiting for one redraws when it arrives. */
const icons: Map<string, HTMLImageElement> = new Map();
const waiting: Map<HTMLImageElement, Set<Chart<'line'>>> = new Map();

const getIcon = (rank: Rank, chart: Chart<'line'>): HTMLImageElement | undefined => {
	const src = getRankIcon(rank);
	let icon = icons.get(src);
	if (!icon) {
		const image = new Image();
		icon = image;
		image.addEventListener('load', () => {
			waiting.get(image)?.forEach(item => {
				// A chart destroyed in the meantime has no context left.
				if (item.ctx)
					item.draw();
			});
			waiting.delete(image);
		}, { once: true });
		image.src = src;
		icons.set(src, image);
	}
	if (icon.complete && icon.naturalWidth > 0)
		return icon;

	waiting.set(icon, (waiting.get(icon) ?? new Set()).add(chart));

	return undefined;
};

const drawBadge = (chart: Chart<'line'>, change: RankChange, box: Box): void => {
	const { ctx } = chart;
	const color = change.direction === 'up' ? upColor : downColor;

	// A small offset shadow, like the app's cards.
	ctx.fillStyle = inkColor;
	ctx.beginPath();
	ctx.roundRect(box.left + 2, box.top + 2, badgeWidth, badgeHeight, 8);
	ctx.fill();

	ctx.fillStyle = badgeColor;
	ctx.strokeStyle = inkColor;
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.roundRect(box.left, box.top, badgeWidth, badgeHeight, 8);
	ctx.fill();
	ctx.stroke();

	const icon = getIcon(change.tier, chart);
	if (icon)
		ctx.drawImage(icon, box.left + 3, box.top + (badgeHeight - iconSize) / 2, iconSize, iconSize);

	// ▲ or ▼ to the right of the icon.
	const arrowX = box.left + 3 + iconSize + 2;
	const middle = box.top + badgeHeight / 2;
	const tip = change.direction === 'up' ? -5 : 5;
	ctx.fillStyle = color;
	ctx.beginPath();
	ctx.moveTo(arrowX, middle - tip);
	ctx.lineTo(arrowX + 10, middle - tip);
	ctx.lineTo(arrowX + 5, middle + tip);
	ctx.closePath();
	ctx.fill();
};

/** A thin line from the point to the edge of its badge. */
const drawLeader = (chart: Chart<'line'>, point: LinePoint, placement: BadgePlacement, color: string): void => {
	const { ctx } = chart;
	const { box, side } = placement;
	const fromY = point.y + (side === 'above' ? -ringRadius : ringRadius);
	const toX = Math.min(Math.max(point.x, box.left + 8), box.right - 8);
	const toY = side === 'above' ? box.bottom : box.top;

	ctx.strokeStyle = color;
	ctx.lineWidth = 1.5;
	ctx.beginPath();
	ctx.moveTo(point.x, fromY);
	ctx.lineTo(toX, toY);
	ctx.stroke();
};

const drawRing = (chart: Chart<'line'>, point: LinePoint, color: string): void => {
	const { ctx } = chart;
	ctx.fillStyle = badgeColor;
	ctx.strokeStyle = color;
	ctx.lineWidth = 3;
	ctx.beginPath();
	ctx.arc(point.x, point.y, ringRadius - 1.5, 0, Math.PI * 2);
	ctx.fill();
	ctx.stroke();
};

const getVisibleLines = (chart: Chart<'line'>): LinePoint[][] =>
	chart.data.datasets.flatMap((_, index) => chart.isDatasetVisible(index)
		? [ chart.getDatasetMeta(index).data.map(element => ({ x: element.x, y: element.y })) ]
		: []);

/**
 * Marks every change of tier on the MMR line: a ring on the point and a badge with the new
 * tier's icon and ▲/▼, placed beside the line so the curve stays readable.
 * `obstacles` are other labels on the chart the badges must not cover.
 */
export const createRankChangeMarkers = (
	changes: readonly RankChange[],
	obstacles: (chart: Chart<'line'>) => Box[] = () => [],
): Plugin<'line'> => ({
	id: 'rankChangeMarkers',
	afterDatasetsDraw(chart): void {
		const points = chart.getDatasetMeta(0).data;
		const marked = changes.flatMap(change => {
			const element = points[change.index];

			return element ? [ { change, point: { x: element.x, y: element.y } } ] : [];
		});
		if (marked.length === 0)
			return;

		const lines = getVisibleLines(chart);
		const placements = layoutBadges(
			marked.map(({ change, point }) => ({ x: point.x, preferred: change.direction === 'up' ? 'above' : 'below' })),
			{
				width:      badgeWidth + 2,
				height:     badgeHeight + 2,
				area:       chart.chartArea,
				lineExtent: (left, right) => getLineExtent(lines, left, right),
				obstacles:  obstacles(chart),
			},
		);

		const { ctx } = chart;
		ctx.save();
		marked.forEach(({ change, point }, index) => {
			const color = change.direction === 'up' ? upColor : downColor;
			const placement = placements[index];
			if (placement) {
				drawLeader(chart, point, placement, color);
				drawBadge(chart, change, placement.box);
			}

			drawRing(chart, point, color);
		});
		ctx.restore();
	},
});
