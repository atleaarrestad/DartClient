import { html, LitElement, unsafeCSS } from 'lit';
import { customElement } from 'lit/decorators.js';

import { sharedStyles } from '../../styles/shared-styles.js';
import notificationContainerStyles from './aa-notification-container-cmp.css?inline';

@customElement('aa-notification-container-cmp')
export class NotificationContainer extends LitElement {

	override render() {
		return html`<slot></slot>`;
	}

	static override styles = [
		sharedStyles,
		unsafeCSS(notificationContainerStyles),
	];

}
