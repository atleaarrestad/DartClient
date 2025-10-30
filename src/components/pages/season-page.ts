import { html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { sharedStyles } from "../../../styles.js";
import { LitElement } from "lit";
import { NotificationService } from "../../services/notificationService.js";
import { DialogService } from "../../services/dialogService.js";
import { container } from "tsyringe";
import { User, SeasonStatistics, Season } from "../../models/schemas.js";
import { getRankDisplayValue, getRankIcon } from "../../models/rank.js";
import { SeasonService } from "../../services/seasonService.js";
import { UserService } from "../../services/userService.js";

@customElement("season-page")
export class SeasonPage extends LitElement {
	private notificationService: NotificationService;
	private dialogService: DialogService;
	private seasonService: SeasonService;
	private userService: UserService;

	@state() private season?: Season;
	@state() private users: User[] = [];

	constructor() {
		super();
		this.userService = container.resolve(UserService);
		this.notificationService = container.resolve(NotificationService);
		this.seasonService = container.resolve(SeasonService);
		this.dialogService = container.resolve(DialogService);
	}

	public override async connectedCallback(): Promise<void> {
		super.connectedCallback();
		this.season = await this.seasonService.getCurrentSeason();
		this.users = await this.userService.getAllUsers();
	}

	private getStatsForCurrentSeason(user: User): SeasonStatistics {
		if (!user.seasonStatistics || user.seasonStatistics.length === 0) {
			return {
				id: 0,
				userId: user.id,
				seasonId: "",
				currentRank: undefined,
				highestAchievedRank: undefined,
				mmr: 0,
			} as unknown as SeasonStatistics;
		}
		if (this.season) {
			const match = user.seasonStatistics.find(
				(s) => s.seasonId === this.season!.id
			);
			if (match) return match;
		}
		return user.seasonStatistics.reduce((prev, curr) =>
			curr.id > prev.id ? curr : prev
		);
	}

	private get podium() {
		const rows = this.users
			.map((u) => {
				const s = this.getStatsForCurrentSeason(u);
				return { user: u, mmr: s?.mmr ?? 0, rank: s?.currentRank };
			})
			.sort((a, b) => (b.mmr ?? 0) - (a.mmr ?? 0))
			.slice(0, 3);

		if (rows.length === 3) return [rows[1], rows[0], rows[2]];
		if (rows.length === 2) return [rows[1], rows[0]];
		return rows;
	}

	private podiumCell(entry?: { user: User; rank: any; mmr: number }) {
		if (!entry) return html``;
		const alias = entry.user.alias ?? entry.user.name;
		const icon = getRankIcon(entry.rank);
		const label = getRankDisplayValue(entry.rank);
		return html`
			<div class="player">
				<div class="alias">${alias}</div>
				<img class="rank-icon" src=${icon} alt=${label} />
				<div class="rank-label">${label}</div>
				<div class="mmr">MMR ${entry.mmr}</div>
			</div>
		`;
	}

	override render() {
		const p = this.podium;

		return html`
			<section class="wrap">
				<!--<h2 class="title">Season Podium</h2>-->

				${p.length === 0
					? html`<div class="empty">No players found for this season.</div>`
					: html`
							<div class="podium">
								<div class="column second">
									${this.podiumCell(p[0])}
									<div class="step step-2"></div>
								</div>
								<div class="column first">
									${this.podiumCell(p[1] ?? p[0])}
									<div class="step step-1"></div>
								</div>
								<div class="column third">
									${this.podiumCell(p[2])}
									<div class="step step-3"></div>
								</div>
							</div>
					  `}
			</section>
		`;
	}

	static override styles = [
		css`
			:host {
				display: block;
			}

			.wrap {
				padding: 1rem;
				text-align: center;
			}

			.title {
				margin-bottom: 2rem;
				font-size: 1.75rem;
				font-weight: 800;
			}

			.podium {
				display: grid;
				grid-template-columns: 1fr 1fr 1fr;
				align-items: end;
				gap: 2rem;
				max-width: 900px;
				margin: 0 auto;
			}

			.column {
				display: flex;
				flex-direction: column;
				align-items: center;
				justify-content: flex-end;
				gap: 1rem;
			}

			/* Podium steps with more height variation */
			.step {
				width: 100%;
				max-width: 220px;
				border-radius: 12px;
				background: #f3f3f3;
				box-shadow: inset 0 4px 6px rgba(0, 0, 0, 0.1);
			}
			.step-1 {
				height: 200px;
				background: #fffbe6;
			}
			.step-2 {
				height: 140px;
				background: #f0f4ff;
			}
			.step-3 {
				height: 110px;
				background: #fff3ec;
			}

			.player {
				display: flex;
				flex-direction: column;
				align-items: center;
				gap: 0.5rem;
			}

			.alias {
				font-weight: 800;
				font-size: 1.25rem;
			}

			.rank-icon {
				width: 128px;
				height: 128px;
				object-fit: contain;
				image-rendering: -webkit-optimize-contrast;
			}

			.rank-label {
				font-size: 1rem;
				font-weight: 600;
				opacity: 0.9;
			}

			.mmr {
				font-size: 0.9rem;
				font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
					"Liberation Mono", "Courier New", monospace;
				color: #444;
				margin-top: 0.25rem;
				opacity: 0.8;
			}

			.empty {
				padding: 1rem;
				color: #666;
				background: #fafafa;
				border-radius: 12px;
			}

			@media (max-width: 700px) {
				.podium {
					grid-template-columns: 1fr;
				}
				.step-1,
				.step-2,
				.step-3 {
					height: 120px;
				}
			}
		`,
	];
}
