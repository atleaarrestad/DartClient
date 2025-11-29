import '../aa-button-cmp.js';

import { html, unsafeCSS } from 'lit';
import { LitElement } from 'lit';
import { property, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { container } from 'tsyringe';

import { sharedStyles } from '../../../styles.js';
import { sum } from '../../helpers/sum.js';
import { RoundStatus } from '../../models/enums.js';
import { getRankDisplayValue, getRankIcon } from '../../models/rank.js';
import { GameTracker, PlayerRounds, Round, Season, SeasonStatistics, User } from '../../models/schemas.js';
import { DataService } from '../../services/dataService.js';
import { DialogService } from '../../services/dialogService.js';
import { GameService } from '../../services/gameService.js';
import { NotificationService } from '../../services/notificationService.js';
import { SeasonService } from '../../services/seasonService.js';
import { UserService } from '../../services/userService.js';
import gamePageStyles from './game-page.css?inline';


export class GamePage extends LitElement {

	@property({ type: Array }) users:   User[] = [];
	@property({ type: Array }) players: PlayerRounds[] = [];

	@state() protected season?: Season;
	@state() protected loading: boolean = true;

	protected dataService:            DataService;
	protected seasonService:          SeasonService;
	protected userService:            UserService;
	protected notificationService:    NotificationService;
	protected dialogService:          DialogService;
	protected gameService:            GameService;
	protected gameIdFromLocalStorage: string | undefined = undefined;
	protected creatingGame:           boolean = false;
	protected selectedId?:            string;

	constructor() {
		super();

		this.notificationService = container.resolve(NotificationService);
		this.seasonService = container.resolve(SeasonService);
		this.dialogService = container.resolve(DialogService);
		this.dataService = container.resolve(DataService);
		this.userService = container.resolve(UserService);
		this.gameService = container.resolve(GameService);
	}

	override connectedCallback(): void {
		super.connectedCallback();

		this.initialize();
	}

	protected async initialize(): Promise<void> {
		this.loading = true;

		await this.healthCheckServer();
		await this.loadUsers();
		await this.GetLatestSeason();

		const locallyCachedGameSessionId = this.gameService.getCachedGameId();
		if (locallyCachedGameSessionId !== undefined) {
			const gameTracker = await this.gameService.getActiveGame(locallyCachedGameSessionId);
			if (gameTracker) {
				this.gameIdFromLocalStorage = locallyCachedGameSessionId;
				this.updateGameState(gameTracker);
			}
			else {
				this.gameIdFromLocalStorage = undefined;
				this.gameService.removeCachedGameId();
			}
		}

		this.loading = false;
	}

	protected async healthCheckServer(): Promise<void> {
		this.dataService.Ping()
			.catch(error => this.notificationService.addNotification(error, 'danger'));
	}

	protected async loadUsers(): Promise<void> {
		const usersPromise = this.userService.getAllUsers();
		this.notificationService.addNotification('Fetching users..', 'info', usersPromise);

		return usersPromise
			.then((users) => {
				if (users)
					this.users = [ ...users ];

				else
					this.users = [];
			})
			.catch((error) => {
				this.notificationService.addNotification(error, 'danger');
			});
	}

	protected async GetLatestSeason(): Promise<void> {
		const season = await this.seasonService.getCurrentSeason();
		this.season = season;
	}

	protected async handleThrowUpdated?(
		updatedThrow: Round['dartThrows'][number],
		playerIndex: number,
		roundNumber: number,
	): Promise<void>;

	protected handleDartThrowFocused?(event: FocusEvent): void;

	protected updateGameState(gameTracker: GameTracker): void {
		this.players = [ ...gameTracker.playersRounds ];
		this.reorderPlayersByMMR();
		this.requestUpdate();
	}

	protected getCumulativePoints(player: PlayerRounds): number {
		for (let i = player.rounds.length - 1; i >= 0; i--) {
			const round = player.rounds[i];
			if (round?.roundStatus !== RoundStatus.Unplayed)
				return round!.cumulativePoints;
		}

		return 0;
	}

	protected getRoundSum(round: Round): number {
		const newSum = sum(round.dartThrows, t => t.finalPoints);

		return newSum;
	}

	protected getDifferenceFromBase(player: PlayerRounds): number | undefined {
		return this.getCumulativePoints(player) - this.season!.goal;
	}

	protected getLatestSeasonStatsForPlayer(playerIndex: number): SeasonStatistics | undefined {
		const user = this.getUserFromPlayerIndex(playerIndex);
		if (user && user.seasonStatistics.length > 0) {
			const seasonStats = user.seasonStatistics[user.seasonStatistics.length - 1];

			return seasonStats;
		}

		return undefined;
	}

	protected getUserFromPlayerIndex(playerIndex: number): User | undefined {
		const playerId = this.players[playerIndex]!.playerId;
		const user = this.users.find(user => user.id == playerId);

		return user;
	}

	protected reorderPlayersByMMR(): void {
		this.players = this.players.sort((a, b) => {
			const userA = this.users.find(u => u.id === a.playerId);
			const userB = this.users.find(u => u.id === b.playerId);

			const mmrA = userA?.seasonStatistics?.[userA.seasonStatistics.length - 1]?.mmr ?? 0;
			const mmrB = userB?.seasonStatistics?.[userB.seasonStatistics.length - 1]?.mmr ?? 0;

			return mmrA - mmrB;
		});
	}

	protected renderLoadingState(): unknown {
		return html`<p>Loading...</p>`;
	}

	protected renderEmptyState(): unknown {
		return html`
		<div class="centered offsetY">
			<div class="shortcut">[SHIFT + N]</div>
			<div class="subtitle">to start a new game!</div>
		</div>
		`;
	}

	override render(): unknown {
		if (this.loading || !this.season)
			return this.renderLoadingState();

		if (this.players.length === 0)
			return this.renderEmptyState();

		return html`
		<div class="player-container">
			${ this.players.map((player, playerIndex) => {
				const user = this.getUserFromPlayerIndex(playerIndex);
				if (!user)
					return;

				const seasonStats = this.getLatestSeasonStatsForPlayer(playerIndex);
				const mmr = seasonStats?.mmr;
				const rank = seasonStats?.currentRank;

				const hasVictory = player.rounds.some(r => r.roundStatus === RoundStatus.Victory);

				return html`
				<article class="player">
					<span class="player-name">
						${ user.alias }
					</span>

					<span class="total-sum">
						${ this.getCumulativePoints(player) } (${ this.getDifferenceFromBase(player) })
					</span>

					<div class="round-labels-container round-grid">
						<span class="border-right">N</span>
						<span>Throws</span>
						<span class="border-left">Sum</span>
					</div>

					<div class="rounds-container">
						${ player.rounds.map((round, roundIndex) => html`
						<div class=${ classMap({
							'victory':         hasVictory,
							'alternate-color': roundIndex % 2 === 0 && !hasVictory,
							'overshoot':       round.roundStatus === RoundStatus.Overshoot,
						}) }>
							<div class="round-grid">
								<div class="round-number">${ roundIndex + 1 }</div>
								<div class="throws-container">
									${ round.dartThrows.map((dartThrow, throwIndex) => {
										const onThrowUpdated = (e: CustomEvent) =>
											this.handleThrowUpdated?.(e.detail.dartThrow, playerIndex, roundIndex);

										const onFocus = (e: FocusEvent) =>
											this.handleDartThrowFocused?.(e);

										return html`
										<aa-dart-throw
											id="throw-${ playerIndex }-${ roundIndex }-${ throwIndex }"
											.dartThrow=${ dartThrow }
											@throw-updated=${ onThrowUpdated }
											@focus=${ onFocus }>
										</aa-dart-throw>
										`;
									}) }
								</div>
								<div class="cumulative-points-round">
									${ this.getRoundSum(round) }
								</div>
							</div>
						</div>
						`) }
					</div>

					<div class="centered">
						<div class="rank-container">
							<img
								class="rank-icon"
								src=${ getRankIcon(rank) }
								alt=${ getRankDisplayValue(rank) }
							>
							<div class="rank-text-container">
								<span class="rank">${ getRankDisplayValue(rank) }</span>
								<span class="mmr">${ mmr }</span>
							</div>
						</div>
					</div>
				</article>
				`;
			}) }
		</div>
		`;
	}

	static override styles = [ sharedStyles, unsafeCSS(gamePageStyles) ];

}
