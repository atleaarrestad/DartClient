import { html, css, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { RoundStatus, ThrowType, ScoreModifier } from "../models/enums.js";
import { Round } from "../models/roundSchema.js";
import { sharedStyles } from "../../styles.js";
import { AaCombobox } from "./aa-combobox-cmp.js"
import { User } from "../models/userSchema.js";
import { DataService } from "../services/dataService.js";
import { container } from "tsyringe";

@customElement("aa-player")
export class aaPlayer extends LitElement {
  private dataService: DataService;

  @property({ type: Array }) players : User[] = [];
  private selectedPlayerIndex: number = -1;

  @state() rounds: Round[] = [
    this._createRound(1),
    this._createRound(2),
    this._createRound(3),
    this._createRound(4),
    this._createRound(5),
    this._createRound(6),
    this._createRound(7),
    this._createRound(8),
    this._createRound(9),
    this._createRound(10),
    this._createRound(11),
    this._createRound(12),
    this._createRound(13),
    this._createRound(14),
    this._createRound(15),
    this._createRound(16),
    this._createRound(17),
    this._createRound(18),
    this._createRound(19),
    this._createRound(20),
    this._createRound(21),
    this._createRound(22),
    this._createRound(23),
    this._createRound(24),
    this._createRound(25),
  ];

  constructor() {
      super();
      this.dataService = container.resolve(DataService);
    }

  static override styles = [sharedStyles, css`
    :host {
      width: 100%;
      max-width: 25vw;
      min-height: 35vh;
      display: flex;
      flex-direction: column;
      border: 2px solid black;
      border-radius: 10px;
      background: var(--player-bg, #f0f0f0);
    }
    .rounds-container {
      max-height: 75vh;
      overflow-y: auto;
      scrollbar-width: none;
    }
    .alternate-color {
      background-color: rgba(180, 204, 185, 0.25)
    }
    .player-name-container{
      text-align: center;
    }
    .round-grid {
      display: grid;
      grid-template-columns: 1.5rem 1fr 3rem;
      align-items: center;
    }
    .round-labels-container {
      text-align: center;
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
    .throws-container {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
    }
    .round-number {
      border-right: 1px solid black;
      font-size: var(--font-size-round-number);
      line-height: 1.75rem;
      text-align: center;
    }
    .cumulative-points-round {
      border-left: 1px solid black;
      font-size: var(--font-size-cumulative-points);
      text-align: center;
    }
    .total-sum{
      text-align: center;
      border-top: 2px solid black;
      border-bottom: 2px solid black;
      padding-top: .5rem;
      padding-bottom: .5rem;
      font-size: 24px;
    }
  `];

  override render() {
    return html`
      <aa-combobox .players = ${this.players}></aa-combobox>
      <span class="total-sum">0 (-250)</span>
      <div class="round-labels-container round-grid">
        <span class="border-right">N</span>
        <span>Throws</span>
        <span class="border-left">Sum</span>
      </div>
      <div class="rounds-container">
        ${this.rounds.map((round, roundIndex) => html`
          <div class="${roundIndex % 2 === 0 ? 'alternate-color' : ''}">
            <div class="round-grid">
              <div class="round-number">${roundIndex + 1}</div>
              <div class="throws-container">
                ${round.dartThrows.map((dartThrow, throwIndex) => html`
                  <aa-dartthrow
                    .dartThrow=${dartThrow}
                    @throw-updated=${(e: CustomEvent) => this.handleThrowUpdated(e.detail.dartThrow, roundIndex)}
                  ></aa-dartthrow>
                `)}
              </div>
              <div class="cumulative-points-round">${round.cumulativePoints}</div>
          </div>
        </div>
        `)}
      </div>
    `;
  }

  private handleThrowUpdated(updatedThrow: Round["dartThrows"][number], roundIndex: number) {
    const updatedRounds = [...this.rounds];
    
    updatedRounds[roundIndex] = {
      ...updatedRounds[roundIndex]!, 
      dartThrows: updatedRounds[roundIndex]!.dartThrows.map((dartThrow, index) => 
        index === updatedThrow.throwIndex ? { ...dartThrow, ...updatedThrow } : dartThrow
    ),
  };
  
  this.rounds = updatedRounds;

  this.dataService.ValidateRounds(this.rounds).then((response: Round[]) => {
    this.rounds = response;
    console.log(response);
  })
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
