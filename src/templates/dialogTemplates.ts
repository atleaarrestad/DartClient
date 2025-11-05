import { html, TemplateResult } from "lit";
import { GameResult, User } from "../models/schemas.js";
import { getRankDisplayValue } from "../models/rank.js";
import { createRef, ref } from "lit/directives/ref.js";
import { AaDialog } from "../components/aa-dialog.js";

const getOrdinal = (n: number): string => {
	const s = ["th", "st", "nd", "rd"],
		v = n % 100;
	return n + (s[(v - 20) % 10] || s[v] || s[0]!);
};

export const selectUserTemplate = (users: User[]): TemplateResult => {
	const handleUserselected = (e: CustomEvent, user: User) => {
		const dialog = (e.currentTarget as HTMLElement).closest("aa-dialog") as any;
		dialog?.close(user);
	};

	return html`
	<style>
		:host{
			height: 70vh;
		}
    </style>

	 <aa-user-picker
		.users=${users}
		@user-selected=${(e: CustomEvent<User>) => handleUserselected(e, e.detail)}
  ></aa-user-picker>
	`
}

export const newUserTemplate = (options: {
  onSave: (name: string, alias: string) => void;
}): TemplateResult => {
  const nameRef = createRef<HTMLInputElement>();
  const aliasRef = createRef<HTMLInputElement>();

  const handleSave = () => {
	const name = nameRef.value?.value.trim() ?? "";
	const alias = aliasRef.value?.value.trim() ?? "";
	options.onSave(name, alias);
	const dialog = document.querySelector("aa-dialog") as AaDialog || undefined;
	dialog?.close();
  };

  return html`
    <div class="dialog-content">
      <h3>Add New User</h3>

      <label>
        Name:
        <input type="text" ${ref(nameRef)} autofocus />
      </label>

      <label>
        Alias:
        <input type="text" ${ref(aliasRef)} />
      </label>

      <div class="actions">
        <button @click=${handleSave}>Save</button>
      </div>
    </div>
  `;
};

export const postGameTemplate = (gameResult: GameResult, users: User[]): TemplateResult => {
  const sortedPlayerResults = [...gameResult.playerResults].sort((a, b) => {
    if (a.placement === 0 && b.placement !== 0) return 1;
    if (b.placement === 0 && a.placement !== 0) return -1;
    return a.placement - b.placement;
  });

  return html`
    <style>
      .scroll-viewport {
        max-height: 80vh;
        overflow-y: auto;
        scrollbar-gutter: stable; 
      }

      .big-container {
        font-size: 2rem;
      }
      .player-summary {
        margin-bottom: 1rem;
        padding: 2rem;
        border: 1px solid #ddd;
        border-radius: 8px;
        width: fit-content;
        min-width: 1100px;
      }
      .header {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        font-size: 2.4rem;
        font-weight: 600;
      }
      .mmr-history {
        font-weight: normal;
        margin-left: 1rem;
      }
      .secondary {
        font-size: 1.7rem;
        color: #666;
        margin-top: 0.5rem;
      }
      .separator {
        margin: 0 20px;
      }
    </style>

    <div class="scroll-viewport">
      <div class="big-container">
        ${sortedPlayerResults.map((pr) => {
          const mmrDiff = pr.newMMR - pr.oldMMR;
          const user = users.find(u => u.id === pr.userId);
          return html`
            <div class="player-summary">
              <div class="header">
                <span>
                  ${user ? user.name : pr.userId}
                  <span style="color: ${mmrDiff > 0 ? "green" : mmrDiff < 0 ? "red" : "inherit"}">
                    ${mmrDiff > 0 ? "+" : ""}${mmrDiff}
                  </span>
                  <span class="mmr-history">(${pr.oldMMR} → ${pr.newMMR})</span>
                </span>
                <span>
                  ${pr.placement === 0 ? "DNF" : `${getOrdinal(pr.placement)} Place`}
                </span>
              </div>
              <div class="secondary">
                ${pr.oldRank !== pr.newRank
                  ? html`${getRankDisplayValue(pr.oldRank)} → ${getRankDisplayValue(pr.newRank)}`
                  : getRankDisplayValue(pr.oldRank)}
              </div>
              <div class="secondary">
                <span>Total Score: ${pr.totalScore}</span>
                <span class="separator">|</span>
                <span>Rounds: ${pr.roundsPlayed}</span>
                <span class="separator">|</span>
                <span>Overshoots: ${pr.overShoots}</span>
                <span class="separator">|</span>
                <span>avg: ${pr.averageScore}</span>
              </div>
            </div>
          `;
        })}
      </div>
    </div>
  `;
};


export const gameResultDummyData: GameResult = {
	date: new Date("2025-03-24T01:14:58.205118Z"),
	playerRoundsList: [],
	playerResults: [
		{
			id: 25,
			userId: "0b147800-1282-405f-875b-2687ce257bdf",
			placement: 1,
			totalScore: 250,
			averageScore: 50,
			overShoots: 0,
			roundsPlayed: 5,
			oldMMR: 2000,
			newMMR: 2250,
			oldRank: 4,
			newRank: 5,
		},
		{
			id: 26,
			userId: "9c94fabb-f322-450b-a345-235c814afb8e",
			placement: 0,
			totalScore: 240,
			averageScore: 40,
			overShoots: 1,
			roundsPlayed: 6,
			oldMMR: 2350,
			newMMR: 2330,
			oldRank: 5,
			newRank: 5,
		},
		{
			id: 26,
			userId: "9c94fabb-f322-450b-a345-235c814afb81",
			placement: 0,
			totalScore: 240,
			averageScore: 40,
			overShoots: 1,
			roundsPlayed: 6,
			oldMMR: 2350,
			newMMR: 2330,
			oldRank: 5,
			newRank: 5,
		},
		{
			id: 26,
			userId: "9c94fabb-f322-450b-a345-235c814afb82",
			placement: 0,
			totalScore: 240,
			averageScore: 40,
			overShoots: 1,
			roundsPlayed: 6,
			oldMMR: 2350,
			newMMR: 2330,
			oldRank: 5,
			newRank: 5,
		},
		{
			id: 26,
			userId: "9c94fabb-f322-450b-a345-235c814afb83",
			placement: 0,
			totalScore: 240,
			averageScore: 40,
			overShoots: 1,
			roundsPlayed: 6,
			oldMMR: 2350,
			newMMR: 2330,
			oldRank: 5,
			newRank: 5,
		},
		{
			id: 26,
			userId: "9c94fabb-f322-450b-a345-235c814afb84",
			placement: 0,
			totalScore: 240,
			averageScore: 40,
			overShoots: 1,
			roundsPlayed: 6,
			oldMMR: 2350,
			newMMR: 2330,
			oldRank: 5,
			newRank: 5,
		},
		{
			id: 26,
			userId: "9c94fabb-f322-450b-a345-235c814afb85",
			placement: 0,
			totalScore: 240,
			averageScore: 40,
			overShoots: 1,
			roundsPlayed: 6,
			oldMMR: 2350,
			newMMR: 2330,
			oldRank: 5,
			newRank: 5,
		},
		{
			id: 26,
			userId: "9c94fabb-f322-450b-a345-235c814afb86",
			placement: 0,
			totalScore: 240,
			averageScore: 40,
			overShoots: 1,
			roundsPlayed: 6,
			oldMMR: 2350,
			newMMR: 2330,
			oldRank: 5,
			newRank: 5,
		},
		{
			id: 26,
			userId: "9c94fabb-f322-450b-a345-235c814afb87",
			placement: 0,
			totalScore: 240,
			averageScore: 40,
			overShoots: 1,
			roundsPlayed: 6,
			oldMMR: 2350,
			newMMR: 2330,
			oldRank: 5,
			newRank: 5,
		},
		{
			id: 26,
			userId: "9c94fabb-f322-450b-a345-235c814afb88",
			placement: 0,
			totalScore: 240,
			averageScore: 40,
			overShoots: 1,
			roundsPlayed: 6,
			oldMMR: 2350,
			newMMR: 2330,
			oldRank: 5,
			newRank: 5,
		},
		{
			id: 26,
			userId: "9c94fabb-f322-450b-a345-235c814afb89",
			placement: 0,
			totalScore: 240,
			averageScore: 40,
			overShoots: 1,
			roundsPlayed: 6,
			oldMMR: 2350,
			newMMR: 2330,
			oldRank: 5,
			newRank: 5,
		},
	],
	season: {
		id: "e0292748-c383-4d32-b1b4-522df3fa85c9",
		name: "sallanSmud",
		startDate: new Date("2025-03-20T20:19:01.9651849"),
		endDate: new Date("2025-06-08T20:19:01.9652317"),
		scoreModifierRules: [
			{
				scoreModifier: 0,
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
