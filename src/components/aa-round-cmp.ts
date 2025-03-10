import { html, css, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { ThrowType, RoundStatus, ScoreModifier } from "../models/enums.js";
import "./aa-dartthrow-cmp.js";

@customElement("aa-round")
export class aaRound extends LitElement {
  @property({ type: Number }) roundNumber = 0;
  @property({ type: Number }) cumulativePoints = 0;
  @property({ type: Number }) roundStatus: RoundStatus = RoundStatus.Valid;
  @property({ type: Array }) dartThrows: Array<{
    hitLocation: number;
    throwType: ThrowType;
    finalPoints: number;
    activatedModifiers: ScoreModifier[];
  }> = [];

  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      border: 1px solid black;
      padding: 10px;
      margin: 5px;
      width: fit-content;
    }
    .round-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 5px;
    }
  `;

  override render() {
    return html`
      <div class="round-header">
        <span>Round ${this.roundNumber}</span>
        <span>Status: ${RoundStatus[this.roundStatus]}</span>
        <span>Points: ${this.cumulativePoints}</span>
      </div>
      ${this.dartThrows.map((dartThrow, index) => html`
        <aa-dartthrow
          .hitLocation=${dartThrow.hitLocation}
          .throwType=${dartThrow.throwType}
          .finalPoints=${dartThrow.finalPoints}
          .activatedModifiers=${dartThrow.activatedModifiers}
          @throw-updated=${(e: CustomEvent) => this._updateThrow(e.detail, index)}
        ></aa-dartthrow>
      `)}
    `;
  }

  private _updateThrow(updatedThrow: any, index: number) {
    this.dartThrows = this.dartThrows.map((t, i) =>
      i === index ? updatedThrow : t
    );

    this._notifyUpdate();
  }

  private _notifyUpdate() {
    this.dispatchEvent(new CustomEvent("round-updated", {
      detail: {
        roundNumber: this.roundNumber,
        dartThrows: this.dartThrows,
        cumulativePoints: this.cumulativePoints,
        roundStatus: this.roundStatus
      },
      bubbles: true,
      composed: true
    }));
  }

  updateFromServer(data: { roundNumber: number, dartThrows: any[], cumulativePoints: number, roundStatus: RoundStatus }) {
    this.roundNumber = data.roundNumber;
    this.dartThrows = data.dartThrows;
    this.cumulativePoints = data.cumulativePoints;
    this.roundStatus = data.roundStatus;
  }
}
