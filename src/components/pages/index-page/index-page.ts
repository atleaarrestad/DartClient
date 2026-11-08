import { html } from 'lit';
import { customElement } from 'lit/decorators.js';

import {
	clampThrowPosition,
	getArrowKeyDirection,
	getFirstUnplayedThrow,
	getFocusAfterPlayerRemoval,
	getNextThrowFocus,
	getNextTurnStart,
	getThrowElementId,
	parseThrowElementId,
	type FocusDirection,
	type ThrowPosition,
} from '../../../helpers/throwFocusNavigation.js';
import { RoundStatus } from '../../../models/enums.js';
import type { GameResult, PlayerRounds, Round, User } from '../../../models/schemas.js';
import {
	confirmNewGameTemplate,
	confirmRematchTemplate,
	gameplayShortcutsTemplate,
	postGameTemplate,
	selectUserTemplate,
} from '../../../templates/dialogTemplates.js';
import { renderPlayerChips } from '../../../templates/playerChips.js';
import type { aaDartThrow } from '../../aa-dart-throw-cmp/aa-dart-throw-cmp.js';
import { GamePage } from '../game-page/game-page.js';
import { DartThrow } from '../../../models/dartThrowSchema.js';

type DartThrowPatch = Pick<DartThrow, 'hitLocation' | 'throwType'>;

/** Patches by player id, then round index, then throw index. */
type DartThrowPatches = Map<string, Map<number, Map<number, DartThrowPatch>>>;

function addDartThrowPatch(
	patches: DartThrowPatches,
	playerId: string,
	roundIndex: number,
	throwIndex: number,
	patch: DartThrowPatch,
): void {
	const byRound = patches.get(playerId) ?? new Map<number, Map<number, DartThrowPatch>>();
	const byThrow = byRound.get(roundIndex) ?? new Map<number, DartThrowPatch>();

	byThrow.set(throwIndex, patch);
	byRound.set(roundIndex, byThrow);
	patches.set(playerId, byRound);
}

/**
 * Applies the patches to the matching throws. Players and rounds without a patch keep
 * their identity, so their rendering stays cached.
 */
function patchDartThrows(players: PlayerRounds[], patches: DartThrowPatches): PlayerRounds[] {
	return players.map(player => {
		const roundPatches = patches.get(player.playerId);
		if (!roundPatches)
			return player;

		return {
			...player,
			rounds: player.rounds.map((round, roundIndex) => {
				const throwPatches = roundPatches.get(roundIndex);
				if (!throwPatches)
					return round;

				return {
					...round,
					dartThrows: round.dartThrows.map((dartThrow, throwIndex) => {
						const patch = throwPatches.get(throwIndex);
						return patch
							? {
								...dartThrow,
								hitLocation: patch.hitLocation,
								throwType:   patch.throwType,
							}
							: dartThrow;
					}),
				};
			}),
		};
	});
}

@customElement('index-page')
export class IndexPage extends GamePage {

	protected override isReadOnly: boolean = false;
	protected blockThrowUpdates: boolean = false;
	protected lastPlayedUserIds: string[] = [];
	private readonly pendingDartThrowUpdates = new Map<
		string,
		{ token: symbol; dartThrow: DartThrow; }
	>();
	private gameSynchronizationPromise?: Promise<void>;

	override connectedCallback(): void {
		super.connectedCallback();
		this.lastPlayedUserIds = this.cacheService.getLastPlayedUserIds();
		window.addEventListener('keydown', this.onKeyDown);
	}

	override disconnectedCallback(): Promise<void> {
		window.removeEventListener('keydown', this.onKeyDown);
		return super.disconnectedCallback();
	}

	protected override async handleThrowUpdated(
		updatedThrow: Round['dartThrows'][number],
		playerIndex: number,
		roundNumber: number,
	): Promise<void> {
		if (this.blockThrowUpdates)
			return;
		if (!this.players[playerIndex])
			return;

		const gameId = this.gameIdFromLocalStorage!;
		const playerId = this.players[playerIndex]!.playerId;
		const updateKey = this.getDartThrowUpdateKey(
			gameId,
			playerId,
			roundNumber,
			updatedThrow.throwIndex,
		);
		const token = Symbol(updateKey);

		this.pendingDartThrowUpdates.set(updateKey, {
			token,
			dartThrow: { ...updatedThrow },
		});

		try {
			const gameUpdate = await this.gameService.addDartThrowToGame(
				gameId,
				playerId,
				roundNumber,
				updatedThrow,
			);

			this.removePendingDartThrowUpdate(updateKey, token);

			const focusedDraft = this.getFocusedDartThrowDraft();
			if ('playersRounds' in gameUpdate) {
				this.updateGameState(gameUpdate);
			}
			else {
				let status = this.applyGameDelta(gameUpdate);
				if (status === 'gap' || status === 'invalid') {
					await this.synchronizeGameState();
					status = this.applyGameDelta(gameUpdate);
					if (status === 'gap' || status === 'invalid')
						await this.synchronizeGameState();
				}
			}

			this.applyPendingDartThrowUpdates();
			this.applyFocusedDartThrowDraft(focusedDraft);
			this.focusNextValidPlayerAfterRoundFailure(playerIndex, roundNumber);
		}
		catch (error) {
			this.removePendingDartThrowUpdate(updateKey, token);
			await this.synchronizeGameState();
			this.applyPendingDartThrowUpdates();

			throw error;
		}
	}

	private getDartThrowUpdateKey(
		gameId: string,
		playerId: string,
		roundIndex: number,
		throwIndex: number,
	): string {
		return `${ gameId }:${ playerId }:${ roundIndex }:${ throwIndex }`;
	}

	private removePendingDartThrowUpdate(key: string, token: symbol): boolean {
		const pendingUpdate = this.pendingDartThrowUpdates.get(key);
		if (pendingUpdate?.token !== token)
			return false;

		this.pendingDartThrowUpdates.delete(key);
		return true;
	}

	private applyPendingDartThrowUpdates(): void {
		if (this.pendingDartThrowUpdates.size === 0)
			return;

		const patches: DartThrowPatches = new Map();
		for (const [ key, pending ] of this.pendingDartThrowUpdates) {
			const [ gameId, playerId, roundIndexText, throwIndexText ] = key.split(':');
			if (gameId !== this.gameIdFromLocalStorage)
				continue;

			addDartThrowPatch(
				patches,
				playerId!,
				Number(roundIndexText),
				Number(throwIndexText),
				pending.dartThrow,
			);
		}

		this.players = patchDartThrows(this.players, patches);
	}

	private getFocusedDartThrowDraft(): {
		playerId: string;
		position: ThrowPosition;
		patch:    DartThrowPatch;
	} | undefined {
		const position = this.getSelectedThrow();
		const dartThrow = this.selectedCellElement?.dartThrow;
		if (!position || !dartThrow)
			return undefined;

		const playerId = this.players[position.playerIndex]?.playerId;
		if (!playerId)
			return undefined;

		return {
			playerId,
			position,
			patch: {
				hitLocation: dartThrow.hitLocation,
				throwType:   dartThrow.throwType,
			},
		};
	}

	private applyFocusedDartThrowDraft(
		draft: ReturnType<IndexPage['getFocusedDartThrowDraft']>,
	): void {
		if (!draft)
			return;

		const patches: DartThrowPatches = new Map();
		addDartThrowPatch(
			patches,
			draft.playerId,
			draft.position.roundIndex,
			draft.position.throwIndex,
			draft.patch,
		);
		this.players = patchDartThrows(this.players, patches);
	}

	private async synchronizeGameState(): Promise<void> {
		this.gameSynchronizationPromise ??= this.fetchAndApplyGameState()
			.finally(() => {
				this.gameSynchronizationPromise = undefined;
			});

		await this.gameSynchronizationPromise;
	}

	private async fetchAndApplyGameState(): Promise<void> {
		const gameId = this.gameIdFromLocalStorage;
		if (!gameId)
			return;

		const gameTracker = await this.gameService.getActiveGame(gameId);
		if (!gameTracker)
			throw new Error('The active game could not be synchronized.');

		this.updateGameState(gameTracker);
		this.applyPendingDartThrowUpdates();
	}

	protected onKeyDown = this.handleKeyDown.bind(this);

	protected handleKeyDown(event: KeyboardEvent): void {
		if (document.querySelector('aa-dialog'))
			return;

		if (event.shiftKey) {
			const arrowDirection = getArrowKeyDirection(event.code);
			if (arrowDirection) {
				this.moveFreeFocus(arrowDirection);
				event.preventDefault();
				return;
			}

			if (event.repeat)
				return;

			switch (event.code) {
				case 'Minus':
				case 'NumpadAdd':
					this.addNewPlayer()
						.catch(error => this.reportError(error, 'Unable to add the player.'));
					event.preventDefault();
					break;

				case 'Slash':
				case 'NumpadSubtract':
					this.removeFocusedPlayer()
						.catch(error => this.reportError(error, 'Unable to remove the player.'));
					event.preventDefault();
					break;

				case 'Tab':
					this.moveFocus('backward');
					event.preventDefault();
					break;

				case 'KeyN':
					void this.createGame();
					event.preventDefault();
					break;

				case 'KeyS':
					void this.saveGame();
					event.preventDefault();
					break;

				case 'KeyR':
					if (this.isRematchPermissible()) {
						void this.rematch();
					}
					event.preventDefault();
					break;

				case 'KeyH':
					void this.openShortcutHelp();
					event.preventDefault();
					break;
			}
		}
		else {
			if (event.repeat)
				return;

			switch (event.code) {
				case 'Tab':
				case 'Enter':
				case 'NumpadEnter':
					this.moveFocus('forward');
					event.preventDefault();
			}
		}
	}

	protected override isPlayerActive(playerIndex: number): boolean {
		return this.getSelectedThrow()?.playerIndex === playerIndex;
	}

	private isRematchPermissible(): boolean {
		return this.hasRematchPlayers() && !this.creatingGame;
	}

	private async confirmRematch(): Promise<boolean> {
		const rematchUsers = this.getLastPlayedUsers();
		if (rematchUsers.length === 0)
			return false;

		const confirmed = await this.dialogService.open<boolean>(
			confirmRematchTemplate(rematchUsers),
			{ title: 'Confirm Rematch' },
		);

		return confirmed ?? false;
	}

	private async rematch(): Promise<void> {
		if (!this.isRematchPermissible())
			return;

		if (this.isActiveGame) {
			const confirmed = await this.confirmRematch();
			if (!confirmed || this.creatingGame)
				return;
		}

		this.creatingGame = true;
		try {
			this.players = [];
			this.isActiveGame = true;

			await this.requestNewGame();

			const rematchUsers = this.getLastPlayedUsers();
			for (const user of rematchUsers) {
				await this.addNewPlayer(user);
			}
		}
		catch (error) {
			this.isActiveGame = false;
			this.reportError(error, 'Unable to start the rematch.');
		}
		finally {
			this.creatingGame = false;
		}
	}

	protected debounceBlockThrowUpdates = (() => {
		let timeout: number | undefined;

		return () => {
			if (timeout)
				clearTimeout(timeout);

			timeout = window.setTimeout(() => {
				this.blockThrowUpdates = false;
			}, 100);
		};
	})();

	/** Shift+arrows: move around the grid, ignoring turn order. */
	protected moveFreeFocus(direction: FocusDirection): void {
		this.blockThrowUpdates = true;

		const selectedThrow = this.getSelectedThrow();
		if (!selectedThrow) {
			this.focusDartThrow({ playerIndex: 0, roundIndex: 0, throwIndex: 0 });
		}
		else {
			const nextThrow = getNextThrowFocus(
				this.players,
				this.maximumRounds,
				direction,
				selectedThrow,
				true,
			);

			if (nextThrow)
				this.focusDartThrow(nextThrow);
		}

		this.debounceBlockThrowUpdates();
	}

	protected async requestNewGame(): Promise<string> {
		if (this.gameIdFromLocalStorage) {
			await this.unsubscribeFromAchievementEvents();
		}

		this.pendingDartThrowUpdates.clear();
		const newGameID = await this.gameService.requestNewGame();
		if (newGameID) {
			this.gameIdFromLocalStorage = newGameID;
			this.gameRevisionId = newGameID;
			this.gameRevision = 0;
			this.projectedV2AchievementsByPlayer = {};
			this.lastDartHintsByPlayer = {};
			await this.subscribeToAchievementEvents(newGameID);
		}

		return newGameID;
	}

	/** Tab / Enter / Shift+Tab: move through the throws in turn order. */
	protected moveFocus(direction: 'forward' | 'backward'): void {
		const selectedThrow = this.getSelectedThrow();
		if (!selectedThrow) {
			this.focusDartThrow({ playerIndex: 0, roundIndex: 0, throwIndex: 0 });
			return;
		}

		const nextThrow = getNextThrowFocus(
			this.players,
			this.maximumRounds,
			direction,
			selectedThrow,
		);

		if (nextThrow)
			this.focusDartThrow(nextThrow);
		else if (direction === 'forward')
			this.selectedCellElement?.blur();
	}

	protected getSelectedThrow(): ThrowPosition | undefined {
		return parseThrowElementId(this.selectedId);
	}

	protected async getNewPlayer(players: readonly PlayerRounds[] = this.players): Promise<User | undefined> {
		const filteredUsers = this.users.filter(
			user => !players.some(player => player.playerId === user.id),
		);

		return this.dialogService.open<User>(
			selectUserTemplate(filteredUsers),
			{ title: 'Select User' },
		);
	}

	protected async addNewPlayer(user?: User): Promise<void> {
		if (!this.isActiveGame)
			return;

		user ??= await this.getNewPlayer();

		if (this.gameIdFromLocalStorage && user) {
			const gameTracker = await this.gameService.addPlayerToGame(this.gameIdFromLocalStorage, user.id);
			this.updateGameState(gameTracker);
			this.focusFirstUnplayedRound();
		}
	}

	protected override getShortcutsAction(): () => void {
		return () => void this.openShortcutHelp();
	}

	protected async removeFocusedPlayer(): Promise<void> {
		if (!this.isActiveGame)
			return;

		const selectedThrow = this.getSelectedThrow();
		if (!selectedThrow)
			return;

		const playerId = this.players[selectedThrow.playerIndex]?.playerId;
		if (playerId && this.gameIdFromLocalStorage) {
			const targetFocus = getFocusAfterPlayerRemoval(this.players.length, selectedThrow);

			const gameTracker = await this.gameService.removePlayer(this.gameIdFromLocalStorage, playerId);
			this.updateGameState(gameTracker);

			if (!targetFocus) {
				this.clearSelectedThrow();
				return;
			}

			await this.updateComplete;
			this.focusClosestDartThrow(targetFocus);
		}
	}

	private clearSelectedThrow(): void {
		this.selectedId = undefined;
		this.selectedCellElement = undefined;
		this.requestUpdate();
	}

	private focusClosestDartThrow(position: ThrowPosition): void {
		const closestThrow = clampThrowPosition(this.players, position);
		if (!closestThrow) {
			this.clearSelectedThrow();
			return;
		}

		this.focusDartThrow(closestThrow);
	}

	private async openShortcutHelp(): Promise<void> {
		if (!this.isActiveGame)
			return;

		await this.dialogService.open(
			gameplayShortcutsTemplate(),
			{ title: 'Gameplay Shortcuts' },
		);
	}

	private async confirmNewGame(): Promise<boolean> {
		const confirmed = await this.dialogService.open<boolean>(
			confirmNewGameTemplate(),
			{ title: 'Start a New Game?' },
		);

		return confirmed ?? false;
	}

	protected async createGame(): Promise<void> {
		if (this.creatingGame)
			return;

		this.creatingGame = true;
		try {
			if (this.isActiveGame && !await this.confirmNewGame())
				return;

			// Pick the first player before touching the board, so cancelling keeps the current game.
			const user = await this.getNewPlayer([]);
			if (!user)
				return;

			this.players = [];
			this.isActiveGame = true;

			await this.requestNewGame();
			await this.addNewPlayer(user);
		}
		catch (error) {
			this.isActiveGame = false;
			this.reportError(error, 'Unable to create a new game.');
		}
		finally {
			this.creatingGame = false;
		}
	}

	protected async saveGame(): Promise<void> {
		if (!this.isActiveGame)
			return;

		try {
			if (!this.gameIdFromLocalStorage)
				return;

			const isValidGame = this.validateGameCanBeSubmitted();
			if (!isValidGame) {
				this.notificationService.addNotification({
					type: 'info',
					message: 'Cannot submit game! Play at least one round and select user for all players',
				});
				return;
			}

			const gameResult: GameResult = await this.gameService.submitGame(this.gameIdFromLocalStorage);
			const lastPlayedUserIds = this.players.map(player => player.playerId);

			await this.unsubscribeFromAchievementEvents();
			this.gameService.removeCachedGameId();
			this.pendingDartThrowUpdates.clear();

			this.lastPlayedUserIds = lastPlayedUserIds;
			this.cacheService.setLastPlayedUserIds(lastPlayedUserIds);

			this.gameIdFromLocalStorage = undefined;
			this.gameRevisionId = undefined;
			this.gameRevision = 0;
			this.isActiveGame = false;

			await this.loadUsers({forceRefresh: true, query: {includeSeasonStatistics: true, limitToSeasonId: this.season!.id}});

			this.players = [];
			this.requestUpdate();

			await this.dialogService.open(
				postGameTemplate(gameResult, this.users),
				{ title: 'Game Summary' },
			);
		}
		catch (error) {
			this.reportError(error, 'Unable to save the game.');
		}
	}

	protected override handleDartThrowFocused(event: FocusEvent): void {
		this.selectedId = (event.target as aaDartThrow).id;
		this.selectedCellElement = event.target as aaDartThrow;
		this.requestUpdate();
	}

	protected focusDartThrow(position: ThrowPosition): void {
		const element = this.renderRoot.querySelector<aaDartThrow>(`#${ getThrowElementId(position) }`);
		element?.focus();
	}

	protected focusFirstUnplayedRound(): void {
		this.focusDartThrow(getFirstUnplayedThrow(this.players, this.maximumRounds));
	}

	/** After an overshoot or a failed win condition the turn passes to the next player. */
	protected focusNextValidPlayerAfterRoundFailure(playerIndex: number, roundIndex: number): void {
		const roundStatus = this.players[playerIndex]?.rounds[roundIndex]?.roundStatus;
		if (roundStatus !== RoundStatus.Overshoot
			&& roundStatus !== RoundStatus.WinConditionFailed)
			return;

		const nextTurnStart = getNextTurnStart(this.players, this.maximumRounds, playerIndex, roundIndex);
		if (!nextTurnStart || this.isFocusAlreadyOnTurn(nextTurnStart))
			return;

		this.focusDartThrow(nextTurnStart);
	}

	protected isFocusAlreadyOnTurn(target: ThrowPosition): boolean {
		const selectedThrow = this.getSelectedThrow();

		return selectedThrow?.playerIndex === target.playerIndex
			&& selectedThrow.roundIndex === target.roundIndex;
	}

	protected validateGameCanBeSubmitted(): boolean {
		const allPlayersSelectedUser = this.players
			.every(player => player.playerId !== '');

		const hasPlayedAtLeastOneRound = this.players
			.every(player => player.rounds[0]?.roundStatus !== RoundStatus.Unplayed);

		return allPlayersSelectedUser && hasPlayedAtLeastOneRound;
	}

	protected getLastPlayedUsers(): User[] {
		return this.lastPlayedUserIds
			.map(id => this.users.find(user => user.id === id))
			.filter((user): user is User => user !== undefined);
	}

	protected hasRematchPlayers(): boolean {
		return this.getLastPlayedUsers().length > 0;
	}

	protected override renderEmptyState(): unknown {
		const rematchUsers = this.getLastPlayedUsers();

		return html`
			<div class="empty-state">
				<div class="empty-shortcuts-card">
					<div class="shortcut-section">
						<div class="shortcut-row">
							<span class="shortcut-label">Start a new game</span>
							<span class="shortcut-keys">
								<span class="keycap" aria-label="Shift plus N">⇧ N</span>
							</span>
						</div>
					</div>

					${rematchUsers.length > 0 ? html`
						<div class="shortcut-divider"></div>

						<div class="shortcut-section">
							<div class="shortcut-row">
								<span class="shortcut-label">Rematch last game</span>
								<span class="shortcut-keys">
									<span class="keycap" aria-label="Shift plus R">⇧ R</span>
								</span>
							</div>

							${renderPlayerChips(rematchUsers, 'rematch-player-list')}
						</div>
					` : ''}
				</div>
			</div>
		`;
	}
}
