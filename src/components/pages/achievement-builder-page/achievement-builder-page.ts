import '../../aa-loading-state/aa-loading-state.js';
import '../../achievement-builder/achievement-builder.js';
import '../../../ui/button/aa-button.js';
import '../../../ui/error-state/aa-error-state.js';

import type { Commands, PreventResult, RouterLocation } from '@vaadin/router';
import { html, LitElement, nothing, TemplateResult, unsafeCSS } from 'lit';
import { customElement, query, state } from 'lit/decorators.js';
import { container } from 'tsyringe';

import { faIcons } from '../../../faIcons.js';
import { getAbsoluteBase } from '../../../getAbsoluteBase.js';
import { compileAchievementTemplate, getEditableVersion } from '../../../helpers/compileAchievementTemplate.js';
import { getErrorMessage } from '../../../helpers/getErrorMessage.js';
import type {
	AchievementCategoryResponse,
	AchievementTemplateResponse,
} from '../../../models/achievementBuilderApi.js';
import { AchievementBuilderService } from '../../../services/achievementBuilderService.js';
import { DialogService } from '../../../services/dialogService.js';
import { NotificationService } from '../../../services/notificationService.js';
import { SeasonService } from '../../../services/seasonService.js';
import { sharedStyles } from '../../../styles/shared-styles.js';
import type {
	AaAchievementBuilder,
	AchievementBuilderStateChangeDetail,
	AchievementTemplateDisabledChangeDetail,
} from '../../achievement-builder/achievement-builder.js';
import {
	type AchievementDraftLimits,
	defaultAchievementDraftLimits,
} from '../../achievement-builder/achievement-draft.js';
import type { AchievementCategoryActions } from '../../achievement-category-manager/achievement-category-manager.js';
import {
	clearStoredManagementKey,
	openManagementUnlockDialog,
	restoreManagementAccess,
} from '../../management-access/management-access.js';
import pageStyles from './achievement-builder-page.css?inline';

type SaveAction = 'draft' | 'publish';

const discardMessage = 'Discard unsaved achievement changes?';

/**
 * The achievement builder for one season, on its own page so it can use the whole window.
 * Owns loading, management access, saving and publishing; the builder owns the draft.
 */
@customElement('achievement-builder-page')
export class AchievementBuilderPage extends LitElement {

	private readonly builderService = container.resolve(AchievementBuilderService);
	private readonly seasonService = container.resolve(SeasonService);
	private readonly dialogService = container.resolve(DialogService);
	private readonly notificationService = container.resolve(NotificationService);

	@state() private seasonId = '';
	@state() private seasonName = '';
	@state() private templates:    AchievementTemplateResponse[] = [];
	@state() private categories:   AchievementCategoryResponse[] = [];
	@state() private limits:       AchievementDraftLimits = defaultAchievementDraftLimits;
	@state() private adminKey = '';
	@state() private loading = true;
	@state() private loadError = '';
	@state() private saving?:      SaveAction;
	@state() private builderState: AchievementBuilderStateChangeDetail = {
		readOnlyReason: undefined,
		templateId:     '',
		versionId:      '',
	};

	@query('aa-achievement-builder') private builder?: AaAchievementBuilder;

	/** The template and version from the URL, opened once the builder exists. */
	private requestedSelection?: { templateId: string; versionId?: string; };

	override connectedCallback(): void {
		super.connectedCallback();
		window.addEventListener('beforeunload', this.handleBeforeUnload);
	}

	override disconnectedCallback(): void {
		window.removeEventListener('beforeunload', this.handleBeforeUnload);
		super.disconnectedCallback();
	}

	onBeforeEnter(location: RouterLocation): void {
		this.seasonId = String(location.params['seasonId'] ?? '');
		const search = new URLSearchParams(location.search);
		const templateId = search.get('template');
		this.requestedSelection = templateId
			? { templateId, versionId: search.get('version') ?? undefined }
			: undefined;
		void this.load();
	}

	onBeforeLeave(_location: RouterLocation, commands: Commands): PreventResult | void {
		if (this.builder?.hasUnsavedChanges && !window.confirm(discardMessage))
			return commands.prevent();
	}

	private readonly handleBeforeUnload = (event: BeforeUnloadEvent): void => {
		if (!this.builder?.hasUnsavedChanges)
			return;

		event.preventDefault();
		event.returnValue = '';
	};

	private get accessGranted(): boolean {
		return !!this.adminKey;
	}

	private async load(): Promise<void> {
		this.loading = true;
		this.loadError = '';
		try {
			this.adminKey = await restoreManagementAccess(key => this.seasonService.verifyManagementAccess(key));
			const [ seasons, templates, catalog, categories ] = await Promise.all([
				this.seasonService.getAll(),
				this.builderService.getTemplates(this.seasonId, this.adminKey || undefined),
				this.builderService.getCatalog(),
				this.builderService.getCategories(this.seasonId),
			]);
			const season = seasons.find(item => item.id === this.seasonId);
			if (!season)
				throw new Error('This season does not exist.');

			this.seasonName = season.name;
			this.templates = templates;
			this.limits = catalog.limits;
			this.categories = categories;
		}
		catch (error) {
			this.loadError = getErrorMessage(error, 'Unable to load the achievement builder.');
		}
		finally {
			this.loading = false;
		}

		await this.updateComplete;
		const selection = this.requestedSelection;
		this.requestedSelection = undefined;
		if (selection && this.builder && !this.builder.openTemplate(selection.templateId, selection.versionId))
			this.notify('info', 'The achievement in the link no longer exists.');
		// Without the code nothing can be created, so show an existing achievement instead.
		else if (!selection && !this.accessGranted && this.templates[0])
			this.builder?.openTemplate(this.templates[0].id);
	}

	private notify(type: 'success' | 'info' | 'danger', message: string): void {
		this.notificationService.addNotification({ type, message });
	}

	private async unlock(): Promise<void> {
		const key = await openManagementUnlockDialog({
			dialogService: this.dialogService,
			verify:        key => this.seasonService.verifyManagementAccess(key),
			description:   'Enter the management code to create, edit and publish achievements.',
			submitLabel:   'Unlock editing',
			initialKey:    this.adminKey,
		}).catch((error: unknown) => {
			this.notify('danger', getErrorMessage(error, 'Unable to open the unlock dialog.'));

			return undefined;
		});
		if (!key)
			return;

		this.adminKey = key;
		// Drafts are only listed for managers, so reload the templates with the code.
		try {
			const templates = await this.builderService.getTemplates(this.seasonId, key);
			this.builder?.setTemplates(templates, this.builderState.templateId || undefined);
			this.templates = templates;
		}
		catch (error) {
			this.notify('danger', getErrorMessage(error, 'Unable to reload the achievements.'));
		}
	}

	/** Locking discards unsaved changes, since a locked builder can't save them. */
	private lock(): void {
		const builder = this.builder;
		if (builder?.hasUnsavedChanges) {
			if (!window.confirm(discardMessage))
				return;

			const { templateId, versionId } = this.builderState;
			builder.openTemplate(templateId, versionId || undefined);
		}

		clearStoredManagementKey();
		this.adminKey = '';
	}

	private storeTemplate(template: AchievementTemplateResponse): AchievementTemplateResponse[] {
		const templates = this.templates.some(item => item.id === template.id)
			? this.templates.map(item => item.id === template.id ? template : item)
			: [ ...this.templates, template ];
		this.templates = templates;

		return templates;
	}

	/** Saves the draft, validates it on the server and optionally publishes it. */
	private async save(action: SaveAction): Promise<void> {
		const builder = this.builder;
		if (this.saving || !builder || !this.accessGranted)
			return;

		const draft = builder.getValidatedDraft();
		if (!draft)
			return;

		this.saving = action;
		try {
			const request = compileAchievementTemplate(draft);
			const saved = draft.id
				? await this.builderService.updateTemplate(draft.id, request, this.adminKey)
				: await this.builderService.createTemplate(request, this.adminKey);
			builder.setTemplates(this.storeTemplate(saved), saved.id);

			const validation = await this.builderService.validateTemplate(saved.id, this.adminKey);
			if (!validation.isValid) {
				builder.showServerValidationErrors(validation.errors.length > 0
					? validation.errors
					: [ 'Achievement template is invalid.' ]);
				this.notify('info', `Saved ${ draft.nameTemplate } as a draft, but it is not valid yet.`);

				return;
			}

			if (action === 'publish') {
				const published = await this.builderService.publishTemplate(saved.id, this.adminKey);
				builder.setTemplates(this.storeTemplate(published), published.id);
			}

			this.notify('success', action === 'publish'
				? `Published ${ draft.nameTemplate }.`
				: `Saved ${ draft.nameTemplate } as a draft.`);
		}
		catch (error) {
			this.notify('danger', getErrorMessage(error, 'Unable to save the achievement.'));
		}
		finally {
			this.saving = undefined;
		}
	}

	/** Disabling and enabling apply to the saved template at once; the open draft is untouched. */
	private async setTemplateDisabled(event: CustomEvent<AchievementTemplateDisabledChangeDetail>): Promise<void> {
		const { templateId, disabled } = event.detail;
		if (!this.accessGranted)
			return;

		try {
			const template = await this.builderService.setTemplateDisabled(templateId, disabled, this.adminKey);
			this.storeTemplate(template);
			const name = getEditableVersion(template)?.nameTemplate ?? 'the achievement';
			this.notify('success', disabled ? `Disabled ${ name }.` : `Enabled ${ name }.`);
		}
		catch (error) {
			this.notify('danger', getErrorMessage(error, disabled
				? 'Unable to disable the achievement.'
				: 'Unable to enable the achievement.'));
		}
	}

	private get categoryActions(): AchievementCategoryActions | undefined {
		if (!this.accessGranted)
			return undefined;

		const { builderService, seasonId, adminKey } = this;
		const thenReload = async (action: Promise<unknown>): Promise<AchievementCategoryResponse[]> => {
			await action;

			return builderService.getCategories(seasonId);
		};

		return {
			create:  name => thenReload(builderService.createCategory({ seasonId, name }, adminKey)),
			rename:  (categoryId, name) => thenReload(builderService.updateCategory(categoryId, { name }, adminKey)),
			reorder: orderedCategoryIds => thenReload(
				builderService.reorderCategories({ seasonId, orderedCategoryIds }, adminKey),
			),
			archive: categoryId => thenReload(builderService.archiveCategory(categoryId, adminKey)),
			restore: categoryId => thenReload(builderService.restoreCategory(categoryId, adminKey)),
			delete:  categoryId => thenReload(builderService.deleteCategory(categoryId, adminKey)),
		};
	}

	/** Keeps the open achievement in the URL, so a reload or a shared link opens it again. */
	private handleBuilderState(event: CustomEvent<AchievementBuilderStateChangeDetail>): void {
		this.builderState = event.detail;
		const url = new URL(window.location.href);
		const { templateId, versionId } = event.detail;
		if (templateId) {
			url.searchParams.set('template', templateId);
			url.searchParams.set('version', versionId);
		}
		else {
			url.searchParams.delete('template');
			url.searchParams.delete('version');
		}
		if (url.href !== window.location.href)
			window.history.replaceState(window.history.state, '', url);
	}

	private renderAccess(): TemplateResult {
		if (!this.accessGranted) {
			return html`
				<aa-button variant="secondary" size="small" @click=${ () => void this.unlock() }>
					<i class="fa-solid fa-lock" aria-hidden="true"></i>
					Unlock editing
				</aa-button>
			`;
		}

		return html`
			<span class="page-bar__access" title="Editing unlocked for this browser session">
				<i class="fa-solid fa-lock-open" aria-hidden="true"></i>
				Editing unlocked
			</span>
			<aa-button variant="ghost" size="small" @click=${ this.lock }>Lock</aa-button>
		`;
	}

	private renderActions(): TemplateResult | typeof nothing {
		if (!this.accessGranted)
			return nothing;

		const reason = this.builderState.readOnlyReason;
		const disabled = !!this.saving || !!reason;

		return html`
			<div class="page-bar__actions">
				<aa-button
					variant="secondary"
					?disabled=${ disabled }
					?loading=${ this.saving === 'draft' }
					title=${ reason ?? '' }
					@click=${ () => void this.save('draft') }
				>
					Save draft
				</aa-button>
				<aa-button
					variant="primary"
					?disabled=${ disabled }
					?loading=${ this.saving === 'publish' }
					title=${ reason ?? '' }
					@click=${ () => void this.save('publish') }
				>
					Publish
				</aa-button>
			</div>
		`;
	}

	override render(): TemplateResult {
		if (this.loading)
			return html`<aa-loading-state loading label="Loading achievements"></aa-loading-state>`;

		if (this.loadError) {
			return html`
				<div class="page-error">
					<aa-error-state heading="Unable to load achievements" message=${ this.loadError }>
						<i slot="icon" class="fa-solid fa-triangle-exclamation"></i>
						<aa-button slot="actions" variant="primary" @click=${ () => void this.load() }>
							Try again
						</aa-button>
					</aa-error-state>
				</div>
			`;
		}

		return html`
			<div class="page">
				<header class="page-bar">
					<a class="page-bar__back" href=${ `${ getAbsoluteBase() }seasons` }>
						<i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
						Seasons
					</a>
					<h1 class="page-bar__title">
						Achievements
						<span>${ this.seasonName }</span>
					</h1>
					<div class="page-bar__access-group">${ this.renderAccess() }</div>
					${ this.renderActions() }
				</header>
				<aa-achievement-builder
					class="page-builder"
					seasonId=${ this.seasonId }
					.categories=${ this.categories }
					.templates=${ this.templates }
					.categoryActions=${ this.categoryActions }
					.limits=${ this.limits }
					?locked=${ !this.accessGranted }
					@achievement-builder-state-change=${ this.handleBuilderState }
					@achievement-template-disabled-change=${ (event: CustomEvent<AchievementTemplateDisabledChangeDetail>) =>
						void this.setTemplateDisabled(event) }
				></aa-achievement-builder>
			</div>
		`;
	}

	static override styles = [ sharedStyles, faIcons, unsafeCSS(pageStyles) ];

}

declare global {
	interface HTMLElementTagNameMap {
		'achievement-builder-page': AchievementBuilderPage;
	}
}
