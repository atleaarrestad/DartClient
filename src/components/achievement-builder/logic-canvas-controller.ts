import type { ReactiveControllerHost } from 'lit';

const minimumScale = 0.35;
const maximumScale = 1.5;
const defaultOffset = 24;
const fitPadding = 48;
const wheelZoomSpeed = 0.0015;

interface CanvasDragState {
	pointerId: number;
	startX:    number;
	startY:    number;
	originX:   number;
	originY:   number;
}

interface CanvasElements {
	viewport: HTMLElement;
	graph:    HTMLElement;
}

/** Pan and zoom state for the logic canvas viewport. Needs no host lifecycle hooks. */
export class LogicCanvasController {

	scale = 1;
	x = defaultOffset;
	y = defaultOffset;
	dragging = false;

	private drag?: CanvasDragState;

	constructor(
		private readonly host: ReactiveControllerHost,
		private readonly getElements: () => Partial<CanvasElements>,
	) {}

	get transform(): string {
		return `translate(${ this.x }px, ${ this.y }px) scale(${ this.scale })`;
	}

	zoomTo(scale: number, focusX?: number, focusY?: number): void {
		const nextScale = Math.min(maximumScale, Math.max(minimumScale, scale));
		const { viewport } = this.getElements();
		const x = focusX ?? (viewport?.clientWidth ?? 0) / 2;
		const y = focusY ?? (viewport?.clientHeight ?? 0) / 2;
		const worldX = (x - this.x) / this.scale;
		const worldY = (y - this.y) / this.scale;

		this.x = x - worldX * nextScale;
		this.y = y - worldY * nextScale;
		this.scale = nextScale;
		this.host.requestUpdate();
	}

	zoomBy(delta: number): void {
		this.zoomTo(this.scale + delta);
	}

	panBy(deltaX: number, deltaY: number): void {
		this.x += deltaX;
		this.y += deltaY;
		this.host.requestUpdate();
	}

	async fit(): Promise<void> {
		await this.host.updateComplete;
		const { viewport, graph } = this.getElements();
		if (!viewport || !graph)
			return;

		const scale = Math.min(
			1,
			(viewport.clientWidth - fitPadding) / graph.offsetWidth,
			(viewport.clientHeight - fitPadding) / graph.offsetHeight,
		);
		this.scale = Math.max(minimumScale, scale);
		this.x = Math.max(defaultOffset, (viewport.clientWidth - graph.offsetWidth * this.scale) / 2);
		this.y = Math.max(defaultOffset, (viewport.clientHeight - graph.offsetHeight * this.scale) / 2);
		this.host.requestUpdate();
	}

	readonly handleWheel = (event: WheelEvent): void => {
		event.preventDefault();
		const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
		this.zoomTo(
			this.scale * Math.exp(-event.deltaY * wheelZoomSpeed),
			event.clientX - bounds.left,
			event.clientY - bounds.top,
		);
	};

	startDrag(event: PointerEvent): void {
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		this.drag = {
			pointerId: event.pointerId,
			startX:    event.clientX,
			startY:    event.clientY,
			originX:   this.x,
			originY:   this.y,
		};
		this.dragging = true;
		this.host.requestUpdate();
	}

	readonly handlePointerMove = (event: PointerEvent): void => {
		if (this.drag?.pointerId !== event.pointerId)
			return;

		this.x = this.drag.originX + event.clientX - this.drag.startX;
		this.y = this.drag.originY + event.clientY - this.drag.startY;
		this.host.requestUpdate();
	};

	readonly handlePointerUp = (event: PointerEvent): void => {
		if (this.drag?.pointerId !== event.pointerId)
			return;

		const viewport = event.currentTarget as HTMLElement;
		if (viewport.hasPointerCapture(event.pointerId))
			viewport.releasePointerCapture(event.pointerId);

		this.drag = undefined;
		this.dragging = false;
		this.host.requestUpdate();
	};

}
