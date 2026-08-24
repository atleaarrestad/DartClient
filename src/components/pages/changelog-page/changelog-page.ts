import { html, LitElement, unsafeCSS } from 'lit';
import { customElement } from 'lit/decorators.js';
import { map } from 'lit/directives/map.js';

import { sharedStyles } from '../../../styles/shared-styles.js';
import changelogPageStyles from './changelog-page.css?inline';

interface ChangelogEntry {
	date: string;
	title: string;
	tag: 'bug' | 'feature' | 'improvement';
	changes: string[];
}

const changelogEntries: ChangelogEntry[] = [
	{
		date: '2026-08-24',
		title: 'Game constraints',
		tag: 'feature',
		changes: [
			'Added configurable maximum game length',
			'Added a final player round limit after every other player finishes',
			'Added many new achievements',
			'Game area now uses the available screen space more generously',
		],
	},
	{
		date: '2026-08-23',
		title: 'Biiiig update',
		tag: 'feature',
		changes: [
			'New design across most pages and dialogs',
			'Season creation and editing with rank, MMR and achievement settings',
			'Better player stats with MMR graphs, heatmaps and achievement progress',
			'More achievements, cleaner categories and a simpler achievement browser',
			'Added caching and ETags',
			'Hopefully the migration does not break production :)',
		],
	},
	{
		date: '2026-03-20',
		title: 'Spectate mode indicator',
		tag: 'improvement',
		changes: [
			'Added indicator bottom left when in spectate mode to make sure the user knows they are currently spectating',
		],
	},
	{
		date: '2026-03-20',
		title: 'SignalR resilience',
		tag: 'improvement',
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
		unsafeCSS(changelogPageStyles),
	];

}
