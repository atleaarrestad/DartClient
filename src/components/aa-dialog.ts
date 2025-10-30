import { LitElement, html, css, TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";

@customElement("aa-dialog")
export class AaDialog extends LitElement {
	@property({ type: Object })
	contentTemplate?: TemplateResult;
	override connectedCallback() {
		super.connectedCallback();
		window.addEventListener("keydown", this.onKeyDown);
	}

	override disconnectedCallback() {
		super.disconnectedCallback();
		window.removeEventListener("keydown", this.onKeyDown);
	}

	private onKeyDown = (e: KeyboardEvent) => {
		if (e.key === "Escape") {
			e.preventDefault();
			this.close();
		}
	};

	static override styles = css`
    :host {
      position: fixed;
      top: 0; left: 0;
      width: 100%; height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.5);
      z-index: 1000;
    }
    .dialog {
      background: white;
      border-radius: 8px;
      position: relative;
      max-width: 90%;
      max-height: 90%;
      overflow: auto;
	  padding: 1rem;
	  box-shadow: 3px 3px 0px 0px black;
    }
    .close-btn {
      position: absolute;
      top: -5px;
      right: -5px;
      cursor: pointer;
      background: none;
      border: none;
      font-size: 2rem;
    }
  `;

	override render() {
		return html`
      <div class="dialog" @click="${(e: Event) => e.stopPropagation()}">
        <button class="close-btn" @click="${this.close}">&times;</button>
        <slot></slot>
      </div>
    `;
	}

	close(result?: unknown) {
		this.dispatchEvent(new CustomEvent("dialog-closed", {
			bubbles: true,
			composed: true,
			detail: { result }
		}));
	}
}
