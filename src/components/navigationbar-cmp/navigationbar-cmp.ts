import { html, nothing, TemplateResult, unsafeCSS } from 'lit';
import { LitElement } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { container } from 'tsyringe';

import { faIcons } from '../../faIcons.js';
import { getAbsoluteBase } from '../../getAbsoluteBase.js';
import { Season } from '../../models/schemas.js';
import {
	getPlayStatus,
	PlayStatus,
	playStatusChangedEventName,
	syncStatusLabels,
} from '../../services/playStatus.js';
import {
	SeasonService,
	seasonUpdatedEventName,
} from '../../services/seasonService.js';
import { sharedStyles } from '../../styles/shared-styles.js';
import navigationbarStyles from './navigationbar-cmp.css?inline';


const base = getAbsoluteBase();

const describeSync = (status: PlayStatus): string =>
	status.sync === 'connected' ? 'Live sync on' : `Live sync ${ syncStatusLabels[status.sync].toLowerCase() }`;


@customElement('aa-navigationbar')
export class AaNavigationbar extends LitElement {

	private seasonService:             SeasonService;
	private shortcutResetTimer?:       number;
	private shortcutPrefixActive = false;
	@state() private season?:          Season;
	/** Live sync and shortcuts of the game page being shown, if any. */
	@state() private playStatus?:      PlayStatus = getPlayStatus();

	override connectedCallback(): void {
		super.connectedCallback();

		this.seasonService = container.resolve(SeasonService);
		window.addEventListener(seasonUpdatedEventName, this.handleSeasonUpdated);
		window.addEventListener(playStatusChangedEventName, this.handlePlayStatusChanged);
		window.addEventListener('keydown', this.handleShortcutKeyDown);
		this.playStatus = getPlayStatus();

		void this.initialize();
	}

	override disconnectedCallback(): void {
		window.removeEventListener(seasonUpdatedEventName, this.handleSeasonUpdated);
		window.removeEventListener(playStatusChangedEventName, this.handlePlayStatusChanged);
		window.removeEventListener('keydown', this.handleShortcutKeyDown);
		window.clearTimeout(this.shortcutResetTimer);
		super.disconnectedCallback();
	}

	protected async initialize(): Promise<void> {
		try {
			this.season = await this.seasonService.getCurrentSeason();
		}
		catch (error) {
			// Without a current season the link falls back to the season list.
			console.error('Failed to load the current season', error);
			this.season = undefined;
		}
	}

	private handleSeasonUpdated = (event: Event): void => {
		const updatedSeason = (event as CustomEvent<Season>).detail;
		if (updatedSeason.id === this.season?.id)
			this.season = updatedSeason;
	};

	private handlePlayStatusChanged = (event: Event): void => {
		this.playStatus = (event as CustomEvent<PlayStatus | undefined>).detail;
	};

	/**
	 * A dot on the link of the page showing the game: green while live sync is on, with a word
	 * next to it otherwise. The full reason is in the tooltip.
	 */
	private renderSync(link: PlayStatus['link']): TemplateResult | typeof nothing {
		const status = this.playStatus;
		if (status?.link !== link)
			return nothing;

		const label = syncStatusLabels[status.sync];

		return html`
			<span class="sync sync--${ status.sync }" title=${ `${ describeSync(status) }. ${ status.syncMessage }` }>
				<span class="sync__dot" aria-hidden="true"></span>
				${ status.sync === 'connected' ? nothing : html`<span class="sync__label">${ label }</span>` }
			</span>
		`;
	}

	private renderShortcutsKey(): TemplateResult | typeof nothing {
		const open = this.playStatus?.openShortcuts;
		if (!open)
			return nothing;

		return html`
			<li>
				<button
					type="button"
					class="nav-key"
					title="Gameplay shortcuts (Shift+H)"
					aria-label="Gameplay shortcuts"
					@click=${ open }
				>
					<i class="fa-solid fa-keyboard" aria-hidden="true"></i>
					<kbd class="nav-shortcut" aria-hidden="true">⇧ H</kbd>
				</button>
			</li>
		`;
	}

	private handleShortcutKeyDown = (event: KeyboardEvent): void => {
		if (
			event.repeat
			|| event.altKey
			|| event.ctrlKey
			|| event.metaKey
			|| event.shiftKey
			|| document.querySelector('aa-dialog')
			|| this.isEditableTarget(event)
		) {
			this.resetShortcutPrefix();

			return;
		}

		const key = event.key.toLowerCase();
		if (this.shortcutPrefixActive) {
			this.resetShortcutPrefix();

			const link = this.shadowRoot
				?.querySelector<HTMLAnchorElement>(`a[data-shortcut="${ key }"]`);
			if (!link || (key === 'c' && !this.season))
				return;

			event.preventDefault();
			link.click();

			return;
		}

		if (key !== 'g')
			return;

		event.preventDefault();
		this.shortcutPrefixActive = true;
		this.shortcutResetTimer = window.setTimeout(
			() => this.resetShortcutPrefix(),
			1_200,
		);
	};

	private isEditableTarget(event: KeyboardEvent): boolean {
		const target = event.composedPath()[0];

		return target instanceof HTMLElement
			&& (
				target.matches('input, textarea, select')
				|| target.isContentEditable
			);
	}

	private resetShortcutPrefix(): void {
		this.shortcutPrefixActive = false;
		window.clearTimeout(this.shortcutResetTimer);
		this.shortcutResetTimer = undefined;
	}

	private renderShortcut(key: string): TemplateResult {
		return html`<kbd class="nav-shortcut" aria-hidden="true">G ${ key }</kbd>`;
	}

	override render(): unknown {
		return html`
		<nav class="navbar">
			<ul class="nav-links nav-links--primary" aria-label="Play and current season">
				<li class="nav-item--play">
					<a href=${ base } data-shortcut="p" title="Play (G then P)">
						<i class="fa-solid fa-play" aria-hidden="true"></i>
						<span>Play</span>
						${ this.renderSync('play') }
						${ this.renderShortcut('P') }
					</a>
				</li>
				<li class="nav-item--season">
					<a
						href=${ this.season ? `${ base }season/${ this.season.id }` : `${ base }seasons` }
						data-shortcut="c"
						title="Current season (G then C)"
					>
						<i class="fa-solid fa-trophy" aria-hidden="true"></i>
						<span>${ this.season?.name ?? 'Season' }</span>
						${ this.renderShortcut('C') }
					</a>
				</li>
			</ul>

			<ul class="nav-links" aria-label="Site navigation">
				<li>
					<a href=${ `${ base }users` } data-shortcut="u" title="Users (G then U)">
						Users
						${ this.renderShortcut('U') }
					</a>
				</li>
				<li>
					<a
						href=${ `${ base }sessions` }
						data-shortcut="a"
						title="Active games (G then A)"
					>
						Active games
						${ this.renderSync('sessions') }
						${ this.renderShortcut('A') }
					</a>
				</li>
				<li>
					<a
						href=${ `${ base }changelog` }
						data-shortcut="l"
						title="Change log (G then L)"
					>
						Change log
						${ this.renderShortcut('L') }
					</a>
				</li>
				<li>
					<a href=${ `${ base }seasons` } data-shortcut="s" title="Seasons (G then S)">
						Seasons
						${ this.renderShortcut('S') }
					</a>
				</li>
				${ this.renderShortcutsKey() }
			</ul>
			<span class="visually-hidden" role="status" aria-live="polite">
				${ this.playStatus ? describeSync(this.playStatus) : '' }
			</span>
		</nav>
		`;
	}

	static override styles = [
		sharedStyles,
		faIcons,
		unsafeCSS(navigationbarStyles),
	];

}
