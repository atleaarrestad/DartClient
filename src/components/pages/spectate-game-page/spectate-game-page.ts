import '../../aa-reaction-picker/aa-reaction-picker.js';

import { Router } from '@vaadin/router';
import type { PropertyValues } from 'lit';
import { html, nothing, unsafeCSS } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { repeat } from 'lit/directives/repeat.js';

import { faIcons } from '../../../faIcons.js';
import { getAbsoluteBase } from '../../../getAbsoluteBase.js';
import { isPlaceholderThrow } from '../../../helpers/lastDartHints.js';
import {
	countThrownDarts,
	findNextPlayerId,
	getCurrentRoundIndex,
	getOpenRound,
	hasWon,
} from '../../../helpers/spectateFocus.js';
import { RoundStatus, ThrowType } from '../../../models/enums.js';
import { getRankDisplayValue, getRankIcon } from '../../../models/rank.js';
import { GameResult, GameTracker, GameTrackerDelta, PlayerRounds, Round } from '../../../models/schemas.js';
import { SignalRSubscription } from '../../../services/signalRService.js';
import { postGameTemplate } from '../../../templates/dialogTemplates.js';
import type { ReactionPickDetail } from '../../aa-reaction-picker/aa-reaction-picker.js';
import { GamePage } from '../game-page/game-page.js';
import spectateGamePageStyles from './spectate-game-page.css?inline';

/**
 * Screens this narrow get the phone layout (see renderPhone). The app's global styles hide the
 * navigation bar on the spectate page at the same width.
 */
const phoneMediaQuery = '(max-width: 700px)';

type DartThrow = Round['dartThrows'][number];

@customElement('spectate-game-page')
export class SpectateGamePage extends GamePage {

	@state() private gameId!: string;
	/** The animal this spectator reacts as; the server names it on every (re)join. */
	@state() private spectatorAnimal?: string;
	/** Whether the screen is a phone's: then the page is the phone layout. */
	@state() private isPhone = false;
	/** The player the spectator tapped to look at; without one the page follows the thrower. */
	@state() private pinnedPlayerId?: string;
	protected override readonly playStatusLink = 'sessions';
	protected override readonly showsSpectateCode = false;
	private readonly phoneMedia = window.matchMedia(phoneMediaQuery);
	private readonly onPhoneMediaChange = (event: MediaQueryListEvent): void => {
		this.isPhone = event.matches;
	};

	/** The phone list, watched so the player in focus stays in view when it shrinks or grows. */
	private observedPhoneList?: HTMLElement;
	private readonly phoneListResizeObserver = new ResizeObserver(() => this.keepFocusInView());
	/** The player and list height the list was last scrolled for; it scrolls when they change. */
	private focusViewKey = '';
	private spectateSubscription?: SignalRSubscription;
	private readonly onGameUpdated = (gameId: string, gameTracker: GameTracker) => this.HandleOnGameUpdated(gameId, gameTracker);
	private readonly onGameDelta = (gameId: string, delta: GameTrackerDelta) => void this.HandleOnGameDelta(gameId, delta);
	private readonly onGameFinished = (gameId: string, gameResult: GameResult) => this.HandleOnGameFinished(gameId, gameResult);
	private synchronizationPromise?: Promise<void>;

	override connectedCallback(): void {
		super.connectedCallback();
		this.isPhone = this.phoneMedia.matches;
		this.phoneMedia.addEventListener('change', this.onPhoneMediaChange);
	}

	override async disconnectedCallback(): Promise<void> {
		this.phoneMedia.removeEventListener('change', this.onPhoneMediaChange);
		this.phoneListResizeObserver.disconnect();
		this.observedPhoneList = undefined;
		this.focusViewKey = '';
		await super.disconnectedCallback();
	}

	protected override willUpdate(changedProperties: PropertyValues): void {
		super.willUpdate(changedProperties);
		// Looking at a player who is up now is following the game again.
		const pinned = this.pinnedPlayerId;
		if (pinned && (pinned === this.getLivePlayerId() || !this.players.some(player => player.playerId === pinned)))
			this.pinnedPlayerId = undefined;
	}

	override updated(changedProperties: PropertyValues): void {
		super.updated(changedProperties);
		this.observePhoneList();
		this.keepFocusInView();
	}

	override async initialize(generation: number): Promise<void> {
		// The spectated game never goes into the player's cached game id, which belongs to
		// the game they play on the index page.
		this.gameId = this.getGameIdFromRoute() ?? '';

		await super.initialize(generation);
	}

	protected override getInitialGameId(): string | undefined {
		return this.gameId || undefined;
	}

	protected override handleInitialGameMissing(): void {
		this.returnToActiveGames();
	}

	private getGameIdFromRoute(): string | undefined {
		const routePrefix = `${ getAbsoluteBase() }spectate/`;
		const gameId = window.location.pathname
			.slice(routePrefix.length)
			.split('/')[0];

		return gameId ? decodeURIComponent(gameId) : undefined;
	}

	protected override renderPlayerHeaderContent(): unknown {
		return html`
			<div class="spectator-game-header" role="status">
				<span class="spectator-game-header__label">
					<i class="fa-solid fa-eye" aria-hidden="true"></i>
					Spectating
				</span>
				<aa-reaction-picker
					.animal=${ this.spectatorAnimal }
					?available=${ this.getDisplaySyncStatus() === 'connected' }
					@reaction-pick=${ this.onReactionPick }
				></aa-reaction-picker>
				<a class="spectator-game-header__join" href=${ getAbsoluteBase() }>Join game</a>
			</div>
		`;
	}

	protected override renderReadyState(): unknown {
		return this.isPhone && this.isActiveGame ? this.renderPhone() : super.renderReadyState();
	}

	/**
	 * The phone layout, for someone in the room following the game on their phone: one bar
	 * (watching, the round, React), the players as a list with the one in focus opened up,
	 * under it the last-dart board while that player is on a last dart, and who watches at the
	 * foot. The board gets its room first; the list takes the rest and scrolls (without a
	 * scrollbar) to keep the player in focus in view. In focus is whoever throws, or the
	 * player tapped; tapping the thrower follows the game again. No navigation and no Join
	 * game: a phone in the room is for watching.
	 */
	private renderPhone(): unknown {
		const liveId = this.getLivePlayerId();
		const focusedId = this.pinnedPlayerId ?? liveId;
		const nextId = liveId ? findNextPlayerId(this.players, liveId, this.maximumRounds) : undefined;
		const live = this.players.find(player => player.playerId === liveId);
		const roundIndex = live
			? getCurrentRoundIndex(live)
			: Math.max(0, ...this.players.map(player => player.rounds.length - 1));

		return html`
			<div class="phone">
				<header class="phone-bar">
					<span class="phone-bar__label">
						<i class="fa-solid fa-eye" aria-hidden="true"></i>
						Spectating
					</span>
					${ this.renderPhoneStatus(roundIndex) }
					<aa-reaction-picker
						.animal=${ this.spectatorAnimal }
						?available=${ this.getDisplaySyncStatus() === 'connected' }
						@reaction-pick=${ this.onReactionPick }
					></aa-reaction-picker>
				</header>
				<div class="phone-list">
					${ repeat(this.players, player => player.playerId, (player, playerIndex) => player.playerId === focusedId
						? this.renderPhoneFocus(player, playerIndex, player.playerId === liveId, roundIndex)
						: this.renderPhoneRow(player, playerIndex, player.playerId === liveId, player.playerId === nextId)) }
				</div>
				<div class="phone-gap" aria-hidden="true"></div>
				${ this.renderPhoneHints(focusedId) }
				<footer class="phone-footer">
					<aa-watch-panel .spectators=${ this.spectators }></aa-watch-panel>
				</footer>
				<aa-reaction-overlay></aa-reaction-overlay>
			</div>
		`;
	}

	/** The round being thrown; while live sync isn't up, that it is on its way instead. */
	private renderPhoneStatus(roundIndex: number): unknown {
		const sync = this.getDisplaySyncStatus();
		if (sync !== 'connected') {
			return html`
				<span class="phone-bar__status phone-bar__status--offline" role="status">
					${ sync === 'connecting' ? 'Connecting…' : 'Reconnecting…' }
				</span>
			`;
		}

		const round = this.maximumRounds === null
			? `Round ${ roundIndex + 1 }`
			: `Round ${ Math.min(roundIndex + 1, this.maximumRounds) } of ${ this.maximumRounds }`;

		return html`<span class="phone-bar__status">${ round }</span>`;
	}

	/**
	 * The player in focus, opened up: their rank, total and what is left, the round's three
	 * darts big (the dart to come outlined; for a player between turns their last round), the
	 * earlier rounds small, and the achievements they have unlocked.
	 */
	private renderPhoneFocus(player: PlayerRounds, playerIndex: number, isLive: boolean, liveRoundIndex: number): unknown {
		const user = this.getUserFromPlayerIndex(playerIndex);
		if (!user)
			return nothing;

		const stats = this.getLatestSeasonStatsForPlayer(playerIndex);
		const open = getOpenRound(player);
		const throwing = isLive || (open !== undefined && countThrownDarts(open) > 0);
		const round = throwing ? open : player.rounds.findLast(played => countThrownDarts(played) > 0);
		const roundIndex = throwing ? getCurrentRoundIndex(player) : round?.roundIndex ?? 0;
		const darts = [ 0, 1, 2 ].map(throwIndex => round?.dartThrows.find(dart => dart.throwIndex === throwIndex));
		const nextThrow = throwing ? darts.findIndex(dart => !dart || isPlaceholderThrow(dart)) : -1;
		const earlier = player.rounds.filter(played => played.roundIndex < roundIndex);
		const hasVictory = hasWon(player);

		return html`
			<section
				class="phone-focus"
				data-player-id=${ player.playerId }
				aria-label=${ isLive ? `${ user.alias }, throwing` : user.alias }
			>
				<div class="phone-focus__head">
					<img class="phone-rank" src=${ getRankIcon(stats?.currentRank) } alt="" width="40" height="40">
					<span class="phone-focus__who">
						<span class="phone-focus__name">${ user.alias }</span>
						<span class="phone-sub">${ getRankDisplayValue(stats?.currentRank) } ${ stats?.mmr ?? 0 }</span>
					</span>
					${ this.renderPhoneScore(player) }
				</div>
				<div class="phone-darts">
					${ darts.map((dart, throwIndex) => this.renderPhoneDart(dart, throwIndex === nextThrow, throwIndex)) }
					<span class="phone-round-sum">
						<span>${ throwing && roundIndex === liveRoundIndex ? 'Round' : `Round ${ roundIndex + 1 }` }</span>
						<b>${ round ? this.getRoundSum(round) : 0 }</b>
					</span>
				</div>
				${ earlier.length > 0 || this.projectedV2AchievementsByPlayer[player.playerId]?.length
					? html`
						<div class="phone-history">
							${ earlier.map(played => html`
								<span class=${ classMap({
									'phone-round':            true,
									'phone-round--overshoot': played.roundStatus === RoundStatus.Overshoot,
									'phone-round--victory':   hasVictory,
								}) }>
									<span class="phone-round__number">${ played.roundIndex + 1 }</span>
									<span class="phone-round__sum">${ this.getRoundSum(played) }</span>
								</span>
							`) }
							${ this.renderProjectedAchievements(player.playerId) }
						</div>
					`
					: nothing }
			</section>
		`;
	}

	/** A dart of the round in focus as it reads on the card; the dart to come is outlined. */
	private renderPhoneDart(dart: DartThrow | undefined, isNext: boolean, throwIndex: number): unknown {
		if (!dart || isPlaceholderThrow(dart)) {
			return html`
				<span class=${ classMap({ 'phone-dart': true, 'phone-dart--empty': !isNext, 'phone-dart--next': isNext }) }>
					${ isNext && throwIndex === 2 ? 'Last dart' : nothing }
				</span>
			`;
		}

		if (dart.throwType === ThrowType.Miss || dart.throwType === ThrowType.Rim)
			return html`<span class="phone-dart phone-dart--word">${ dart.throwType === ThrowType.Miss ? 'Miss' : 'Rim' }</span>`;

		const times = dart.throwType === ThrowType.Triple ? 'x3' : dart.throwType === ThrowType.Double ? 'x2' : '';

		return html`
			<span class="phone-dart">
				${ dart.hitLocation }
				${ times ? html`<span class="phone-dart__times">${ times }</span>` : nothing }
			</span>
		`;
	}

	/**
	 * Another player, one row: their rank, name and last round, their total. Tap to look at
	 * them; the thrower, when someone else is in focus, says so, and so does who is up next.
	 */
	private renderPhoneRow(player: PlayerRounds, playerIndex: number, isLive: boolean, isNext: boolean): unknown {
		const user = this.getUserFromPlayerIndex(playerIndex);
		if (!user)
			return nothing;

		const rank = this.getLatestSeasonStatsForPlayer(playerIndex)?.currentRank;
		const open = getOpenRound(player);
		const last = player.rounds.findLast(played => played !== open && countThrownDarts(played) > 0);
		let tag: unknown = nothing;
		if (hasWon(player))
			tag = html`<span class="phone-tag phone-tag--won">Won</span>`;
		else if (isLive)
			tag = html`<span class="phone-tag phone-tag--live">Throwing</span>`;
		else if (isNext)
			tag = html`<span class="phone-tag phone-tag--next">Up next</span>`;

		return html`
			<button class="phone-row" type="button" @click=${ () => this.lookAt(player.playerId, isLive) }>
				<img class="phone-rank" src=${ getRankIcon(rank) } alt=${ getRankDisplayValue(rank) } width="30" height="30">
				<span class="phone-row__who">
					<span class="phone-row__name">${ user.alias }</span>
					<span class="phone-sub">
						${ last ? `Last round ${ this.getRoundSum(last) }` : 'No darts yet' }
						${ tag }
					</span>
				</span>
				${ this.renderPhoneScore(player) }
			</button>
		`;
	}

	private renderPhoneScore(player: PlayerRounds): unknown {
		return html`
			<span class="phone-score">
				${ this.getCumulativePoints(player) }
				<span class="phone-score__left">(${ this.getDifferenceFromBase(player) })</span>
			</span>
		`;
	}

	/**
	 * The last-dart board, while the player in focus is on a last dart and there is something
	 * to aim for; otherwise it is gone and the list has its room.
	 */
	private renderPhoneHints(focusedId: string | undefined): unknown {
		const state = this.getLastDartHintsState();
		if (state.status !== 'ready' || !state.hints || state.target.playerId !== focusedId)
			return nothing;

		const { hints, victoryHits, sixtyNineHits } = state.hints;
		if (hints.length === 0 && victoryHits.length === 0 && sixtyNineHits.length === 0)
			return nothing;

		return html`
			<aa-last-dart-hints
				class="phone-hints"
				compact
				.playerName=${ state.target.playerName }
				.hints=${ state.hints }
				.tierRewards=${ this.getTierRewards() }
			></aa-last-dart-hints>
		`;
	}

	/** Look at a player; the one throwing is following the game again. */
	private lookAt(playerId: string, isLive: boolean): void {
		this.pinnedPlayerId = isLive ? undefined : playerId;
	}

	private observePhoneList(): void {
		const list = this.renderRoot.querySelector<HTMLElement>('.phone-list') ?? undefined;
		if (list === this.observedPhoneList)
			return;

		this.phoneListResizeObserver.disconnect();
		this.observedPhoneList = list;
		if (list)
			this.phoneListResizeObserver.observe(list);
	}

	/**
	 * Scrolls the list just enough to show the player in focus, when the focus moves to
	 * another player or the list changes height (the board coming or going); not otherwise,
	 * so a spectator scrolling to look around isn't pulled back with every dart.
	 */
	private keepFocusInView(): void {
		const list = this.observedPhoneList;
		const focus = list?.querySelector<HTMLElement>('.phone-focus');
		if (!list || !focus)
			return;

		const key = `${ focus.dataset['playerId'] }|${ list.clientHeight }`;
		if (key === this.focusViewKey)
			return;

		this.focusViewKey = key;
		const top = focus.offsetTop;
		const bottom = top + focus.offsetHeight;
		if (top < list.scrollTop)
			list.scrollTop = top;
		else if (bottom > list.scrollTop + list.clientHeight)
			list.scrollTop = Math.min(top, bottom - list.clientHeight);
	}

	/** A reconnect is a new connection, so the server picks a new animal for it. */
	protected override async onReactionsJoined(gameId: string): Promise<void> {
		this.spectatorAnimal = undefined;
		try {
			const animal = await this.gameLiveService.claimSpectatorName(gameId);
			if (gameId === this.gameId)
				this.spectatorAnimal = animal;
		}
		catch (error) {
			console.warn('[Reactions] could not get a spectator name', error);
		}
	}

	/** Shows the reaction here at once, then sends it to everyone else on the game. */
	private readonly onReactionPick = async (event: CustomEvent<ReactionPickDetail>): Promise<void> => {
		const { reaction } = event.detail;
		const gameId = this.gameId;
		const shownAs = this.spectatorAnimal;
		if (shownAs)
			this.showReaction(reaction, shownAs);

		try {
			const result = await this.gameLiveService.sendSpectatorReaction(gameId, reaction);
			if (!result?.accepted || !result.animal || gameId !== this.gameId)
				return;

			// The server names spectators; after a reconnect race its answer is the truth.
			if (result.animal !== this.spectatorAnimal)
				this.spectatorAnimal = result.animal;
			if (!shownAs)
				this.showReaction(reaction, result.animal);
		}
		catch (error) {
			console.warn('[Reactions] could not send a reaction', error);
		}
	};

	protected override async registerSignalRSubscriptions(): Promise<void> {
		const baseSubscriptionsReady = super.registerSignalRSubscriptions();

		if (!this.gameId) {
			await baseSubscriptionsReady;
			return;
		}

		this.spectateSubscription = this.gameLiveService.subscribeToGame(
			this.gameId,
			{
				onUpdated:  this.onGameUpdated,
				onDelta:    this.onGameDelta,
				onFinished: this.onGameFinished,
			},
			() => this.synchronizeGameState(),
		);

		await Promise.all([
			baseSubscriptionsReady,
			this.spectateSubscription.ready,
		]);
	}

	protected override async cleanupSignalRSubscriptions(): Promise<void> {
		const subscription = this.spectateSubscription;
		this.spectateSubscription = undefined;
		await subscription?.dispose();

		await super.cleanupSignalRSubscriptions();
	}

	private async synchronizeGameState(): Promise<void> {
		this.synchronizationPromise ??= this.fetchAndApplyGameState()
			.finally(() => {
				this.synchronizationPromise = undefined;
			});

		await this.synchronizationPromise;
	}

	private async fetchAndApplyGameState(): Promise<void> {
		const gameTracker = await this.gameService.getActiveGame(this.gameId);
		if (gameTracker) {
			this.updateGameState(gameTracker);
			return;
		}

		if (!this.isConnected)
			return;

		this.returnToActiveGames();
	}

	private returnToActiveGames(): void {
		this.notificationService.addNotification({
			type:    'info',
			message: 'This game is no longer active. Returning to active games.',
		});
		Router.go(`${ getAbsoluteBase() }sessions`);
	}

	private HandleOnGameUpdated(gameId: string, gameTracker: GameTracker): void {
		if (gameId !== this.gameId)
			return;

		this.updateGameState(gameTracker);
	}

	private async HandleOnGameDelta(gameId: string, delta: GameTrackerDelta): Promise<void> {
		if (gameId !== this.gameId)
			return;

		let status = this.applyGameDelta(delta);
		if (status !== 'gap' && status !== 'invalid')
			return;

		await this.synchronizeGameState();
		status = this.applyGameDelta(delta);
		if (status === 'gap' || status === 'invalid')
			await this.synchronizeGameState();
	}

	private async HandleOnGameFinished(gameId: string, gameResult: GameResult): Promise<void> {
		if (gameId !== this.gameId)
			return;

		this.dialogService.open(
			postGameTemplate(gameResult, this.users),
			{ title: 'Game Summary' },
		);
	}

	static override styles = [ ...GamePage.styles, faIcons, unsafeCSS(spectateGamePageStyles) ];

}
