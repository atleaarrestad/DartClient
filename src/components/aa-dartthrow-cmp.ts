import { html, css, LitElement } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import { ThrowType } from "../models/enums.js";
import { DartThrow } from "../models/dartThrowSchema.js";
import { sharedStyles } from "../../styles.js";

@customElement("aa-dartthrow")
export class aaDartThrow extends LitElement {
  @property({ type: Object }) dartThrow: DartThrow
  @state() isReadOnly: boolean = false;
  @query("input") inputElement: HTMLInputElement;

  static override styles = [sharedStyles, css`
    input[type="text"] {
      position: relative;
      text-align: center;
      z-index: 0;
      background-color: rgba(0, 0, 0, 0);
      border: unset;
      width: 100%;
      font-size: var(--font-size-dartthrow);
    }

    .multiplier {
      pointer-events: none;
      position: absolute;
      top: 0%;
      right: 0px;
      width: 40%;
      height: 100%;
      background: linear-gradient(90deg, rgba(180,204,185,0) 0%, rgba(180,204,185,0.4) 80%);
      z-index: 1;
      text-align: right;
      span {
        font-size: var(--font-size-multiplier);
        font-style: italic;
        padding-right: .5rem;
        line-height: 2rem;

      }
    }
    .is-middle-input {
      border-left: 1px solid rgba(0, 0, 0, .25);
      border-right: 1px solid rgba(0, 0, 0, .25);
    }
  `];

  override render() {
    return html`
      <div style="position: relative;" class=${this.dartThrow.throwIndex === 1 ? 'is-middle-input': ''}>
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
      return html`
      <div class="multiplier">
        <span>x2</span>
      </div>`;
    }
    if (this.dartThrow.throwType === ThrowType.Triple) {
      return html`
      <div class="multiplier">
        <span>x3</span>
      </div>`;
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
