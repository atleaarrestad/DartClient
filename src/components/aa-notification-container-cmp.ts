import { LitElement, html, css } from "lit";
import { customElement } from "lit/decorators.js";
import { sharedStyles } from "../../styles.js";

@customElement("aa-notification-container-cmp")
export class NotificationContainer extends LitElement {
	override render() {
		return html`<slot></slot>`;
	}

	static override styles = [sharedStyles, css`
		:host {
			position: fixed;
			top: 20px;
			right: 20px;
			display: flex;
			flex-direction: column;
			gap: 10px;
			z-index: 9999;
			max-height: 80vh;
		}
  `];
}
