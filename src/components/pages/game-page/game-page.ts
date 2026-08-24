import '../../aa-loading-state/aa-loading-state.js';

import { html, unsafeCSS } from 'lit';
import type { PropertyValues } from 'lit';
import { LitElement } from 'lit';
import { property, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { map } from 'lit/directives/map.js';
import { container } from 'tsyringe';

import { getAchievementTierIcon } from '../../../helpers/achievementHelper.js';
import { sum } from '../../../helpers/sum.js';
import { AchievementTier, RoundStatus, SessionAchievement } from '../../../models/enums.js';
import { AchievementDefinitionsResponse, GameTracker, PlayerRounds, Round, Season, SeasonStatistics, User } from '../../../models/schemas.js';
import { DataService } from '../../../services/dataService.js';
import { DialogService } from '../../../services/dialogService.js';
import { GameService } from '../../../services/gameService.js';
import { NotificationService } from '../../../services/notificationService.js';
import { SeasonService } from '../../../services/seasonService.js';
import { UserService, GetAllUsersOptions } from '../../../services/userService.js';
import { sharedStyles } from '../../../styles/shared-styles.js';
import gamePageStyles from './game-page.css?inline';
import { aaDartThrow } from '../../aa-dart-throw-cmp/aa-dart-throw-cmp.js';
import '../../rank-display/aa-rank-display.js';
import { achievementService } from '../../../services/achievementService.js';
import { SignalRConnectionStatus, signalRService } from '../../../services/signalRService.js';
import { CacheService } from '../../../services/cacheService.js';
import { getErrorMessage } from '../../../helpers/getErrorMessage.js';

export class GamePage extends LitElement {

	@property({ type: Array }) users: User[] = [];
	@property({ type: Array }) players: PlayerRounds[] = [];

	@state() protected season?: Season;
	@state() protected loading: boolean = true;
	@state() protected isReadOnly: boolean = true;
	@state() protected syncStatus: SignalRConnectionStatus = 'disconnected';
	@state() protected syncStatusMessage = 'Live sync offline';
	@state() protected browserOnline = navigator.onLine;
	@state() protected achievementDefinitions?: AchievementDefinitionsResponse;
	@state() protected visibleRoundCapacity = 10;
	@state() protected maximumRounds: number | null = null;
	@state() protected compactAchievementPlayers: ReadonlySet<string> = new Set();

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
	protected projectedSessionAchievementsByPlayer: Record<string, SessionAchievement[]> = {};
	protected scrollLeader: HTMLElement | null = null;
	protected signalRService: signalRService;
	private removeSignalRStatusListener?: () => void;
	private observedPlayerContainer?: HTMLElement;
	private readonly playerContainerResizeObserver = new ResizeObserver(() =>
		this.schedulePlayerGridLayout());
	private playerGridAnimationFrame?: number;

	private hasShownInitialSyncFailure = false;
	private readonly achievementSubscriptionKey = 'session-achievement';
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
		window.addEventListener('offline', this.handleBrowserOffline);
		window.addEventListener('online', this.handleBrowserOnline);
		void this.initialize();
	}

	override async disconnectedCallback(): Promise<void> {
		super.disconnectedCallback();

		window.removeEventListener('offline', this.handleBrowserOffline);
		window.removeEventListener('online', this.handleBrowserOnline);
		this.playerContainerResizeObserver.disconnect();
		this.observedPlayerContainer = undefined;
		if (this.playerGridAnimationFrame !== undefined)
			cancelAnimationFrame(this.playerGridAnimationFrame);
		this.removeSignalRStatusListener?.();
		await this.beforeSignalRStop();
		await this.signalRService.stop();
	}

	override updated(changedProperties: PropertyValues): void {
		super.updated(changedProperties);
		this.observePlayerContainer();
	}

	protected async initialize(): Promise<void> {
		this.loading = true;

		await this.healthCheckServer();
		await this.GetLatestSeason();
		await Promise.all([
			this.loadUsers({query: {includeSeasonStatistics: true, limitToSeasonId: this.season!.id}}),
			this.loadAchievementDefinitions(),
		]);

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

		await this.signalRService.buildHubConnection('hubs/main');
		this.bindSignalRState();

		try {
			await this.signalRService.start();
			await this.registerSignalRSubscriptions();
		}
		catch (error) {
			this.reportError(error, 'Live updates are unavailable right now. Retrying automatically...');
		}
	}

	public async subscribeToAchievementEvents(gameId: string) {
		this.signalRService.off('OnSessionAchievementUnlocked');
		this.signalRService.on('OnSessionAchievementUnlocked', this.onSessionAchievementUnlocked);
		await this.signalRService.subscribe(
			this.achievementSubscriptionKey,
			'SubscribeAchievement',
			[ gameId ],
			'UnsubscribeAchievement',
		);
	}

	public async unSubscribeToAchievementEvents(gameId: string) {
		this.signalRService.off('OnSessionAchievementUnlocked');
		await this.signalRService.unsubscribe(this.achievementSubscriptionKey);
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
		try {
			await this.dataService.Ping();
		}
		catch (error) {
			this.reportError(error, 'Unable to reach the server.');
		}
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
				this.reportError(error, 'Unable to load users.');
			});
	}

	protected async loadAchievementDefinitions(): Promise<void> {
		try {
			this.achievementDefinitions = await this.achievementService.getAchievementDefinitions();
		}
		catch (error) {
			this.reportError(error, 'Unable to load achievement details.');
		}
	}

	protected async registerSignalRSubscriptions(): Promise<void> {
		if (this.gameIdFromLocalStorage)
			await this.subscribeToAchievementEvents(this.gameIdFromLocalStorage);
	}

	protected async beforeSignalRStop(): Promise<void> {
		if (this.gameIdFromLocalStorage)
			await this.unSubscribeToAchievementEvents(this.gameIdFromLocalStorage);
	}

	protected reportError(error: unknown, fallback: string): void {
		this.notificationService.addNotification({
			type: 'danger',
			message: getErrorMessage(error, fallback),
		});
	}

	protected renderSyncStatus(): unknown {
		const displayStatus = this.getDisplaySyncStatus();
		if (!this.isActiveGame && displayStatus === 'connected')
			return null;

		const statusText = displayStatus === 'connected'
			? 'Sync connected'
			: displayStatus === 'connecting'
				? 'Sync connecting...'
				: displayStatus === 'reconnecting'
					? 'Sync reconnecting...'
					: 'Sync offline';
		const statusMessage = this.getDisplaySyncStatusMessage();
		const showDetails = displayStatus !== 'connected';

		return html`
			<div class="sync-status sync-status--${ displayStatus }" role="status" aria-live="polite">
				<span class="sync-status__dot" aria-hidden="true"></span>
				<div class="sync-status__copy">
					<span class="sync-status__title">${ statusText }</span>
					${ showDetails
						? html`<span class="sync-status__message">${ statusMessage }</span>`
						: null }
				</div>
			</div>
		`;
	}

	private bindSignalRState(): void {
		this.removeSignalRStatusListener?.();

		this.removeSignalRStatusListener = this.signalRService.addStatusListener(
			(status, error) => this.handleSignalRStatusChanged(status, error),
		);
	}

	private handleSignalRStatusChanged(status: SignalRConnectionStatus, error?: Error): void {
		const previousStatus = this.syncStatus;
		this.syncStatus = status;
		this.syncStatusMessage = this.getSignalRStatusMessage(status, error);

		if (status === 'disconnected' && previousStatus === 'connecting' && !this.hasShownInitialSyncFailure) {
			this.hasShownInitialSyncFailure = true;
			this.reportError(error, 'Unable to connect to live updates. Retrying automatically...');
		}
		else if (status === 'reconnecting' && previousStatus !== 'reconnecting') {
			this.notificationService.addNotification({
				type: 'info',
				message: 'Live sync was interrupted. Reconnecting...',
			});
		}
		else if (status === 'connected') {
			if (previousStatus === 'reconnecting' || this.hasShownInitialSyncFailure) {
				this.notificationService.addNotification({
					type: 'success',
					message: 'Live sync restored.',
				});
			}
			this.hasShownInitialSyncFailure = false;
		}
	}

	private readonly handleBrowserOffline = (): void => {
		this.browserOnline = false;
		this.notificationService.addNotification({
			type: 'danger',
			message: 'Browser is offline. Live sync will resume when your connection returns.',
		});
	};

	private readonly handleBrowserOnline = (): void => {
		const wasOffline = !this.browserOnline;
		this.browserOnline = true;

		if (wasOffline) {
			this.notificationService.addNotification({
				type: 'info',
				message: 'Browser connection restored. Reconnecting live sync...',
			});
		}

		void this.signalRService.start().catch(() => {});
	};

	private getSignalRStatusMessage(status: SignalRConnectionStatus, error?: Error): string {
		switch (status) {
		case 'connected':
			return 'Real-time updates are active.';
		case 'connecting':
			return 'Connecting to the game hub...';
		case 'reconnecting':
			return getErrorMessage(error, 'Trying to restore live updates...');
		case 'disconnected':
		default:
			return getErrorMessage(error, 'Updates may be delayed until the connection returns.');
		}
	}

	private getDisplaySyncStatus(): SignalRConnectionStatus {
		if (!this.browserOnline)
			return 'disconnected';

		return this.syncStatus;
	}

	private getDisplaySyncStatusMessage(): string {
		if (!this.browserOnline)
			return 'Browser offline. Waiting for network...';

		return this.syncStatusMessage;
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

		this.maximumRounds = gameTracker.maximumRounds;
		this.players = [ ...gameTracker.playersRounds ];
		this.projectedSessionAchievementsByPlayer = {
			...gameTracker.projectedSessionAchievementsByPlayer,
		};
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

	protected getMaximumRoundCount(): number | null {
		return this.maximumRounds;
	}

	protected getPlaceholderRoundCount(player: PlayerRounds): number {
		const maximumRounds = this.getMaximumRoundCount();
		const remainingRounds = maximumRounds === null
			? this.visibleRoundCapacity - player.rounds.length
			: Math.min(this.visibleRoundCapacity, maximumRounds - player.rounds.length);

		return Math.max(0, remainingRounds);
	}

	protected shouldRenderRoundLimitBarrier(player: PlayerRounds): boolean {
		const maximumRounds = this.getMaximumRoundCount();
		if (maximumRounds === null)
			return false;

		const renderedRoundCount =
			player.rounds.length + this.getPlaceholderRoundCount(player);

		return renderedRoundCount >= maximumRounds;
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
			container.scrollTop = container.scrollHeight > container.clientHeight
				? container.scrollHeight
				: 0;
		});
	}

	private observePlayerContainer(): void {
		const playerContainer =
			this.shadowRoot?.querySelector<HTMLElement>('.player-container');

		if (playerContainer === this.observedPlayerContainer) {
			this.schedulePlayerGridLayout();
			return;
		}

		this.playerContainerResizeObserver.disconnect();
		this.observedPlayerContainer = playerContainer;

		if (!playerContainer)
			return;

		this.playerContainerResizeObserver.observe(playerContainer);
		this.schedulePlayerGridLayout();
	}

	private schedulePlayerGridLayout(): void {
		if (this.playerGridAnimationFrame !== undefined)
			cancelAnimationFrame(this.playerGridAnimationFrame);

		this.playerGridAnimationFrame = requestAnimationFrame(() => {
			this.playerGridAnimationFrame = undefined;
			this.updatePlayerGridRows();
		});
	}

	private updatePlayerGridRows(): void {
		const playerContainer = this.observedPlayerContainer;
		if (!playerContainer || playerContainer.clientHeight === 0)
			return;

		const playerCards: HTMLElement[] = [
			...playerContainer.querySelectorAll('.player'),
		];
		if (playerCards.length === 0)
			return;

		const rowCount = new Set(
			playerCards.map(playerCard => Math.round(playerCard.offsetTop)),
		).size;

		const styles = getComputedStyle(playerContainer);
		const verticalPadding =
			Number.parseFloat(styles.paddingTop)
			+ Number.parseFloat(styles.paddingBottom);
		const rowGap = Number.parseFloat(styles.rowGap) || 0;
		const availableHeight =
			playerContainer.clientHeight
			- verticalPadding
			- rowGap * (rowCount - 1);
		const availableRowHeight = Math.max(
			240,
			Math.floor(availableHeight / rowCount),
		);
		const playerLayouts = playerCards.map(playerCard => {
			const roundsViewport =
				playerCard.querySelector<HTMLElement>('.rounds-scroll-container');
			const roundGrid = playerCard.querySelector<HTMLElement>('.round-grid');
			const scrollbarWidth = roundsViewport
				? roundsViewport.offsetWidth - roundsViewport.clientWidth
				: 0;

			playerCard.style.setProperty(
				'--round-scrollbar-width',
				`${ scrollbarWidth }px`,
			);

			return {
				fixedHeight: roundsViewport
					? playerCard.offsetHeight - roundsViewport.clientHeight
					: playerCard.offsetHeight,
				roundHeight: roundGrid?.offsetHeight ?? 32,
			};
		});
		const visibleRoundCapacity = Math.max(
			1,
			Math.floor(Math.min(...playerLayouts.map(layout =>
				(availableRowHeight - layout.fixedHeight) / layout.roundHeight))),
		);

		if (this.visibleRoundCapacity !== visibleRoundCapacity)
			this.visibleRoundCapacity = visibleRoundCapacity;

		const naturalRowHeight = Math.max(...playerLayouts.map((layout, playerIndex) =>
			layout.fixedHeight
			+ (() => {
				const player = this.players[playerIndex];
				if (!player)
					return 1;

				return player.rounds.length
					+ this.getPlaceholderRoundCount(player)
					+ (this.shouldRenderRoundLimitBarrier(player) ? 1 : 0);
			})() * layout.roundHeight));
		const rowHeight = Math.min(availableRowHeight, naturalRowHeight);
		const rowHeightValue = `${ rowHeight }px`;

		if (playerContainer.style.getPropertyValue('--player-row-height') !== rowHeightValue)
			playerContainer.style.setProperty('--player-row-height', rowHeightValue);

		this.updateAchievementLayouts(playerCards);
	}

	private updateAchievementLayouts(playerCards: HTMLElement[]): void {
		const compactPlayers = new Set<string>();

		for (const playerCard of playerCards) {
			const rankInner =
				playerCard.querySelector<HTMLElement>('.rank-inner-container');
			const rankDisplay =
				rankInner?.querySelector<HTMLElement>('aa-rank-display');
			const detailedAchievements =
				rankInner?.querySelector<HTMLElement>('.projected-achievements--detailed');
			const playerId = rankInner?.dataset.playerId;

			if (!rankInner || !rankDisplay || !detailedAchievements || !playerId)
				continue;

			const gap = Number.parseFloat(getComputedStyle(rankInner).columnGap) || 0;
			const requiredWidth =
				rankDisplay.offsetWidth + detailedAchievements.scrollWidth + gap;

			if (requiredWidth > rankInner.clientWidth)
				compactPlayers.add(playerId);
		}

		const layoutChanged =
			compactPlayers.size !== this.compactAchievementPlayers.size
			|| [...compactPlayers].some(
				playerId => !this.compactAchievementPlayers.has(playerId),
			);

		if (layoutChanged)
			this.compactAchievementPlayers = compactPlayers;
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

	protected renderProjectedAchievements(playerId: string): unknown {
		if (!this.achievementDefinitions)
			return null;

		const achievements = this.projectedSessionAchievementsByPlayer[playerId] ?? [];
		if (achievements.length === 0)
			return null;

		const countsByTier = new Map<AchievementTier, number>();
		for (const achievement of achievements) {
			const definition = this.achievementDefinitions.sessionAchievementDefinitions.get(achievement);
			if (!definition)
				continue;

			const tier = definition.achievementTier as AchievementTier;
			countsByTier.set(tier, (countsByTier.get(tier) ?? 0) + 1);
		}

		const tierOrder = [
			AchievementTier.diamond,
			AchievementTier.platinum,
			AchievementTier.gold,
			AchievementTier.silver,
			AchievementTier.bronze,
		];

		const groupedTiers = tierOrder.filter(tier => countsByTier.has(tier));
		const total = groupedTiers.reduce(
			(sum, tier) => sum + (countsByTier.get(tier) ?? 0),
			0,
		);
		const breakdown = groupedTiers
			.map(tier => `${ countsByTier.get(tier) } ${ AchievementTier[tier] }`)
			.join(', ');

		return html`
			<span
				class="projected-achievements projected-achievements--detailed"
				aria-label="Achievements unlocked when this game is submitted"
			>
				${groupedTiers.map(tier => html`
						<span
							class="projected-achievement"
							title="${ countsByTier.get(tier) } ${ AchievementTier[tier] } achievement(s) when submitted"
						>
							<span class="projected-achievement__count">${ countsByTier.get(tier) }x</span>
							<img
								class="projected-achievement__icon"
								src=${ getAchievementTierIcon(tier) }
								alt="${ AchievementTier[tier] } achievement"
							/>
						</span>
					`)}
			</span>
			<span
				class="projected-achievements projected-achievements--compact"
				title="${ total } achievement(s) when submitted: ${ breakdown }"
				aria-label="${ total } achievements unlocked when this game is submitted"
			>
				<span class="projected-achievement">
					<span class="projected-achievement__count">${ total }x</span>
					<img
						class="projected-achievement__icon"
						src=${ getAchievementTierIcon(groupedTiers[0]!) }
						alt="Achievement"
					/>
				</span>
			</span>
		`;
	}

	override render(): unknown {
		const isLoading = this.loading || !this.season;

		return html`
			<aa-loading-state
				?loading=${isLoading}
				label="Setting up the play area"
			>
				${isLoading ? null : this.renderReadyState()}
			</aa-loading-state>
		`;
	}

	private renderReadyState(): unknown {
		if (!this.isActiveGame)
			return this.renderEmptyState();

		return html`
			<div class="page-shell">
				<div class="floating-controls">
					${this.renderTopContent()}
					${this.renderSyncStatus()}
				</div>

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
							const placeholderRoundCount = this.getPlaceholderRoundCount(player);

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
										<span>${user.alias}</span>
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
															<div class="round-number">${ roundIndex + 1 }</div>
															<div class="throws-container">
																${map(round.dartThrows, (dartThrow, throwIndex) => {
																	const onThrowUpdated = async (e: CustomEvent) => {
																		const cmp = e.currentTarget as aaDartThrow;
																		const previousThrow = this.players[playerIndex]?.rounds[roundIndex]?.dartThrows[throwIndex];

																		cmp.isSaving = true;
																		try {
																			await this.handleThrowUpdated?.(
																				e.detail.dartThrow,
																				playerIndex,
																				roundIndex,
																			);
																		}
																		catch (error) {
																			if (previousThrow) {
																				cmp.dartThrow = { ...previousThrow };
																				cmp.requestUpdate();
																			}
																			this.reportError(error, 'Unable to save dart throw.');
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
																<span>${ this.getRoundSum(round) }</span>
															</div>
														</div>
													</div>
												`)}
											${Array.from(
												{ length: placeholderRoundCount },
												(_, placeholderIndex) => {
													const roundIndex = player.rounds.length + placeholderIndex;

													return html`
														<div
															class=${classMap({
																'round-placeholder': true,
																'alternate-color': roundIndex % 2 === 0,
															})}
															aria-hidden="true"
														>
															<div class="round-grid">
																<div class="round-number">${ roundIndex + 1 }</div>
																<div class="throws-container placeholder-throws">
																	<span></span>
																	<span></span>
																	<span></span>
																</div>
																<div class="cumulative-points-round"></div>
															</div>
														</div>
													`;
												},
											)}
											${ this.shouldRenderRoundLimitBarrier(player) && this.maximumRounds !== null
												? html`
													<div
														class="round-limit-barrier"
														role="img"
														aria-label="Round limit reached. Round ${ this.maximumRounds + 1 } is locked."
														title="Round limit — no more rounds"
													>
														<div class="round-grid">
															<div class="round-number">${ this.maximumRounds + 1 }</div>
															<div class="throws-container placeholder-throws">
																<span></span>
																<span></span>
																<span></span>
															</div>
															<div class="cumulative-points-round"></div>
														</div>
													</div>
												`
												: null }
										</div>
									</div>

									<div class="rank-container">
										<div
											class=${classMap({
												'rank-inner-container': true,
												'is-achievement-compact':
													this.compactAchievementPlayers.has(player.playerId),
											})}
											data-player-id=${ player.playerId }
										>
											<aa-rank-display .rank=${rank}>
												<span class="mmr">${mmr}</span>
											</aa-rank-display>
											${this.renderProjectedAchievements(player.playerId)}
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
