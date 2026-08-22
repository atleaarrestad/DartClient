import { css, html, LitElement } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';

let tooltipId = 0;

@customElement('aa-info-tooltip')
export class AaInfoTooltip extends LitElement {
	@property({ type: String }) text = '';

	@state() private open = false;
	@state() private tooltipLeft = 0;
	@state() private tooltipTop = 0;

	@query('button') private button?: HTMLButtonElement;
	@query('[role="tooltip"]') private tooltip?: HTMLElement;

	private readonly descriptionId = `aa-info-tooltip-${ ++tooltipId }`;

	override disconnectedCallback(): void {
		this.removePositionListeners();
		super.disconnectedCallback();
	}

	private show = async (): Promise<void> => {
		this.open = true;
		this.addPositionListeners();
		await this.updateComplete;
		this.updatePosition();
	};

	private hide = (): void => {
		this.open = false;
		this.removePositionListeners();
	};

	private handleKeyDown = (event: KeyboardEvent): void => {
		if (event.key === 'Escape')
			this.hide();
	};

	private addPositionListeners(): void {
		window.addEventListener('resize', this.updatePosition);
		window.addEventListener('scroll', this.updatePosition, true);
	}

	private removePositionListeners(): void {
		window.removeEventListener('resize', this.updatePosition);
		window.removeEventListener('scroll', this.updatePosition, true);
	}

	private updatePosition = (): void => {
		if (!this.open || !this.button || !this.tooltip)
			return;

		const buttonRect = this.button.getBoundingClientRect();
		const tooltipRect = this.tooltip.getBoundingClientRect();
		const margin = 10;
		const left = Math.min(
			window.innerWidth - tooltipRect.width - margin,
			Math.max(margin, buttonRect.left + buttonRect.width / 2 - tooltipRect.width / 2),
		);
		const spaceBelow = window.innerHeight - buttonRect.bottom;
		const top = spaceBelow >= tooltipRect.height + margin
			? buttonRect.bottom + 7
			: buttonRect.top - tooltipRect.height - 7;

		this.tooltipLeft = left;
		this.tooltipTop = Math.max(margin, top);
	};

	override render(): unknown {
		return html`
			<button
				type="button"
				aria-label="More information"
				aria-describedby=${ this.descriptionId }
				aria-expanded=${ this.open }
				@mouseenter=${ this.show }
				@mouseleave=${ this.hide }
				@focus=${ this.show }
				@blur=${ this.hide }
				@click=${ this.show }
				@keydown=${ this.handleKeyDown }
			>
				i
			</button>
			<div
				id=${ this.descriptionId }
				role="tooltip"
				?hidden=${ !this.open }
				style=${ `left: ${ this.tooltipLeft }px; top: ${ this.tooltipTop }px;` }
			>
				${ this.text }
			</div>
		`;
	}

	static override styles = css`
		:host {
			display: inline-grid;
			flex: 0 0 auto;
		}
		button {
			display: inline-grid;
			place-items: center;
			width: 19px;
			height: 19px;
			padding: 0;
			border: 2px solid currentColor;
			border-radius: 50%;
			background: #fff;
			color: #000;
			font: 900 12px/1 Georgia, serif;
			cursor: help;
		}
		button:hover,
		button:focus-visible,
		button[aria-expanded='true'] {
			background: #7df9ff;
			outline: none;
		}
		[role='tooltip'] {
			position: fixed;
			z-index: 3000;
			width: max-content;
			max-width: min(260px, calc(100vw - 20px));
			padding: 0.55rem 0.65rem;
			border: 2px solid #000;
			border-radius: 9px;
			background: #fff3cf;
			box-shadow: 4px 4px 0 #000;
			color: #000;
			font-size: 0.75rem;
			font-weight: 600;
			line-height: 1.35;
			pointer-events: none;
		}
		[hidden] {
			display: none;
		}
	`;
}
