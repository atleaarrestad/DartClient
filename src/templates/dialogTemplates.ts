import { html, TemplateResult } from 'lit';
import { createRef, ref } from 'lit/directives/ref.js';

import { AaDialog } from '../components/aa-dialog/aa-dialog.js';
import '../ui/button/aa-button.js';
import { defaultMmrConfiguration } from '../models/mmr.js';
import { getRankDisplayValue, getRankIcon, Rank } from '../models/rank.js';
import { AchievementDefinitionsResponse, GameResult, User, RuleDefinition } from '../models/schemas.js';
import { SessionAchievement } from "../models/enums.js";
import { renderAchievementSummary } from "../helpers/achievementHelper.js";

export interface SeasonRuleDialogItem {
	value: number;
	execOrder?: number;
}

interface SeasonRuleDialogTemplateOptions {
	title: string;
	description?: string;
	items: SeasonRuleDialogItem[];
	definitions: RuleDefinition[];
	renderRuleCode: (code: string) => TemplateResult;
}

export const seasonRuleDialogTemplate = ({
	title,
	description,
	items,
	definitions,
	renderRuleCode,
}: SeasonRuleDialogTemplateOptions): TemplateResult => {
	const resolvedRules = items
		.map((item) => ({
			item,
			definition: definitions.find((def) => def.value === item.value),
		}))
		.filter((x): x is { item: SeasonRuleDialogItem; definition: RuleDefinition } => !!x.definition);

	const closeDialog = (e: Event) => {
		const dialog = (e.currentTarget as HTMLElement).closest('aa-dialog') as any;
		dialog?.close();
	};

	return html`
		<div class="rules-dialog">
			${description ? html`<p class="rules-dialog-intro">${description}</p>` : null}

			<div class="rules-dialog-list">
				${resolvedRules.map(
					({ item, definition }) => html`
						<article class="rules-dialog-card">
							<div class="rules-dialog-card-header">
								<div class="rules-dialog-title-row">
									${item.execOrder !== undefined
										? html`<span class="rules-dialog-pill">Order #${item.execOrder}</span>`
										: html`<span class="rules-dialog-pill">Rule</span>`}
									<div class="rules-dialog-title">${definition.name}</div>
								</div>
								<p class="rules-dialog-description">${definition.description}</p>
							</div>

							<div class="rules-dialog-body">
								${renderRuleCode(definition.codeImplementation)}
							</div>
						</article>
					`,
				)}
			</div>

			<div class="rules-dialog-footer">
				<aa-button type="button" variant="secondary" size="small" @click=${closeDialog}>
					Close
				</aa-button>
			</div>
		</div>
	`;
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
		${combo.map((part, index) => html`
			${index > 0 ? html`<span>+</span>` : null}
			<span class="keycap">${part}</span>
		`)}
	</span>
`;

export const gameplayShortcutsTemplate = (): TemplateResult => {
	const closeDialog = (e: Event) => {
		const dialog = (e.currentTarget as HTMLElement).closest('aa-dialog') as any;
		dialog?.close();
	};

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

			<div class="shortcut-help-footer">
				<aa-button type="button" variant="secondary" size="small" @click=${closeDialog}>
					Close
				</aa-button>
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
	const handleUserSelected = (e: CustomEvent, user: User) => {
		const dialog = (e.currentTarget as HTMLElement).closest('aa-dialog') as any;
		dialog?.close(user);
	};

	return html`
		<aa-user-picker
			class="select-user-dialog"
			.users=${ users }
			@user-selected=${ (e: CustomEvent<User>) => handleUserSelected(e, e.detail) }
		></aa-user-picker>
	`;
};

export const confirmRematchTemplate = (users: User[]): TemplateResult => {
	const closeDialog = (result?: boolean) => {
		const dialog = document.querySelector('aa-dialog');
		if (!dialog)
			return;

		dialog.dispatchEvent(new CustomEvent('dialog-closed', {
			detail: { result },
			bubbles: true,
			composed: true,
		}));
	};

	const onKeyDown = (event: KeyboardEvent) => {
		if (event.key === 'Escape') {
			event.preventDefault();
			closeDialog(false);
		}
	};

	return html`
		<div class="confirm-rematch" tabindex="-1" @keydown=${onKeyDown}>
			<div class="confirm-copy">
				<div class="confirm-title">Start rematch?</div>
				<div class="confirm-text">
					You are currently in an active game!
				</div>
			</div>

			<div class="rematch-card">
				<div class="rematch-header">
					<span class="rematch-label">Rematch roster</span>
					<span class="rematch-keys" aria-hidden="true">
						<span class="keycap">Shift</span>
						<span>+</span>
						<span class="keycap">R</span>
					</span>
				</div>

				<div class="roster-label">Players</div>

				<div class="player-list">
					${users.map(user => html`
						<span class="player-pill">${user.alias || user.name}</span>
					`)}
				</div>
			</div>

			<div class="actions">
				<aa-button
					type="button"
					variant="primary"
					data-autofocus
					@click=${() => closeDialog(true)}
				>
					Yes, rematch
				</aa-button>

				<aa-button
					type="button"
					variant="secondary"
					@click=${() => closeDialog(false)}
				>
					No, keep game
				</aa-button>
			</div>
		</div>
	`;
};

export const newUserTemplate = (options: {
	onSave: (name: string, alias: string) => void;
}): TemplateResult => {
	const nameRef = createRef<HTMLInputElement>();
	const aliasRef = createRef<HTMLInputElement>();

	const handleSave = () => {
		const name = nameRef.value?.value.trim() ?? '';
		const alias = aliasRef.value?.value.trim() ?? '';
		options.onSave(name, alias);
		const dialog = document.querySelector('aa-dialog') as AaDialog || undefined;
		dialog?.close();
	};

	return html`
    <div class="dialog-content">
      <label>
        Name:
        <input type="text" ${ ref(nameRef) } autofocus />
      </label>

      <label>
        Alias:
        <input type="text" ${ ref(aliasRef) } />
      </label>

      <div class="actions">
        <aa-button type="button" variant="primary" @click=${ handleSave }>Save</aa-button>
      </div>
    </div>
  `;
};

export const postGameTemplate = (
	gameResult: GameResult,
	users: User[],
	achievementDefinitions: AchievementDefinitionsResponse
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

							${renderAchievementSummary(pr, achievementDefinitions)}

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



export const gameResultDummyData: GameResult = {
	date:             new Date('2025-03-24T01:14:58.205118Z'),
	playerRoundsList: [],
	playerResults:    [
		{
			id:           25,
			userId:       '0b147800-1282-405f-875b-2687ce257bdf',
			placement:    1,
			totalScore:   250,
			averageScore: 50,
			overShoots:   0,
			roundsPlayed: 5,
			oldMMR:       2000,
			newMMR:       2250,
			oldRank:      4,
			newRank:      5,
			unlockedSessionAchievements: [SessionAchievement.AllTwentyVariantsSameGame, SessionAchievement.BudgetTrippleTwenty],
			unlockedProgressAchievements: []
		},
		{
			id:           26,
			userId:       '9c94fabb-f322-450b-a345-235c814afb8e',
			placement:    0,
			totalScore:   240,
			averageScore: 40,
			overShoots:   1,
			roundsPlayed: 6,
			oldMMR:       2350,
			newMMR:       2330,
			oldRank:      5,
			newRank:      5,
			unlockedSessionAchievements: [SessionAchievement.ClassicAnyDouble, SessionAchievement.ClassicAnyTripple, SessionAchievement.Classic1, SessionAchievement.Classic3, SessionAchievement.Classic2],
			unlockedProgressAchievements: []
		},
		{
			id:           26,
			userId:       '9c94fabb-f322-450b-a345-235c814afb81',
			placement:    0,
			totalScore:   240,
			averageScore: 40,
			overShoots:   1,
			roundsPlayed: 6,
			oldMMR:       2350,
			newMMR:       2330,
			oldRank:      5,
			newRank:      5,
			unlockedSessionAchievements: [],
			unlockedProgressAchievements: []
		},
		{
			id:           26,
			userId:       '9c94fabb-f322-450b-a345-235c814afb82',
			placement:    0,
			totalScore:   240,
			averageScore: 40,
			overShoots:   1,
			roundsPlayed: 6,
			oldMMR:       2350,
			newMMR:       2330,
			oldRank:      5,
			newRank:      5,
			unlockedSessionAchievements: [],
			unlockedProgressAchievements: []
		},
		{
			id:           26,
			userId:       '9c94fabb-f322-450b-a345-235c814afb83',
			placement:    0,
			totalScore:   240,
			averageScore: 40,
			overShoots:   1,
			roundsPlayed: 6,
			oldMMR:       2350,
			newMMR:       2330,
			oldRank:      5,
			newRank:      5,
			unlockedSessionAchievements: [],
			unlockedProgressAchievements: []
		},
		{
			id:           26,
			userId:       '9c94fabb-f322-450b-a345-235c814afb84',
			placement:    0,
			totalScore:   240,
			averageScore: 40,
			overShoots:   1,
			roundsPlayed: 6,
			oldMMR:       2350,
			newMMR:       2330,
			oldRank:      5,
			newRank:      5,
			unlockedSessionAchievements: [],
			unlockedProgressAchievements: []
		},
		{
			id:           26,
			userId:       '9c94fabb-f322-450b-a345-235c814afb85',
			placement:    0,
			totalScore:   240,
			averageScore: 40,
			overShoots:   1,
			roundsPlayed: 6,
			oldMMR:       2350,
			newMMR:       2330,
			oldRank:      5,
			newRank:      5,
			unlockedSessionAchievements: [],
			unlockedProgressAchievements: []
		},
		{
			id:           26,
			userId:       '9c94fabb-f322-450b-a345-235c814afb86',
			placement:    0,
			totalScore:   240,
			averageScore: 40,
			overShoots:   1,
			roundsPlayed: 6,
			oldMMR:       2350,
			newMMR:       2330,
			oldRank:      5,
			newRank:      5,
			unlockedSessionAchievements: [],
			unlockedProgressAchievements: []
		},
		{
			id:           26,
			userId:       '9c94fabb-f322-450b-a345-235c814afb87',
			placement:    0,
			totalScore:   240,
			averageScore: 40,
			overShoots:   1,
			roundsPlayed: 6,
			oldMMR:       2350,
			newMMR:       2330,
			oldRank:      5,
			newRank:      5,
			unlockedSessionAchievements: [],
			unlockedProgressAchievements: []
		},
		{
			id:           26,
			userId:       '9c94fabb-f322-450b-a345-235c814afb88',
			placement:    0,
			totalScore:   240,
			averageScore: 40,
			overShoots:   1,
			roundsPlayed: 6,
			oldMMR:       2350,
			newMMR:       2330,
			oldRank:      5,
			newRank:      5,
			unlockedSessionAchievements: [],
			unlockedProgressAchievements: []
		},
		{
			id:           26,
			userId:       '9c94fabb-f322-450b-a345-235c814afb89',
			placement:    0,
			totalScore:   240,
			averageScore: 40,
			overShoots:   1,
			roundsPlayed: 6,
			oldMMR:       2350,
			newMMR:       2330,
			oldRank:      5,
			newRank:      5,
			unlockedSessionAchievements: [],
			unlockedProgressAchievements: []
		},
	],
	season: {
		id:                 'e0292748-c383-4d32-b1b4-522df3fa85c9',
		name:               'sallanSmud',
		startDate:          new Date('2025-03-20T20:19:01.9651849'),
		endDate:            new Date('2025-06-08T20:19:01.9652317'),
		scoreModifierRules: [
			{
				scoreModifier:  0,
				executionOrder: 0,
			},
		],
		winConditionRules: [
			{
				winCondition: 0,
			},
			{
				winCondition: 1,
			},
		],
		rankThresholds: [],
		achievementTierRewards: [],
		mmrConfiguration: { ...defaultMmrConfiguration },
		goal: 250,
	},
	goal: 250,
};
