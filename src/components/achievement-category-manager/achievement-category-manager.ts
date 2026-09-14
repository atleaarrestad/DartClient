import '../../ui/button/aa-button.js';

import { html, LitElement, nothing, PropertyValues, unsafeCSS } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import type { AchievementCategoryResponse } from '../../models/achievementBuilderApi.js';
import { sharedStyles } from '../../styles/shared-styles.js';
import categoryManagerStyles from './achievement-category-manager.css?inline';

export interface AchievementCategoryActions {
	create(name: string): Promise<AchievementCategoryResponse[]>;
	rename(categoryId: string, name: string): Promise<AchievementCategoryResponse[]>;
	reorder(orderedCategoryIds: string[]): Promise<AchievementCategoryResponse[]>;
	archive(categoryId: string): Promise<AchievementCategoryResponse[]>;
	restore(categoryId: string): Promise<AchievementCategoryResponse[]>;
	delete(categoryId: string): Promise<AchievementCategoryResponse[]>;
}

export interface AchievementCategoriesUpdatedDetail {
	categories: AchievementCategoryResponse[];
	selectedCategoryId?: string;
}

export const achievementCategoriesUpdatedEventName = 'achievement-categories-updated';
export const achievementCategoryManagerCloseEventName = 'achievement-category-manager-close';

@customElement('aa-achievement-category-manager')
export class AaAchievementCategoryManager extends LitElement {
	@property({ attribute: false }) categories: AchievementCategoryResponse[] = [];
	@property({ attribute: false }) actions?: AchievementCategoryActions;

	@state() private newCategoryName = '';
	@state() private names: Record<string, string> = {};
	@state() private busyAction = '';
	@state() private error = '';

	protected override willUpdate(changed: PropertyValues<this>): void {
		if (!changed.has('categories'))
			return;

		this.names = Object.fromEntries(
			this.categories.map(category => [ category.id, category.name ]),
		);
	}

	private get activeCategories(): AchievementCategoryResponse[] {
		return this.categories
			.filter(category => !category.isArchived)
			.sort((left, right) => left.sortOrder - right.sortOrder);
	}

	private get archivedCategories(): AchievementCategoryResponse[] {
		return this.categories
			.filter(category => category.isArchived)
			.sort((left, right) => left.name.localeCompare(right.name));
	}

	private async run(
		actionKey: string,
		action: () => Promise<AchievementCategoryResponse[]>,
		selectedCategoryId?: (categories: AchievementCategoryResponse[]) => string | undefined,
	): Promise<void> {
		if (this.busyAction)
			return;

		this.busyAction = actionKey;
		this.error = '';
		try {
			const categories = await action();
			this.dispatchEvent(new CustomEvent<AchievementCategoriesUpdatedDetail>(
				achievementCategoriesUpdatedEventName,
				{
					detail: {
						categories,
						selectedCategoryId: selectedCategoryId?.(categories),
					},
					bubbles: true,
					composed: true,
				},
			));
		}
		catch (error) {
			this.error = error instanceof Error
				? error.message
				: 'Unable to update achievement categories.';
		}
		finally {
			this.busyAction = '';
		}
	}

	private createCategory(): void {
		const name = this.newCategoryName.trim();
		if (!name || !this.actions)
			return;

		void this.run(
			'create',
			() => this.actions!.create(name),
			categories => categories.find(category =>
				category.name.localeCompare(name, undefined, { sensitivity: 'accent' }) === 0)?.id,
		).then(() => {
			if (!this.error)
				this.newCategoryName = '';
		});
	}

	private saveName(category: AchievementCategoryResponse): void {
		const name = this.names[category.id]?.trim() ?? '';
		if (!name || name === category.name || !this.actions)
			return;
		void this.run(`rename:${ category.id }`, () => this.actions!.rename(category.id, name));
	}

	private moveCategory(categoryId: string, offset: -1 | 1): void {
		if (!this.actions)
			return;

		const active = this.activeCategories;
		const index = active.findIndex(category => category.id === categoryId);
		const destination = index + offset;
		if (index < 0 || destination < 0 || destination >= active.length)
			return;

		const reordered = [ ...active ];
		const current = reordered[index]!;
		const target = reordered[destination]!;
		[ reordered[index], reordered[destination] ] = [
			target,
			current,
		];
		void this.run(
			`reorder:${ categoryId }`,
			() => this.actions!.reorder(reordered.map(category => category.id)),
		);
	}

	private archiveCategory(category: AchievementCategoryResponse): void {
		if (
			!this.actions
			|| !window.confirm(`Archive category "${ category.name }"?`)
		)
			return;
		void this.run(
			`archive:${ category.id }`,
			() => this.actions!.archive(category.id),
		);
	}

	private restoreCategory(category: AchievementCategoryResponse): void {
		if (!this.actions)
			return;
		void this.run(
			`restore:${ category.id }`,
			() => this.actions!.restore(category.id),
		);
	}

	private deleteCategory(category: AchievementCategoryResponse): void {
		if (
			!this.actions
			|| category.usageCount > 0
			|| !window.confirm(`Permanently delete category "${ category.name }"?`)
		)
			return;
		void this.run(
			`delete:${ category.id }`,
			() => this.actions!.delete(category.id),
		);
	}

	private renderActiveCategory(
		category: AchievementCategoryResponse,
		index: number,
	): unknown {
		const busy = this.busyAction.endsWith(category.id);
		const categories = this.activeCategories;
		const name = this.names[category.id] ?? category.name;
		return html`
			<div class="category-row">
				<div class="category-row__order">
					<button
						type="button"
						aria-label=${ `Move ${ category.name } up` }
						?disabled=${ !!this.busyAction || index === 0 }
						@click=${ () => this.moveCategory(category.id, -1) }
					>&uarr;</button>
					<button
						type="button"
						aria-label=${ `Move ${ category.name } down` }
						?disabled=${ !!this.busyAction || index === categories.length - 1 }
						@click=${ () => this.moveCategory(category.id, 1) }
					>&darr;</button>
				</div>
				<input
					type="text"
					aria-label=${ `Category name for ${ category.name }` }
					.value=${ name }
					?disabled=${ !!this.busyAction }
					@input=${ (event: InputEvent) => {
						this.names = {
							...this.names,
							[category.id]: (event.currentTarget as HTMLInputElement).value,
						};
					} }
					@keydown=${ (event: KeyboardEvent) => {
						if (event.key === 'Enter')
							this.saveName(category);
					} }
				/>
				<span class="category-row__usage">
					${ category.usageCount } version${ category.usageCount === 1 ? '' : 's' }
				</span>
				<aa-button
					type="button"
					size="small"
					variant="secondary"
					.disabled=${ !!this.busyAction
						|| !name.trim()
						|| name.trim() === category.name }
					.loading=${ busy && this.busyAction.startsWith('rename:') }
					@click=${ () => this.saveName(category) }
				>
					Save
				</aa-button>
				<aa-button
					type="button"
					size="small"
					variant="secondary"
					.disabled=${ !!this.busyAction }
					.loading=${ busy && this.busyAction.startsWith('archive:') }
					@click=${ () => this.archiveCategory(category) }
				>
					Archive
				</aa-button>
			</div>
		`;
	}

	override render(): unknown {
		const active = this.activeCategories;
		const archived = this.archivedCategories;
		return html`
			<section class="category-manager">
				<header>
					<div>
						<h4>Manage categories</h4>
						<p>Categories are shared by this season's achievement templates.</p>
					</div>
					<button
						type="button"
						class="category-manager__close"
						aria-label="Close category manager"
						@click=${ () => this.dispatchEvent(new CustomEvent(
							achievementCategoryManagerCloseEventName,
							{ bubbles: true, composed: true },
						)) }
					>x</button>
				</header>

				<div class="category-manager__create">
					<input
						type="text"
						placeholder="New category name"
						aria-label="New category name"
						.value=${ this.newCategoryName }
						?disabled=${ !!this.busyAction || !this.actions }
						@input=${ (event: InputEvent) => {
							this.newCategoryName = (event.currentTarget as HTMLInputElement).value;
						} }
						@keydown=${ (event: KeyboardEvent) => {
							if (event.key === 'Enter')
								this.createCategory();
						} }
					/>
					<aa-button
						type="button"
						size="small"
						.disabled=${ !!this.busyAction || !this.newCategoryName.trim() || !this.actions }
						.loading=${ this.busyAction === 'create' }
						@click=${ this.createCategory }
					>
						Create category
					</aa-button>
				</div>

				${ this.error
					? html`<p class="category-manager__error">${ this.error }</p>`
					: nothing }

				<div class="category-manager__section">
					<strong>Active</strong>
					${ active.length > 0
						? active.map((category, index) =>
							this.renderActiveCategory(category, index))
						: html`<p class="category-manager__empty">No active categories.</p>` }
				</div>

				${ archived.length > 0
					? html`
						<div class="category-manager__section">
							<strong>Archived</strong>
							${ archived.map(category => html`
								<div class="category-row category-row--archived">
									<span>${ category.name }</span>
									<span class="category-row__usage">
										${ category.usageCount } version${
											category.usageCount === 1 ? '' : 's'
										}
									</span>
									<aa-button
										type="button"
										size="small"
										variant="secondary"
										.disabled=${ !!this.busyAction }
										.loading=${ this.busyAction === `restore:${ category.id }` }
										@click=${ () => this.restoreCategory(category) }
									>
										Restore
									</aa-button>
									<aa-button
										type="button"
										size="small"
										variant="secondary"
										title=${ category.usageCount > 0
											? 'Used categories cannot be deleted.'
											: 'Permanently delete category' }
										.disabled=${ !!this.busyAction || category.usageCount > 0 }
										.loading=${ this.busyAction === `delete:${ category.id }` }
										@click=${ () => this.deleteCategory(category) }
									>
										Delete
									</aa-button>
								</div>
							`) }
						</div>
					`
					: nothing }
			</section>
		`;
	}

	static override styles = [
		sharedStyles,
		unsafeCSS(categoryManagerStyles),
	];
}

declare global {
	interface HTMLElementTagNameMap {
		'aa-achievement-category-manager': AaAchievementCategoryManager;
	}
}
