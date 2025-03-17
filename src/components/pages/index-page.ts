import { html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import { sharedStyles } from "../../../styles.js";

import { LitElement } from "lit";
import { DataService } from "../../services/dataService.js";
import { NotificationService } from "../../services/notificationService.js";
import { container } from "tsyringe";

import { User } from "../../models/userSchema.js";
import { Round } from "../../models/roundSchema.js";
import { ThrowType, RoundStatus } from "../../models/enums.js"

import "../aa-button-cmp.js";
import { PlayerRounds } from "src/models/roundSchema.js";
import { aaDartThrow } from "../aa-dartthrow-cmp.js";


@customElement("index-page")
export class IndexPage extends LitElement {
  private dataService: DataService;
  private notificationService: NotificationService;

  @property({ type: Array }) users : User[] = [];
  @property({type: Array}) players: PlayerRounds[] = [
    {playerId: "",
      rounds: [
        this.createRound(1),
        this.createRound(2),
        this.createRound(3)
      ]
    },
    {playerId: "",
      rounds: [
        this.createRound(1),
        this.createRound(2),
        this.createRound(3)
      ]
    }
  ];

  constructor() {
    super();
    this.dataService = container.resolve(DataService);
    this.notificationService = container.resolve(NotificationService);
  }

  public override connectedCallback(): void {
    this.healthCheckServer();
    this.loadUsers();
    super.connectedCallback();
  }
  
  
  private async healthCheckServer(): Promise<void> {
    this.dataService.Ping().catch(error => this.notificationService.addNotification(error, "danger"));
  }

  private async loadUsers(): Promise<void> {
    const usersPromise = this.dataService.GetAllUsers();
    this.notificationService.addNotification("Fetching users..", "info", usersPromise);

    usersPromise
        .then(users => {
            if (users) {
                this.users = [...users];
            } else {
                this.users = [];
            }
        })
        .catch(error => {
            this.notificationService.addNotification(error, "danger");
        });

  }

  private createRound(roundNumber: number): Round {
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

  private handleThrowUpdated(updatedThrow: Round["dartThrows"][number], playerIndex: number, roundIndex: number) {
    if (!this.players[playerIndex]) {
      return;
    }
  
    const updatedRounds = [...this.players[playerIndex].rounds];
  
    updatedRounds[roundIndex] = {
      ...updatedRounds[roundIndex]!, 
      dartThrows: updatedRounds[roundIndex]!.dartThrows.map((dartThrow, index) => 
        index === updatedThrow.throwIndex ? { ...dartThrow, ...updatedThrow } : dartThrow
      )
    };
  
    const updatedPlayer = { ...this.players[playerIndex], rounds: updatedRounds };
  
    this.players = [
      ...this.players.slice(0, playerIndex),
      updatedPlayer,                         
      ...this.players.slice(playerIndex + 1)
    ];
  
    this.dataService.ValidateRounds(updatedRounds).then((response: Round[]) => {
      updatedPlayer.rounds = [...response];

      this.players = [
        ...this.players.slice(0, playerIndex),
        updatedPlayer,
        ...this.players.slice(playerIndex + 1)
      ];
    });
  }

  private handleUserselected(user: User, playerIndex: number) {
    this.players[playerIndex]!.playerId = user.id;
    console.log(this.players[playerIndex]);
  }

  private handleRequestNextThrowFocus(playerIndex: number, roundIndex: number, throwIndex: number) {
    const player = this.players[playerIndex];
    const round = player!.rounds[roundIndex];
  
    if (throwIndex === 2) {
      if (playerIndex === this.players.length - 1) {
        const nextRoundIndex = roundIndex + 1 < player!.rounds.length ? roundIndex + 1 : 0;
        this.focusThrow(0, nextRoundIndex);
      } else {
        const nextPlayerIndex = playerIndex + 1;
        this.focusThrow(nextPlayerIndex, roundIndex);
      }
    } else {
      const nextThrowIndex = throwIndex + 1;
      this.focusThrow(playerIndex, roundIndex, nextThrowIndex);
    }
  }
  
  private focusThrow(playerIndex: number, roundIndex: number, throwIndex: number = 0) {
    const throwId = `throw-${playerIndex}${roundIndex}${throwIndex}`;
    const dartThrowElement = this.renderRoot.querySelector<aaDartThrow>(`#${throwId}`);
    dartThrowElement?.focus();
  }
  
  override render() {
    return html`
      <div class="player-container">
        ${this.players.map((player, playerIndex) => html`
          <article class="player">
            <aa-combobox
              @user-selected=${(e: CustomEvent) => this.handleUserselected(e.detail, playerIndex)}
              .users=${this.users}></aa-combobox>
            <span class="total-sum">0 (-250)</span>
            <div class="round-labels-container round-grid">
              <span class="border-right">N</span>
              <span>Throws</span>
              <span class="border-left">Sum</span>
            </div>
            <div class="rounds-container">
              ${player.rounds.map((round, roundIndex) => html`
                <div class="${roundIndex % 2 === 0 ? 'alternate-color' : ''}">
                  <div class="round-grid">
                    <div class="round-number">${roundIndex + 1}</div>
                    <div class="throws-container">
                      ${round.dartThrows.map((dartThrow, throwIndex) => html`
                        <aa-dartthrow
                          id="throw-${playerIndex}${roundIndex}${throwIndex}"
                          .dartThrow=${dartThrow}
                          @throw-updated=${(e: CustomEvent) => this.handleThrowUpdated(e.detail.dartThrow, playerIndex, roundIndex)}
                          @request-next-throw-focus=${(e: CustomEvent) => this.handleRequestNextThrowFocus(playerIndex, roundIndex, throwIndex)}
                        ></aa-dartthrow>
                      `)}
                    </div>
                    <div class="cumulative-points-round">${round.cumulativePoints}</div>
                </div>
              </div>
              `)}
            </div>
          </article>
        `)}
      </div>
    `;
  }


  static override styles = [sharedStyles, css`
    :host {}

    .player-container {
      display: flex;
      place-items: center;
      place-content: center;
      flex-grow: 1;
      margin-top: 24px;
      height: fit-content;
    }
    
    .player {
      width: 100%;
      max-width: 35vw;
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
}
