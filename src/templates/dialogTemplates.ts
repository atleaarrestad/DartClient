import { html, TemplateResult } from 'lit';
import { createRef, ref } from 'lit/directives/ref.js';

import { AaDialog } from '../components/aa-dialog.js';
import { getRankDisplayValue, getRankIcon, Rank } from '../models/rank.js';
import { AchievementDefinitionsResponse, GameResult, User, RuleDefinition } from '../models/schemas.js';
import { SessionAchievement } from "../models/enums.js";
import { renderAchievementSummary } from "../helpers/achievementHelper.js";

export type SeasonRuleDialogItem = {
	value: number;
	execOrder?: number;
};

type SeasonRuleDialogTemplateOptions = {
	title: string;
	description?: string;
	items: SeasonRuleDialogItem[];
	definitions: RuleDefinition[];
	renderRuleCode: (code: string) => TemplateResult;
};

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
		<style>
			.rules-dialog {
				display: grid;
				gap: 1rem;
			}

			.rules-dialog-intro {
				margin: 0;
				font-size: 0.95rem;
				line-height: 1.45;
				opacity: 0.82;
			}

			.rules-dialog-list {
				display: grid;
				gap: 0.9rem;
			}

			.rules-dialog-card {
				background: #fffdf8;
				border: 2px solid black;
				border-right-width: 4px;
				border-bottom-width: 4px;
				border-radius: 16px;
				box-shadow: 5px 6px 0 0 black;
				overflow: hidden;
			}

			.rules-dialog-card-header {
				padding: 0.9rem 1rem 0.65rem;
				border-bottom: 1px dashed #cfcfcf;
				background: rgba(255, 255, 255, 0.8);
			}

			.rules-dialog-title-row {
				display: flex;
				flex-wrap: wrap;
				align-items: center;
				gap: 0.45rem;
				margin-bottom: 0.35rem;
			}

			.rules-dialog-title {
				font-size: 1rem;
				font-weight: 900;
				line-height: 1.2;
			}

			.rules-dialog-pill {
				display: inline-flex;
				align-items: center;
				padding: 0.12rem 0.5rem;
				border: 2px solid black;
				border-right-width: 3px;
				border-bottom-width: 3px;
				border-radius: 999px;
				background: #f5f5f5;
				font-size: 0.78rem;
				font-weight: 800;
				white-space: nowrap;
			}

			.rules-dialog-description {
				margin: 0;
				font-size: 0.9rem;
				line-height: 1.4;
				opacity: 0.82;
			}

			.rules-dialog-body {
				padding: 0.85rem 1rem 1rem;
			}

			.rules-dialog-footer {
				display: flex;
				justify-content: flex-end;
				padding-top: 0.2rem;
			}

			.rules-dialog-btn {
				appearance: none;
				background: white;
				border: 2px solid black;
				border-right-width: 4px;
				border-bottom-width: 4px;
				border-radius: 14px;
				padding: 0.5rem 0.9rem;
				font-weight: 800;
				cursor: pointer;
				box-shadow: 4px 4px 0 black;
			}

			.rules-dialog-btn:active {
				transform: translate(2px, 2px);
				box-shadow: 2px 2px 0 black;
			}

			.rule-code {
				max-width: 100%;
				max-height: min(52vh, 520px);
				overflow: auto;
				white-space: pre;
			}

			pre.hljs {
				display: block;
				overflow: auto;
				padding: 1rem;
				border-radius: 12px;
				background: #f6f8fa;
				color: #24292e;
				line-height: 1.45;
				font-family: 'Cascadia Code', 'Consolas', monospace;
				font-size: 0.88rem;
				margin: 0;
				border: 1px solid #d0d7de;
			}

			.hljs-comment,
			.hljs-quote {
				color: #6a737d;
				font-style: italic;
			}

			.hljs-keyword,
			.hljs-selector-tag,
			.hljs-literal,
			.hljs-name {
				color: #d73a49;
			}

			.hljs-variable,
			.hljs-template-variable,
			.hljs-attribute {
				color: #005cc5;
			}

			.hljs-string,
			.hljs-doctag,
			.hljs-title,
			.hljs-section,
			.hljs-type {
				color: #032f62;
			}

			.hljs-number,
			.hljs-symbol,
			.hljs-bullet {
				color: #005cc5;
			}

			.hljs-built_in,
			.hljs-builtin-name,
			.hljs-class .hljs-title {
				color: #6f42c1;
			}

			.hljs-meta {
				color: #22863a;
			}

			.hljs-emphasis {
				font-style: italic;
			}

			.hljs-strong {
				font-weight: 700;
			}
		</style>

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
				<button class="rules-dialog-btn" @click=${closeDialog}>Close</button>
			</div>
		</div>
	`;
};

type ShortcutEntry = {
	label: string;
	subtext?: string;
	combos: string[][];
};

type ShortcutSection = {
	title: string;
	items: ShortcutEntry[];
};

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
		<style>
			.shortcut-help-dialog {
				display: grid;
				gap: 1rem;
			}

			.shortcut-help-intro {
				margin: 0;
				font-size: 0.95rem;
				line-height: 1.45;
				opacity: 0.82;
			}

			.shortcut-help-grid {
				display: grid;
				gap: 1rem;
			}

			.empty-shortcuts-card {
				display: grid;
				gap: 0;
				background: #fffdf6;
				border: 2px solid #000;
				border-radius: 20px;
				box-shadow: 4px 4px 0 #000;
				overflow: hidden;
			}

			.shortcut-section {
				display: grid;
				gap: 0.75rem;
				padding: 1rem 1.1rem;
			}

			.shortcut-section-title {
				margin: 0;
				font-size: 0.9rem;
				font-weight: 900;
				text-transform: uppercase;
				letter-spacing: 0.04em;
				opacity: 0.65;
				text-align: left;
			}

			.shortcut-divider {
				height: 2px;
				background: repeating-linear-gradient(to right,
						#000 0 10px,
						transparent 10px 16px);
				opacity: 0.35;
				margin: 0 1rem;
			}

			.shortcut-row {
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: 1rem;
				flex-wrap: wrap;
			}

			.shortcut-text {
				display: grid;
				gap: 0.2rem;
				flex: 1 1 16rem;
			}

			.shortcut-label {
				font-size: 1.05rem;
				font-weight: 900;
				text-align: left;
			}

			.shortcut-subtext {
				font-size: 0.85rem;
				font-weight: 800;
				opacity: 0.65;
				text-align: left;
			}

			.shortcut-key-group {
				display: inline-flex;
				align-items: center;
				gap: 0.5rem;
				flex-wrap: wrap;
			}

			.shortcut-keys {
				display: inline-flex;
				align-items: center;
				gap: 0.35rem;
				font-weight: 900;
			}

			.shortcut-separator {
				font-size: 0.85rem;
				font-weight: 900;
				opacity: 0.55;
			}

			.keycap {
				display: inline-flex;
				align-items: center;
				justify-content: center;
				min-width: 2.1rem;
				padding: 0.2rem 0.5rem;
				background: #fff;
				border: 2px solid #000;
				border-radius: 12px;
				line-height: 1;
				box-shadow: 2px 2px 0 #000;
			}

			.shortcut-help-footer {
				display: flex;
				justify-content: flex-end;
			}

			.shortcut-help-btn {
				appearance: none;
				background: white;
				border: 2px solid black;
				border-right-width: 4px;
				border-bottom-width: 4px;
				border-radius: 14px;
				padding: 0.5rem 0.9rem;
				font-weight: 800;
				cursor: pointer;
				box-shadow: 4px 4px 0 black;
			}

			.shortcut-help-btn:active {
				transform: translate(2px, 2px);
				box-shadow: 2px 2px 0 black;
			}
		</style>

		<div class="shortcut-help-dialog">
			<p class="shortcut-help-intro">
				The game supports fast keyboard play. Use these shortcuts whenever a game is active.
			</p>

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
				<button class="shortcut-help-btn" @click=${closeDialog}>Close</button>
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
	<style>
		:host{
			height: 70vh;
		}
    </style>

	 <aa-user-picker
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
		<style>
			.confirm-rematch {
				display: grid;
				gap: 1rem;
				outline: none;
			}

			.confirm-copy {
				display: grid;
				gap: 0.4rem;
			}

			.confirm-title {
				font-size: 1.1rem;
				font-weight: 900;
			}

			.confirm-text {
				opacity: 0.8;
				line-height: 1.4;
			}

			.rematch-card {
				display: grid;
				gap: 0.75rem;
				padding: 0.9rem 1rem;
				background: #fffdf6;
				border: 2px solid #000;
				border-radius: 20px;
				box-shadow: 4px 4px 0 #000;
			}

			.rematch-header {
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: 1rem;
				flex-wrap: wrap;
			}

			.rematch-label {
				font-size: 1rem;
				font-weight: 900;
			}

			.rematch-keys {
				display: inline-flex;
				align-items: center;
				gap: 0.35rem;
				font-weight: 900;
			}

			.keycap {
				display: inline-flex;
				align-items: center;
				justify-content: center;
				min-width: 2.1rem;
				padding: 0.2rem 0.5rem;
				background: #fff;
				border: 2px solid #000;
				border-radius: 12px;
				line-height: 1;
				box-shadow: 2px 2px 0 #000;
			}

			.roster-label {
				font-size: 0.85rem;
				font-weight: 800;
				opacity: 0.65;
			}

			.player-list {
				display: flex;
				flex-wrap: wrap;
				gap: 0.5rem;
			}

			.player-pill {
				display: inline-flex;
				align-items: center;
				padding: 0.3rem 0.65rem;
				background: #eef6ff;
				border: 2px solid #000;
				border-radius: 999px;
				font-weight: 800;
				box-shadow: 2px 2px 0 #000;
			}

			.actions {
				display: flex;
				justify-content: flex-end;
				gap: 0.75rem;
				flex-wrap: wrap;
				margin-top: 0.25rem;
			}

			.dialog-button {
				font: inherit;
				font-weight: 900;
				border: 2px solid #000;
				border-radius: 14px;
				padding: 0.65rem 0.9rem;
				box-shadow: 3px 3px 0 #000;
				cursor: pointer;
				background: #fff;
			}

			.dialog-button:hover {
				transform: translate(-1px, -1px);
				box-shadow: 4px 4px 0 #000;
			}

			.dialog-button:active {
				transform: translate(2px, 2px);
				box-shadow: 1px 1px 0 #000;
			}

			.dialog-button:focus-visible {
				outline: 3px solid #000;
				outline-offset: 3px;
			}

			.dialog-button.confirm {
				background: #fff7d6;
			}
		</style>

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
				<button
					type="button"
					class="dialog-button confirm"
					data-autofocus
					@click=${() => closeDialog(true)}
				>
					Yes, rematch
				</button>

				<button
					type="button"
					class="dialog-button"
					@click=${() => closeDialog(false)}
				>
					No, keep game
				</button>
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
        <button @click=${ handleSave }>Save</button>
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
		<style>
			.postgame * {
				width: auto;
				height: auto;
				box-sizing: border-box;
			}

			.list {
				display: grid;
				gap: 1rem;
				padding: 0.25rem 0;
			}

			.player-row {
				display: grid;
				gap: 0.35rem;
			}

			.divider {
				border-bottom: 2px dashed #000;
				opacity: 0.35;
				margin-top: 0.5rem;
			}

			.header-row {
				display: flex;
				align-items: baseline;
				justify-content: space-between;
				gap: 1rem;
			}

			.name-line {
				font-size: 1.15rem;
				font-weight: 800;
				display: inline-flex;
				align-items: baseline;
				gap: 0.5rem;
				flex-wrap: wrap;
			}

			.mmr {
				display: inline-flex;
				align-items: center;
				gap: 0.35rem;
				font-weight: 800;
				background: #fff;
				border: 2px solid #000;
				border-radius: 999px;
				padding: 0.15rem 0.6rem;
				line-height: 1.2;
			}

			.mmr .delta.up { color: #008000; }
			.mmr .delta.down { color: #cc0000; }
			.mmr .delta.flat { opacity: 0.65; }

			.placement {
				background: #e8f0ff;
				border: 2px solid #000;
				border-radius: 14px;
				padding: 0.2rem 0.6rem;
				font-weight: 800;
			}

			.rankline {
				font-size: 0.95rem;
				opacity: 0.85;
			}

			.stats {
				display: flex;
				flex-wrap: wrap;
				gap: 0.4rem;
			}

			.pill {
				background: #fff;
				border: 2px solid #000;
				border-radius: 14px;
				padding: 0.35rem 0.55rem;
				display: inline-flex;
				align-items: center;
				gap: 0.5rem;
				font-weight: 700;
			}

			.pill .label { opacity: 0.7; }

			@media (min-width: 900px) {
				.name-line { font-size: 1.25rem; }
			}

			.achievements { margin-top: 0.5rem; }
			.achievements > summary { list-style: none; }
			.achievements > summary::-webkit-details-marker { display: none; }

			.ach-summary {
				display: flex;
				align-items: center;
				gap: 0.5rem;
				flex-wrap: wrap;
				cursor: pointer;
				user-select: none;
			}

			.ach-label { font-weight: 800; opacity: 0.75; }
			.ach-hint { font-weight: 800; opacity: 0.55; font-size: 0.9em; }
			.achievements[open] .ach-hint { opacity: 0.35; }

			.ach-total {
				font-weight: 900;
				background: #fff;
				border: 2px solid #000;
				border-radius: 999px;
				padding: 0.1rem 0.55rem;
			}

			.ach-badges { display: inline-flex; gap: 0.35rem; flex-wrap: wrap; }

			.ach-badge {
				display: inline-flex;
				align-items: center;
				gap: 0.25rem;
				background: #fff;
				border: 2px solid #000;
				border-radius: 999px;
				padding: 0.15rem 0.45rem;
				font-weight: 800;
			}

			.ach-icon { width: 18px; height: 18px; }
			.ach-count { line-height: 1; }

			.ach-list { margin-top: 0.35rem; }
			.ach-tier-group { margin-top: 0.35rem; }
			.ach-tier-header {
				display: inline-flex;
				align-items: center;
				gap: 0.35rem;
				font-weight: 900;
			}
			.ach-tier-group ul {
				margin: 0.25rem 0 0 1.1rem;
				padding: 0;
			}
			.muted { opacity: 0.7; }
		</style>

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

export type SeasonSpotlightLeaderboardRow = {
	position: number;
	alias: string;
	value: string;
};

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
		<style>
			.spotlight-dialog {
				display: grid;
				gap: 0.9rem;
				min-width: 0;
			}

			.description {
				margin: 0;
				font-size: 0.92rem;
				line-height: 1.4;
				opacity: 0.8;
			}

			.empty {
				padding: 1rem;
				text-align: center;
				font-weight: 700;
				border: 2px solid black;
				border-right-width: 4px;
				border-bottom-width: 4px;
				border-radius: 16px;
				background: #fff;
				box-shadow: 5px 5px 0 0 black;
			}

			.table-wrap {
				overflow: auto;
				border: 2px solid black;
				border-right-width: 4px;
				border-bottom-width: 4px;
				border-radius: 16px;
				background: #fff;
				box-shadow: 5px 5px 0 0 black;
			}

			table {
				width: 100%;
				border-collapse: collapse;
				font-size: 0.95rem;
			}

			thead th {
				text-align: left;
				padding: 0.8rem 0.9rem;
				font-size: 0.82rem;
				font-weight: 900;
				text-transform: uppercase;
				letter-spacing: 0.03em;
				background: #eef6ff;
				border-bottom: 2px solid black;
				white-space: nowrap;
			}

			tbody td {
				padding: 0.8rem 0.9rem;
				vertical-align: middle;
			}

			tbody tr:nth-child(even) {
				background: rgba(0, 0, 0, 0.05);
			}

			tbody tr + tr td {
				border-top: 1px solid rgba(0, 0, 0, 0.12);
			}

			.col-pos {
				width: 70px;
				font-weight: 900;
				white-space: nowrap;
			}

			.col-name {
				font-weight: 800;
				overflow-wrap: anywhere;
			}

			.col-value {
				text-align: right;
				font-weight: 900;
				white-space: nowrap;
			}

			@media (max-width: 640px) {
				table {
					font-size: 0.9rem;
				}

				thead th,
				tbody td {
					padding: 0.7rem 0.65rem;
				}

				.col-pos {
					width: 54px;
				}
			}
		</style>

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
			unlockedSessionAchievements: [SessionAchievement.AllTwentyVariantsSameGame, SessionAchievement.BudgetTrippleTwenty, SessionAchievement.MaggaSlayer],
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
		goal: 250,
	},
	goal: 250,
};
