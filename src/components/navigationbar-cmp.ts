import { html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { sharedStyles } from "../../styles.js";
import { LitElement } from "lit";
import { Season } from "../models/schemas.js";
import { SeasonService } from "../services/seasonService.js";

import { container } from "tsyringe";

@customElement("aa-navigationbar")
export class AaNavigationbar extends LitElement {
	private seasonService!: SeasonService;
	@state() private season?: Season;
	@property({ type: Boolean }) test: boolean;

	override connectedCallback(): void {
		super.connectedCallback();

		this.seasonService = container.resolve(SeasonService);
		this.seasonService.getSeason().then((season) => {
			this.season = season;
		});
	}

	override render() {
		return html`
			<nav class="navbar">
				<a class="logo" href="/">
					<img class="logo-icon" src="icons/season_alpha.png" alt="Logo" />
					<span>Season ${this.season?.name}</span>
				</a>
				<ul class="nav-links">
					<li><a href="/">Home</a></li>
					<li><a href="/about">About</a></li>
					<li><a href="/services">Services</a></li>
					<li><a href="/contact">Contact</a></li>
				</ul>
			</nav>
		`;
	}

	static override styles = [sharedStyles, css`
		:host {
			display: block;
			width: 100%;
			background-color: #ffeef1;
			color: #000;
			border-bottom: 4px solid #000;
			box-shadow: 4px 4px 0 #000;
			font-family: 'Bitter', serif;
		}
	
		.navbar {
			display: flex;
			align-items: center;
			justify-content: space-between;
			padding: 1rem 2rem;
			gap: 1rem;
		}
	
		.logo {
			display: flex;
			align-items: center;
			text-decoration: none;
			color: #000;
			gap: 0.5rem;
		}
	
		.logo-icon {
			width: 64px;
			height: 64px;
			object-fit: contain;
		}
	
		.logo span {
			font-size: 1.5rem;
			font-weight: 700;
		}
	
		.nav-links {
			display: flex;
			gap: 1rem;
		}
	
		.nav-links li {
			list-style: none;
		}
	
		.nav-links a {
			text-decoration: none;
			color: #000;
			background-color: #e5fbe7;
			padding: 0.5rem 1rem;
			border: 2px solid #000;
			border-radius: 8px;
			font-weight: 600;
			box-shadow: 3px 3px 0 #000;
			transition: transform 0.1s ease;
			white-space: nowrap;
		}
	
		.nav-links a:hover {
			transform: translate(-2px, -2px);
			box-shadow: 5px 5px 0 #000;
		}
	`];
}
