import { html, LitElement, nothing, TemplateResult, unsafeCSS } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { faIcons } from '../../faIcons.js';
import { getAchievementTierIcon } from '../../helpers/achievementHelper.js';
import { formatTierLabel, VariantSummary } from '../../helpers/achievementVariantRules.js';
import { getEditableVersion } from '../../helpers/compileAchievementTemplate.js';
import type {
	AchievementCategoryResponse,
	AchievementTemplateResponse,
	AchievementTemplateVersionResponse,
} from '../../models/achievementBuilderApi.js';
import { sharedStyles } from '../../styles/shared-styles.js';
import { countDefinitionInstances, getVersionVariantSummary } from './achievement-draft.js';
import libraryStyles from './achievement-template-library.css?inline';
import { getTierRange } from './variant-rules/variant-rule-edits.js';

export interface AchievementTemplateOpenDetail {
	templateId: string;
	versionId?: string;
}

export const achievementTemplateOpenEventName = 'achievement-template-open';

interface TemplateRow {
	template: AchievementTemplateResponse;
	/** The version the row stands for: the draft, else the latest version. */
	version:  AchievementTemplateVersionResponse;
}

interface TemplateGroup {
	id:   string;
	name: string;
	rows: TemplateRow[];
}

const byVersionNumberDescending = (
	left: AchievementTemplateVersionResponse,
	right: AchievementTemplateVersionResponse,
): number => right.versionNumber - left.versionNumber;

/** Sidebar list of the season's achievement templates, grouped by category. */
/** Versions never change once loaded, so their summaries are worked out once. */
const summaries: WeakMap<AchievementTemplateVersionResponse, VariantSummary | undefined> = new WeakMap();

const getSummary = (version: AchievementTemplateVersionResponse): VariantSummary | undefined => {
	if (!summaries.has(version))
		summaries.set(version, getVersionVariantSummary(version));

	return summaries.get(version);
};

/** The tier icon, or the lowest and highest one when tier rules give the achievements several. */
const renderTiers = (version: AchievementTemplateVersionResponse, summary: VariantSummary | undefined): TemplateResult => {
	const range = summary && getTierRange(summary);
	if (!range || range.lowest === range.highest) {
		const tier = range?.lowest ?? version.achievementTier;

		return html`<img src=${ getAchievementTierIcon(tier) } alt="" />`;
	}

	return html`
		<span class="row__tiers" title=${ `${ formatTierLabel(range.lowest) } to ${ formatTierLabel(range.highest) }` }>
			<img src=${ getAchievementTierIcon(range.lowest) } alt="" />
			<img src=${ getAchievementTierIcon(range.highest) } alt="" />
		</span>
	`;
};

@customElement('aa-achievement-template-library')
export class AaAchievementTemplateLibrary extends LitElement {

	@property({ attribute: false }) templates:  AchievementTemplateResponse[] = [];
	@property({ attribute: false }) categories: AchievementCategoryResponse[] = [];
	@property({ type: String }) selectedTemplateId = '';
	@property({ type: String }) selectedVersionId = '';
	/** The open achievement has unsaved changes. */
	@property({ type: Boolean }) dirty = false;
	/** Name of the unsaved new achievement, shown while no saved template is selected. */
	@property({ type: String }) newDraftName = '';
	/** Every version opens read-only and no new achievement can be made. */
	@property({ type: Boolean }) readOnly = false;

	@state() private filter = '';

	private openTemplate(detail: AchievementTemplateOpenDetail): void {
		this.dispatchEvent(new CustomEvent<AchievementTemplateOpenDetail>(
			achievementTemplateOpenEventName,
			{ detail, bubbles: true, composed: true },
		));
	}

	private matchesFilter(template: AchievementTemplateResponse, filter: string): boolean {
		return !filter || template.versions.some(version => [
			version.nameTemplate,
			version.descriptionTemplate,
			version.categoryName,
		].some(value => value.toLocaleLowerCase().includes(filter)));
	}

	private get groups(): TemplateGroup[] {
		const filter = this.filter.trim().toLocaleLowerCase();
		const order = new Map(this.categories.map(category => [ category.id, category.sortOrder ]));
		const groups: Map<string, TemplateGroup> = new Map();

		for (const template of this.templates) {
			const version = getEditableVersion(template);
			if (!version || !this.matchesFilter(template, filter))
				continue;

			const group = groups.get(version.categoryId)
				?? { id: version.categoryId, name: version.categoryName, rows: [] };
			group.rows.push({ template, version });
			groups.set(version.categoryId, group);
		}

		const rank = (group: TemplateGroup): number => order.get(group.id) ?? Number.MAX_SAFE_INTEGER;

		return [ ...groups.values() ]
			.sort((left, right) => rank(left) - rank(right) || left.name.localeCompare(right.name))
			.map(group => ({
				...group,
				rows: group.rows.sort((left, right) =>
					left.version.nameTemplate.localeCompare(right.version.nameTemplate)),
			}));
	}

	private renderStatus(template: AchievementTemplateResponse, version: AchievementTemplateVersionResponse): TemplateResult {
		if (template.isDisabled)
			return html`<span class="status status--disabled" title="Disabled: not checked and doesn't count">Disabled</span>`;
		if (template.isBuiltIn)
			return html`<span class="status status--locked" title="Built-in, read-only">Built-in</span>`;
		if (version.status === 'Draft')
			return html`<span class="status status--draft">Draft</span>`;

		return html`<span class="status status--published">v${ version.versionNumber }</span>`;
	}

	private renderVersions(template: AchievementTemplateResponse): TemplateResult | typeof nothing {
		if (template.versions.length < 2)
			return nothing;

		const versions = [ ...template.versions ].sort(byVersionNumberDescending);

		return html`
			<ul class="versions" aria-label="Versions">
				${ versions.map(version => {
					const selected = version.id === this.selectedVersionId;

					return html`
						<li>
							<button
								type="button"
								class="version"
								aria-current=${ selected ? 'true' : 'false' }
								@click=${ () => {
									if (!selected)
										this.openTemplate({ templateId: template.id, versionId: version.id });
								} }
							>
								<span>v${ version.versionNumber }</span>
								<span class="version__status">${ version.status }</span>
							</button>
						</li>
					`;
				}) }
			</ul>
		`;
	}

	private renderRow({ template, version }: TemplateRow): TemplateResult {
		const selected = template.id === this.selectedTemplateId;
		const shownVersion = selected
			? template.versions.find(item => item.id === this.selectedVersionId) ?? version
			: version;
		const summary = getSummary(shownVersion);
		const count = summary?.count ?? countDefinitionInstances(shownVersion.parameters);

		return html`
			<li class="entry ${ selected ? 'entry--selected' : '' } ${ template.isDisabled ? 'entry--disabled' : '' }">
				<button
					type="button"
					class="row"
					aria-current=${ selected ? 'true' : 'false' }
					title=${ shownVersion.descriptionTemplate }
					@click=${ () => {
						if (!selected)
							this.openTemplate({ templateId: template.id });
					} }
				>
					${ renderTiers(shownVersion, summary) }
					<span class="row__name">${ shownVersion.nameTemplate || 'Unnamed achievement' }</span>
					${ count > 1 ? html`<span class="row__count" title="Generated achievements">×${ count }</span>` : nothing }
					${ selected && this.dirty
						? this.renderDirtyMark()
						: this.renderStatus(template, shownVersion) }
				</button>
				${ selected ? this.renderVersions(template) : nothing }
			</li>
		`;
	}

	private renderDirtyMark(): TemplateResult {
		return html`
			<span class="row__dirty" title="Unsaved changes">
				<span class="visually-hidden">Unsaved changes</span>
			</span>
		`;
	}

	private renderNewDraftRow(): TemplateResult | typeof nothing {
		if (this.readOnly || this.selectedTemplateId)
			return nothing;

		return html`
			<ul class="entries entries--new">
				<li class="entry entry--selected">
					<div class="row row--static" aria-current="true">
						<i class="fa-solid fa-pen-to-square" aria-hidden="true"></i>
						<span class="row__name">${ this.newDraftName.trim() || 'New achievement' }</span>
						${ this.dirty
							? this.renderDirtyMark()
							: html`<span class="status status--draft">New</span>` }
					</div>
				</li>
			</ul>
		`;
	}

	override render(): TemplateResult {
		const groups = this.groups;

		return html`
			<nav class="library" aria-label="Achievement library">
				<div class="library__top">
					<input
						type="search"
						aria-label="Search achievements"
						placeholder="Search achievements…"
						.value=${ this.filter }
						@input=${ (event: InputEvent) => {
							this.filter = (event.currentTarget as HTMLInputElement).value;
						} }
					/>
					${ this.readOnly
						? nothing
						: html`
							<button
								type="button"
								class="new-button"
								@click=${ () => this.openTemplate({ templateId: '' }) }
							>
								<i class="fa-solid fa-plus" aria-hidden="true"></i>
								New achievement
							</button>
						` }
				</div>
				<div class="library__list">
					${ this.renderNewDraftRow() }
					${ groups.map(group => html`
						<section class="group" aria-label=${ group.name }>
							<h4>${ group.name }</h4>
							<ul class="entries">
								${ group.rows.map(row => this.renderRow(row)) }
							</ul>
						</section>
					`) }
					${ groups.length === 0
						? html`
							<p class="library__empty">
								${ this.filter.trim()
									? 'No achievements match your search.'
									: 'No achievements yet.' }
							</p>
						`
						: nothing }
				</div>
			</nav>
		`;
	}

	static override styles = [
		sharedStyles,
		faIcons,
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
