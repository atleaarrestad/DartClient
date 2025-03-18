import { html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import { sharedStyles } from "../../../styles.js";

import { LitElement } from "lit";
import { DataService } from "../../services/dataService.js";
import { NotificationService } from "../../services/notificationService.js";
import { container } from "tsyringe";

import { User } from "../../models/userSchema.js";
import { Round } from "../../models/roundSchema.js";
import { ThrowType, RoundStatus } from "../../models/enums.js";

import "../aa-button-cmp.js";
import { PlayerRounds } from "src/models/roundSchema.js";
import { aaDartThrow } from "../aa-dartthrow-cmp.js";

@customElement("index-page")
export class IndexPage extends LitElement {
	private dataService: DataService;
	private notificationService: NotificationService;

	@property({ type: Array }) users: User[] = [];
	@property({ type: Array }) players: PlayerRounds[] = [
		this.getEmptyPlayerObject(3),
		this.getEmptyPlayerObject(3),
	];

	constructor() {
		super();
		this.dataService = container.resolve(DataService);
		this.notificationService = container.resolve(NotificationService);
	}

	public override connectedCallback(): void {
		this.healthCheckServer();
		this.loadUsers();
		window.addEventListener("keydown", event => this.handleKeyDown(event));
		super.connectedCallback();
	}

	override disconnectedCallback(): void {
		window.removeEventListener("keydown", this.handleKeyDown);
		super.disconnectedCallback();
	}

	private async healthCheckServer(): Promise<void> {
		this.dataService.Ping().catch(error => this.notificationService.addNotification(error, "danger"));
	}

	private async loadUsers(): Promise<void> {
		const usersPromise = this.dataService.GetAllUsers();
		this.notificationService.addNotification("Fetching users..", "info", usersPromise);

		usersPromise
			.then((users) => {
				if (users) {
					this.users = [...users];
				}
				else {
					this.users = [];
				}
			})
			.catch((error) => {
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
				index === updatedThrow.throwIndex ? { ...dartThrow, ...updatedThrow } : dartThrow,
			),
		};

		const updatedPlayer = { ...this.players[playerIndex], rounds: updatedRounds };

		this.players = [
			...this.players.slice(0, playerIndex),
			updatedPlayer,
			...this.players.slice(playerIndex + 1),
		];

		this.dataService.ValidateRounds(updatedRounds).then((response: Round[]) => {
			updatedPlayer.rounds = [...response];

			this.players = [
				...this.players.slice(0, playerIndex),
				updatedPlayer,
				...this.players.slice(playerIndex + 1),
			];
		});
	}

	private handleUserselected(user: User, playerIndex: number) {
		this.players[playerIndex]!.playerId = user.id;
	}

	private handleKeyDown(event: KeyboardEvent) {
		if (event.shiftKey && event.key === "+") {
			const playerWithMostRounds = this.players.reduce((prev, current) => {
				return prev!.rounds.length > current.rounds.length ? prev : current;
			}, this.players[0]);

			const roundsPlayed = playerWithMostRounds!.rounds.length;
			this.addNewPlayer(roundsPlayed);
		}

		if (event.shiftKey && event.key === "-") {
			if (this.players.length > 1) {
				this.players.pop();
				this.players = [...this.players];
			}
		}
	}

	private addNewPlayer(roundCount: number) {
		const newPlayer = this.getEmptyPlayerObject(roundCount);

		this.players = [...this.players, newPlayer];
	}

	private getEmptyPlayerObject(roundCount: number): PlayerRounds {
		return {
			playerId: "",
			rounds: Array.from({ length: roundCount }, (_, index) => this.createRound(index + 1)),
		};
	}

	private handleRequestNextFocus(
		direction: "right" | "left",
		playerIndex: number,
		roundIndex: number,
		throwIndex: number,
	) {
		const nextFocus = this.getNextFocus(direction, playerIndex, roundIndex, throwIndex);

		if (nextFocus) {
			const { nextPlayerIndex, nextRoundIndex, nextThrowIndex } = nextFocus;
			this.focusThrow(nextPlayerIndex, nextRoundIndex, nextThrowIndex);
		}
	}

	private getNextFocus(
		direction: "right" | "left",
		playerIndex: number,
		roundIndex: number,
		throwIndex: number,
	): { nextPlayerIndex: number; nextRoundIndex: number; nextThrowIndex: number } | null {
		const playerCount = this.players.length;

		if (direction === "right") {
			if (throwIndex === 2) {
				if (playerIndex === playerCount - 1) {
					if (this.players[playerIndex]?.rounds.length == roundIndex + 1) {
						return null;
					}
					const nextRoundIndex = roundIndex + 1 < this.players[playerIndex]!.rounds.length ? roundIndex + 1 : 0;
					return { nextPlayerIndex: 0, nextRoundIndex, nextThrowIndex: 0 };
				}
				else {
					return { nextPlayerIndex: playerIndex + 1, nextRoundIndex: roundIndex, nextThrowIndex: 0 };
				}
			}
			else {
				return { nextPlayerIndex: playerIndex, nextRoundIndex: roundIndex, nextThrowIndex: throwIndex + 1 };
			}
		}

		if (direction === "left") {
			if (throwIndex === 0) {
				if (playerIndex === 0) {
					if (roundIndex === 0) {
						return null;
					}
					const nextRoundIndex = roundIndex === 0 ? this.players[0]!.rounds.length - 1 : roundIndex - 1;
					return { nextPlayerIndex: playerCount - 1, nextRoundIndex, nextThrowIndex: 2 };
				}
				else {
					return { nextPlayerIndex: playerIndex - 1, nextRoundIndex: roundIndex, nextThrowIndex: 2 };
				}
			}
			else {
				return { nextPlayerIndex: playerIndex, nextRoundIndex: roundIndex, nextThrowIndex: throwIndex - 1 };
			}
		}

		return null;
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
							<div class="${roundIndex % 2 === 0 ? "alternate-color" : ""}">
							<div class="round-grid">
								<div class="round-number">${roundIndex + 1}</div>
								<div class="throws-container">
								${round.dartThrows.map((dartThrow, throwIndex) => html`
									<aa-dartthrow
										id="throw-${playerIndex}${roundIndex}${throwIndex}"
										.dartThrow=${dartThrow}
										@throw-updated=${(e: CustomEvent) => this.handleThrowUpdated(e.detail.dartThrow, playerIndex, roundIndex)}
										@request-next-focus=${(e: CustomEvent) => this.handleRequestNextFocus(e.detail.direction, playerIndex, roundIndex, throwIndex)}
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
