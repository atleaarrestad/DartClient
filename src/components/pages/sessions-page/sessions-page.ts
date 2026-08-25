import '../../aa-loading-state/aa-loading-state.js';
import '../../active-game-card/aa-active-game-card.js';
import '../../../ui/page-header/aa-page-header.js';

import { html, TemplateResult, unsafeCSS } from 'lit';
import { LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { container } from 'tsyringe';

import { getAbsoluteBase } from '../../../getAbsoluteBase.js';
import { GameTracker, User } from '../../../models/schemas.js';
import { ActiveGamesLiveService } from '../../../services/activeGamesLiveService.js';
import { GameService } from '../../../services/gameService.js';
import { NotificationService } from '../../../services/notificationService.js';
import { SeasonService } from '../../../services/seasonService.js';
import { SignalRSubscription } from '../../../services/signalRService.js';
import { UserService } from '../../../services/userService.js';
import { sharedStyles } from '../../../styles/shared-styles.js';
import sessionsPageStyles from './sessions-page.css?inline';

const base = getAbsoluteBase();

@customElement('sessions-page')
export class SessionsPage extends LitElement {

	private notificationService: NotificationService;
	private activeGamesLiveService: ActiveGamesLiveService;
	private gameService:         GameService;
	private seasonService:       SeasonService;
	private userService:         UserService;
	private activeGamesSubscription?: SignalRSubscription;
	private activeGamesRefresh?: Promise<void>;
	private activeGamesRefreshQueued = false;
	private readonly onActiveGamesChanged = () => this.handleActiveGamesChanged();

	@property({ type: Array }) gameTrackers: GameTracker[] = [];
	@property({ type: Array }) users:        User[] = [];
	@state() private loading = true;

	constructor() {
		super();
		this.notificationService = container.resolve(NotificationService);
		this.activeGamesLiveService = container.resolve(ActiveGamesLiveService);
		this.gameService = container.resolve(GameService);
		this.seasonService = container.resolve(SeasonService);
		this.userService = container.resolve(UserService);
	}

	onBeforeEnter(_location: Location): void {}

	override async connectedCallback(): Promise<void> {
		super.connectedCallback();
		await this.loadGames();

		if (this.isConnected)
			await this.subscribeToActiveGames();
	}

	override async disconnectedCallback(): Promise<void> {
		super.disconnectedCallback();

		const subscription = this.activeGamesSubscription;
		this.activeGamesSubscription = undefined;
		await subscription?.dispose();
	}

	private async loadGames(): Promise<void> {
		try {
			this.loading = true;

			const [ result, season ] = await Promise.all([
				this.gameService.getActiveGames(),
				this.seasonService.getCurrentSeason(),
			]);
			const users = await this.userService.getAllUsers({
				query: {
					includeSeasonStatistics: true,
					limitToSeasonId:         season.id,
				},
			});

			this.gameTrackers = result ?? [];
			this.users = users ?? [];
		}
		catch (err) {
			console.error(err);
			this.notificationService.addNotification({ message: "Couldn't load active games", type: 'danger' });
		}
		finally {
			this.loading = false;
		}
	}

	private async subscribeToActiveGames(): Promise<void> {
		const subscription = this.activeGamesLiveService.subscribe(
			this.onActiveGamesChanged,
			() => this.refreshActiveGames(),
		);
		this.activeGamesSubscription = subscription;

		try {
			await subscription.ready;
		}
		catch (error) {
			console.error(error);
			this.notificationService.addNotification({
				message: 'Live active-game updates are unavailable. Retrying automatically...',
				type:    'danger',
			});
		}
	}

	private handleActiveGamesChanged(): void {
		const refreshPromise = this.refreshActiveGames();
		this.notificationService.addNotification({
			message: 'Active games changed. Refreshing...',
			type:    'info',
			promise: refreshPromise,
		});

		void refreshPromise.catch(error => {
			console.error(error);
			this.notificationService.addNotification({
				message: "Couldn't refresh active games",
				type:    'danger',
			});
		});
	}

	private refreshActiveGames(): Promise<void> {
		this.activeGamesRefreshQueued = true;

		if (!this.activeGamesRefresh) {
			this.activeGamesRefresh = this.runActiveGamesRefreshLoop()
				.finally(() => {
					this.activeGamesRefresh = undefined;
				});
		}

		return this.activeGamesRefresh;
	}

	private async runActiveGamesRefreshLoop(): Promise<void> {
		while (this.activeGamesRefreshQueued) {
			this.activeGamesRefreshQueued = false;
			const gameTrackers = await this.gameService.getActiveGames();
			this.gameTrackers = gameTrackers ?? [];
		}
	}

	private handleOnGameSelected(event: CustomEvent<GameTracker>): void {
		const gameTracker = event.detail;
		this.gameService.setCachedGameId(gameTracker.id);
		history.pushState({}, '', `${ base }spectate/${ gameTracker.id }`);
		window.dispatchEvent(new PopStateEvent('popstate'));
	}

	override render(): TemplateResult {
		return html`
			<aa-loading-state
				?loading=${ this.loading }
				label="Finding active games"
			>
				${ this.loading ? null : this.renderContent() }
			</aa-loading-state>
		`;
	}

	private renderContent(): TemplateResult {
		return html`
			<section class="page-shell">
				<aa-page-header centered>
					<span slot="title">Active games</span>
				</aa-page-header>

				${ this.gameTrackers.length > 0
					? html`
						<ul
							class="cards"
							role="list"
							@game-selected=${ this.handleOnGameSelected }
						>
							${ this.gameTrackers.map((tracker, index) => html`
								<li>
									<aa-active-game-card
										.gameTracker=${ tracker }
										.users=${ this.users }
										.matchNumber=${ index + 1 }
									></aa-active-game-card>
								</li>
							`) }
						</ul>
					`
					: null }
			</section>
		`;
	}

	static override styles = [
		sharedStyles,
		unsafeCSS(sessionsPageStyles),
	];

}
