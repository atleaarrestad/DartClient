import { html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { sharedStyles } from "../../../styles.js";
import { classMap } from "lit/directives/class-map.js";

import { LitElement } from "lit";
import { DataService } from "../../services/dataService.js";
import { NotificationService } from "../../services/notificationService.js";
import { DialogService } from "../../services/dialogService.js";
import { postGameTemplate, gameResultDummyData, selectUserTemplate } from "../../templates/dialogTemplates.js";
import { container } from "tsyringe";

import { User, Round, SeasonStatistics, PlayerRounds, GameResult, Season, GameTracker } from "../../models/schemas.js";
import { ThrowType, RoundStatus } from "../../models/enums.js";

import "../aa-button-cmp.js";
import { aaDartThrow } from "../aa-dartthrow-cmp.js";
import { AaCombobox } from "../aa-combobox-cmp.js";

import { getRankDisplayValue, Rank, getRankIcon } from "../../models/rank.js";
import { UserService } from "../../services/userService.js";
import { GameService } from "../../services/gameService.js";
import { SeasonService } from "../../services/seasonService.js";

@customElement("index-page")
export class IndexPage extends LitElement {
	private dataService: DataService;
	private seasonService: SeasonService;
	private userService: UserService;
	private notificationService: NotificationService;
	private dialogService: DialogService;
	private gameService: GameService;
	@state() private season?: Season;
	@state() private loading: boolean = true;
	private gameIdFromLocalStorage: string | undefined = undefined;

	private onKeyDown = (event: KeyboardEvent) => this.handleKeyDown(event);

  	private creatingGame = false;

	protected selectedId?: string;
	@property({ type: Array }) users: User[] = [];

	@property({ type: Array }) players: PlayerRounds[] = [];

	constructor() {
		super();
		this.dataService = container.resolve(DataService);
		this.seasonService = container.resolve(SeasonService);
		this.notificationService = container.resolve(NotificationService);
		this.dialogService = container.resolve(DialogService);
		this.userService = container.resolve(UserService);
		this.gameService = container.resolve(GameService);
	}

	public override async connectedCallback(): Promise<void> {
		super.connectedCallback();
		await this.healthCheckServer();
		await this.loadUsers();
		await this.GetLatestSeason();

		var locallyCachedGameSessionId = this.gameService.getCachedGameId()
		if (locallyCachedGameSessionId !== undefined){
			const gameTracker = await this.gameService.getActiveGame(locallyCachedGameSessionId);
			if (gameTracker){
				this.gameIdFromLocalStorage = locallyCachedGameSessionId;
				this.updateGameState(gameTracker);
			}
			else{
				this.gameIdFromLocalStorage = undefined;
				this.gameService.removeCachedGameId();
			}
		}

		this.loading = false;
		window.addEventListener("keydown", this.onKeyDown);
	}

	override disconnectedCallback(): void {
		window.removeEventListener("keydown", this.onKeyDown);
    	super.disconnectedCallback();
	}

	private async healthCheckServer(): Promise<void> {
		this.dataService.Ping().catch(error => this.notificationService.addNotification(error, "danger"));
	}

	private async loadUsers(): Promise<void> {
		const usersPromise = this.userService.getAllUsers();
		this.notificationService.addNotification("Fetching users..", "info", usersPromise);

		return usersPromise
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

	private async GetLatestSeason(): Promise<void> {
		const season = await this.seasonService.getCurrentSeason();
		this.season = season;
	}


	private async handleThrowUpdated(updatedThrow: Round["dartThrows"][number], playerIndex: number, roundNumber: number) {
		if (!this.players[playerIndex]) {
			return;
		}
		const playerId = this.getUserFromPlayerIndex(playerIndex)?.id;
		try {
			const gameTracker = await this.gameService.addDartThrowToGame(this.gameIdFromLocalStorage!, playerId!, roundNumber, updatedThrow);
			this.updateGameState(gameTracker);
		} catch (error) {
		}
	}

	private handleKeyDown(event: KeyboardEvent) {
		if (event.shiftKey) {
			if (event.repeat) return;
			switch (event.key) {
				case "+":
					if (this.players.length > 0){
						this.addNewPlayer();
					}
					event.preventDefault();
					break;

				case "-":
					this.removeLastPlayer();
					event.preventDefault();
					break;

				case "Tab":
					this.moveFocus("backward");
					event.preventDefault();
					break;

				case "n":
				case "N":
					(async () => {
						if (this.creatingGame){
							return;
						}
							
						this.creatingGame = true;
						try {
							this.players = [];
							await this.requestNewGame();
							await this.addNewPlayer();
						} finally {
							this.creatingGame = false;
						}
					})();
					event.preventDefault();
					break;


				case "s":
				case "S":
					(async () => {
						try {
							if (!this.gameIdFromLocalStorage){
								return;
							}
							const isValidGame = this.validateGameCanBeSubmitted();
							if (!isValidGame) {
								this.notificationService.addNotification("Cannot submit game! Play atleast one round and select user for all players", "info");
								return;
							}
							const gameResult: GameResult = await this.dataService.SubmitGame(this.gameIdFromLocalStorage);
							this.gameIdFromLocalStorage = undefined;

							await this.loadUsers(); // make sure this finishes before continuing

							this.players = [];
							this.requestUpdate();
							await this.dialogService.open(postGameTemplate(gameResult, this.users));
						}
						catch (error) {
							const errorMessage = (error as Error).message;
							this.notificationService.addNotification(errorMessage, "danger");
						}
					})();
					event.preventDefault();
					break;
			}
		}
		else {
			switch (event.key) {
				case "Tab":
				case "Enter":
					this.moveFocus("forward");
					event.preventDefault();
			}
		}
	}


	private moveFocus(direction: "forward" | "backward") {
		const selectedElementDetails = this.getSelectedElementDetails();
		const playerCount = this.players.length;

		if (selectedElementDetails.type === "nothing") {
			this.focusDartThrow(0, 0, 0);
		}

		else if (selectedElementDetails.type === "throw") {
			const nextThrow = this.getNextFocusForDartthrow(direction,
				selectedElementDetails.playerIndex!,
				selectedElementDetails.rowIndex!,
				selectedElementDetails.throwIndex!,
			);

			if (nextThrow) {
				this.focusDartThrow(nextThrow.nextPlayerIndex, nextThrow.nextRoundIndex, nextThrow.nextThrowIndex);
			}
		}
	}

	private async removeLastPlayer() {
		const playerId = this.players.at(-1)?.playerId;
		if (playerId && this.gameIdFromLocalStorage){
			const gameTracker = await this.gameService.removePlayer(this.gameIdFromLocalStorage, playerId);
			this.updateGameState(gameTracker);
		}
	}

	private async requestNewGame(): Promise<string>{
		const newGameID = await this.gameService.requestNewGame();
		if (newGameID){
			this.gameIdFromLocalStorage = newGameID;
		}
		return newGameID;
	}

	private updateGameState(gameTracker: GameTracker){
		this.players = [...gameTracker.playersRounds];
		this.reorderPlayersByMMR();
		this.requestUpdate();
	}

	private async addNewPlayer() {
		const filteredUsers = this.users.filter(
			user => !this.players.some(player => player.playerId === user.id)
		);
		const user = await this.dialogService.open<User>(selectUserTemplate(filteredUsers))

		if (this.gameIdFromLocalStorage && user){
			const gameTracker = await this.gameService.addPlayerToGame(this.gameIdFromLocalStorage, user.id);
			this.updateGameState(gameTracker);

		}
	}

	private getSelectedElementDetails(): { type: "throw" | "nothing"; playerIndex?: number; rowIndex?: number; throwIndex?: number } {
		const result = { type: "nothing", playerIndex: undefined, rowIndex: undefined, throwIndex: undefined };
		if (!this.selectedId) {
			return result;
		}

		const idParts = this.selectedId!.split("-");
		result.type = idParts[0]!;

		if (result.type === "throw") {
			result.throwIndex = parseInt(idParts.pop(), 10);
			result.rowIndex = parseInt(idParts.pop(), 10);
			result.playerIndex = parseInt(idParts.pop(), 10);
		}

		return result;
	};

	private handleDartthrowFocused(event: FocusEvent) {
		this.selectedId = (event.target as aaDartThrow).id;
	}

	private focusCombobox(index: number) {
		const element = this.renderRoot.querySelector(`#combobox-${index}`) as AaCombobox;
		element?.focus();
	}

	private focusDartThrow(playerIndex: number, rowIndex: number, throwIndex: number) {
		const element = this.renderRoot.querySelector(`#throw-${playerIndex}-${rowIndex}-${throwIndex}`) as aaDartThrow;
		element?.focus();
	}

	private getNextFocusablePlayer(currentPlayerIndex: number, direction: "forward" | "backward"): number | undefined {
		const playerCount = this.players.length;

		if (playerCount <= 1) {
			return undefined;
		}

		const step = direction === "forward" ? 1 : -1;

		for (let i = 1; i < playerCount; i++) {
			const nextPlayerIndex = (currentPlayerIndex + step * i + playerCount) % playerCount;

			const nextPlayer = this.players[nextPlayerIndex];
			const nextPlayerHasWon = nextPlayer!.rounds.some(round => round.roundStatus === RoundStatus.Victory);
			if (nextPlayerHasWon) {
				continue;
			}
			else {
				return nextPlayerIndex;
			}
		}

		return undefined;
	}


	private getNextFocusForDartthrow(
		direction: "forward" | "backward",
		playerIndex: number,
		roundIndex: number,
		throwIndex: number,
	): { nextPlayerIndex: number; nextRoundIndex: number; nextThrowIndex: number } | null {
		if (direction === "forward") {
			if (throwIndex === 2) {
				const nextFocusablePlayer = this.getNextFocusablePlayer(playerIndex, "forward");

				// everyone else has won (potentially you also)
				if (nextFocusablePlayer === undefined) {
					return { nextPlayerIndex: playerIndex, nextRoundIndex: roundIndex + 1, nextThrowIndex: 0 };
				}
				// Has looped around
				if (nextFocusablePlayer < playerIndex) {
					return { nextPlayerIndex: nextFocusablePlayer, nextRoundIndex: roundIndex + 1, nextThrowIndex: 0 };
				}
				else {
					return { nextPlayerIndex: nextFocusablePlayer, nextRoundIndex: roundIndex, nextThrowIndex: 0 };
				}
			}
			else {
				return { nextPlayerIndex: playerIndex, nextRoundIndex: roundIndex, nextThrowIndex: throwIndex + 1 };
			}
		}

		if (direction === "backward") {
			if (playerIndex === 0 && roundIndex === 0 && throwIndex === 0) {
				return null;
			}

			if (throwIndex === 0) {
				const prevFocusablePlayer = this.getNextFocusablePlayer(playerIndex, "backward");

				// everyone else has won (potentially you also)
				if (prevFocusablePlayer === undefined) {
					return { nextPlayerIndex: playerIndex, nextRoundIndex: roundIndex - 1, nextThrowIndex: 2 };
				}

				if (roundIndex === 0) {
					return { nextPlayerIndex: prevFocusablePlayer, nextRoundIndex: roundIndex, nextThrowIndex: 2 };
				}

				// If we're not in the first round, move to the previous round
				if (prevFocusablePlayer > playerIndex) {
					return { nextPlayerIndex: prevFocusablePlayer, nextRoundIndex: roundIndex - 1, nextThrowIndex: 2 };
				}
				else {
					return { nextPlayerIndex: prevFocusablePlayer, nextRoundIndex: roundIndex, nextThrowIndex: 2 };
				}
			}
			else {
				return { nextPlayerIndex: playerIndex, nextRoundIndex: roundIndex, nextThrowIndex: throwIndex - 1 };
			}
		}

		return null;
	}

	private getCumulativePoints(player: PlayerRounds): number {
		for (let i = player.rounds.length - 1; i >= 0 ; i--) {
			const round = player.rounds[i];
			if (round?.roundStatus !== RoundStatus.Unplayed){
				return round!.cumulativePoints;
			}
		}
		return 0;
	}

	private getRoundSum(round: Round): number{
		return round.dartThrows.reduce(
			(total, t) => total + t.finalPoints,
			0
		);
	}

	private getDifferenceFromBase(player: PlayerRounds): number | undefined {
		return this.getCumulativePoints(player) - this.season!.goal;
	}

	private getLatestSeasonStatsForPlayer(playerIndex: number): SeasonStatistics | undefined {
		const user = this.getUserFromPlayerIndex(playerIndex);
		if (user && user.seasonStatistics.length > 0) {
			const seasonStats = user.seasonStatistics[user.seasonStatistics.length - 1];
			return seasonStats;
		}
		return undefined;
	}

	private getUserFromPlayerIndex(playerIndex: number): User | undefined {
		const playerId = this.players[playerIndex]!.playerId;
		const user = this.users.find(user => user.id == playerId);
		return user;
	}

	private reorderPlayersByMMR() {
		this.players = this.players.sort((a, b) => {
			const userA = this.users.find(u => u.id === a.playerId);
			const userB = this.users.find(u => u.id === b.playerId);

			const mmrA = userA?.seasonStatistics?.[userA.seasonStatistics.length - 1]?.mmr ?? 0;
			const mmrB = userB?.seasonStatistics?.[userB.seasonStatistics.length - 1]?.mmr ?? 0;

			return mmrA - mmrB;
		});
	}

	private validateGameCanBeSubmitted() {
		const AllPlayersSelectedUser = this.players.every(player => player.playerId !== "");
		const hasPlayedAtleastOneRound = this.players.every(player => player.rounds[0]?.roundStatus !== RoundStatus.Unplayed);
		return (AllPlayersSelectedUser && hasPlayedAtleastOneRound);
	}

	override render() {
		if (this.loading || !this.season) {
			return html`<p>Loading...</p>`;
		}
		if (this.players.length === 0){
			return html`
				<div class="centered offsetY">
					<div class="shortcut">[SHIFT + N]</div>
					<div class="subtitle">to start a new game!</div>
				</div>
			`
		}

		return html`
			<div class="player-container">
				${this.players.map((player, playerIndex) => {
					const seasonStats = this.getLatestSeasonStatsForPlayer(playerIndex);
					const mmr = seasonStats?.mmr;
					const rank = seasonStats?.currentRank;
					const hasVictory = player.rounds.some(r => r.roundStatus === RoundStatus.Victory);

					return html`
						<article class="player">
							<span class="player-name"> ${this.getUserFromPlayerIndex(playerIndex)?.alias ?? "Hackerman"}</span>
							<span class="total-sum">${this.getCumulativePoints(player)} (${this.getDifferenceFromBase(player)})</span>
							<div class="round-labels-container round-grid">
								<span class="border-right">N</span>
								<span>Throws</span>
								<span class="border-left">Sum</span>
							</div>
							<div class="rounds-container">
								${player.rounds.map((round, roundIndex) => html`
									<div class=${classMap({
										"victory": hasVictory,
										"alternate-color": roundIndex % 2 === 0 && !hasVictory,
										"overshoot": round.roundStatus === RoundStatus.Overshoot,
									})}>
										<div class="round-grid">
											<div class="round-number">${roundIndex + 1}</div>
											<div class="throws-container">
												${round.dartThrows.map((dartThrow, throwIndex) => html`
													<aa-dartthrow
														id="throw-${playerIndex}-${roundIndex}-${throwIndex}"
														.dartThrow=${dartThrow}
														@throw-updated=${async (e: CustomEvent) => this.handleThrowUpdated(e.detail.dartThrow, playerIndex, roundIndex)}
														@focus=${(e: FocusEvent) => this.handleDartthrowFocused(e)}>
													</aa-dartthrow>
												`)}
											</div>
											<div class="cumulative-points-round">${this.getRoundSum(round)}</div>
										</div>
									</div>
								`)}
							</div>
							<div class="centered">
								<div class="rank-container">
									<img class="rank-icon" src="${getRankIcon(rank)}" alt="${getRankDisplayValue(rank)}" />
									<div class="rank-text-container">
										<span class="rank">${getRankDisplayValue(rank)}</span>
										<span class="mmr">${mmr}</span>
									</div>
								</div>
							</div>

						</article>
					`;
				})}
			</div>
		`;
	}

	static override styles = [sharedStyles, css`
		.rank-text-container{
			display: flex;
			flex-direction: column;
		}
		.mmr {
			font-size: 0.75rem;
		}
		.player-name{
			padding: 8px;
			text-align: center;
			font-size: 1.5rem
		}

		.shortcut {
			font-size: 2rem;
			font-weight: bold;
			margin-bottom: 0.5rem;
		}

		.subtitle {
			font-size: 1.2rem;
			opacity: 0.8;
		}
		.offsetY {
			padding-top: 40vh;
		
		}
		.overshoot {
			background-color: #ed817f89 !important;
		}
			
		.victory {
			background-color: var(--color-victory);
		}

		
		

		.centered {
			max-width: fit-content;
			margin-left: auto;
			margin-right: auto;
		}

		.rank-container {
			display: flex;
			align-items: center;
			justify-content: center;
			gap: 0.5rem;
		}

		.rank-icon {
			width: 64px;
			height: 64px;
			object-fit: contain;
		}

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
			min-width: 250px;
			display: flex;
			flex-direction: column;
			border: 1px solid black;
			background: var(--player-bg, #f0f0f0);
			box-shadow: 3px 3px 0px 0px black;
		}

		.player:first-child {
			border-top-left-radius: 10px;
			border-bottom-left-radius: 10px;
		}

		.player:last-child {
			border-bottom-right-radius: 10px;
			border-top-right-radius: 10px;
		}

		.player:first-child:last-child {
			border-radius: 10px;
		}
		
		.rounds-container {
			max-height: 75vh;
			overflow-y: auto;
			scrollbar-width: none;
			border-bottom: 1px solid black;
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
			font-size: .7rem;
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
			font-size: .6rem;
			line-height: 1.75rem;
			text-align: center;
		}
		.cumulative-points-round {
			border-left: 1px solid black;
			font-size: 1rem;
			text-align: center;
		}
		.total-sum{
			text-align: center;
			border-top: 2px solid black;
			border-bottom: 2px solid black;
			padding-top: .5rem;
			padding-bottom: .5rem;
			font-size: 1.5rem;
		}
  `];
}
