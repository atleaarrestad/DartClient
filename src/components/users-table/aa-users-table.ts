import '../rank-display/aa-rank-display.js';
import '../../ui/data-table/aa-data-table.js';

import { html, LitElement, TemplateResult, unsafeCSS } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import { Rank } from '../../models/rank.js';
import { User } from '../../models/schemas.js';
import { sharedStyles } from '../../styles/shared-styles.js';
import type {
	DataTableColumn,
	DataTableRowActivateEvent,
	DataTableSortEvent,
} from '../../ui/data-table/aa-data-table.js';
import usersTableStyles from './aa-users-table.css?inline';

export type UsersTableSortKey = 'name' | 'alias' | 'mmr' | 'rank';

export interface UsersTableRow {
	user:  User;
	mmr:   number;
	rank?: Rank;
}

export type UsersTableSortRequestEvent = CustomEvent<UsersTableSortKey>;
export type UsersTableUserSelectedEvent = CustomEvent<User>;

export const sortRequestEventName = 'sort-request';
export const userSelectedEventName = 'user-selected';

@customElement('aa-users-table')
export class AaUsersTable extends LitElement {

	@property({ attribute: false }) rows: UsersTableRow[] = [];
	@property({ type: String }) sortKey:  UsersTableSortKey = 'mmr';
	@property({ type: Boolean }) sortAsc = false;

	private readonly columns: DataTableColumn<UsersTableRow>[] = [
		{
			key:    'position',
			label:  '#',
			width:  '60px',
			render: (_row, index) => html`<span class="row-index">${ index + 1 }</span>`,
		},
		{
			key:      'name',
			label:    'Username',
			width:    '30%',
			sortable: true,
			render:   row => html`<strong>${ row.user.name }</strong>`,
		},
		{
			key:      'alias',
			label:    'Alias',
			width:    '22%',
			sortable: true,
			render:   row => html`<span class="muted">@${ row.user.alias }</span>`,
		},
		{
			key:      'mmr',
			label:    'MMR',
			width:    '18%',
			sortable: true,
			align:    'right',
			render:   row => html`<span class="numeric">${ row.mmr }</span>`,
		},
		{
			key:      'rank',
			label:    'Rank',
			width:    '24%',
			sortable: true,
			align:    'center',
			render:   row => html`
				<aa-rank-display
					.rank=${ row.rank }
					empty-text="-"
					compact
				></aa-rank-display>
			`,
		},
	];

	private handleSort(event: DataTableSortEvent): void {
		const key = event.detail as UsersTableSortKey;

		this.dispatchEvent(new CustomEvent<UsersTableSortKey>(sortRequestEventName, {
			bubbles:  true,
			composed: true,
			detail:   key,
		}));
	}

	private handleRowActivate(event: DataTableRowActivateEvent<UsersTableRow>): void {
		this.dispatchEvent(new CustomEvent<User>(userSelectedEventName, {
			bubbles:  true,
			composed: true,
			detail:   event.detail.user,
		}));
	}

	override render(): TemplateResult {
		return html`
			<aa-data-table
				fill
				activatable
				exportparts="table-card"
				label="Users"
				.rows=${ this.rows }
				.columns=${ this.columns }
				.sortKey=${ this.sortKey }
				.sortAsc=${ this.sortAsc }
				.rowLabel=${ (row: UsersTableRow) => `Open ${ row.user.name }'s profile` }
				@data-table-sort=${ this.handleSort }
				@data-table-row-activate=${ this.handleRowActivate }
			>
				<slot name="actions" slot="footer-actions"></slot>
			</aa-data-table>
		`;
	}

	static override styles = [
		sharedStyles,
		unsafeCSS(usersTableStyles),
	];

}

declare global {
	interface HTMLElementTagNameMap {
		'aa-users-table': AaUsersTable;
	}
}
