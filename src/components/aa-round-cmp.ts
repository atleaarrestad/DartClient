import { html, css, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { RoundStatus, ThrowType, ScoreModifier } from "../models/enums.js";
import { Round } from "../models/roundSchema.js";
import "./aa-dartthrow-cmp.js";

@customElement("aa-round")
export class aaRound extends LitElement {
  @property({ type: Object }) round: Round

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

  override connectedCallback() {
    super.connectedCallback();
    this._ensureThreeDartThrows();
  }

  override render() {
    return html`
      <div class="round-header">
        <span>Round ${this.round.roundNumber}</span>
        <span>Status: ${RoundStatus[this.round.roundStatus]}</span>
        <span>Points: ${this.round.cumulativePoints}</span>
      </div>
      ${this.round.dartThrows.map((dartThrow, index) => html`
        <aa-dartthrow
          .dartThrow=${dartThrow}
          @throw-updated=${(e: CustomEvent) => this._updateThrow(e.detail, index)}
        ></aa-dartthrow>
      `)}
    `;
  }

  private _updateThrow(updatedThrow: Round["dartThrows"][number], index: number) {
    this.round = {
      ...this.round,
      dartThrows: this.round.dartThrows.map((t, i) => (i === index ? updatedThrow : t)),
    };
    this._notifyUpdate();
  }

  private _notifyUpdate() {
    this.dispatchEvent(
      new CustomEvent("round-updated", {
        detail: this.round,
        bubbles: true,
        composed: true,
      })
    );
  }

  updateFromServer(updatedRound: Round) {
    this.round = {
      ...this.round,
      cumulativePoints: updatedRound.cumulativePoints,
      roundStatus: updatedRound.roundStatus,
      dartThrows: updatedRound.dartThrows.length === 3 ? updatedRound.dartThrows : this.round.dartThrows,
    };
  }

  private _ensureThreeDartThrows() {
    if (this.round.dartThrows.length < 3) {
      const existingIndices = new Set(this.round.dartThrows.map(t => t.throwIndex));
  
      this.round = {
        ...this.round,
        dartThrows: [
          ...this.round.dartThrows,
          ...Array.from({ length: 3 }, (_, i) => i)
            .filter(i => !existingIndices.has(i))
            .map(i => ({
              throwIndex: i,
              hitLocation: 0,
              throwType: ThrowType.Single,
              finalPoints: 0,
              activatedModifiers: [] as ScoreModifier[],
            })),
        ].sort((a, b) => a.throwIndex - b.throwIndex),
      };
    }
  }
  
}
