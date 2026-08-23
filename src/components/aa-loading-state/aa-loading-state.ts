import { html, LitElement, TemplateResult, unsafeCSS } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import { sharedStyles } from '../../styles/shared-styles.js';
import loadingStateStyles from './aa-loading-state.css?inline';

@customElement('aa-loading-state')
export class AaLoadingState extends LitElement {

	@property({ type: Boolean }) loading = true;
	@property({ type: String }) label = 'Loading...';

	override render(): TemplateResult {
		return html`
			<div
				class="frame"
				?data-loading=${ this.loading }
				aria-busy=${ this.loading ? 'true' : 'false' }
			>
				<div
					class="content"
					aria-hidden=${ this.loading ? 'true' : 'false' }
					?inert=${ this.loading }
				>
					<slot></slot>
				</div>

				<div
					class="loader-layer"
					role="status"
					aria-live="polite"
					aria-hidden=${ this.loading ? 'false' : 'true' }
				>
					<div class="spinner" aria-hidden="true">
						<div class="target"></div>
						<div class="orbit">
							<div class="dart"></div>
						</div>
					</div>
					<span class="visually-hidden">${ this.label }</span>
				</div>
			</div>
		`;
	}

	static override styles = [
		sharedStyles,
		unsafeCSS(loadingStateStyles),
	];

}
