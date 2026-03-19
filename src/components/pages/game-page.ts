import '../aa-button-cmp.js';

import { html, unsafeCSS } from 'lit';
import { LitElement } from 'lit';
import { property, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { map } from 'lit/directives/map.js';
import { container } from 'tsyringe';

import { sum } from '../../helpers/sum.js';
import { RoundStatus, SessionAchievement } from '../../models/enums.js';
import { getRankDisplayValue, getRankIcon } from '../../models/rank.js';
import { GameTracker, PlayerRounds, Round, Season, SeasonStatistics, User } from '../../models/schemas.js';
import { DataService } from '../../services/dataService.js';
import { DialogService } from '../../services/dialogService.js';
import { GameService } from '../../services/gameService.js';
import { NotificationService } from '../../services/notificationService.js';
import { SeasonService } from '../../services/seasonService.js';
import { UserService, GetAllUsersOptions } from '../../services/userService.js';
import { sharedStyles } from '../../styles.js';
import gamePageStyles from './game-page.css?inline';
import { aaDartThrow } from '../aa-dart-throw-cmp.js';
import { achievementService } from '../../services/achievementService.js';
import { signalRService } from '../../services/signalRService.js';
import { CacheService } from '../../services/cacheService.js';

export class GamePage extends LitElement {

	@property({ type: Array }) users: User[] = [];
	@property({ type: Array }) players: PlayerRounds[] = [];

	@state() protected season?: Season;
	@state() protected loading: boolean = true;
	@state() protected isReadOnly: boolean = true;

	protected dataService: DataService;
	protected seasonService: SeasonService;
	protected achievementService: achievementService;
	protected userService: UserService;
	protected notificationService: NotificationService;
	protected dialogService: DialogService;
	protected gameService: GameService;
	protected cacheService: CacheService;
	protected gameIdFromLocalStorage: string | undefined = undefined;
	protected creatingGame: boolean = false;
	protected selectedId?: string;
	protected selectedCellElement?: aaDartThrow = undefined;
	protected isActiveGame: boolean = false;
	protected scrollLeader: HTMLElement | null = null;
	protected signalRService: signalRService;
	private readonly onSessionAchievementUnlocked = (
		gameId: string,
		playerId: string,
		sessionAchievements: SessionAchievement[],
	) => this.HandleSessionAchievementUnlocked(gameId, playerId, sessionAchievements);

	constructor() {
		super();

		this.notificationService = container.resolve(NotificationService);
		this.seasonService = container.resolve(SeasonService);
		this.achievementService = container.resolve(achievementService);
		this.dialogService = container.resolve(DialogService);
		this.dataService = container.resolve(DataService);
		this.userService = container.resolve(UserService);
		this.gameService = container.resolve(GameService);
		this.signalRService = container.resolve(signalRService);
		this.cacheService = container.resolve(CacheService);
	}

	override connectedCallback(): void {
		super.connectedCallback();
		void this.initialize();
	}

	override async disconnectedCallback(): Promise<void> {
		super.disconnectedCallback();

		if (this.gameIdFromLocalStorage) {
			await this.unSubscribeToAchievementEvents(this.gameIdFromLocalStorage);
		}

		this.signalRService.stop();
	}

	protected async initialize(): Promise<void> {
		this.loading = true;

		await this.healthCheckServer();
		await this.GetLatestSeason();
		await this.loadUsers({query: {includeSeasonStatistics: true, limitToSeasonId: this.season!.id}});

		const locallyCachedGameSessionId = this.gameService.getCachedGameId();
		if (locallyCachedGameSessionId !== undefined) {
			const gameTracker = await this.gameService.getActiveGame(locallyCachedGameSessionId);
			if (gameTracker) {
				this.gameIdFromLocalStorage = locallyCachedGameSessionId;
				this.updateGameState(gameTracker);
				this.isActiveGame = true;
			}
			else {
				this.gameIdFromLocalStorage = undefined;
				this.gameService.removeCachedGameId();
			}
		}

		this.loading = false;

		void this.scrollToEndInPlayerRounds();

		this.signalRService.buildHubConnection('hubs/main');
		await this.signalRService.start();

		if (this.gameIdFromLocalStorage) {
			await this.subscribeToAchievementEvents(this.gameIdFromLocalStorage);
		}
	}

	public async subscribeToAchievementEvents(gameId: string) {
		this.signalRService.off('OnSessionAchievementUnlocked');
		this.signalRService.on('OnSessionAchievementUnlocked', this.onSessionAchievementUnlocked);
		await this.signalRService.invoke<void>('SubscribeAchievement', gameId);
	}

	public async unSubscribeToAchievementEvents(gameId: string) {
		this.signalRService.off('OnSessionAchievementUnlocked');
		await this.signalRService.invoke<void>('UnsubscribeAchievement', gameId);
	}

	private async HandleSessionAchievementUnlocked(
		gameId: string,
		playerId: string,
		sessionAchievements: SessionAchievement[],
	) {
		const achievementNames = sessionAchievements.map(sessionAchievement => {
			const achievementName = SessionAchievement[sessionAchievement];
			return achievementName.replace(/([a-z])([A-Z])/g, '$1 $2');
		});

		this.notificationService.addNotification({
			type: 'achievement',
			achievementNames,
			timeout: 6000,
		});
	}

	protected async healthCheckServer(): Promise<void> {
		this.dataService.Ping()
			.catch(error => this.notificationService.addNotification({ type: 'danger', message: error }));
	}

	protected async loadUsers(options?: GetAllUsersOptions): Promise<void> {
		const usersPromise = this.userService.getAllUsers(options);

		this.notificationService.addNotification({
			type: 'info',
			message: 'Fetching users..',
			promise: usersPromise,
		});

		return usersPromise
			.then((users) => {
				this.users = users ? [...users] : [];
			})
			.catch((error) => {
				this.notificationService.addNotification({
					type: 'danger',
					message: error,
				});
			});
	}

	protected async GetLatestSeason(): Promise<void> {
		this.season = await this.seasonService.getCurrentSeason();
	}

	protected async handleThrowUpdated?(
		updatedThrow: Round['dartThrows'][number],
		playerIndex: number,
		roundNumber: number,
	): Promise<void>;

	protected handleDartThrowFocused?(event: FocusEvent): void;

	protected updateGameState(gameTracker: GameTracker): void {
		const oldRoundCount = Math.max(...this.players.map(p => p.rounds.length), 0);
		const newRoundCount = Math.max(...gameTracker.playersRounds.map(p => p.rounds.length), 0);
		const roundCountChanged = oldRoundCount !== newRoundCount;

		this.players = [ ...gameTracker.playersRounds ];
		this.reorderPlayersByMMR();

		if (roundCountChanged)
			void this.scrollToEndInPlayerRounds();
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
		return sum(round.dartThrows, t => t.finalPoints);
	}

	protected getDifferenceFromBase(player: PlayerRounds): number | undefined {
		return this.getCumulativePoints(player) - this.season!.goal;
	}

	protected getLatestSeasonStatsForPlayer(playerIndex: number): SeasonStatistics | undefined {
		const user = this.getUserFromPlayerIndex(playerIndex);
		if (user && user.seasonStatistics.length > 0) {
			return user.seasonStatistics.find(stats => stats.seasonId == this.season?.id);
		}

		return undefined;
	}

	protected getUserFromPlayerIndex(playerIndex: number): User | undefined {
		const playerId = this.players[playerIndex]!.playerId;
		return this.users.find(user => user.id == playerId);
	}

	protected reorderPlayersByMMR(): void {
		this.players = this.players.toSorted((a, b) => {
			const userA = this.users.find(u => u.id === a.playerId);
			const userB = this.users.find(u => u.id === b.playerId);

			const mmrA = userA?.seasonStatistics?.find(stats => stats.seasonId == this.season?.id)?.mmr ?? 0;
			const mmrB = userB?.seasonStatistics?.find(stats => stats.seasonId == this.season?.id)?.mmr ?? 0;

			return mmrA - mmrB;
		});
	}

	protected async scrollToEndInPlayerRounds(): Promise<void> {
		await this.updateComplete;

		const scrollContainers = this.shadowRoot?.querySelectorAll('.rounds-scroll-container');
		scrollContainers?.forEach(container => {
			container.scrollTop = container.scrollHeight;
		});
	}

	protected onPlayerInteract = (event: Event): void => {
		const target = event.currentTarget as HTMLElement;
		const scrollContainer = target.querySelector('.rounds-scroll-container') as HTMLElement;
		if (scrollContainer)
			this.scrollLeader = scrollContainer;
	};

	protected onPlayerScroll = (event: Event): void => {
		const target = event.target as HTMLElement;

		if (this.scrollLeader && this.scrollLeader !== target)
			return;

		if (!this.scrollLeader)
			this.scrollLeader = target;

		const scrollTop = target.scrollTop;

		const scrollContainers = this.shadowRoot?.querySelectorAll('.rounds-scroll-container');
		scrollContainers?.forEach(container => {
			if (container === this.scrollLeader)
				return;

			if (container !== target && container.scrollTop !== scrollTop)
				container.scrollTop = scrollTop;
		});
	};

	protected renderLoadingState(): unknown {
		return html`<p>Loading...</p>`;
	}

	protected renderEmptyState(): unknown {
		return html`
			<div class="empty-state">
				<div class="shortcut">[SHIFT + N]</div>
				<div class="subtitle">to start a new game!</div>
			</div>
		`;
	}

	protected renderTopContent(): unknown {
		return null;
	}

	protected renderBottomContent(): unknown {
		return null;
	}

	protected isPlayerActive(_playerIndex: number): boolean {
		return false;
	}

	override render(): unknown {
		if (this.loading || !this.season)
			return this.renderLoadingState();

		if (!this.isActiveGame)
			return this.renderEmptyState();

		return html`
			<div class="page-shell">
				${this.renderTopContent()}

				<div class="page-content">
					<div class="player-container">
						${this.players.map((player, playerIndex) => {
							const user = this.getUserFromPlayerIndex(playerIndex);
							if (!user)
								return;

							const seasonStats = this.getLatestSeasonStatsForPlayer(playerIndex);
							const mmr = seasonStats?.mmr ?? 0;
							const rank = seasonStats?.currentRank;

							const hasVictory = player.rounds.some(r => r.roundStatus === RoundStatus.Victory);

							return html`
								<article
									class="player"
									@focusin=${this.onPlayerInteract}
									@mouseenter=${this.onPlayerInteract}
								>
									<span class=${classMap({
										'player-name': true,
										'active-player-name': this.isPlayerActive(playerIndex),
									})}>
										${user.alias}
									</span>

									<span class="total-sum">
										${this.getCumulativePoints(player)} (${this.getDifferenceFromBase(player)})
									</span>

									<div class="round-labels-container">
										<span class="border-right">N</span>
										<span>Throws</span>
										<span class="border-left">Sum</span>
									</div>

									<div class="rounds-scroll-container" @scroll=${this.onPlayerScroll}>
										<div class="rounds-container">
											${player.rounds.map((round, roundIndex) => html`
												<div class=${classMap({
													'victory': hasVictory,
													'alternate-color': roundIndex % 2 === 0 && !hasVictory,
													'overshoot': round.roundStatus === RoundStatus.Overshoot,
												})}>
													<div class="round-grid">
														<div class="round-number">${roundIndex + 1 }</div>
														<div class="throws-container">
															${map(round.dartThrows, (dartThrow, throwIndex) => {
																const onThrowUpdated = async (e: CustomEvent) => {
																	const cmp = e.currentTarget as aaDartThrow;

																	cmp.isSaving = true;
																	try {
																		await this.handleThrowUpdated?.(
																			e.detail.dartThrow,
																			playerIndex,
																			roundIndex,
																		);
																	}
																	finally {
																		cmp.isSaving = false;
																	}
																};

																const onFocus = (e: FocusEvent) =>
																	this.handleDartThrowFocused?.(e);

																return html`
																	<aa-dart-throw
																		id="throw-${playerIndex}-${roundIndex}-${throwIndex}"
																		.dartThrow=${dartThrow}
																		?isDisabled=${this.isReadOnly}
																		@throw-updated=${onThrowUpdated}
																		@focus=${onFocus}>
																	</aa-dart-throw>
																`;
															})}
														</div>
														<div class="cumulative-points-round">
															<span>${this.getRoundSum(round)}</span>
														</div>
													</div>
												</div>
											`)}
										</div>
									</div>

									<div class="rank-container">
										<div class="rank-inner-container">
											<img
												class="rank-icon"
												src=${getRankIcon(rank)}
												alt=${getRankDisplayValue(rank)}
											>
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

					${this.renderBottomContent()}
				</div>
			</div>
		`;
	}

	static override styles = [ sharedStyles, unsafeCSS(gamePageStyles) ];
}
