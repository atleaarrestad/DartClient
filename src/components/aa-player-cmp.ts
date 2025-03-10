import { html, css, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import "./aa-round-cmp.js";
import { RoundStatus, ThrowType, ScoreModifier } from "../models/enums.js";
import { Round } from "../models/roundSchema.js";

@customElement("aa-player")
export class aaPlayer extends LitElement {
  @property({ type: String }) name = "Player";

  @state() rounds: Round[] = [
    this._createRound(1),
    this._createRound(2),
    this._createRound(3),
  ];

  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      border: 2px solid black;
      padding: 10px;
      margin: 5px;
      border-radius: 10px;
      background: var(--player-bg, #f0f0f0);
    }
  `;

  override render() {
    return html`
      <div><strong>${this.name}</strong></div>
      ${this.rounds.map((round, index) => html`
        <aa-round
          .round=${round}
          @round-updated=${(e: CustomEvent) => this._handleRoundUpdate(e.detail, index)}
        ></aa-round>
      `)}
    `;
  }

  private _handleRoundUpdate(updatedRound: Round, index: number) {
    this.rounds = this.rounds.map((round, i) =>
      i === index ? updatedRound : round
    );

    this._sendRoundsToServer();
  }

  private async _sendRoundsToServer() {
    try {
      const response = await fetch("/validate-rounds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(this.rounds),
      });

      if (!response.ok) throw new Error("Failed to validate rounds");

      const validatedRounds = await response.json();
      this.rounds = validatedRounds;
    } catch (error) {
      console.error("Error validating rounds:", error);
    }
  }

  private _createRound(roundNumber: number): Round {
    return {
      roundNumber,
      dartThrows: [
        { throwIndex: 0, hitLocation: 0, throwType: ThrowType.Single, finalPoints: 0, activatedModifiers: [] },
        { throwIndex: 1, hitLocation: 0, throwType: ThrowType.Single, finalPoints: 0, activatedModifiers: [] },
        { throwIndex: 2, hitLocation: 0, throwType: ThrowType.Single, finalPoints: 0, activatedModifiers: [] },
      ],
      cumulativePoints: 0,
      roundStatus: RoundStatus.Valid,
    };
  }
}
