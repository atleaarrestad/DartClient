import { html, css, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { sharedStyles } from "../../styles.js";

@customElement("aa-info-card")
export class InfoCard extends LitElement {
	/** Top text */
	@property({ type: String }) label = "";
	/** Middle image URL */
	@property({ type: String }) imageSrc = "";
	/** Middle image alt text */
	@property({ type: String }) imageAlt = "";
	/** Bottom text */
	@property({ type: String }) value = "";

	override render() {
		return html`
      <div class="card">
        <div class="label">${this.label}</div>
        <div class="icon">
          ${this.imageSrc
				? html`<img src="${this.imageSrc}" alt="${this.imageAlt}" />`
				: html``}
        </div>
        <div class="value">${this.value}</div>
      </div>
    `;
	}

	static override styles = [
		sharedStyles,
		css`
      .card {
        display: grid;
        /* three rows: label / image area / value */
        grid-template-rows: 30px 1fr 30px;
        height: 150px;
        border: 1px solid var(--border-color, #ccc);
        border-radius: 0.5rem;
        padding: 0.5rem;
        text-align: center;
        box-shadow: var(--shadow, 0 2px 4px rgba(0, 0, 0, 0.1));
      }
      .label {
        font-size: 0.9rem;
        color: var(--secondary-text, #666);
        line-height: 30px; /* vertically center single line */
      }
      .icon {
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .icon img {
        width: 48px;
        height: 48px;
		margin-bottom: 0.5rem;
      }
      .value {
        font-size: 1.1rem;
        font-weight: bold;
        line-height: 30px; /* vertically center single line */
      }
    `,
	];
}
