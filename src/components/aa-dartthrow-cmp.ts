import { html, css, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { ThrowType, ScoreModifier } from "../models/enums.js"; // Import enums

@customElement("aa-dartthrow")
export class aaDartThrow extends LitElement {
  @property({ type: Number }) hitLocation = 0;
  @property({ type: Number }) throwType: ThrowType = ThrowType.Single;
  @property({ type: Number }) finalPoints = 0;
  @property({ type: Array }) activatedModifiers: ScoreModifier[] = [];

  static override styles = css`
    :host {
      display: flex;
      gap: 5px;
      align-items: center;
    }
    select, input {
      width: 60px;
      text-align: center;
    }
    input[type="number"] {
      -moz-appearance: textfield;
    }
    input::-webkit-outer-spin-button,
    input::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
  `;

  override render() {
    return html`
      <input
        type="number"
        min="0"
        max="20"
        .value=${String(this.hitLocation)}
        @input=${this._updateHitLocation}
      >
      <select @change=${this._updateThrowType}>
        ${Object.entries(ThrowType).map(([key, value]) => html`
          <option value=${value} ?selected=${this.throwType === value}>
            ${key}
          </option>
        `)}
      </select>
      <span>Points: ${this.finalPoints}</span>
    `;
  }

  private _updateHitLocation(event: Event) {
    const input = event.target as HTMLInputElement;
    let value = parseInt(input.value, 10);
    if (isNaN(value) || value < 0 || value > 20) value = 0;
    this.hitLocation = value;
    this._emitUpdate();
  }

  private _updateThrowType(event: Event) {
    const select = event.target as HTMLSelectElement;
    this.throwType = parseInt(select.value) as ThrowType;
    this._emitUpdate();
  }

  private _emitUpdate() {
    this.dispatchEvent(new CustomEvent("throw-updated", {
      detail: {
        hitLocation: this.hitLocation,
        throwType: this.throwType,
        finalPoints: this.finalPoints,
        activatedModifiers: this.activatedModifiers
      },
      bubbles: true,
      composed: true
    }));
  }
}
