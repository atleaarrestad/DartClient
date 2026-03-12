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
	private dialogService: DialogService;
	private seasonService: SeasonService;
	private userService: UserService;

	@state() private season?: Season;
	@state() private users: User[] = [];
	@state() private sortKey: SortKey = 'mmr';
	@state() private sortAsc = false;
	@state() private isLoading = true;

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
		this.isLoading = true;

		try {
			this.season = await this.seasonService.getCurrentSeason();
			this.users = await this.userService.getAllUsers({
				forceRefresh: false,
				query: {
					includeSeasonStatistics: true,
					limitToSeasonId: this.season!.id,
				},
			}) ?? [];

			this.sortUsers(this.sortKey, false);
		}
		finally {
			this.isLoading = false;
		}
	}

	private getStatsForCurrentSeason(user: User): SeasonStatistics {
		const match = user.seasonStatistics.find(s => s.seasonId === this.season!.id);
		if (match) {
			return match;
		}

		return {
			id: 0,
			userId: user.id,
			seasonId: '',
			currentRank: undefined,
			highestAchievedRank: undefined,
			mmr: 0,
		} as unknown as SeasonStatistics;
	}

	private sortUsers(key: SortKey, toggleIfSame = true): void {
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
		if (this.sortKey !== key) {
			return '';
		}

		return this.sortAsc ? '▲' : '▼';
	}

	private onRowClick(user: User): void {
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
						.catch((e) => this.notificationService.addNotification({
							type: 'danger',
							message: e.message,
						}));
				},
			}),
			{ title: 'Create new user' },
		);
	}

	private renderHeader() {
		return html`
			<section class="hero-card">
				<div class="hero-row">
					<div class="hero-copy">
						<h2>Players</h2>
						<p>
							${this.season
								? html`Current season: <strong>${this.season.name}</strong>`
								: html`Current season`}
						</p>
					</div>

					<aa-button @click=${() => this.onNewUserButtonClicked()}>
						+ Add User
					</aa-button>
				</div>

				<div class="summary-row">
					<div class="summary-pill">
						<span class="summary-value">${this.users.length}</span>
						<span class="summary-label">Players</span>
					</div>
					<div class="summary-pill">
						<span class="summary-value">${this.sortKey.toUpperCase()}</span>
						<span class="summary-label">Sorted by</span>
					</div>
					<div class="summary-pill">
						<span class="summary-value">${this.sortAsc ? 'ASC' : 'DESC'}</span>
						<span class="summary-label">Order</span>
					</div>
				</div>
			</section>
		`;
	}

	private renderLoading() {
		return html`
			<section class="page-shell">
				<div class="loading-card" role="status" aria-live="polite">
					<div class="loading-title">Loading players…</div>
					<div class="loading-subtitle">Fetching current season and player stats.</div>
				</div>
			</section>
		`;
	}

	private renderEmpty() {
		return html`
			<section class="page-shell">
				${this.renderHeader()}
				<section class="table-card empty-card">
					<h3>No players yet</h3>
					<p>Add the first player to get started.</p>
				</section>
			</section>
		`;
	}

	override render(): unknown {
		if (this.isLoading) {
			return this.renderLoading();
		}

		if (!this.season || this.users.length === 0) {
			return this.renderEmpty();
		}

		return html`
			<section class="page-shell">
				${this.renderHeader()}

				<section class="table-card">
					<div class="table-toolbar">
						<div>
							<h3>Leaderboard</h3>
							<p>Click a player to open their profile. Click a column header to sort.</p>
						</div>
					</div>

					<div class="table-wrap">
						<table class="users-table">
							<thead>
								<tr>
									<th @click=${() => this.sortUsers('name')}>
										<div class="th-content th-left">
											<span>Username</span>
											<span class="sort-indicator">${this.getSortIndicator('name')}</span>
										</div>
									</th>
									<th @click=${() => this.sortUsers('alias')}>
										<div class="th-content th-left">
											<span>Alias</span>
											<span class="sort-indicator">${this.getSortIndicator('alias')}</span>
										</div>
									</th>
									<th @click=${() => this.sortUsers('mmr')}>
										<div class="th-content th-right">
											<span>MMR</span>
											<span class="sort-indicator">${this.getSortIndicator('mmr')}</span>
										</div>
									</th>
									<th @click=${() => this.sortUsers('rank')}>
										<div class="th-content th-center">
											<span>Rank</span>
											<span class="sort-indicator">${this.getSortIndicator('rank')}</span>
										</div>
									</th>
								</tr>
							</thead>

							<tbody>
								${this.users.map((user, index) => {
									const stats = this.getStatsForCurrentSeason(user);
									const rankValue = stats.currentRank;

									return html`
										<tr @click=${() => this.onRowClick(user)}>
											<td>
												<div class="player-cell">
													<div class="player-index">${index + 1}</div>
													<div class="player-name">${user.name}</div>
												</div>
											</td>

											<td class="alias-cell">@${user.alias}</td>

											<td class="mmr-cell">${stats.mmr}</td>

											<td class="rank-cell">
												${rankValue !== undefined
													? html`
														<div class="rank-wrap">
															<img
																class="rank-icon"
																src=${getRankIcon(rankValue)}
																alt=${getRankDisplayValue(rankValue)}
																title=${getRankDisplayValue(rankValue)}
															/>
															<span class="rank-name">${getRankDisplayValue(rankValue)}</span>
														</div>
													`
													: html`<span class="rank-empty">-</span>`}
											</td>
										</tr>
									`;
								})}
							</tbody>
						</table>
					</div>
				</section>
			</section>
		`;
	}

	static override styles = [
		sharedStyles,
		css`
			:host {
				display: block;
			}

			* {
				box-sizing: border-box;
			}

			.page-shell {
				display: grid;
				gap: 1rem;
				padding: 1rem;
			}

			.hero-card,
			.table-card,
			.loading-card {
				background: #fffaf3;
				border: 3px solid #000;
				border-radius: 18px;
				box-shadow: 6px 6px 0 #000;
			}

			.hero-card {
				padding: 1rem;
			}

			.hero-row {
				display: flex;
				align-items: flex-start;
				justify-content: space-between;
				gap: 1rem;
				flex-wrap: wrap;
			}

			.hero-copy h2 {
				margin: 0;
				font-size: 1.9rem;
				line-height: 1;
			}

			.hero-copy p {
				margin: 0.35rem 0 0;
				opacity: 0.72;
				font-weight: 700;
			}

			.summary-row {
				display: flex;
				flex-wrap: wrap;
				gap: 0.65rem;
				margin-top: 0.9rem;
			}

			.summary-pill {
				display: inline-flex;
				align-items: center;
				gap: 0.45rem;
				padding: 0.4rem 0.65rem;
				background: #fffefb;
				border: 2px solid #000;
				border-radius: 999px;
				box-shadow: 2px 2px 0 #000;
				font-weight: 900;
			}

			.summary-value {
				font-size: 0.95rem;
			}

			.summary-label {
				font-size: 0.8rem;
				opacity: 0.7;
				font-weight: 800;
			}

			.table-card {
				padding: 0.75rem;
			}

			.table-toolbar {
				display: flex;
				align-items: flex-start;
				justify-content: space-between;
				gap: 1rem;
				padding: 0.2rem 0.25rem 0.8rem;
			}

			.table-toolbar h3 {
				margin: 0;
				font-size: 1.15rem;
			}

			.table-toolbar p {
				margin: 0.2rem 0 0;
				font-size: 0.9rem;
				opacity: 0.7;
				font-weight: 600;
			}

			.table-wrap {
				overflow: auto;
				border: 2px dashed rgba(0, 0, 0, 0.2);
				border-radius: 14px;
				background: rgba(255, 255, 255, 0.55);
			}

			.users-table {
				width: 100%;
				border-collapse: separate;
				border-spacing: 0;
				min-width: 700px;
				table-layout: fixed;
			}

			.users-table th,
			.users-table td {
				padding: 0.8rem 0.85rem;
				text-align: left;
				border-bottom: 1px solid rgba(0, 0, 0, 0.12);
				vertical-align: middle;
			}

			.users-table th:nth-child(1),
			.users-table td:nth-child(1) {
				width: 32%;
			}

			.users-table th:nth-child(2),
			.users-table td:nth-child(2) {
				width: 24%;
			}

			.users-table th:nth-child(3),
			.users-table td:nth-child(3) {
				width: 18%;
			}

			.users-table th:nth-child(4),
			.users-table td:nth-child(4) {
				width: 26%;
			}

			.users-table thead th {
				position: sticky;
				top: 0;
				background: #fff7ea;
				z-index: 1;
				cursor: pointer;
				user-select: none;
				font-size: 0.84rem;
				text-transform: uppercase;
				letter-spacing: 0.03em;
				font-weight: 900;
			}

			.th-content {
				display: flex;
				align-items: center;
				gap: 0.4rem;
				width: 100%;
			}

			.th-left {
				justify-content: flex-start;
			}

			.th-right {
				justify-content: flex-start;
				text-align: left;
			}

			.th-center {
				justify-content: flex-start;
				text-align: left;
			}

			.sort-indicator {
				min-width: 1rem;
				opacity: 0.75;
				display: inline-block;
				text-align: left;
			}

			.users-table tbody tr {
				cursor: pointer;
				transition: background-color 120ms ease;
			}

			.users-table tbody tr:nth-child(even) {
				background: rgba(0, 0, 0, 0.025);
			}

			.users-table tbody tr:hover {
				background: #eef8ef;
			}

			.player-cell {
				display: flex;
				align-items: center;
				gap: 0.7rem;
				min-width: 0;
			}

			.player-index {
				width: 30px;
				height: 30px;
				display: inline-flex;
				align-items: center;
				justify-content: center;
				border: 2px solid #000;
				border-radius: 999px;
				background: #fff;
				box-shadow: 2px 2px 0 #000;
				font-weight: 900;
				flex: 0 0 auto;
				font-size: 0.85rem;
			}

			.player-name {
				font-weight: 900;
				overflow: hidden;
				text-overflow: ellipsis;
				white-space: nowrap;
			}

			.alias-cell {
				font-weight: 700;
				color: rgba(0, 0, 0, 0.8);
				overflow: hidden;
				text-overflow: ellipsis;
				white-space: nowrap;
			}

			.mmr-cell {
				text-align: right;
				font-weight: 900;
				font-variant-numeric: tabular-nums;
			}

			.rank-cell {
				text-align: center;
			}

			.rank-wrap {
				display: inline-flex;
				align-items: center;
				justify-content: center;
				gap: 0.55rem;
				max-width: 100%;
			}

			.rank-icon {
				height: 34px;
				width: 34px;
				object-fit: contain;
				display: block;
				flex: 0 0 auto;
			}

			.rank-name {
				font-weight: 800;
				white-space: nowrap;
			}

			.rank-empty {
				opacity: 0.6;
				font-weight: 800;
			}

			.loading-card,
			.empty-card {
				padding: 2rem 1rem;
				text-align: center;
			}

			.loading-title,
			.empty-card h3 {
				margin: 0;
				font-size: 1.15rem;
				font-weight: 900;
			}

			.loading-subtitle,
			.empty-card p {
				margin: 0.35rem 0 0;
				opacity: 0.72;
				font-weight: 600;
			}

			@media (max-width: 800px) {
				.page-shell {
					padding: 0.75rem;
				}

				.hero-row {
					align-items: stretch;
				}

				.summary-row {
					margin-top: 0.75rem;
				}

				.users-table {
					min-width: 640px;
				}
			}
		`,
	];
}