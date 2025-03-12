import { html, css, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { RoundStatus, ThrowType, ScoreModifier } from "../models/enums.js";
import { Round } from "../models/roundSchema.js";
import "./aa-dartthrow-cmp.js";
import { sharedStyles } from "../../styles.js";

@customElement("aa-round")
export class aaRound extends LitElement {
  @property({ type: Object }) round: Round

  static override styles = [sharedStyles, css`
    :host {

    }

    .round-container {
      display: grid;
      grid-template-columns: 1.5rem 1fr 3rem;
      align-items: center;
    }
    .throws-container {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
    }
    .round-number {
      border-right: 1px solid black;
      font-size: var(--font-size-round-number);
      line-height: 1.75rem;
    }
    .cumulative-points {
      border-left: 1px solid black;
      font-size: var(--font-size-cumulative-points)
    }
    .cumulative-points, .round-number{
      text-align: center;
      
    }
  `];

  override connectedCallback() {
    super.connectedCallback();
    this._ensureThreeDartThrows();
  }

  override render() {
    return html`
      <div class="round-container">
        <span class="round-number">${this.round.roundNumber}</span>
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
