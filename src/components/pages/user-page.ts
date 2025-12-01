import type { RouterLocation } from '@vaadin/router';
import { css, html } from 'lit';
import { LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { container } from 'tsyringe';

import { UserQueryOptions } from '../../api/users.requests.js';
import { getRankDisplayValue, getRankIcon } from '../../models/rank.js';
import { SeasonStatistics, User } from '../../models/schemas.js';
import { Season } from '../../models/schemas.js';
import { SeasonService } from '../../services/seasonService.js';
import { UserService } from '../../services/userService.js';
import { sharedStyles } from '../../styles.js';


@customElement('user-page')
export class UserPage extends LitElement {

	@property({ type: Array }) users: User[] = [];

	@state() private userId!:         string;
	@state() private currentSeason?:  Season;
	@state() private seasons?:        Season[];
	@state() private selectedSeason?: Season;

	private seasonService: SeasonService;
	private userService:   UserService;
	private user?:         User;

	constructor() {
		super();
		this.userService = container.resolve(UserService);
		this.seasonService = container.resolve(SeasonService);
	}

	onBeforeEnter(location: RouterLocation): void {
		this.userId = location.params['id'] as string;
	}

	override async connectedCallback(): Promise<void> {
		super.connectedCallback();
		const options: UserQueryOptions = {
			includeSeasonStatistics: true,
			includeHitCounts:        true,
			includeMatchSnapshots:   true,
			includeFinishCounts:     true,
		};

		this.user = await this.userService.getUserById(this.userId, options) ?? undefined;
		this.currentSeason = await this.seasonService.getCurrentSeason();
		this.seasons = await this.seasonService.getAll();
		this.selectedSeason = this.seasons.find(s => s.id === this.currentSeason!.id) || this.seasons[0];
	}

	private handleSeasonChange(e: Event) {
		const select = e.target as HTMLSelectElement;
		const seasonId = select.value;
		this.selectedSeason = this.seasons?.find(s => s.id === seasonId);
	}

	private editUser(user: User): void {
		// TODO: implement the edit dialog or navigation
		// this.dialogService.open("editUserTemplate", { user });
	}

	private getStatsForSeason(season: Season): SeasonStatistics {
		const defaultStats: SeasonStatistics = {
			id:                         0,
			userId:                     this.user?.id ?? '',
			seasonId:                   season.id,
			currentRank:                0,
			highestAchievedRank:        0,
			mmr:                        0,
			matchSnapshots:             [],
			hitCounts:                  [],
			highestRoundScore:          0,
			highestRoundScoreForVicory: 0,
			finishCount:                [],
		};
		if (!this.user?.seasonStatistics?.length)
			return defaultStats;

		const match = this.user.seasonStatistics.find(ss => ss.seasonId === season.id);

		return match || defaultStats;
	}

	override render(): unknown {
		if (!this.user || !this.seasons?.length || !this.selectedSeason)
			return html`<p>Loading data…</p>`;

		const stats = this.getStatsForSeason(this.selectedSeason);

		return html`
		  <section class="user-header">
			<h2>${ this.user.name } (@${ this.user.alias })</h2>

			<label>
			  Season:
			  <select @change=${ this.handleSeasonChange }>
				${ this.seasons.map(
					s => html`<option
					value=${ s.id }
					?selected=${ s.id === this.selectedSeason!.id }
				  >
					${ s.name }
				  </option>`,
				) }
			  </select>
			</label>

			<div class="cards-container">
			  <aa-info-card
			  		label="Current Rank"
					value=${ getRankDisplayValue(stats.currentRank) }
					imageSrc=${ getRankIcon(stats.currentRank) }
					imageAlt=${ getRankDisplayValue(stats.currentRank) }
					.rank=${ stats.currentRank }
				></aa-info-card>
			  <aa-info-card
			  		label="Highest Rank"
					value=${ getRankDisplayValue(stats.highestAchievedRank) }
					imageSrc=${ getRankIcon(stats.highestAchievedRank) }
					imageAlt=${ getRankDisplayValue(stats.highestAchievedRank) }
					.rank=${ stats.highestAchievedRank }
				></aa-info-card>
			  <aa-info-card label="Highest round score" value=${ stats.highestRoundScore } ></aa-info-card>
			  <aa-info-card label="Highest finishing score" value=${ stats.highestRoundScoreForVicory } ></aa-info-card>
			</div>
		  </section>
		  <div class="charts-container">
			  <aa-match-snapshot-chart .snapshots=${ stats.matchSnapshots }></aa-match-snapshot-chart>
			  <aa-hit-count-chart .hits=${ stats.hitCounts }></aa-hit-count-chart>
			  <aa-finish-count-chart .finishCounts=${ stats.finishCount }></aa-finish-count-chart>
		  </div>

		`;
	}

	static override styles = [
		sharedStyles,
		css`
		.charts-container {
			display: flex;
			gap: 1rem;
			margin-top: 1rem;
			max-height: 40vh;
		}
		.user-header {
			padding: 1rem;
			border-bottom: 1px solid #ccc;
		}
		.user-header label {
			margin-left: 1rem;
			font-size: 0.9rem;
		}
		.user-header select {
			margin-left: 0.5rem;
		}
		.cards-container {
			display: grid;
			grid-template-columns: 1fr 1fr 1fr 1fr;
			gap: 1rem;
			margin-top: 1rem;
		}
		`,
	];

}
