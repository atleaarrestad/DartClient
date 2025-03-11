import { html, css, LitElement } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { ThrowType } from "../models/enums.js";
import { DartThrow } from "../models/dartThrowSchema.js";

@customElement("aa-dartthrow")
export class aaDartThrow extends LitElement {
  @property({ type: Object }) dartThrow: DartThrow = {
    hitLocation: 0,
    throwType: ThrowType.Single,
    finalPoints: 0,
    throwIndex: 0,
    activatedModifiers: [],
  };
  @state() isReadOnly: boolean = false;
  @query("input") inputElement: HTMLInputElement;

  static override styles = css`
    :host {
      display: flex;
      gap: 5px;
      align-items: center;
      position: relative;
    }
    input[type="text"] {
      position: relative;
      text-align: center;
      z-index: 0;
    }
    .multiplier {
      position: absolute;
      top: -5px;
      right: -5px;
      width: 22px;
      height: 22px;
      background: green;
      color: white;
      font-size: 12px;
      font-weight: bold;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      z-index: 1;
    }
  `;

  override render() {
    return html`
      <div style="position: relative;">
        <input
          type="text"
          value=""
          ?readonly=${this.isReadOnly}
          @input=${this.handleInputChanged}
          @keydown=${this._handleKeyDown}
        >
        ${this._renderMultiplier()}
      </div>
    `;
  }

  private _renderMultiplier() {
    if (this.dartThrow.throwType === ThrowType.Double) {
      return html`<span class="multiplier">2x</span>`;
    }
    if (this.dartThrow.throwType === ThrowType.Triple) {
      return html`<span class="multiplier">3x</span>`;
    }
    return null;
  }

  private handleInputChanged(event: Event) {
    const input = event.target as HTMLInputElement;
    let value = parseInt(input.value, 10);

    if (isNaN(value)) {
      input.value = "";
      this.dartThrow = { ...this.dartThrow, hitLocation: 0, throwType: ThrowType.Single};
    } else if (value >= 0 && value <= 20) {
      input.value = String(value);
      this.dartThrow = { ...this.dartThrow, hitLocation: value };
    } else {
      input.value = String(this.dartThrow.hitLocation);
    }
    
    if (this.dartThrow.hitLocation === 0 &&
      (this.dartThrow.throwType == ThrowType.Double || this.dartThrow.throwType == ThrowType.Triple)){
       this.dartThrow.throwType = ThrowType.Single;
      }

    this.requestUpdate();
  }

  private _handleKeyDown(event: KeyboardEvent) {
    const upKeys = ["ArrowUp", "Up", "KP_Up"];
    const downKeys = ["ArrowDown", "Down", "KP_Down"];
    
    if (!upKeys.includes(event.key) && !downKeys.includes(event.key)) return;
    event.preventDefault();

    const throwTypes = [ThrowType.Miss, ThrowType.Rim, ThrowType.Single, ThrowType.Double, ThrowType.Triple];
    let currentIndex = throwTypes.indexOf(this.dartThrow.throwType);

    if (upKeys.includes(event.key) && currentIndex < throwTypes.length - 1) {
      currentIndex++;
    } else if (downKeys.includes(event.key) && currentIndex > 0) {
      currentIndex--;
    } else {
      return;
    }

    this.dartThrow = { ...this.dartThrow, throwType: throwTypes[currentIndex]! };

    if (this.dartThrow.hitLocation === 0 &&
       (this.dartThrow.throwType == ThrowType.Double || this.dartThrow.throwType == ThrowType.Triple)){
        this.dartThrow.throwType = ThrowType.Single;
       }

    this.updateDisplayForThrowType();
  }
  private updateDisplayForThrowType() {
    console.log(this.inputElement);
    if (this.dartThrow.throwType === ThrowType.Miss) {
      this.inputElement.value = "MISS";
      this.dartThrow = { ...this.dartThrow, hitLocation: 0 };
      this.isReadOnly = true;
    } else if (this.dartThrow.throwType === ThrowType.Rim) {
      this.inputElement.value = "RIM";
      this.dartThrow = { ...this.dartThrow, hitLocation: 0 };
      this.isReadOnly = true;
    } else {
      this.isReadOnly = false;
      if (this.inputElement.value === "MISS" || this.inputElement.value === "RIM") {
        this.inputElement.value = String(this.dartThrow.hitLocation);
      }
    }
  }
}
