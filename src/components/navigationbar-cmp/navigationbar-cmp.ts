import { html, unsafeCSS } from 'lit';
import { LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { container } from 'tsyringe';

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
	@state() private season?:          Season;
	@property({ type: Boolean }) test: boolean;

	override connectedCallback(): void {
		super.connectedCallback();

		this.seasonService = container.resolve(SeasonService);
		window.addEventListener(seasonUpdatedEventName, this.handleSeasonUpdated);

		this.initialize();
	}

	override disconnectedCallback(): void {
		window.removeEventListener(seasonUpdatedEventName, this.handleSeasonUpdated);
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

	override render(): unknown {
		return html`
		<nav class="navbar">
			<s-logo-wrapper>
				<a class="logo" href=${ base }>
					<img class="logo-icon" src=${ `${ base }icons/home.png` } alt="Home" />
					<span>Play</span>
				</a>

				<a class="logo center" href=${ `${ base }season/${ this.season?.id }` }>
					<img
						class="logo-icon"
						src=${ `${ base }icons/season_beta.png` }
						alt=${ this.season?.name ?? 'Season' }
					/>
					<span class="fit-content">${ this.season?.name ?? 'Season' }</span>
				</a>
			</s-logo-wrapper>

			<ul class="nav-links">
				<li><a href=${ `${ base }users` }>Users</a></li>
				<li><a href=${ `${ base }sessions` }>Active games</a></li>
				<li><a href=${ `${ base }changelog` }>Change log</a></li>
				<li><a href="#" class="disabled">Game-log</a></li>
				<li><a href=${ `${ base }seasons` }>Seasons</a></li>
			</ul>
		</nav>
		`;
	}

	static override styles = [
		sharedStyles,
		unsafeCSS(navigationbarStyles),
	];

}
