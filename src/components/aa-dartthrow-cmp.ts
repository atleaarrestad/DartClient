import { html, css, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { ThrowType, ScoreModifier } from "../models/enums.js"; // Import enums
import { DartThrow } from "../models/dartThrowSchema.js"


@customElement("aa-dartthrow")
export class aaDartThrow extends LitElement {

  @property({ type: Object }) dartThrow: DartThrow = {
    hitLocation: 0,
    throwType: ThrowType.Single,
    finalPoints: 0,
    throwIndex: 0,
    activatedModifiers: [],
  };
  

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
      .value=${String(this.dartThrow.hitLocation)}
      @input=${this._updateHitLocation}
    >
    <select @change=${this._updateThrowType}>
      ${Object.keys(ThrowType)
        .filter((key) => isNaN(Number(key)))
        .map((key) => html`
          <option value=${ThrowType[key as keyof typeof ThrowType]} ?selected=${this.dartThrow.throwType === ThrowType[key as keyof typeof ThrowType]}>
            ${key}
          </option>
        `)}
    </select>
    <span>Points: ${this.dartThrow.finalPoints}</span>
  `;
}



private _updateHitLocation(event: Event) {
  const input = event.target as HTMLInputElement;
  let value = parseInt(input.value, 10);
  if (isNaN(value) || value < 0 || value > 20) value = 0;

  this.dartThrow = { ...this.dartThrow, hitLocation: value };
  this._emitUpdate();
}

private _updateThrowType(event: Event) {
  const select = event.target as HTMLSelectElement;
  this.dartThrow = { ...this.dartThrow, throwType: parseInt(select.value) as ThrowType };
  this._emitUpdate();
}

private _emitUpdate() {
  this.dispatchEvent(new CustomEvent("throw-updated", {
    detail: this.dartThrow,
    bubbles: true,
    composed: true
  }));
}

}
