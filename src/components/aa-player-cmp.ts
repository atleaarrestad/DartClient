import { html, css, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import "./aa-round-cmp.js";
import { RoundStatus, ThrowType, ScoreModifier } from "../models/enums.js";
import { Round } from "../models/roundSchema.js";
import { sharedStyles } from "../../styles.js";

@customElement("aa-player")
export class aaPlayer extends LitElement {
  @property({ type: String }) name = "Player";

  @state() rounds: Round[] = [
    this._createRound(1),
    this._createRound(2),
    this._createRound(3),
  ];

  static override styles = [sharedStyles, css`
    :host {
      width: 100%;
      max-width: 25vw;
      display: flex;
      flex-direction: column;
      border: 2px solid black;
      border-radius: 10px;
      background: var(--player-bg, #f0f0f0);
    }
    .rounds-container {
      
    }
    .alternate-color {
      background-color: rgba(180, 204, 185, 0.25)
    }
    .player-name-container{
      text-align: center;
    }
    .round-labels-container {
      display: grid;
      grid-template-columns: 1.5rem 1fr 3rem;
      align-items: center;
      text-align: center;
      border-top: 1px solid black;
      border-bottom: 1px solid black;
      background-color: #B4CCB9;
      font-size: 10px;
    }
    .border-right{
      border-right: 1px solid black;
    }
    .border-left{
      border-left: 1px solid black;
    }
  `];

  override render() {
    return html`
      <div class="player-name-container">${this.name}</div>
      <div class="round-labels-container">
        <span class="border-right">N</span>
        <span>Throws</span>
        <span class="border-left">Sum</span>
      </div>
      <div class="rounds-container">
        ${this.rounds.map((round, index) => html`
          <div class="${index % 2 === 0 ? 'alternate-color' : ''}">
            <aa-round
              .round=${round}
              @round-updated=${(e: CustomEvent) => this._handleRoundUpdate(e.detail, index)}
            ></aa-round>
          </div>
        `)}
      </div>
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
