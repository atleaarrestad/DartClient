import { css, html, LitElement } from 'lit';
import { customElement } from 'lit/decorators.js';
import { map } from 'lit/directives/map.js';

import { sharedStyles } from '../../styles.js';

type ChangelogEntry = {
	date: string;
	title: string;
	tag: 'bug' | 'feature';
	changes: string[];
};

const changelogEntries: ChangelogEntry[] = [
	{
		date: '2026-03-19',
		title: 'SignalR resilience',
		tag: 'feature',
		changes: [
			'Added feature to restore connections automatically after problems with signalR are solved',
			'Added small GUI hint bottom left during gameplay to indicate connection status',
		],
	},
	{
		date: '2026-03-19',
		title: 'Shortcut menu',
		tag: 'feature',
		changes: [
			'Added new dialog for showing all available shortcuts (shift + H) during gameplay',
		],
	},
	{
		date: '2026-03-19',
		title: 'Autofocus next player',
		tag: 'feature',
		changes: [
			'Added feature to autofocus next valid player if current round was overshoot or winconditionfailed',
		],
	},
	{
		date: '2026-03-19',
		title: 'Achievement notification',
		tag: 'bug',
		changes: [
			'Improved looks of achievement notification to not look like a warning',
			'fixed issue where achievements triggered duplicate notifications',
		],
	},
	{
		date: '2026-03-19',
		title: 'Deep links',
		tag: 'bug',
		changes: [
			'Fixed issue where sharing deep links would not work (sharing season page for example)',
		],
	},
	{
		date: '2026-03-19',
		title: 'Change log',
		tag: 'feature',
		changes: [
			'Added this changelog ayyy',
			'All the updates prior to this are not included in the change log',
		],
	},
];

@customElement('changelog-page')
export class ChangelogPage extends LitElement {

	private isRecentEntry(dateText: string): boolean {
		const addedDate = new Date(`${ dateText }T00:00:00`);
		const msInDay = 1000 * 60 * 60 * 24;
		const ageInDays = (Date.now() - addedDate.getTime()) / msInDay;

		return ageInDays >= 0 && ageInDays < 14;
	}

	override render() {
		return html`
			<section class="changelog-card" aria-labelledby="changelog-title">
				<div class="card-header">
					<div class="card-heading">
						<h1 id="changelog-title">Change log</h1>
					</div>

					<span class="entry-count">${ changelogEntries.length } entries</span>
				</div>

				<div class="log-scroll" role="region" aria-label="Changelog entries">
					<ul class="log-list">
						${ map(changelogEntries, entry => {
							const isRecent = this.isRecentEntry(entry.date);

							return html`
							<li class="log-entry ${ isRecent ? 'log-entry--recent' : '' }">
								<div class="entry-topline">
									<span class="entry-date">${ entry.date }</span>
									<span class="entry-tag entry-tag--${ entry.tag }">${ entry.tag }</span>
									${ isRecent ? html`<span class="entry-new">New</span>` : null }
								</div>

								<h2>${ entry.title }</h2>

								<ul class="change-points">
									${ map(entry.changes, change => html`<li>${ change }</li>`) }
								</ul>
							</li>
						`;
						}) }
					</ul>
				</div>
			</section>
		`;
	}

	static override styles = [
		sharedStyles,
		css`
			:host {
				display: block;
				padding: 3.5rem 1.5rem 1.5rem;
				color: #111;
				font-family: 'Bitter', serif;
			}

			h1,
			h2,
			p {
				margin: 0;
			}

			.changelog-card {
				max-width: 1100px;
				margin: 1rem auto 0;
				min-height: calc(100vh - 220px);
				border: 3px solid #000;
				box-shadow: 6px 6px 0 #000;
				border-radius: 18px;
				background: #fffaf3;
				padding: 0.75rem;
				display: flex;
				flex-direction: column;
			}

			code {
				padding: 0.1rem 0.4rem;
				border: 2px solid #000;
				border-radius: 8px;
				background: #fffefb;
				font-size: 0.95em;
				font-family: inherit;
				font-weight: 700;
			}

			.card-header {
				display: flex;
				flex-wrap: wrap;
				gap: 1rem;
				align-items: center;
				justify-content: space-between;
				margin-bottom: 1rem;
				padding: 0.35rem 0.35rem 0.9rem;
			}

			.card-heading {
				display: grid;
				gap: 0.75rem;
				max-width: 70ch;
			}

			h1 {
				font-size: clamp(2rem, 4vw, 3rem);
			}

			.intro {
				line-height: 1.5;
				font-size: 1rem;
				opacity: 0.72;
				font-weight: 600;
			}

			.log-scroll {
				flex: 1;
				min-height: 0;
				max-height: calc(100vh - 360px);
				overflow-y: auto;
				border: 2px dashed rgba(0, 0, 0, 0.2);
				border-radius: 14px;
				background: rgba(255, 255, 255, 0.55);
				padding-right: 0.5rem;
			}

			.log-scroll::-webkit-scrollbar {
				width: 14px;
			}

			.log-scroll::-webkit-scrollbar-thumb {
				background: #000;
				border-radius: 999px;
				border: 3px solid #fffaf3;
			}

			.log-scroll::-webkit-scrollbar-track {
				background: #fff7ea;
				border-radius: 999px;
				border: 2px solid #000;
			}

			.log-list {
				display: grid;
				gap: 1rem;
				padding: 0.75rem;
				margin: 0;
				list-style: none;
			}

			.log-entry {
				padding: 1rem;
				background: #fffefb;
				border: 2px solid #000;
				border-radius: 16px;
				box-shadow: 4px 4px 0 #000;
			}

			.log-entry--recent {
				background: #fff7ea;
			}

			.entry-topline {
				display: flex;
				flex-wrap: wrap;
				gap: 0.75rem;
				align-items: center;
				margin-bottom: 0.75rem;
			}

			.entry-date,
			.entry-count {
				padding: 0.3rem 0.7rem;
				border: 2px solid #000;
				border-radius: 999px;
				background: #fffefb;
				font-weight: 700;
				box-shadow: 2px 2px 0 #000;
			}

			.entry-tag {
				padding: 0.3rem 0.7rem;
				border: 2px solid #000;
				border-radius: 999px;
				box-shadow: 2px 2px 0 #000;
				font-weight: 700;
				text-transform: uppercase;
			}

			.entry-tag--feature {
				background: #d9e8ff;
			}

			.entry-tag--bug {
				background: #ffd9de;
			}

			.entry-new {
				padding: 0.3rem 0.7rem;
				border: 2px solid #000;
				border-radius: 999px;
				background: #e5fbe7;
				box-shadow: 2px 2px 0 #000;
				font-weight: 700;
				text-transform: uppercase;
			}

			h2 {
				margin-bottom: 0.75rem;
				font-size: 1.25rem;
			}

			.change-points {
				display: grid;
				gap: 0.6rem;
				padding-left: 1.25rem;
				margin: 0;
			}

			.change-points li {
				list-style: square;
				line-height: 1.45;
			}

			@media (max-width: 640px) {
				:host {
					padding: 2.25rem 1rem 1rem;
				}

				.changelog-card,
				.log-entry {
					box-shadow: 4px 4px 0 #000;
				}

				.changelog-card {
					min-height: calc(100vh - 180px);
				}
			}
		`,
	];

}
