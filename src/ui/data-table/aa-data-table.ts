import { html, LitElement, nothing, TemplateResult, unsafeCSS } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { ifDefined } from 'lit/directives/if-defined.js';

import dataTableStyles from './aa-data-table.css?inline';

export type DataTableColumnAlignment = 'left' | 'center' | 'right';

export interface DataTableColumn<Row = unknown> {
	key:       string;
	label:     string;
	width?:    string;
	sortable?: boolean;
	align?:    DataTableColumnAlignment;
	render:    (row: Row, index: number) => unknown;
}

export type DataTableSortEvent = CustomEvent<string>;
export type DataTableRowActivateEvent<Row = unknown> = CustomEvent<Row>;

export const dataTableSortEventName = 'data-table-sort';
export const dataTableRowActivateEventName = 'data-table-row-activate';

@customElement('aa-data-table')
export class AaDataTable extends LitElement {

	@property({ attribute: false }) rows:      unknown[] = [];
	@property({ attribute: false }) columns:   DataTableColumn[] = [];
	@property({ attribute: false }) rowLabel?: (row: unknown, index: number) => string;
	@property({ type: String }) override title = '';
	@property({ type: String }) label = 'Data table';
	@property({ type: String }) sortKey = '';
	@property({ type: Boolean }) sortAsc = false;
	@property({ type: Boolean, reflect: true }) activatable = false;
	@property({ type: Boolean, reflect: true }) fill = false;

	@state() private hasFooterActions = false;

	private requestSort(key: string): void {
		this.dispatchEvent(new CustomEvent<string>(dataTableSortEventName, {
			bubbles:  true,
			composed: true,
			detail:   key,
		}));
	}

	private activateRow(row: unknown): void {
		if (!this.activatable)
			return;

		this.dispatchEvent(new CustomEvent(dataTableRowActivateEventName, {
			bubbles:  true,
			composed: true,
			detail:   row,
		}));
	}

	private handleRowKeydown(event: KeyboardEvent, row: unknown): void {
		if (!this.activatable || (event.key !== 'Enter' && event.key !== ' '))
			return;

		event.preventDefault();
		this.activateRow(row);
	}

	private getAriaSort(column: DataTableColumn): 'ascending' | 'descending' | 'none' | undefined {
		if (!column.sortable)
			return undefined;
		if (this.sortKey !== column.key)
			return 'none';

		return this.sortAsc ? 'ascending' : 'descending';
	}

	private getSortIndicator(column: DataTableColumn): string {
		if (this.sortKey !== column.key)
			return '';

		return this.sortAsc ? '▲' : '▼';
	}

	private handleFooterSlotChange(event: Event): void {
		const slot = event.currentTarget as HTMLSlotElement;
		this.hasFooterActions = slot.assignedNodes({ flatten: true })
			.some(node => node.nodeType !== Node.TEXT_NODE || Boolean(node.textContent?.trim()));
	}

	override render(): TemplateResult {
		return html`
			<section
				class="table-card ${ this.title ? 'table-card--with-title' : '' }"
				part="table-card"
			>
				${ this.title
					? html`<h3 class="table-title">${ this.title }</h3>`
					: nothing }

				<div class="table-wrap">
					<table aria-label=${ this.label }>
						<colgroup>
							${ this.columns.map(column => html`
								<col style=${ ifDefined(column.width ? `width: ${ column.width }` : undefined) } />
							`) }
						</colgroup>
						<thead>
							<tr>
								${ this.columns.map(column => html`
									<th
										class="cell--${ column.align ?? 'left' }"
										aria-sort=${ ifDefined(this.getAriaSort(column)) }
									>
										${ column.sortable
											? (() => {
												const indicator = this.getSortIndicator(column);

												return html`
													<button
														class="sort-button"
														type="button"
														@click=${ () => this.requestSort(column.key) }
													>
														<span>${ column.label }</span>
														${ indicator
															? html`
																<span class="sort-indicator" aria-hidden="true">
																	${ indicator }
																</span>
															`
															: nothing }
													</button>
												`;
											})()
											: column.label }
									</th>
								`) }
							</tr>
						</thead>
						<tbody>
							${ this.rows.map((row, index) => html`
								<tr
									class=${ this.activatable ? 'activatable' : '' }
									tabindex=${ ifDefined(this.activatable ? 0 : undefined) }
									aria-label=${ ifDefined(this.rowLabel?.(row, index)) }
									@click=${ () => this.activateRow(row) }
									@keydown=${ (event: KeyboardEvent) => this.handleRowKeydown(event, row) }
								>
									${ this.columns.map(column => html`
										<td
											class="cell--${ column.align ?? 'left' }"
											part="cell ${ column.key }-cell"
										>
											${ column.render(row, index) }
										</td>
									`) }
								</tr>
							`) }
						</tbody>
					</table>

					<footer class="table-footer" ?hidden=${ !this.hasFooterActions }>
						<slot
							name="footer-actions"
							@slotchange=${ this.handleFooterSlotChange }
						></slot>
					</footer>
				</div>
			</section>
		`;
	}

	static override styles = unsafeCSS(dataTableStyles);

}

declare global {
	interface HTMLElementTagNameMap {
		'aa-data-table': AaDataTable;
	}

	interface HTMLElementEventMap {
		[dataTableSortEventName]:        DataTableSortEvent;
		[dataTableRowActivateEventName]: DataTableRowActivateEvent;
	}
}
