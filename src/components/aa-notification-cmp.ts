import { LitElement, html, css } from "lit";
import { property, customElement } from "lit/decorators.js";
import { sharedStyles } from "../../styles.js";

@customElement("aa-notification-cmp")
export class NotificationElement extends LitElement {
	@property() message: string = "";
	@property() type: "success" | "danger" | "info" = "success";
	@property({ type: Boolean }) visible: boolean = true;
	@property({ type: Object }) promise: Promise<unknown> | null = null;

	static override styles = [
		sharedStyles,
		css`
      :host([hidden]) {
        opacity: 0;
        transform: translateY(-20px);
      }

      .icon {
        font-size: 14px;
        padding-right: 1rem;
        height: fit-content;
        width: fit-content;
      }

      .content {
        flex-grow: 1;
      }

      .title {
        font-size: 18px;
        margin-bottom: 5px;
      }

      .message {
        font-size: 14px;
        word-wrap: break-word;
        white-space: normal;
      }
      .notification {
        display: grid;
        grid-template-columns: auto 1fr;
        align-items: center;
        padding: 12px 20px;
        width: 300px;
        border: 2px solid black;
        border-radius: 5px;
        font-weight: bold;
        text-align: left;
        opacity: 1;
        transform: translateY(-10px);
        transition: opacity 0.3s, transform 0.3s;
        pointer-events: none;
        color: black;
        box-shadow: 2px 2px 0px 0px black;
      }
      .message {
        font-family: var(--font-family-second);
        font-size: var(--font-size-notification);
      }
    `,
	];

	override firstUpdated() {
		if (this.promise) {
			this.promise.finally(() => {
				setTimeout(() => {
					this.visible = false;
					this.remove();
				}, 600);
			});
		}
		else {
			setTimeout(() => {
				this.visible = false;
				setTimeout(() => {
					this.remove();
				}, 300);
			}, 3000);
		}
	}

	override updated(changedProperties: Map<string, unknown>) {
		super.updated(changedProperties);
		if (changedProperties.has("visible") && !this.visible) {
			this.setAttribute("hidden", "");
		}
		else {
			this.removeAttribute("hidden");
		}
	}

	private getIconClass() {
		if (this.promise != undefined) {
			return "fas fa-spinner fa-spin info";
		}

		switch (this.type) {
			case "success": return "fas fa-check-circle success";
			case "danger": return "fas fa-exclamation-triangle danger";
			case "info": return "fas fa-info-circle info";
			default: return "fas fa-info-circle info";
		}
	}

	private getBackgroundColor() {
		switch (this.type) {
			case "success": return "var(--color-success)";
			case "danger": return "var(--color-danger)";
			case "info": return "var(--color-info)";
			default: return "#333";
		}
	}

	override render() {
		return html`
      <div
        class="notification"
        style="background-color: ${this.getBackgroundColor()}"
      >
        <div class="icon">
          <i class="${this.getIconClass()}"></i>
        </div>
        <div class="content">
          <div class="message">${this.message}</div>
        </div>
      </div>
    `;
	}
}
