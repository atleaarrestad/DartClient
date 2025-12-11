import { Router } from '@vaadin/router';
import { css, html } from 'lit';
import { LitElement } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { container } from 'tsyringe';

import { getAbsoluteBase } from '../../getAbsoluteBase.js';
import { getRankDisplayValue, getRankIcon } from '../../models/rank.js';
import { Season, SeasonStatistics, User } from '../../models/schemas.js';
import { DialogService } from '../../services/dialogService.js';
import { NotificationService } from '../../services/notificationService.js';
import { SeasonService } from '../../services/seasonService.js';
import { UserService } from '../../services/userService.js';
import { sharedStyles } from '../../styles.js';
import { newUserTemplate } from '../../templates/dialogTemplates.js';


const base = getAbsoluteBase();


export type SortKey = 'name' | 'alias' | 'mmr' | 'rank';


@customElement('users-page')
export class UsersPage extends LitElement {

	private notificationService: NotificationService;
	private dialogService:       DialogService;
	private seasonService:       SeasonService;
	private userService:         UserService;

	@state() private season?: Season;
	@state() private users:   User[] = [];
	@state() private sortKey: SortKey = 'mmr';
	@state() private sortAsc: boolean = true;

	constructor() {
		super();
		this.userService = container.resolve(UserService);
		this.notificationService = container.resolve(NotificationService);
		this.seasonService = container.resolve(SeasonService);
		this.dialogService = container.resolve(DialogService);
	}

	override connectedCallback(): void {
		super.connectedCallback();

		this.initialize();
	}

	protected async initialize(): Promise<void> {
		this.users = await this.userService.getAllUsers() ?? [];
		this.season = await this.seasonService.getCurrentSeason();
		this.sortUsers(this.sortKey);
	}

	private getStatsForCurrentSeason(user: User): SeasonStatistics {
		if (!user.seasonStatistics || user.seasonStatistics.length === 0) {
			return {
				id:                  0,
				userId:              user.id,
				seasonId:            '',
				currentRank:         undefined,
				highestAchievedRank: undefined,
				mmr:                 0,
			} as unknown as SeasonStatistics;
		}

		if (this.season) {
			const match = user.seasonStatistics.find(s => s.seasonId === this.season!.id);
			if (match)
				return match;
		}

		return user.seasonStatistics.reduce((prev, curr) => curr.id > prev.id ? curr : prev);
	}

	private sortUsers(key: SortKey): void {
		if (this.sortKey === key) {
			this.sortAsc = !this.sortAsc;
		}
		else {
			this.sortKey = key;
			this.sortAsc = true;
		}

		this.users = this.users
			.map(u => ({ user: u, stats: this.getStatsForCurrentSeason(u) }))
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
					cmp = (a.stats.mmr ?? 0) - (b.stats.mmr ?? 0);
					break;
				case 'rank':
					cmp = (a.stats.currentRank ?? 0) - (b.stats.currentRank ?? 0);
					break;
				}

				return this.sortAsc ? cmp : -cmp;
			})
			.map(ws => ws.user);
	}

	private getSortIndicator(key: SortKey): string {
		if (this.sortKey !== key)
			return '';

		return this.sortAsc ? '▲' : '▼';
	}

	private onRowClick(user: User): void {
		Router.go(`${ base }user/${ user.id }`);
	}

	private onNewUserButtonClicked() {
		this.dialogService.open(
			newUserTemplate({
				onSave: (name, alias) => {
					this.userService.addUser(name, alias)
						.then(() => {
							this.userService.getAllUsers()
								.then((users: User[]) => {
									this.users = users;
									this.requestUpdate();
								});
						})
						.catch((e) => this.notificationService.addNotification(e.message, 'danger'));
				},
			})
			, { title: 'Create new user' },
		);
	}

	override render(): unknown {
		if (!this.season || this.users.length === 0)
			return html`<p>Loading data…</p>`;

		return html`
		<h2>Users</h2>

      <table class="users-table">
        <thead>
          <tr>
            <th @click="${ () => this.sortUsers('name') }">Username ${ this.getSortIndicator('name') }</th>
            <th @click="${ () => this.sortUsers('alias') }">Alias ${ this.getSortIndicator('alias') }</th>
            <th @click="${ () => this.sortUsers('mmr') }">MMR ${ this.getSortIndicator('mmr') }</th>
            <th @click="${ () => this.sortUsers('rank') }">Rank ${ this.getSortIndicator('rank') }</th>
          </tr>
        </thead>
        <tbody>
          ${ this.users.map((user) => {
				const stats = this.getStatsForCurrentSeason(user);
				const rankValue = stats.currentRank;

				return html`
				<tr  @click="${ () => this.onRowClick(user) }">
					<td>${ user.name }</td>
					<td>${ user.alias }</td>
					<td>${ stats.mmr }</td>
					<td>
					${ rankValue !== undefined
							? html`
							<img
								src=${ getRankIcon(rankValue) }
								alt=${ getRankDisplayValue(rankValue) }
								title=${ getRankDisplayValue(rankValue) }
							>
							`
							: html`-` }
					</td>
				</tr>
				`;
			}) }
        </tbody>
      </table>
	  <aa-button @click=${ () => this.onNewUserButtonClicked() }>+ Add User</aa-button>
    `;
	}

	static override styles = [
		sharedStyles,
		css`
      .users-table {
        width: 100%;
        border-collapse: collapse;
      }
      .users-table th,
      .users-table td {
        padding: 0.5rem;
        border: 1px solid var(--border-color, #ccc);
        text-align: left;
        white-space: nowrap;
      }
      .users-table th {
        cursor: pointer;
        user-select: none;
      }
      .users-table tbody tr:nth-child(even) {
        background-color: var(--row-even-bg, #f9f9f9);
      }
      .users-table tbody tr:hover {
        background-color: #e5fbe7;
      }
      .users-table tbody tr {
        cursor: pointer;
		  height: 50px;
      }
      .users-table th:nth-child(4),
      .users-table td:nth-child(4) {
			text-align: center;
      }
		.users-table td:nth-child(4) {
			padding-block: 0px;
			img {
				height: 38px;
			}
		}
    `,
	];

}
