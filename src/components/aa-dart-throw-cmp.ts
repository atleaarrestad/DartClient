import { css, html, LitElement } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';

import { DartThrow } from '../models/dartThrowSchema.js';
import { ThrowType } from '../models/enums.js';
import { sharedStyles } from '../styles.js';


@customElement('aa-dart-throw')
export class aaDartThrow extends LitElement {

	@property({ type: Object }) dartThrow:   DartThrow;
	@property({ type: Boolean }) isDisabled: boolean = false;

	@state() isReadOnly: boolean = false;

	@state() oldValue:     number = 0;
	@state() oldThrowType: ThrowType = ThrowType.Single;

	@query('input') inputElement: HTMLInputElement;

	override focus(options?: FocusOptions): void {
		this.shadowRoot?.querySelector('input')?.focus(options);
	}

	private handleBlur() {
		const isSameHitLocation = this.oldValue === this.dartThrow.hitLocation;
		const isSameThrowType = this.oldThrowType === this.dartThrow.throwType;

		if (isSameHitLocation && isSameThrowType)
			return;

		const bullseyeOrRim = [ 0, 25, 50 ].includes(this.dartThrow.hitLocation);
		const isDoubleOrTriple
			= this.dartThrow.throwType === ThrowType.Double
			|| this.dartThrow.throwType === ThrowType.Triple;

		if (bullseyeOrRim && isDoubleOrTriple)
			this.dartThrow.throwType = ThrowType.Single;

		const event = new CustomEvent('throw-updated', {
			detail:   { dartThrow: this.dartThrow },
			bubbles:  true,
			composed: true,
		});

		this.dispatchEvent(event);
		this.oldValue = this.dartThrow.hitLocation;
		this.oldThrowType = this.dartThrow.throwType;
	}

	private renderMultiplier() {
		if (this.dartThrow.throwType === ThrowType.Double) {
			return html`
			<div class="multiplier">
				<span>x2</span>
			</div>
			`;
		}
		if (this.dartThrow.throwType === ThrowType.Triple) {
			return html`
			<div class="multiplier">
				<span>x3</span>
			</div>
			`;
		}
	}

	private handleInputChanged(event: Event) {
		const input = event.target as HTMLInputElement;
		const value = parseInt(input.value, 10);

		if (isNaN(value)) {
			input.value = '';
			this.dartThrow = { ...this.dartThrow, hitLocation: 0, throwType: ThrowType.Single };
		}
		else if ((value >= 0 && value <= 20) || value === 25 || value == 50) {
			input.value = String(value);
			this.dartThrow = { ...this.dartThrow, hitLocation: value };
		}
		else {
			input.value = String(this.dartThrow.hitLocation);
		}

		if (this.dartThrow.hitLocation === 0
			&& (this.dartThrow.throwType == ThrowType.Double || this.dartThrow.throwType == ThrowType.Triple))
			this.dartThrow.throwType = ThrowType.Single;

		this.requestUpdate();
	}

	private handleKeyDown(event: KeyboardEvent) {
		const keyActions: Record<string, () => void> = {
			ArrowUp: () => this.adjustThrowType('up'),
			Up:      () => this.adjustThrowType('up'),
			KP_Up:   () => this.adjustThrowType('up'),

			ArrowDown: () => this.adjustThrowType('down'),
			Down:      () => this.adjustThrowType('down'),
			KP_Down:   () => this.adjustThrowType('down'),
		};

		if (keyActions[event.key]) {
			event.preventDefault();
			keyActions[event.key]!();
		}
	}

	private adjustThrowType(direction: 'up' | 'down') {
		const throwTypes = [ ThrowType.Miss, ThrowType.Rim, ThrowType.Single, ThrowType.Double, ThrowType.Triple ];
		const currentIndex = throwTypes.indexOf(this.dartThrow.throwType);

		if (direction === 'up' && currentIndex < throwTypes.length - 1)
			this.dartThrow = { ...this.dartThrow, throwType: throwTypes[currentIndex + 1]! };

		else if (direction === 'down' && currentIndex > 0)
			this.dartThrow = { ...this.dartThrow, throwType: throwTypes[currentIndex - 1]! };

		const isBullseyeOrRim = [ 0, 25, 50 ].includes(this.dartThrow.hitLocation);
		const isDoubleOrTriple
			= this.dartThrow.throwType === ThrowType.Double
			|| this.dartThrow.throwType === ThrowType.Triple;

		// Special case: If it's a Double or Triple, and the hitLocation is 0, reset to Single
		if (isBullseyeOrRim && isDoubleOrTriple)
			this.dartThrow.throwType = ThrowType.Single;

		this.updateDisplayForThrowType();
	}

	private updateDisplayForThrowType() {
		if (this.dartThrow.throwType === ThrowType.Miss) {
			this.inputElement.value = 'MISS';
			this.dartThrow = { ...this.dartThrow, hitLocation: 0 };
			this.isReadOnly = true;
		}
		else if (this.dartThrow.throwType === ThrowType.Rim) {
			this.inputElement.value = 'RIM';
			this.dartThrow = { ...this.dartThrow, hitLocation: 0 };
			this.isReadOnly = true;
		}
		else {
			this.isReadOnly = false;
			if (this.inputElement.value === 'MISS' || this.inputElement.value === 'RIM')
				this.inputElement.value = String(this.dartThrow.hitLocation);
		}
	}

	override render(): unknown {
		const value = this.dartThrow.hitLocation == 0 ? '' : this.dartThrow.hitLocation.toString();
		const wrapperClasses = { 'wrapper': true, 'is-middle-input': this.dartThrow.throwIndex === 1 };
		const inputClasses = { 'scoreModifierActivated': this.dartThrow.activatedModifiers.length > 0 };

		return html`
		<div class=${ classMap(wrapperClasses) }>
			<input
				name="input"
				tabindex ="-1"
				type     ="text"
				class    =${ classMap(inputClasses) }
				?readonly=${ this.isReadOnly }
				?disabled=${ this.isDisabled }
				.value   =${ value }
				@input   =${ this.handleInputChanged }
				@keydown =${ this.handleKeyDown }
				@blur    =${ this.handleBlur }
			>
			${ this.renderMultiplier() }
		</div>
    	`;
	}

	static override styles = [
		sharedStyles, css`
		:host {
			display: grid;
		}
		.wrapper {
			display: grid;
    		grid-template-columns: 1fr auto;
		}
		.scoreModifierActivated {
			color: rgba(247, 33, 226, 1);
			font-weight: bolder;
		}
		input[type="text"] {
			grid-row: 1/2;
			grid-column: 1/3;

			position: relative;
			text-align: center;
			z-index: 0;
			background-color: rgba(0, 0, 0, 0);
			border: unset;
			width: 100%;
			font-size: 1.25rem;
			height: 100%;
		}
		.multiplier {
			grid-row: 1/2;
			grid-column: 2/3;
			pointer-events: none;
			background: linear-gradient(90deg, rgba(180,204,185,0) 0%, rgba(180,204,185,0.4) 80%);
			align-content: center;

			span {
				font-style: italic;
				padding-right: .5rem;
			}
		}
		.is-middle-input {
			border-left: 1px solid rgba(0, 0, 0, .25);
			border-right: 1px solid rgba(0, 0, 0, .25);
    	}
  `,
	];

}
