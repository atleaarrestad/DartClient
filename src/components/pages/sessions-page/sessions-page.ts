import '../../aa-loading-state/aa-loading-state.js';
import '../../active-game-card/aa-active-game-card.js';
import '../../../ui/page-header/aa-page-header.js';

import { html, TemplateResult, unsafeCSS } from 'lit';
import { LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { container } from 'tsyringe';

import { getAbsoluteBase } from '../../../getAbsoluteBase.js';
import { GameTracker, User } from '../../../models/schemas.js';
import { GameService } from '../../../services/gameService.js';
import { NotificationService } from '../../../services/notificationService.js';
import { SeasonService } from '../../../services/seasonService.js';
import { UserService } from '../../../services/userService.js';
import { sharedStyles } from '../../../styles/shared-styles.js';
import sessionsPageStyles from './sessions-page.css?inline';

const base = getAbsoluteBase();

@customElement('sessions-page')
export class SessionsPage extends LitElement {

	private notificationService: NotificationService;
	private gameService:         GameService;
	private seasonService:       SeasonService;
	private userService:         UserService;

	@property({ type: Array }) gameTrackers: GameTracker[] = [];
	@property({ type: Array }) users:        User[] = [];
	@state() private loading = true;

	constructor() {
		super();
		this.notificationService = container.resolve(NotificationService);
		this.gameService = container.resolve(GameService);
		this.seasonService = container.resolve(SeasonService);
		this.userService = container.resolve(UserService);
	}

	onBeforeEnter(_location: Location): void {}

	override async connectedCallback(): Promise<void> {
		super.connectedCallback();
		await this.loadGames();
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
