import { css, html } from 'lit';
import { LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import { sharedStyles } from '../styles.js';

@customElement('change-me')
export class changeMe extends LitElement {

	@property({ type: Boolean }) test: boolean;
	override connectedCallback(): void {
		super.connectedCallback();
	}

	override render() {
		return html`

    `;
	}

	static override styles = [
		sharedStyles, css`
		:host {}
	`,
	];

}
