import '../aa-button-cmp.js';

import { customElement } from 'lit/decorators.js';

import { RoundStatus } from '../../models/enums.js';
import type { GameResult, Round, User } from '../../models/schemas.js';
import { postGameTemplate, selectUserTemplate } from '../../templates/dialogTemplates.js';
import type { AaCombobox } from '../aa-combobox-cmp.js';
import type { aaDartThrow } from '../aa-dart-throw-cmp.js';
import { GamePage } from './game-page.js';


interface ElementDetails {
	type:         'throw' | 'nothing';
	playerIndex?: number;
	rowIndex?:    number;
	throwIndex?:  number;
}


@customElement('index-page')
export class IndexPage extends GamePage {

	protected override isReadOnly: boolean = false;

	override connectedCallback(): void {
		super.connectedCallback();

		window.addEventListener('keydown', this.onKeyDown);
	}

	override disconnectedCallback(): void {
		super.disconnectedCallback();

		window.removeEventListener('keydown', this.onKeyDown);
	}

	protected override async handleThrowUpdated(
		updatedThrow: Round['dartThrows'][number],
		playerIndex: number,
		roundNumber: number,
	): Promise<void> {
		if (!this.players[playerIndex])
			return;

		const playerId = this.getUserFromPlayerIndex(playerIndex)?.id;
		try {
			const gameTracker = await this.gameService
				.addDartThrowToGame(this.gameIdFromLocalStorage!, playerId!, roundNumber, updatedThrow);

			this.updateGameState(gameTracker);
		}
		catch (error) { /* */ }
	}

	protected onKeyDown = this.handleKeyDown.bind(this);
	protected handleKeyDown(event: KeyboardEvent): void {
		if (event.repeat)
			return;

		if (event.shiftKey) {
			switch (event.code) {
			case 'Minus':
			case 'NumpadAdd':
				this.addNewPlayer();

				event.preventDefault();
				break;

			case 'Slash':
			case 'NumpadSubtract':
				this.removeLastPlayer();
				event.preventDefault();
				break;

			case 'Tab':
				this.moveFocus('backward');
				event.preventDefault();
				break;

			case 'KeyN':
				this.createGame();
				event.preventDefault();
				break;

			case 'KeyS':
				this.saveGame();
				event.preventDefault();
				break;
			}
		}
		else {
			switch (event.code) {
			case 'Tab':
			case 'Enter':
				this.moveFocus('forward');
				event.preventDefault();
			}
		}
	}

	protected async requestNewGame(): Promise<string> {
		const newGameID = await this.gameService.requestNewGame();
		if (newGameID)
			this.gameIdFromLocalStorage = newGameID;

		return newGameID;
	}

	protected moveFocus(direction: 'forward' | 'backward'): void {
		const selectedElementDetails = this.getSelectedElementDetails();

		if (selectedElementDetails.type === 'nothing') {
			this.focusDartThrow(0, 0, 0);
		}

		else if (selectedElementDetails.type === 'throw') {
			const nextThrow = this.getNextFocusForDartThrow(
				direction,
				selectedElementDetails.playerIndex!,
				selectedElementDetails.rowIndex!,
				selectedElementDetails.throwIndex!,
			);

			if (nextThrow) {
				this.focusDartThrow(
					nextThrow.nextPlayerIndex,
					nextThrow.nextRoundIndex,
					nextThrow.nextThrowIndex,
				);
			}
		}
	}

	protected getSelectedElementDetails(): ElementDetails {
		const result: ElementDetails = {
			type:        'nothing',
			playerIndex: undefined,
			rowIndex:    undefined,
			throwIndex:  undefined,
		};

		if (!this.selectedId)
			return result;


		const idParts = this.selectedId!.split('-');
		result.type = idParts[0]! as 'throw' | 'nothing';

		if (result.type === 'throw') {
			result.throwIndex = parseInt(idParts.pop()!, 10);
			result.rowIndex = parseInt(idParts.pop()!, 10);
			result.playerIndex = parseInt(idParts.pop()!, 10);
		}

		return result;
	};

	protected async addNewPlayer(): Promise<void> {
		if (!this.isActiveGame)
			return;

		const filteredUsers = this.users.filter(
			user => !this.players.some(player => player.playerId === user.id),
		);
		const user = await this.dialogService.open<User>(selectUserTemplate(filteredUsers), { title: 'Select User' });

		if (this.gameIdFromLocalStorage && user) {
			const gameTracker = await this.gameService.addPlayerToGame(this.gameIdFromLocalStorage, user.id);
			this.updateGameState(gameTracker);
		}
	}

	protected async removeLastPlayer(): Promise<void> {
		if (!this.isActiveGame)
			return;

		const playerId = this.players.at(-1)?.playerId;
		if (playerId && this.gameIdFromLocalStorage) {
			const gameTracker = await this.gameService.removePlayer(this.gameIdFromLocalStorage, playerId);
			this.updateGameState(gameTracker);
		}
	}

	protected async createGame(): Promise<void> {
		if (this.creatingGame)
			return;

		this.creatingGame = true;
		try {
			this.players = [];
			await this.requestNewGame();
			await this.addNewPlayer();
		}
		finally {
			this.creatingGame = false;
			this.isActiveGame = true;
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
				this.notificationService.addNotification(
					'Cannot submit game! Play at least one round and select user for all players', 'info',
				);

				return;
			}

			const gameResult: GameResult = await this.dataService.SubmitGame(this.gameIdFromLocalStorage);
			this.gameIdFromLocalStorage = undefined;

			await this.loadUsers(); // make sure this finishes before continuing

			this.players = [];
			this.requestUpdate();
			await this.dialogService.open(postGameTemplate(gameResult, this.users), { title: 'Game Summary' });
		}
		catch (error) {
			const errorMessage = (error as Error).message;
			this.notificationService.addNotification(errorMessage, 'danger');
		}
	}

	protected override handleDartThrowFocused(event: FocusEvent): void {
		this.selectedId = (event.target as aaDartThrow).id;
	}

	protected focusCombobox(index: number): void {
		const element = this.renderRoot.querySelector(`#combobox-${ index }`) as AaCombobox;
		element?.focus();
	}

	protected focusDartThrow(playerIndex: number, rowIndex: number, throwIndex: number): void {
		const element = this.renderRoot.querySelector(`#throw-${ playerIndex }-${ rowIndex }-${ throwIndex }`) as aaDartThrow;
		element?.focus();
	}

	protected getNextFocusablePlayer(currentPlayerIndex: number, direction: 'forward' | 'backward'): number | undefined {
		const playerCount = this.players.length;

		if (playerCount <= 1)
			return undefined;


		const step = direction === 'forward' ? 1 : -1;

		for (let i = 1; i < playerCount; i++) {
			const nextPlayerIndex = (currentPlayerIndex + step * i + playerCount) % playerCount;

			const nextPlayer = this.players[nextPlayerIndex];
			const nextPlayerHasWon = nextPlayer!.rounds.some(round => round.roundStatus === RoundStatus.Victory);
			if (nextPlayerHasWon)
				continue;

			else
				return nextPlayerIndex;
		}

		return undefined;
	}

	protected getNextFocusForDartThrow(
		direction: 'forward' | 'backward',
		playerIndex: number,
		roundIndex: number,
		throwIndex: number,
	): { nextPlayerIndex: number; nextRoundIndex: number; nextThrowIndex: number; } | null {
		if (direction === 'forward') {
			if (throwIndex === 2) {
				const nextFocusablePlayer = this.getNextFocusablePlayer(playerIndex, 'forward');

				// everyone else has won (potentially you also)
				if (nextFocusablePlayer === undefined)
					return { nextPlayerIndex: playerIndex, nextRoundIndex: roundIndex + 1, nextThrowIndex: 0 };

				// Has looped around
				if (nextFocusablePlayer < playerIndex)
					return { nextPlayerIndex: nextFocusablePlayer, nextRoundIndex: roundIndex + 1, nextThrowIndex: 0 };

				else
					return { nextPlayerIndex: nextFocusablePlayer, nextRoundIndex: roundIndex, nextThrowIndex: 0 };
			}
			else {
				return { nextPlayerIndex: playerIndex, nextRoundIndex: roundIndex, nextThrowIndex: throwIndex + 1 };
			}
		}

		if (direction === 'backward') {
			if (playerIndex === 0 && roundIndex === 0 && throwIndex === 0)
				return null;


			if (throwIndex === 0) {
				const prevFocusablePlayer = this.getNextFocusablePlayer(playerIndex, 'backward');

				// everyone else has won (potentially you also)
				if (prevFocusablePlayer === undefined)
					return { nextPlayerIndex: playerIndex, nextRoundIndex: roundIndex - 1, nextThrowIndex: 2 };


				if (roundIndex === 0)
					return { nextPlayerIndex: prevFocusablePlayer, nextRoundIndex: roundIndex, nextThrowIndex: 2 };


				// If we're not in the first round, move to the previous round
				if (prevFocusablePlayer > playerIndex)
					return { nextPlayerIndex: prevFocusablePlayer, nextRoundIndex: roundIndex - 1, nextThrowIndex: 2 };

				else
					return { nextPlayerIndex: prevFocusablePlayer, nextRoundIndex: roundIndex, nextThrowIndex: 2 };
			}
			else {
				return { nextPlayerIndex: playerIndex, nextRoundIndex: roundIndex, nextThrowIndex: throwIndex - 1 };
			}
		}

		return null;
	}

	protected validateGameCanBeSubmitted(): boolean {
		const AllPlayersSelectedUser = this.players
			.every(player => player.playerId !== '');

		const hasPlayedAtLeastOneRound = this.players
			.every(player => player.rounds[0]?.roundStatus !== RoundStatus.Unplayed);

		return (AllPlayersSelectedUser && hasPlayedAtLeastOneRound);
	}

}
