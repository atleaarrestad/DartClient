import '../../aa-loading-state/aa-loading-state.js';
import '../../aa-last-dart-hints/aa-last-dart-hints.js';
import '../../aa-reaction-overlay/aa-reaction-overlay.js';
import '../../../ui/button/aa-button.js';
import '../../../ui/error-state/aa-error-state.js';

import { html, unsafeCSS } from 'lit';
import type { PropertyValues } from 'lit';
import { LitElement } from 'lit';
import { property, query, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { guard } from 'lit/directives/guard.js';
import { map } from 'lit/directives/map.js';
import { container } from 'tsyringe';

import { getAchievementTierIcon } from '../../../helpers/achievementHelper.js';
import {
	applyGameTrackerDelta,
	ApplyGameTrackerDeltaResult,
} from '../../../helpers/applyGameTrackerDelta.js';
import { getFinishValue, getLastDartRoundIndex, isLastDartUp, TierRewards } from '../../../helpers/lastDartHints.js';
import type { ThrowPosition } from '../../../helpers/throwFocusNavigation.js';
import { sum } from '../../../helpers/sum.js';
import { AchievementTier, achievementTiersAscending, RoundStatus } from '../../../models/enums.js';
import { GameTracker, GameTrackerDelta, PlayerRounds, Round, Season, SeasonStatistics, User } from '../../../models/schemas.js';
import { DataService } from '../../../services/dataService.js';
import { DialogService } from '../../../services/dialogService.js';
import { GameService } from '../../../services/gameService.js';
import {
	GameLiveService,
	type ReactionHandlers,
	type SpectatorReaction,
	type SpectatorsSnapshot,
} from '../../../services/gameLiveService.js';
import { NotificationService } from '../../../services/notificationService.js';
import { PlayStatus, setPlayStatus } from '../../../services/playStatus.js';
import { SeasonService } from '../../../services/seasonService.js';
import { UserService, GetAllUsersOptions } from '../../../services/userService.js';
import { sharedStyles } from '../../../styles/shared-styles.js';
import gamePageStyles from './game-page.css?inline';
import { aaDartThrow } from '../../aa-dart-throw-cmp/aa-dart-throw-cmp.js';
import '../../rank-display/aa-rank-display.js';
import {
	SignalRConnectionStatus,
	SignalRService,
	SignalRSubscription,
} from '../../../services/signalRService.js';
import { CacheService } from '../../../services/cacheService.js';
import { getErrorMessage } from '../../../helpers/getErrorMessage.js';
import type { AchievementInstanceResponse } from '../../../models/achievementBuilderApi.js';
import { LastDartHintsLoader, LastDartHintsTarget } from './last-dart-hints-loader.js';
import type { AaReactionOverlay } from '../../aa-reaction-overlay/aa-reaction-overlay.js';

/** Below this, player rows stop shrinking and the player grid scrolls. */
const minimumPlayerRowHeight = 240;
/**
 * Player rows are this fraction of the grid's height: two rows show at once, so a player that
 * doesn't fit in the first row slots into the second, and a third row scrolls.
 */
const playerRowsPerScreen = 2;

export class GamePage extends LitElement {

	@property({ type: Array }) users: User[] = [];
	@property({ type: Array }) players: PlayerRounds[] = [];

	@state() protected season?: Season;
	@state() protected loading: boolean = true;
	@state() protected loadError?: string;
	@state() protected isReadOnly: boolean = true;
	@state() protected syncStatus: SignalRConnectionStatus = 'disconnected';
	@state() protected syncStatusMessage = 'Live sync offline';
	@state() protected browserOnline = navigator.onLine;
	@state() protected visibleRoundCapacity = 10;
	/** How many player cards fit side by side; the cards that start and end a row are rounded. */
	@state() private playerColumnCount = 1;
	@state() protected maximumRounds: number | null = null;
	@state() protected configuredMaximumRounds: number | null = null;
	@state() protected compactAchievementPlayers: ReadonlySet<string> = new Set();
	// Throws being saved, per player: hints wait until the server has all of them.
	@state() private savingThrowCounts: ReadonlyMap<string, number> = new Map();

	protected dataService: DataService;
	protected seasonService: SeasonService;
	protected userService: UserService;
	protected notificationService: NotificationService;
	protected dialogService: DialogService;
	protected gameService: GameService;
	protected cacheService: CacheService;
	protected gameIdFromLocalStorage: string | undefined = undefined;
	protected gameRevision = 0;
	protected gameRevisionId?: string;
	protected creatingGame: boolean = false;
	protected selectedId?: string;
	protected selectedCellElement?: aaDartThrow = undefined;
	@state() protected isActiveGame: boolean = false;
	protected projectedV2AchievementsByPlayer: Record<string, AchievementInstanceResponse[]> = {};
	/** The player whose throw changed last; spectators follow them (see getCurrentThrow). */
	private lastThrowingPlayerId?: string;
	/** Hints for the dart being thrown, when it is a last dart; fetched apart from saving throws. */
	private readonly lastDartHints = new LastDartHintsLoader(
		this,
		(gameId, playerId, signal) => this.gameService.getLastDartHints(gameId, playerId, signal),
	);
	protected scrollLeader: HTMLElement | null = null;
	protected signalRService: SignalRService;
	protected gameLiveService: GameLiveService;
	private removeSignalRStatusListener?: () => void;
	private v2AchievementSubscription?: SignalRSubscription;
	private reactionSubscription?: SignalRSubscription;
	// Bumped on every (un)subscribe, so a subscribe that was overtaken while awaiting backs off.
	private gameEventsGeneration = 0;
	/** Spectators' reactions float over the game, on the players' page and the spectators'. */
	@query('aa-reaction-overlay') protected reactionOverlay?: AaReactionOverlay;
	/**
	 * Who watches the game, as animals. A plain field, handed straight to the overlay, so a
	 * spectator arriving never re-renders the board.
	 */
	private spectators: readonly string[] = [];
	/** The version of `spectators`; older snapshots arriving late are ignored. */
	private spectatorsVersion = 0;
	private lifecycleGeneration = 0;
	private observedPlayerContainer?: HTMLElement;
	private readonly playerContainerResizeObserver = new ResizeObserver(() =>
		this.schedulePlayerGridLayout());
	private playerGridAnimationFrame?: number;

	private hasShownInitialSyncFailure = false;
	private readonly onV2AchievementProjected = (
		gameId: string,
		playerId: string,
		achievements: AchievementInstanceResponse[],
	) => this.HandleV2AchievementProjected(gameId, playerId, achievements);

	private readonly reactionHandlers: ReactionHandlers = {
		onReaction:   (gameId, reaction) => this.handleSpectatorReaction(gameId, reaction),
		onSpectators: (gameId, snapshot) => this.applySpectators(gameId, snapshot),
	};

	constructor() {
		super();

		this.notificationService = container.resolve(NotificationService);
		this.seasonService = container.resolve(SeasonService);
		this.dialogService = container.resolve(DialogService);
		this.dataService = container.resolve(DataService);
		this.userService = container.resolve(UserService);
		this.gameService = container.resolve(GameService);
		this.gameLiveService = container.resolve(GameLiveService);
		this.signalRService = container.resolve(SignalRService);
		this.cacheService = container.resolve(CacheService);
	}

	override connectedCallback(): void {
		super.connectedCallback();
		window.addEventListener('offline', this.handleBrowserOffline);
		window.addEventListener('online', this.handleBrowserOnline);
		const generation = ++this.lifecycleGeneration;
		void this.initialize(generation);
	}

	override async disconnectedCallback(): Promise<void> {
		super.disconnectedCallback();
		this.lifecycleGeneration++;
		this.publishedPlayStatus = '';
		setPlayStatus(undefined);

		window.removeEventListener('offline', this.handleBrowserOffline);
		window.removeEventListener('online', this.handleBrowserOnline);
		this.playerContainerResizeObserver.disconnect();
		this.observedPlayerContainer = undefined;
		if (this.playerGridAnimationFrame !== undefined)
			cancelAnimationFrame(this.playerGridAnimationFrame);
		const removeStatusListener = this.removeSignalRStatusListener;
		this.removeSignalRStatusListener = undefined;
		removeStatusListener?.();

		await this.cleanupSignalRSubscriptions();
	}

	override updated(changedProperties: PropertyValues): void {
		super.updated(changedProperties);
		this.observePlayerContainer();
		this.publishPlayStatus();
	}

	/** The navigation link of this page; the sync dot sits on it. */
	protected readonly playStatusLink: PlayStatus['link'] = 'play';

	/** Opens this page's gameplay shortcuts, if it has any. */
	protected getShortcutsAction(): (() => void) | undefined {
		return undefined;
	}

	private publishedPlayStatus = '';

	/**
	 * Tells the navigation bar about live sync and the shortcuts. Sync shows while a game is
	 * open, and also without one when it isn't connected.
	 */
	private publishPlayStatus(): void {
		const sync = this.getDisplaySyncStatus();
		const status: PlayStatus | undefined = this.isActiveGame || sync !== 'connected'
			? {
				link:          this.playStatusLink,
				sync,
				syncMessage:   this.getDisplaySyncStatusMessage(),
				openShortcuts: this.isActiveGame ? this.getShortcutsAction() : undefined,
			}
			: undefined;
		const key = status ? JSON.stringify({ ...status, openShortcuts: !!status.openShortcuts }) : '';
		if (key === this.publishedPlayStatus)
			return;

		this.publishedPlayStatus = key;
		setPlayStatus(status);
	}

	protected async initialize(generation: number): Promise<void> {
		const isCurrent = () => this.isConnected && generation === this.lifecycleGeneration;

		this.loading = true;
		this.loadError = undefined;

		try {
			await this.healthCheckServer();
			if (!isCurrent())
				return;

			await this.GetLatestSeason();
			if (!isCurrent())
				return;
			if (!this.season)
				throw new Error('There is no active season.');

			await this.loadUsers({
				query: {includeSeasonStatistics: true, limitToSeasonId: this.season.id},
			});
			if (!isCurrent())
				return;

			const initialGameId = this.getInitialGameId();
			if (initialGameId !== undefined) {
				const gameTracker = await this.gameService.getActiveGame(initialGameId);
				if (!isCurrent())
					return;

				if (gameTracker) {
					this.gameIdFromLocalStorage = initialGameId;
					this.updateGameState(gameTracker);
					this.isActiveGame = true;
				}
				else {
					this.gameIdFromLocalStorage = undefined;
					this.handleInitialGameMissing();
				}
			}
		}
		catch (error) {
			if (!isCurrent())
				return;

			this.loadError = getErrorMessage(error, 'Unable to set up the play area.');
			this.loading = false;
			return;
		}

		this.loading = false;

		void this.scrollToEndInPlayerRounds();

		this.bindSignalRState();

		try {
			await this.registerSignalRSubscriptions();
		}
		catch (error) {
			this.reportError(error, 'Live updates are unavailable right now. Retrying automatically...');
		}
	}

	/** The game to show on load: the player's own cached game. */
	protected getInitialGameId(): string | undefined {
		return this.gameService.getCachedGameId();
	}

	/** The game from `getInitialGameId` is no longer active. */
	protected handleInitialGameMissing(): void {
		this.gameService.removeCachedGameId();
	}

	private retryInitialize(): void {
		void this.initialize(++this.lifecycleGeneration);
	}

	/** Live events for the game on screen: projected achievements and spectators' reactions. */
	public async subscribeToGameEvents(gameId: string): Promise<void> {
		const generation = ++this.gameEventsGeneration;
		await this.disposeGameEventSubscriptions();
		if (!this.isConnected || generation !== this.gameEventsGeneration)
			return;

		const v2Subscription = this.gameLiveService.subscribeToV2Achievements(
			gameId,
			this.onV2AchievementProjected,
		);
		this.v2AchievementSubscription = v2Subscription;

		const reactionSubscription = this.gameLiveService.subscribeToReactions(
			gameId,
			this.reactionHandlers,
			() => this.handleReactionsJoined(gameId),
		);
		this.reactionSubscription = reactionSubscription;
		// Reactions are a bonus: without them (an older backend) play and achievements go on.
		reactionSubscription.ready.catch(error =>
			console.warn('[Reactions] unavailable', error));

		await v2Subscription.ready;
	}

	public async unsubscribeFromGameEvents(): Promise<void> {
		this.gameEventsGeneration++;
		await this.disposeGameEventSubscriptions();
	}

	private async disposeGameEventSubscriptions(): Promise<void> {
		const subscriptions = [ this.v2AchievementSubscription, this.reactionSubscription ];
		this.v2AchievementSubscription = undefined;
		this.reactionSubscription = undefined;
		this.setSpectators([], 0);
		await Promise.all(subscriptions.map(subscription => subscription?.dispose()));
	}

	/**
	 * The reactions group was (re)joined: fetch the crowd afresh. The version starts over too,
	 * because after a server restart the server's versions start over.
	 */
	private async handleReactionsJoined(gameId: string): Promise<void> {
		this.spectatorsVersion = 0;
		await Promise.all([ this.refreshSpectators(gameId), this.onReactionsJoined(gameId) ]);
	}

	private async refreshSpectators(gameId: string): Promise<void> {
		try {
			const snapshot = await this.gameLiveService.getSpectators(gameId);
			if (snapshot)
				this.applySpectators(gameId, snapshot);
		}
		catch (error) {
			console.warn('[Reactions] could not fetch the spectators', error);
		}
	}

	/**
	 * Runs whenever the game's reactions group is (re)joined. A reconnect is a new connection
	 * to the server, so a spectator gets a new animal here.
	 */
	protected onReactionsJoined(_gameId: string): void | Promise<void> {}

	private handleSpectatorReaction(gameId: string, reaction: SpectatorReaction): void {
		if (gameId !== this.gameIdFromLocalStorage)
			return;

		this.reactionOverlay?.show(reaction.reaction, reaction.animal);
	}

	private applySpectators(gameId: string, snapshot: SpectatorsSnapshot): void {
		if (gameId !== this.gameIdFromLocalStorage || snapshot.version <= this.spectatorsVersion)
			return;

		this.setSpectators(snapshot.animals, snapshot.version);
	}

	private setSpectators(animals: readonly string[], version: number): void {
		this.spectators = animals;
		this.spectatorsVersion = version;
		if (this.reactionOverlay)
			this.reactionOverlay.spectators = animals;
	}

	private async HandleV2AchievementProjected(
		gameId: string,
		playerId: string,
		achievements: AchievementInstanceResponse[],
	) {
		if (gameId !== this.gameIdFromLocalStorage || achievements.length === 0)
			return;

		const existing = this.projectedV2AchievementsByPlayer[playerId] ?? [];
		const byId = new Map(existing.map(achievement => [ achievement.id, achievement ]));
		achievements.forEach(achievement => byId.set(achievement.id, achievement));
		this.projectedV2AchievementsByPlayer = {
			...this.projectedV2AchievementsByPlayer,
			[playerId]: [ ...byId.values() ],
		};
		this.notificationService.addNotification({
			type: 'achievement',
			achievementNames: achievements.map(achievement => achievement.renderedName),
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

	protected async registerSignalRSubscriptions(): Promise<void> {
		if (this.gameIdFromLocalStorage)
			await this.subscribeToGameEvents(this.gameIdFromLocalStorage);
		else
			await this.signalRService.ensureConnected();
	}

	protected async cleanupSignalRSubscriptions(): Promise<void> {
		await this.unsubscribeFromGameEvents();
	}

	protected reportError(error: unknown, fallback: string): void {
		this.notificationService.addNotification({
			type: 'danger',
			message: getErrorMessage(error, fallback),
		});
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

		void this.signalRService.ensureConnected().catch(() => {});
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

	protected getDisplaySyncStatus(): SignalRConnectionStatus {
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

	protected updateGameState(gameTracker: GameTracker): boolean {
		if (this.gameRevisionId !== gameTracker.id) {
			this.gameRevisionId = gameTracker.id;
			this.gameRevision = 0;
			this.projectedV2AchievementsByPlayer = {};
		}
		else if (gameTracker.revision < this.gameRevision) {
			return false;
		}

		const oldRoundCount = Math.max(...this.players.map(p => p.rounds.length), 0);
		const newRoundCount = Math.max(...gameTracker.playersRounds.map(p => p.rounds.length), 0);
		const roundCountChanged = oldRoundCount !== newRoundCount;

		this.maximumRounds = gameTracker.maximumRounds;
		this.configuredMaximumRounds = gameTracker.configuredMaximumRounds;
		this.gameRevision = gameTracker.revision;
		this.players = [ ...gameTracker.playersRounds ];
		this.projectedV2AchievementsByPlayer = {
			...gameTracker.projectedV2AchievementsByPlayer,
		};
		this.reorderPlayersByMMR();

		if (roundCountChanged)
			void this.scrollToEndInPlayerRounds();

		return true;
	}

	protected applyGameDelta(delta: GameTrackerDelta): ApplyGameTrackerDeltaResult['status'] {
		const gameId = this.gameIdFromLocalStorage;
		if (!gameId)
			return 'invalid';

		const oldRoundCount = Math.max(...this.players.map(player => player.rounds.length), 0);
		const result = applyGameTrackerDelta({
			gameId,
			revision:                        this.gameRevision,
			maximumRounds:                   this.maximumRounds,
			configuredMaximumRounds:         this.configuredMaximumRounds,
			playersRounds:                   this.players,
			projectedV2AchievementsByPlayer: this.projectedV2AchievementsByPlayer,
		}, delta);

		if (result.status !== 'applied')
			return result.status;

		this.gameRevision = result.state.revision;
		this.maximumRounds = result.state.maximumRounds;
		this.configuredMaximumRounds = result.state.configuredMaximumRounds;
		this.players = result.state.playersRounds;
		this.projectedV2AchievementsByPlayer = result.state.projectedV2AchievementsByPlayer;
		this.lastThrowingPlayerId = delta.playerRoundDeltas.at(-1)?.playerId ?? this.lastThrowingPlayerId;

		const newRoundCount = Math.max(...this.players.map(player => player.rounds.length), 0);
		if (oldRoundCount !== newRoundCount)
			void this.scrollToEndInPlayerRounds();

		return result.status;
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

	/**
	 * Empty rounds after the played ones, filling the rows the card shows (never past the round
	 * limit). Once the played rounds fill the card it scrolls to the latest, so the round being
	 * thrown is always in view.
	 */
	protected getPlaceholderRoundCount(player: PlayerRounds): number {
		const maximumRounds = this.getMaximumRoundCount();
		const shownRounds = maximumRounds === null
			? this.visibleRoundCapacity
			: Math.min(this.visibleRoundCapacity, maximumRounds);

		return Math.max(0, shownRounds - player.rounds.length);
	}

	protected getRoundLimitBarrierCount(player: PlayerRounds): number {
		const maximumRounds = this.getMaximumRoundCount();
		if (maximumRounds === null)
			return 0;

		const renderedRoundCount =
			player.rounds.length + this.getPlaceholderRoundCount(player);
		if (renderedRoundCount < maximumRounds)
			return 0;

		const preservedRoundCount = this.configuredMaximumRounds === null
			? Math.max(this.visibleRoundCapacity, player.rounds.length, maximumRounds + 1)
			: Math.max(this.configuredMaximumRounds + 1, player.rounds.length);

		return Math.max(1, preservedRoundCount - renderedRoundCount);
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
		this.observedPlayerContainer = playerContainer ?? undefined;

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

		const playerCards = [
			...playerContainer.querySelectorAll<HTMLElement>('.player'),
		];
		if (playerCards.length === 0)
			return;

		const firstRowTop = Math.round(playerCards[0]!.offsetTop);
		const columnCount = playerCards.filter(card => Math.round(card.offsetTop) === firstRowTop).length;
		if (this.playerColumnCount !== columnCount)
			this.playerColumnCount = columnCount;

		const styles = getComputedStyle(playerContainer);
		const verticalPadding =
			Number.parseFloat(styles.paddingTop)
			+ Number.parseFloat(styles.paddingBottom);
		const rowGap = Number.parseFloat(styles.rowGap) || 0;
		const availableHeight =
			playerContainer.clientHeight
			- verticalPadding
			- rowGap * (playerRowsPerScreen - 1);
		const availableRowHeight = Math.max(
			minimumPlayerRowHeight,
			Math.floor(availableHeight / playerRowsPerScreen),
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
					+ this.getRoundLimitBarrierCount(player);
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
			const playerId = rankInner?.dataset['playerId'];

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
				<div class="shortcut">
					<span class="keycap" aria-label="Shift plus N">⇧ N</span>
				</div>
				<div class="subtitle">to start a new game!</div>
			</div>
		`;
	}

	protected renderPlayerHeaderContent(): unknown {
		return null;
	}

	protected isPlayerActive(_playerIndex: number): boolean {
		return false;
	}

	protected override willUpdate(changedProperties: PropertyValues): void {
		super.willUpdate(changedProperties);
		// Here rather than in updated(), so starting or cancelling a request adds no render.
		this.lastDartHints.sync(this.getLastDartTarget());
	}

	/**
	 * The dart being thrown now. The play page uses the selected cell; spectators have none,
	 * so they follow whoever threw last, at their next dart when it is a last dart.
	 */
	protected getCurrentThrow(): ThrowPosition | undefined {
		const playerIndex = this.players.findIndex(player => player.playerId === this.lastThrowingPlayerId);
		const player = this.players[playerIndex];
		const roundIndex = player ? getLastDartRoundIndex(player) : undefined;

		return roundIndex === undefined ? undefined : { playerIndex, roundIndex, throwIndex: 2 };
	}

	/**
	 * Hints are only ever for the dart being thrown now, when it is the player's last dart and
	 * the server has their first two (no throw of theirs is still saving). Moving to another
	 * player or another dart drops them at once; there is no falling back to anyone else.
	 */
	private getLastDartTarget(): LastDartHintsTarget | undefined {
		const gameId = this.gameRevisionId;
		const position = this.getCurrentThrow();
		const player = position ? this.players[position.playerIndex] : undefined;
		if (!gameId || !this.isActiveGame || !position || !player)
			return undefined;

		if (!isLastDartUp(player, position) || this.savingThrowCounts.has(player.playerId))
			return undefined;

		const { playerIndex, roundIndex } = position;
		const darts = player.rounds
			.find(round => round.roundIndex === roundIndex)!.dartThrows
			.map(dart => `${ dart.throwType }:${ dart.hitLocation }:${ dart.finalPoints }`)
			.join(',');

		return {
			gameId,
			playerId:   player.playerId,
			playerName: this.getUserFromPlayerIndex(playerIndex)?.alias ?? '',
			roundIndex,
			key:        `${ gameId }|${ player.playerId }|${ roundIndex }|${ darts }`,
		};
	}

	private markThrowSaving(playerId: string, isSaving: boolean): void {
		const saving = new Map(this.savingThrowCounts);
		const count = (saving.get(playerId) ?? 0) + (isSaving ? 1 : -1);
		if (count > 0)
			saving.set(playerId, count);
		else
			saving.delete(playerId);

		this.savingThrowCounts = saving;
	}

	/** Docked beside the board (under it on a narrow screen; see the page's styles). */
	protected renderLastDartHints(): unknown {
		const state = this.lastDartHints.state;

		return html`
			<aa-last-dart-hints
				.playerName=${ state.status === 'idle' ? '' : state.target.playerName }
				.hints=${ state.status === 'ready' ? state.hints : null }
				.loading=${ state.status === 'loading' }
				.tierRewards=${ this.getTierRewards() }
				.victoryValue=${ state.status === 'idle' ? 0 : this.getVictoryValue(state.target) }
			></aa-last-dart-hints>
		`;
	}

	/**
	 * What finishing with this dart would be worth to the player, by the season's match MMR
	 * rules: placed after everyone who has finished already, in the target's round.
	 */
	private getVictoryValue(target: LastDartHintsTarget): number {
		const configuration = this.season?.mmrConfiguration;
		if (!configuration)
			return 0;

		const finishedBefore = this.players.filter(player => player.playerId !== target.playerId
			&& player.rounds.some(round => round.roundStatus === RoundStatus.Victory)).length;

		return getFinishValue(configuration, target.roundIndex + 1, finishedBefore + 1);
	}

	private tierRewardsSource?: Season['achievementTierRewards'];
	private tierRewards: TierRewards = {};

	/** The season's MMR per achievement tier, kept as one object while the season is the same. */
	private getTierRewards(): TierRewards {
		const rewards = this.season?.achievementTierRewards;
		if (rewards !== this.tierRewardsSource) {
			this.tierRewardsSource = rewards;
			this.tierRewards = Object.fromEntries((rewards ?? []).map(reward => [ reward.achievementTier, reward.mmrReward ]));
		}

		return this.tierRewards;
	}

	protected renderProjectedAchievements(playerId: string): unknown {
		const v2Achievements = this.projectedV2AchievementsByPlayer[playerId] ?? [];
		if (v2Achievements.length === 0)
			return null;

		const countsByTier = new Map<AchievementTier, number>();
		const namesByTier = new Map<AchievementTier, string[]>();
		for (const achievement of v2Achievements) {
			const tier = achievement.achievementTier as AchievementTier;
			countsByTier.set(tier, (countsByTier.get(tier) ?? 0) + 1);
			namesByTier.set(tier, [
				...(namesByTier.get(tier) ?? []),
				achievement.renderedName,
			]);
		}
		if (countsByTier.size === 0)
			return null;

		const groupedTiers = [ ...achievementTiersAscending ]
			.reverse()
			.filter(tier => countsByTier.has(tier));
		const total = sum(groupedTiers, tier => countsByTier.get(tier) ?? 0);
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
							title="${ (namesByTier.get(tier) ?? []).join(', ') }"
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
		if (this.loadError && !this.loading) {
			return html`
				<div class="load-error-shell">
					<aa-error-state
						class="load-error"
						heading="Unable to set up the play area"
						message=${ this.loadError }
					>
						<aa-button
							slot="actions"
							type="button"
							variant="primary"
							@click=${ this.retryInitialize }
						>
							Try again
						</aa-button>
					</aa-error-state>
				</div>
			`;
		}

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
				<div class="page-content">
					<div class="player-header">
						${this.renderPlayerHeaderContent()}
					</div>

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
							const roundLimitBarrierCount = this.getRoundLimitBarrierCount(player);
							const projectedV2Achievements =
								this.projectedV2AchievementsByPlayer[player.playerId];
							const isAchievementCompact =
								this.compactAchievementPlayers.has(player.playerId);
							const isActive = this.isPlayerActive(playerIndex);
							// Cards in a row are joined; only the row's outer corners are rounded.
							const columnCount = Math.max(1, this.playerColumnCount);
							const isRowStart = playerIndex % columnCount === 0;
							const isRowEnd = playerIndex % columnCount === columnCount - 1
								|| playerIndex === this.players.length - 1;

							return guard([
								player,
								playerIndex,
								user,
								mmr,
								rank,
								this.maximumRounds,
								this.configuredMaximumRounds,
								this.visibleRoundCapacity,
								projectedV2Achievements,
								isAchievementCompact,
								isActive,
								isRowStart,
								isRowEnd,
								this.isReadOnly,
							], () => html`
								<article
									class=${ classMap({
										'player':            true,
										'player--row-start': isRowStart,
										'player--row-end':   isRowEnd,
									}) }
									@focusin=${this.onPlayerInteract}
									@mouseenter=${this.onPlayerInteract}
								>
									<span class=${classMap({
										'player-name': true,
										'active-player-name': isActive,
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
																		this.markThrowSaving(player.playerId, true);
																		try {
																			await this.handleThrowUpdated?.(
																				e.detail.dartThrow,
																				playerIndex,
																				roundIndex,
																			);
																		}
																		catch (error) {
																			const authoritativeThrow =
																				this.players[playerIndex]?.rounds[roundIndex]?.dartThrows[throwIndex]
																				?? previousThrow;
																			if (authoritativeThrow) {
																				cmp.dartThrow = { ...authoritativeThrow };
																				cmp.requestUpdate();
																			}
																			this.reportError(error, 'Unable to save dart throw.');
																		}
																		finally {
																			cmp.isSaving = false;
																			this.markThrowSaving(player.playerId, false);
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
																'victory': hasVictory,
																'alternate-color': roundIndex % 2 === 0 && !hasVictory,
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
											${ roundLimitBarrierCount > 0 && this.maximumRounds !== null
												? html`
													<div
														class="round-limit-barrier-region"
														role="img"
														aria-label=${ roundLimitBarrierCount === 1
															? `Round limit reached. Round ${ this.maximumRounds + 1 } is locked.`
															: `Round limit reached. Rounds ${ this.maximumRounds + 1 } through ${ this.maximumRounds + roundLimitBarrierCount } are locked.` }
														title="Round limit — no more rounds"
													>
														${Array.from(
															{ length: roundLimitBarrierCount },
															(_, barrierIndex) => html`
																<div class="round-limit-barrier-row">
																	<div class="round-grid">
																		<div class="round-number">${ this.maximumRounds! + barrierIndex + 1 }</div>
																		<div class="throws-container placeholder-throws">
																			<span></span>
																			<span></span>
																			<span></span>
																		</div>
																		<div class="cumulative-points-round"></div>
																	</div>
																</div>
															`,
														)}
													</div>
												`
												: null }
										</div>
									</div>

									<div class="rank-container">
										<div
											class=${classMap({
												'rank-inner-container': true,
												'is-achievement-compact': isAchievementCompact,
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
							`);
						})}
					</div>

					<aa-reaction-overlay .spectators=${ this.spectators }></aa-reaction-overlay>
				</div>

				${ this.renderLastDartHints() }
			</div>
		`;
	}

	static override styles = [ sharedStyles, unsafeCSS(gamePageStyles) ];
}
