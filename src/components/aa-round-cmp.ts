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
      display: block;
    }
    .round-container {
      display: grid;
      grid-template-columns: 2rem 1fr 3rem;
      align-items: center;
    }
    .round-number {
      text-align: center;
      font-weight: bold;
      border-right: 1px solid black;
    }
    .throws-container {
      display: flex;
      flex-direction: row;
      justify-content: space-between;
    }
    .cumulative-points {
      text-align: right;
      font-weight: bold;
    }
  `;

  override connectedCallback() {
    super.connectedCallback();
    this._ensureThreeDartThrows();
  }

  override render() {
    return html`
      <div class="round-container">
        <div class="round-number">${this.round.roundNumber}</div>
        
        <div class="throws-container">
          ${this.round.dartThrows.map((dartThrow, index) => html`
            <aa-dartthrow
              .dartThrow=${dartThrow}
              @throw-updated=${(e: CustomEvent) => this._updateThrow(e.detail, index)}
            ></aa-dartthrow>
          `)}
        </div>
        
        <div class="cumulative-points">
          ${this.round.cumulativePoints}
        </div>
      </div>
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
