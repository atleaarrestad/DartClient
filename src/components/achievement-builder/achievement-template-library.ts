import '../../ui/button/aa-button.js';

import { html, LitElement, nothing, TemplateResult, unsafeCSS } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { getAchievementTierIcon } from '../../helpers/achievementHelper.js';
import type {
	AchievementTemplateResponse,
	AchievementTemplateVersionResponse,
} from '../../models/achievementBuilderApi.js';
import { sharedStyles } from '../../styles/shared-styles.js';
import formStyles from './achievement-builder-form.css?inline';
import { countDefinitionInstances } from './achievement-draft.js';
import libraryStyles from './achievement-template-library.css?inline';

export interface AchievementTemplateOpenDetail {
	templateId: string;
	versionId?: string;
}

export const achievementTemplateOpenEventName = 'achievement-template-open';

type TemplateSortColumn = 'achievement' | 'category' | 'type' | 'generated' | 'version';
type SortDirection = 'ascending' | 'descending';

interface TemplateRow {
	template:       AchievementTemplateResponse;
	version:        AchievementTemplateVersionResponse;
	generatedCount: number;
}

const compareRows: Record<TemplateSortColumn, (left: TemplateRow, right: TemplateRow) => number> = {
	achievement: (left, right) => left.version.nameTemplate.localeCompare(right.version.nameTemplate),
	category:    (left, right) => left.version.categoryName.localeCompare(right.version.categoryName),
	type:        (left, right) => left.version.evaluationPhase.localeCompare(right.version.evaluationPhase),
	generated:   (left, right) => left.generatedCount - right.generatedCount,
	version:     (left, right) => left.version.versionNumber - right.version.versionNumber,
};

@customElement('aa-achievement-template-library')
export class AaAchievementTemplateLibrary extends LitElement {

	@property({ attribute: false }) templates: AchievementTemplateResponse[] = [];
	@property({ type: String }) selectedTemplateId = '';
	@property({ type: String }) selectedVersionId = '';
	@property({ type: Boolean }) dirty = false;

	@state() private filter = '';
	@state() private sortColumn:    TemplateSortColumn = 'achievement';
	@state() private sortDirection: SortDirection = 'ascending';

	private openTemplate(detail: AchievementTemplateOpenDetail): void {
		this.dispatchEvent(new CustomEvent<AchievementTemplateOpenDetail>(
			achievementTemplateOpenEventName,
			{ detail, bubbles: true, composed: true },
		));
	}

	private setSort(column: TemplateSortColumn): void {
		if (this.sortColumn === column) {
			this.sortDirection = this.sortDirection === 'ascending' ? 'descending' : 'ascending';

			return;
		}

		this.sortColumn = column;
		this.sortDirection = 'ascending';
	}

	private get rows(): TemplateRow[] {
		const filter = this.filter.trim().toLocaleLowerCase();
		const direction = this.sortDirection === 'ascending' ? 1 : -1;

		return this.templates
			.flatMap(template => template.versions.map(version => ({
				template,
				version,
				generatedCount: countDefinitionInstances(version.parameters),
			})))
			.filter(({ version }) => !filter || [
				version.nameTemplate,
				version.descriptionTemplate,
				version.categoryName,
				version.evaluationPhase,
				version.status,
			].some(value => value.toLocaleLowerCase().includes(filter)))
			.sort((left, right) =>
				direction * compareRows[this.sortColumn](left, right)
				|| compareRows.achievement(left, right)
				|| right.version.versionNumber - left.version.versionNumber);
	}

	private renderSortHeader(column: TemplateSortColumn, label: string): TemplateResult {
		const active = this.sortColumn === column;

		return html`
			<th aria-sort=${ active ? this.sortDirection : 'none' }>
				<button
					type="button"
					class="template-table__sort"
					@click=${ () => this.setSort(column) }
				>
					${ label }
					<span aria-hidden="true">
						${ active ? this.sortDirection === 'ascending' ? '↑' : '↓' : '↕' }
					</span>
				</button>
			</th>
		`;
	}

	private renderRow({ template, version, generatedCount }: TemplateRow): TemplateResult {
		const selected = template.id === this.selectedTemplateId
			&& version.id === this.selectedVersionId;

		return html`
			<tr class=${ selected ? 'template-table__selected' : '' }>
				<td>
					<div class="template-table__identity">
						<img src=${ getAchievementTierIcon(version.achievementTier) } alt="" />
						<div>
							<strong>${ version.nameTemplate || 'Unnamed achievement' }</strong>
							<span>${ version.descriptionTemplate || 'No description' }</span>
						</div>
					</div>
				</td>
				<td>${ version.categoryName }</td>
				<td>${ version.evaluationPhase === 'Progression' ? 'Progression' : 'Session' }</td>
				<td><strong>${ generatedCount }</strong></td>
				<td>
					<div class="template-table__version">
						<strong>v${ version.versionNumber }</strong>
						<span class="template-table__status template-table__status--${
							version.status.toLocaleLowerCase()
						}">
							${ version.status }
						</span>
					</div>
				</td>
				<td>
					<button
						type="button"
						class="template-table__open"
						@click=${ () => this.openTemplate({ templateId: template.id, versionId: version.id }) }
					>
						${ version.status === 'Draft' ? 'Edit' : 'View' }
					</button>
				</td>
			</tr>
		`;
	}

	override render(): TemplateResult {
		const rows = this.rows;

		return html`
			<section class="template-library" aria-label="Existing achievements">
				<div class="template-library__heading">
					<div>
						<strong>Achievement library</strong>
						<span>Select an existing achievement to view or edit.</span>
					</div>
					<div class="template-library__actions">
						${ this.dirty
							? html`<span class="template-library__dirty">Unsaved changes</span>`
							: nothing }
						<aa-button
							type="button"
							size="small"
							variant="secondary"
							@click=${ () => this.openTemplate({ templateId: '' }) }
						>
							Create new achievement
						</aa-button>
					</div>
				</div>
				<div class="template-library__controls">
					<label>
						<span>Find achievement</span>
						<input
							type="search"
							.value=${ this.filter }
							@input=${ (event: InputEvent) => {
								this.filter = (event.currentTarget as HTMLInputElement).value;
							} }
							placeholder="Search name, category, description..."
						/>
					</label>
					<span class="template-library__result-count">
						${ rows.length } version${ rows.length === 1 ? '' : 's' }
					</span>
				</div>
				${ rows.length > 0
					? html`
						<div class="template-table-wrap">
							<table class="template-table">
								<thead>
									<tr>
										${ this.renderSortHeader('achievement', 'Achievement') }
										${ this.renderSortHeader('category', 'Category') }
										${ this.renderSortHeader('type', 'Type') }
										${ this.renderSortHeader('generated', 'Generates') }
										${ this.renderSortHeader('version', 'Version') }
										<th aria-label="Action"></th>
									</tr>
								</thead>
								<tbody>
									${ rows.map(row => this.renderRow(row)) }
								</tbody>
							</table>
						</div>
					`
					: html`
						<div class="empty-panel">
							No achievement versions match your search.
						</div>
					` }
			</section>
		`;
	}

	static override styles = [
		sharedStyles,
		unsafeCSS(formStyles),
		unsafeCSS(libraryStyles),
	];

}

declare global {
	interface HTMLElementTagNameMap {
		'aa-achievement-template-library': AaAchievementTemplateLibrary;
	}

	interface HTMLElementEventMap {
		[achievementTemplateOpenEventName]: CustomEvent<AchievementTemplateOpenDetail>;
	}
}
