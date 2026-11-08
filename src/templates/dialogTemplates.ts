import { html, TemplateResult } from 'lit';

import type { AaDialog } from '../components/aa-dialog/aa-dialog.js';
import '../ui/button/aa-button.js';
import { renderAchievementSummary } from '../helpers/achievementHelper.js';
import { getRankDisplayValue } from '../models/rank.js';
import { GameResult, User } from '../models/schemas.js';
import { renderPlayerChips } from './playerChips.js';

/** Closes the dialog that contains the event's current target. */
const closeDialog = (event: Event, result?: unknown): void => {
	(event.currentTarget as HTMLElement).closest<AaDialog>('aa-dialog')?.close(result);
};

interface ShortcutEntry {
	label: string;
	subtext?: string;
	combos: string[][];
}

interface ShortcutSection {
	title: string;
	items: ShortcutEntry[];
}

const gameplayShortcutSections: ShortcutSection[] = [
	{
		title: 'Navigation',
		items: [
			{
				label: 'Open shortcut help',
				subtext: 'Shows this quick reference during a game.',
				combos: [[ 'Shift', 'H' ]],
			},
			{
				label: 'Move to next throw',
				subtext: 'Follows the normal throw order.',
				combos: [[ 'Tab' ], [ 'Enter' ]],
			},
			{
				label: 'Move to previous throw',
				subtext: 'Steps backward through the throw order.',
				combos: [[ 'Shift', 'Tab' ]],
			},
			{
				label: 'Move freely around the grid',
				subtext: 'Ignores turn order and follows the arrow direction.',
				combos: [[ 'Shift', 'Arrow Keys' ]],
			},
		],
	},
	{
		title: 'Players and game actions',
		items: [
			{
				label: 'Add a new player',
				subtext: 'Adds another player to the current game.',
				combos: [[ 'Shift', '+' ]],
			},
			{
				label: 'Delete focused player',
				subtext: 'Removes the player for the currently focused throw.',
				combos: [[ 'Shift', '-' ]],
			},
			{
				label: 'Save and submit the game',
				subtext: 'Submits the current game when it is valid.',
				combos: [[ 'Shift', 'S' ]],
			},
			{
				label: 'Start a fresh game',
				subtext: 'Starts over with a new game session.',
				combos: [[ 'Shift', 'N' ]],
			},
			{
				label: 'Rematch last finished game',
				subtext: 'Re-adds the players from the previous completed game.',
				combos: [[ 'Shift', 'R' ]],
			},
		],
	},
	{
		title: 'Throw editing',
		items: [
			{
				label: 'Increase throw modifier',
				subtext: 'Cycles through miss, rim, single, double, and triple.',
				combos: [[ 'Arrow Up' ]],
			},
			{
				label: 'Decrease throw modifier',
				subtext: 'Cycles back down through the throw modifiers.',
				combos: [[ 'Arrow Down' ]],
			},
		],
	},
];

const renderShortcutCombo = (combo: string[]): TemplateResult => html`
	<span class="shortcut-keys" aria-hidden="true">
		<span class="keycap">
			${combo.map(part => part === 'Shift' ? '⇧' : part).join(
				combo[0] === 'Shift' ? ' ' : ' + ',
			)}
		</span>
	</span>
`;

export const gameplayShortcutsTemplate = (): TemplateResult => {
	return html`
		<div class="shortcut-help-dialog">
			<div class="shortcut-help-grid">
				<div class="empty-shortcuts-card">
					${gameplayShortcutSections.map((section, sectionIndex) => html`
						<div class="shortcut-section">
							<h3 class="shortcut-section-title">${section.title}</h3>

							${section.items.map(item => html`
								<div class="shortcut-row">
									<div class="shortcut-text">
										<span class="shortcut-label">${item.label}</span>
										${item.subtext ? html`<span class="shortcut-subtext">${item.subtext}</span>` : null}
									</div>

									<span class="shortcut-key-group">
										${item.combos.map((combo, comboIndex) => html`
											${comboIndex > 0 ? html`<span class="shortcut-separator">/</span>` : null}
											${renderShortcutCombo(combo)}
										`)}
									</span>
								</div>
							`)}
						</div>

						${sectionIndex < gameplayShortcutSections.length - 1
							? html`<div class="shortcut-divider"></div>`
							: null}
					`)}
				</div>
			</div>
		</div>
	`;
};

const getOrdinal = (n: number): string => {
	const s = [ 'th', 'st', 'nd', 'rd' ],
		v = n % 100;

	return n + (s[(v - 20) % 10] || s[v] || s[0]!);
};

export const selectUserTemplate = (users: User[]): TemplateResult => {
	return html`
		<aa-user-picker
			class="select-user-dialog"
			.users=${ users }
			@user-selected=${ (e: CustomEvent<User>) => closeDialog(e, e.detail) }
		></aa-user-picker>
	`;
};

export const confirmRematchTemplate = (users: readonly User[]): TemplateResult => html`
	<div class="confirm-rematch">
		<div class="rematch-roster">
			<div class="roster-label">Rematch players</div>
			${ renderPlayerChips(users, 'player-list') }
		</div>
	</div>

	<aa-button
		slot="footer-secondary"
		type="button"
		variant="secondary"
		@click=${ (e: Event) => closeDialog(e, false) }
	>
		No, keep game
	</aa-button>
	<aa-button
		slot="footer-primary"
		type="button"
		variant="primary"
		data-autofocus
		@click=${ (e: Event) => closeDialog(e, true) }
	>
		Yes, rematch
	</aa-button>
`;

export const confirmNewGameTemplate = (): TemplateResult => html`
	<p class="confirm-new-game">
		A game is in progress. Starting a new game leaves it unfinished.
	</p>

	<aa-button
		slot="footer-secondary"
		type="button"
		variant="secondary"
		@click=${ (e: Event) => closeDialog(e, false) }
	>
		No, keep game
	</aa-button>
	<aa-button
		slot="footer-primary"
		type="button"
		variant="primary"
		data-autofocus
		@click=${ (e: Event) => closeDialog(e, true) }
	>
		Yes, new game
	</aa-button>
`;

export const newUserTemplate = (options: {
	onSave: (name: string, alias: string) => void;
}): TemplateResult => {
	// The pattern rejects whitespace-only values, which `required` alone accepts.
	const handleSubmit = (e: SubmitEvent) => {
		e.preventDefault();

		const data = new FormData(e.currentTarget as HTMLFormElement);
		const name = String(data.get('name') ?? '').trim();
		const alias = String(data.get('alias') ?? '').trim();
		if (!name || !alias)
			return;

		options.onSave(name, alias);
		closeDialog(e);
	};

	return html`
		<form class="dialog-content" @submit=${ handleSubmit }>
			<label>
				Name:
				<input type="text" name="name" required pattern=".*\\S.*" autofocus />
			</label>

			<label>
				Alias:
				<input type="text" name="alias" required pattern=".*\\S.*" />
			</label>

			<div class="actions">
				<aa-button type="submit" variant="primary">Save</aa-button>
			</div>
		</form>
	`;
};

export const postGameTemplate = (
	gameResult: GameResult,
	users: User[],
): TemplateResult => {
	const sortedPlayerResults = [ ...gameResult.playerResults ].sort((a, b) => {
		if (a.placement === 0 && b.placement !== 0)
			return 1;
		if (b.placement === 0 && a.placement !== 0)
			return -1;

		return a.placement - b.placement;
	});

	return html`
		<div class="postgame">
			<div class="list">
				${sortedPlayerResults.map((pr, index) => {
					const mmrDiff = pr.newMMR - pr.oldMMR;
					const user = users.find(u => u.id === pr.userId);
					const deltaClass = mmrDiff > 0 ? 'up' : mmrDiff < 0 ? 'down' : 'flat';

					return html`
						<div class="player-row">
							<div class="header-row">
								<div class="name-line">
									<span>${user ? user.name : pr.userId}</span>
									<span class="mmr">
										<span class="delta ${deltaClass}">
											${mmrDiff > 0 ? '+' : ''}${mmrDiff}
										</span>
										<span>(${pr.oldMMR} → ${pr.newMMR})</span>
									</span>
								</div>
								<span class="placement">
									${pr.placement === 0 ? 'DNF' : `${getOrdinal(pr.placement)} Place`}
								</span>
							</div>

							<div class="rankline">
								${pr.oldRank !== pr.newRank
									? html`${getRankDisplayValue(pr.oldRank)} → ${getRankDisplayValue(pr.newRank)}`
									: getRankDisplayValue(pr.oldRank)}
							</div>

							<div class="stats">
								<div class="pill"><span class="label">Total</span> ${pr.totalScore}</div>
								<div class="pill"><span class="label">Rounds</span> ${pr.roundsPlayed}</div>
								<div class="pill"><span class="label">Overshoots</span> ${pr.overShoots}</div>
								<div class="pill"><span class="label">Avg</span> ${pr.averageScore}</div>
							</div>

							${renderAchievementSummary(pr)}

							${index < sortedPlayerResults.length - 1
								? html`<div class="divider"></div>`
								: ''}
						</div>
					`;
				})}
			</div>
		</div>
	`;
};

export interface SeasonSpotlightLeaderboardRow {
	position: number;
	alias: string;
	value: string;
}

export const seasonSpotlightDialogTemplate = (options: {
	title: string;
	description?: string;
	valueLabel?: string;
	rows: SeasonSpotlightLeaderboardRow[];
	emptyText?: string;
}): TemplateResult => {
	const rows = options.rows ?? [];
	const valueLabel = options.valueLabel ?? 'Value';

	return html`
		<div class="spotlight-dialog">
			${options.description
				? html`<p class="description">${options.description}</p>`
				: null}

			${rows.length === 0
				? html`<div class="empty">${options.emptyText ?? 'No eligible players found.'}</div>`
				: html`
					<div class="table-wrap">
						<table>
							<thead>
								<tr>
									<th class="col-pos">#</th>
									<th>Name</th>
									<th class="col-value">${valueLabel}</th>
								</tr>
							</thead>
							<tbody>
								${rows.map((row) => html`
									<tr>
										<td class="col-pos">${row.position}</td>
										<td class="col-name">${row.alias}</td>
										<td class="col-value">${row.value}</td>
									</tr>
								`)}
							</tbody>
						</table>
					</div>
				`}
		</div>
	`;
};
