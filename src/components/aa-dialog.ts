import { LitElement, html, css } from "lit";
import { customElement, property } from "lit/decorators.js";

@customElement("aa-dialog")
export class AaDialog extends LitElement {
  @property({ type: String }) override title: string = "";
  @property({ type: Boolean, reflect: true }) closeOnBackdrop = true;
  private _prevOverflow?: string;

  override connectedCallback() {
    super.connectedCallback();
    window.addEventListener("keydown", this.onKeyDown);
    this._prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    queueMicrotask(() => this.shadowRoot?.getElementById("dialog")?.focus());
  }

  override disconnectedCallback() {
    window.removeEventListener("keydown", this.onKeyDown);
    document.body.style.overflow = this._prevOverflow ?? "";
    super.disconnectedCallback();
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      this.close();
    }
  };

  private onBackdropClick = () => {
    if (this.closeOnBackdrop) this.close();
  };

  static override styles = css`
    :host {
      position: fixed;
      inset: 0;
      display: grid;
      place-items: center;
      background: rgba(0, 0, 0, 0.35);
      z-index: 1000;
      padding: 1rem;
    }

    .dialog {
      background: #f5f3ff;
      border: 2px solid #000;
      border-right-width: 6px;
      border-bottom-width: 6px;
      border-radius: 22px;
      box-shadow: 10px 10px 0 #000;
      max-width: min(1000px, 92vw);
      max-height: min(86vh, 1000px);
      width: 100%;
      display: grid;
      grid-template-rows: auto 1fr auto;
      outline: none;
    }
   
    .bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      padding: 0.75rem 0.9rem;
      border-bottom: 2px solid #000;
      background: #fff;
      border-top-left-radius: 20px;
      border-top-right-radius: 20px;
    }
    .title {
      font-weight: 900;
      font-size: 1.1rem;
      display: inline-flex;
      gap: 0.5rem;
      align-items: center;
    }

    .content {
      overflow: auto;
      padding: 1rem;
      background: transparent;
    }
    .content ::slotted(*) {
      width: auto !important;
      height: auto !important;
      box-sizing: border-box;
    }

    .footer {
      padding: 0.75rem 0.9rem;
      border-top: 2px dashed #000;
      background: #fff;
      border-bottom-left-radius: 20px;
      border-bottom-right-radius: 20px;
      display: flex;
      gap: 0.5rem;
      justify-content: flex-end;
    }

    .btn {
      appearance: none;
      background: #fff;
      border: 2px solid #000;
      border-right-width: 4px;
      border-bottom-width: 4px;
      border-radius: 14px;
      padding: 0.45rem 0.8rem;
      font-weight: 800;
      cursor: pointer;
      box-shadow: 4px 4px 0 #000;
    }
    .btn:active {
      transform: translate(2px, 2px);
      box-shadow: 2px 2px 0 #000;
    }

    .close-btn {
      composes: btn;
    }
  `;

  override render() {
    return html`
      <div
        id="dialog"
        class="dialog"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        @click=${(e: Event) => e.stopPropagation()}
      >
        <slot name="header" @slotchange=${this.requestUpdate}></slot>
        ${this.hasAssigned("header")
          ? null
          : html`
              <div class="bar">
                <div class="title">
                  <slot name="title">${this.title}</slot>
                </div>
                <button class="btn close-btn" @click=${this.close} aria-label="Close dialog">×</button>
              </div>
            `}

        <div class="content" @click=${(e: Event) => e.stopPropagation()}>
          <slot></slot>
        </div>

        <slot name="footer" @slotchange=${this.requestUpdate}></slot>
        ${this.hasAssigned("footer")
          ? null
          : html``}
      </div>
    `;
  }

  override firstUpdated() {
    this.addEventListener("click", this.onBackdropClick);
  }

  private hasAssigned(name: string): boolean {
    const slot = this.shadowRoot?.querySelector(`slot[name="${name}"]`) as HTMLSlotElement | null;
    return !!slot && slot.assignedNodes({ flatten: true }).length > 0;
  }

  close(result?: unknown) {
    this.dispatchEvent(
      new CustomEvent("dialog-closed", {
        bubbles: true,
        composed: true,
        detail: { result },
      }),
    );
  }
}
