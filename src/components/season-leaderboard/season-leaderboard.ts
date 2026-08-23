import '../rank-display/aa-rank-display.js';
import '../../ui/data-table/aa-data-table.js';

import { html, LitElement, nothing, TemplateResult, unsafeCSS } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { Rank } from '../../models/rank.js';
import type {
	DataTableColumn,
	DataTableSortEvent,
} from '../../ui/data-table/aa-data-table.js';
import seasonLeaderboardStyles from './season-leaderboard.css?inline';

export interface SeasonLeaderboardRow {
	alias:                  string;
	rank?:                  Rank;
	rankLabel:              string;
	mmr:                    number;
	rimPercent:             string;
	totalAchievements:      string;
	averagePlayersPerMatch: string;
	averageFinishRound:     string;
}

type SeasonLeaderboardSortKey =
	| 'player'
	| 'rank'
	| 'mmr'
	| 'rim'
	| 'achievements'
	| 'average-players'
	| 'average-finish-round';

@customElement('aa-season-leaderboard')
export class SeasonLeaderboard extends LitElement {

	@property({ attribute: false }) rows: SeasonLeaderboardRow[] = [];
	@state() private sortKey: SeasonLeaderboardSortKey = 'mmr';
	@state() private sortAsc = false;

	private readonly columns: DataTableColumn<SeasonLeaderboardRow>[] = [
		{
			key:    'position',
			label:  '#',
			width:  '60px',
			render: (_row, index) => html`<span class="row-index">${ index + 1 }</span>`,
		},
		{
			key:    'player',
			label:  'Player',
			width:  '30%',
			sortable: true,
			render: row => html`
				<span class="identity">
					<aa-rank-display
						.rank=${ row.rank }
						icon-only
						compact
					></aa-rank-display>
					<strong>${ row.alias }</strong>
				</span>
			`,
		},
		{
			key:    'rank',
			label:  'Rank',
			width:  '18%',
			sortable: true,
			render: row => row.rankLabel,
		},
		{
			key:    'mmr',
			label:  'MMR',
			width:  '90px',
			sortable: true,
			render: row => html`<span class="numeric">${ row.mmr }</span>`,
		},
		{
			key:    'rim',
			label:  'Rim%',
			width:  '90px',
			sortable: true,
			render: row => row.rimPercent,
		},
		{
			key:    'achievements',
			label:  'Achievs',
			width:  '100px',
			sortable: true,
			render: row => row.totalAchievements,
		},
		{
			key:    'average-players',
			label:  'Avg players',
			width:  '120px',
			sortable: true,
			render: row => row.averagePlayersPerMatch,
		},
		{
			key:    'average-finish-round',
			label:  'Avg finish rnd',
			width:  '140px',
			sortable: true,
			render: row => row.averageFinishRound,
		},
	];

	private handleSort(event: DataTableSortEvent): void {
		const key = event.detail as SeasonLeaderboardSortKey;

		if (this.sortKey === key)
			this.sortAsc = !this.sortAsc;
		else {
			this.sortKey = key;
			this.sortAsc = key === 'player';
		}
	}

	private parseNumeric(value: string): number {
		const parsed = Number.parseFloat(value.replace('%', ''));

		return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
	}

	private getSortValue(row: SeasonLeaderboardRow): number | string {
		switch (this.sortKey) {
			case 'player': return row.alias;
			case 'rank': return row.rank ?? Number.NEGATIVE_INFINITY;
			case 'mmr': return row.mmr;
			case 'rim': return this.parseNumeric(row.rimPercent);
			case 'achievements': return this.parseNumeric(row.totalAchievements);
			case 'average-players': return this.parseNumeric(row.averagePlayersPerMatch);
			case 'average-finish-round': return this.parseNumeric(row.averageFinishRound);
		}
	}

	private getDisplayRows(): SeasonLeaderboardRow[] {
		return [ ...this.rows ]
			.sort((left, right) => {
				const leftValue = this.getSortValue(left);
				const rightValue = this.getSortValue(right);
				const comparison = typeof leftValue === 'string' && typeof rightValue === 'string'
					? leftValue.localeCompare(rightValue)
					: Number(leftValue) - Number(rightValue);
				const resolvedComparison = comparison || left.alias.localeCompare(right.alias);

				return this.sortAsc ? resolvedComparison : -resolvedComparison;
			})
			.slice(0, 10);
	}

	override render(): TemplateResult | typeof nothing {
		if (!this.rows.length)
			return nothing;

		return html`
			<aa-data-table
				title="Leaderboard top 10"
				label="Season leaderboard top 10"
				.rows=${ this.getDisplayRows() }
				.columns=${ this.columns }
				.sortKey=${ this.sortKey }
				.sortAsc=${ this.sortAsc }
				@data-table-sort=${ this.handleSort }
			></aa-data-table>
		`;
	}

	static override styles = unsafeCSS(seasonLeaderboardStyles);

}

declare global {
	interface HTMLElementTagNameMap {
		'aa-season-leaderboard': SeasonLeaderboard;
	}
}
