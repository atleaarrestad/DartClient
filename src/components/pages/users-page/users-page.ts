import '../../aa-loading-state/aa-loading-state.js';
import '../../users-table/aa-users-table.js';
import '../../../ui/button/aa-button.js';
import '../../../ui/empty-state/aa-empty-state.js';
import '../../../ui/error-state/aa-error-state.js';

import { Router } from '@vaadin/router';
import { html, unsafeCSS } from 'lit';
import { LitElement } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { container } from 'tsyringe';

import { getAbsoluteBase } from '../../../getAbsoluteBase.js';
import { getErrorMessage } from '../../../helpers/getErrorMessage.js';
import { Season, User } from '../../../models/schemas.js';
import { DialogService } from '../../../services/dialogService.js';
import { NotificationService } from '../../../services/notificationService.js';
import { SeasonService } from '../../../services/seasonService.js';
import { UserService } from '../../../services/userService.js';
import { sharedStyles } from '../../../styles/shared-styles.js';
import { newUserTemplate } from '../../../templates/dialogTemplates.js';
import type {
	UsersTableRow,
	UsersTableSortKey,
	UsersTableSortRequestEvent,
	UsersTableUserSelectedEvent,
} from '../../users-table/aa-users-table.js';
import usersPageStyles from './users-page.css?inline';

const base = getAbsoluteBase();

@customElement('users-page')
export class UsersPage extends LitElement {

	private notificationService: NotificationService;
	private dialogService: DialogService;
	private seasonService: SeasonService;
	private userService: UserService;

	@state() private season?: Season;
	@state() private users: User[] = [];
	@state() private sortKey: UsersTableSortKey = 'mmr';
	@state() private sortAsc = false;
	@state() private isLoading = true;
	@state() private loadError?: string;
	private loadRequestId = 0;

	constructor() {
		super();
		this.userService = container.resolve(UserService);
		this.notificationService = container.resolve(NotificationService);
		this.seasonService = container.resolve(SeasonService);
		this.dialogService = container.resolve(DialogService);
	}

	onBeforeEnter(): void {
		void this.initialize();
	}

	override connectedCallback(): void {
		super.connectedCallback();

		// The router loads in onBeforeEnter; this covers the page being used outside a route.
		if (this.loadRequestId === 0)
			void this.initialize();
	}

	protected async initialize(): Promise<void> {
		const requestId = ++this.loadRequestId;
		this.isLoading = true;
		this.loadError = undefined;

		try {
			const season = await this.seasonService.getCurrentSeason();
			const users = await this.userService.getAllUsers({
				forceRefresh: false,
				query: {
					includeSeasonStatistics: true,
					limitToSeasonId: season.id,
				},
			});
			if (requestId !== this.loadRequestId)
				return;

			this.season = season;
			this.users = users ?? [];
			this.sortUsers(this.sortKey, false);
		}
		catch (error) {
			if (requestId !== this.loadRequestId)
				return;

			console.error('Unable to load players.', error);
			this.loadError = getErrorMessage(error, 'Unable to load players.');
		}
		finally {
			if (requestId === this.loadRequestId)
				this.isLoading = false;
		}
	}

	private getDisplayRows(): UsersTableRow[] {
		return this.users.map(user => {
			const stats = user.seasonStatistics.find(candidate => candidate.seasonId === this.season?.id);

			return {
				user,
				mmr:  stats?.mmr ?? 0,
				rank: stats?.currentRank,
			};
		});
	}

	private sortUsers(key: UsersTableSortKey, toggleIfSame = true): void {
		if (this.sortKey === key) {
			if (toggleIfSame) {
				this.sortAsc = !this.sortAsc;
			}
		}
		else {
			this.sortKey = key;
			this.sortAsc = true;
		}

		this.users = this.users
			.map(user => ({
				user,
				stats: user.seasonStatistics.find(candidate => candidate.seasonId === this.season?.id),
			}))
			.sort((a, b) => {
				let cmp = 0;

				switch (key) {
					case 'name':
						cmp = a.user.name.localeCompare(b.user.name);
						break;
					case 'alias':
						cmp = a.user.alias.localeCompare(b.user.alias);
						break;
					case 'mmr':
						cmp = (a.stats?.mmr ?? 0) - (b.stats?.mmr ?? 0);
						break;
					case 'rank':
						cmp = (a.stats?.currentRank ?? 0) - (b.stats?.currentRank ?? 0);
						break;
				}

				return this.sortAsc ? cmp : -cmp;
			})
			.map(ws => ws.user);
	}

	private handleSortRequest(event: UsersTableSortRequestEvent): void {
		this.sortUsers(event.detail);
	}

	private handleUserSelected(event: UsersTableUserSelectedEvent): void {
		const user = event.detail;
		Router.go(`${base}user/${user.id}`);
	}

	private async onNewUserButtonClicked() {
		this.dialogService.open(
			newUserTemplate({
				onSave: (name, alias) => {
					this.userService.addUser(name, alias)
						.then(async () => {
							this.users = await this.userService.getAllUsers({
								forceRefresh: false,
								query: {
									includeSeasonStatistics: true,
									limitToSeasonId: this.season?.id,
								},
							}) ?? [];

							this.sortUsers(this.sortKey, false);
							this.requestUpdate();
						})
						.catch((error: unknown) => this.notificationService.addNotification({
							type: 'danger',
							message: getErrorMessage(error, 'Unable to create the user.'),
						}));
				},
			}),
			{ title: 'Create new user' },
		);
	}

	private renderEmpty() {
		return html`
			<section class="page-shell">
				<aa-empty-state>
					<span slot="title">No players yet</span>
					<span>Add the first player to get started.</span>
					<aa-button
						slot="actions"
						@click=${ () => this.onNewUserButtonClicked() }
					>
						+ Add User
					</aa-button>
				</aa-empty-state>
			</section>
		`;
	}

	override render(): unknown {
		return html`
			<aa-loading-state
				?loading=${this.isLoading}
				label="Loading players"
			>
				${this.isLoading ? null : this.renderContent()}
			</aa-loading-state>
		`;
	}

	private renderContent(): unknown {
		if (this.loadError) {
			return html`
				<section class="page-shell">
					<aa-error-state
						heading="Unable to load players"
						message=${ this.loadError }
					>
						<aa-button
							slot="actions"
							type="button"
							@click=${ () => void this.initialize() }
						>
							Try again
						</aa-button>
					</aa-error-state>
				</section>
			`;
		}

		if (!this.season || this.users.length === 0) {
			return this.renderEmpty();
		}

		return html`
			<section class="page-shell">
				<aa-users-table
					.rows=${ this.getDisplayRows() }
					.sortKey=${ this.sortKey }
					.sortAsc=${ this.sortAsc }
					@sort-request=${ this.handleSortRequest }
					@user-selected=${ this.handleUserSelected }
				>
					<aa-button
						slot="actions"
						@click=${ () => this.onNewUserButtonClicked() }
					>
						+ Add User
					</aa-button>
				</aa-users-table>
			</section>
		`;
	}

	static override styles = [
		sharedStyles,
		unsafeCSS(usersPageStyles),
	];
}
