import { css, html } from 'lit';
import { LitElement } from 'lit';
import { customElement } from 'lit/decorators.js';

import { sharedStyles } from '../../styles.js';

@customElement('aa-button')
export class aaButton extends LitElement {

	override connectedCallback(): void {
		super.connectedCallback();
	}

	override render() {
		return html`
     		<button><slot></slot></button>
    	`;
	}

	static override styles = [
		sharedStyles, css`
		button {
			background: var(--button-color-first);
			color: #000;
			padding: 6px 10px;
			border: 2px solid black;
			border-bottom-width: 5px;
			border-right-width: 5px;
			border-radius: 12px;
			cursor: pointer;
			transition: transform 0.2s ease-out, box-shadow 0.2s ease-out;
		}
		button:hover {
			transform: translate(-.5px, -.5px);
			box-shadow: 2px 2px 0px black;
			background: orange
		}
	`,
	];

}
