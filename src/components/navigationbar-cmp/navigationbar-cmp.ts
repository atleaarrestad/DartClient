import { html, TemplateResult, unsafeCSS } from 'lit';
import { LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { container } from 'tsyringe';

import { faIcons } from '../../faIcons.js';
import { getAbsoluteBase } from '../../getAbsoluteBase.js';
import { Season } from '../../models/schemas.js';
import {
	SeasonService,
	seasonUpdatedEventName,
} from '../../services/seasonService.js';
import { sharedStyles } from '../../styles/shared-styles.js';
import navigationbarStyles from './navigationbar-cmp.css?inline';


const base = getAbsoluteBase();


@customElement('aa-navigationbar')
export class AaNavigationbar extends LitElement {

	private seasonService:             SeasonService;
	private shortcutResetTimer?:       number;
	private shortcutPrefixActive = false;
	@state() private season?:          Season;
	@property({ type: Boolean }) test: boolean;

	override connectedCallback(): void {
		super.connectedCallback();

		this.seasonService = container.resolve(SeasonService);
		window.addEventListener(seasonUpdatedEventName, this.handleSeasonUpdated);
		window.addEventListener('keydown', this.handleShortcutKeyDown);

		this.initialize();
	}

	override disconnectedCallback(): void {
		window.removeEventListener(seasonUpdatedEventName, this.handleSeasonUpdated);
		window.removeEventListener('keydown', this.handleShortcutKeyDown);
		window.clearTimeout(this.shortcutResetTimer);
		super.disconnectedCallback();
	}

	protected async initialize(): Promise<void> {
		const season = await this.seasonService.getCurrentSeason();
		this.season = season;
	}

	private handleSeasonUpdated = (event: Event): void => {
		const updatedSeason = (event as CustomEvent<Season>).detail;
		if (updatedSeason.id === this.season?.id)
			this.season = updatedSeason;
	};

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
						${ this.renderShortcut('P') }
					</a>
				</li>
				<li class="nav-item--season">
					<a
						href=${ `${ base }season/${ this.season?.id }` }
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
				<li><a href="#" class="disabled">Game-log</a></li>
				<li>
					<a href=${ `${ base }seasons` } data-shortcut="s" title="Seasons (G then S)">
						Seasons
						${ this.renderShortcut('S') }
					</a>
				</li>
			</ul>
		</nav>
		`;
	}

	static override styles = [
		sharedStyles,
		faIcons,
		unsafeCSS(navigationbarStyles),
	];

}
