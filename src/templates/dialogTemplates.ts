import { html, TemplateResult } from 'lit';
import { createRef, ref } from 'lit/directives/ref.js';

import { AaDialog } from '../components/aa-dialog.js';
import { getRankDisplayValue } from '../models/rank.js';
import { AchievementDefinitionsResponse, GameResult, User } from '../models/schemas.js';
import { SessionAchievement } from "../models/enums.js";
import { renderAchievementSummary } from "../helpers/achievementHelper.js";


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

export const postGameTemplate = (gameResult: GameResult, users: User[], achievementDefinitions: AchievementDefinitionsResponse): TemplateResult => {
	const sortedPlayerResults = [ ...gameResult.playerResults ].sort((a, b) => {
		if (a.placement === 0 && b.placement !== 0)
			return 1;
		if (b.placement === 0 && a.placement !== 0)
			return -1;

		return a.placement - b.placement;
	});

	return html`
    <style>
      .postgame * { width: auto; height: auto; box-sizing: border-box; }

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
	  /* make summary look like a normal row (no default marker spacing) */
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

.achievements[open] .ach-hint { opacity: 0.35; } /* subtle change when open */

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
.ach-tier-header { display: inline-flex; align-items: center; gap: 0.35rem; font-weight: 900; }
.ach-tier-group ul { margin: 0.25rem 0 0 1.1rem; padding: 0; }
.muted { opacity: 0.7; }


    </style>

    <div class="postgame">
      <div class="list">
        ${ sortedPlayerResults.map((pr, index) => {
          const mmrDiff = pr.newMMR - pr.oldMMR;
          const user = users.find(u => u.id === pr.userId);
          const deltaClass = mmrDiff > 0 ? 'up' : mmrDiff < 0 ? 'down' : 'flat';

          return html`
            <div class="player-row">
              <div class="header-row">
                <div class="name-line">
                  <span>${ user ? user.name : pr.userId }</span>
                  <span class="mmr">
                    <span class="delta ${ deltaClass }">${ mmrDiff > 0 ? '+' : '' }${ mmrDiff }</span>
                    <span>(${ pr.oldMMR } → ${ pr.newMMR })</span>
                  </span>
                </div>
                <span class="placement">
                  ${ pr.placement === 0 ? 'DNF' : `${ getOrdinal(pr.placement) } Place` }
                </span>
              </div>

              <div class="rankline">
                ${ pr.oldRank !== pr.newRank
                  ? html`${ getRankDisplayValue(pr.oldRank) } → ${ getRankDisplayValue(pr.newRank) }`
                  : getRankDisplayValue(pr.oldRank) }
              </div>

              <div class="stats">
                <div class="pill"><span class="label">Total</span> ${ pr.totalScore }</div>
                <div class="pill"><span class="label">Rounds</span> ${ pr.roundsPlayed }</div>
                <div class="pill"><span class="label">Overshoots</span> ${ pr.overShoots }</div>
                <div class="pill"><span class="label">Avg</span> ${ pr.averageScore }</div>
              </div>
			  ${renderAchievementSummary(pr, achievementDefinitions)}

              ${ index < sortedPlayerResults.length - 1
                ? html`<div class="divider"></div>`
                : '' }
            </div>
          `;
        }) }
      </div>
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
