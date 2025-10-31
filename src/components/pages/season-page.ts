import { html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { sharedStyles } from "../../../styles.js";
import { LitElement } from "lit";
import { container } from "tsyringe";
import { User, SeasonStatistics, Season, RuleDefinition, ScoreModifierRule, WinConditionRule } from "../../models/schemas.js";
import { getRankDisplayValue, getRankIcon } from "../../models/rank.js";
import { SeasonService } from "../../services/seasonService.js";
import { UserService } from "../../services/userService.js";
import { RuleService } from "../../services/ruleService.js";

import hljs from "highlight.js/lib/core";
import { unsafeHTML } from "lit/directives/unsafe-html.js";

@customElement("season-page")
export class SeasonPage extends LitElement {
	private ruleService: RuleService;
	private seasonService: SeasonService;
	private userService: UserService;
	private winConditions: RuleDefinition[] = [];
	private scoreModifiers: RuleDefinition[] = [];
	@state() private season?: Season;
	@state() private users: User[] = [];

	constructor() {
		super();
		this.userService = container.resolve(UserService);
		this.seasonService = container.resolve(SeasonService);
		this.ruleService = container.resolve(RuleService);
	}
	
	public override async connectedCallback(): Promise<void> {
		super.connectedCallback();
		this.season = await this.seasonService.getCurrentSeason();
		this.users = await this.userService.getAllUsers();
		var ruleDefinitions = await this.ruleService.GetDefinitions();
		this.winConditions = ruleDefinitions.winConditions;
		this.scoreModifiers = ruleDefinitions.scoreModifiers;
		this.requestUpdate();
	}
	private renderRuleCode(code: string) {
		const highlighted = hljs.highlight(code, { language: "csharp" }).value;
		return html`
			<pre class="hljs"><code class="language-csharp">${unsafeHTML(highlighted)}</code></pre>
		`;
	}
	private getStatsForCurrentSeason(user: User): SeasonStatistics {
		if (!user.seasonStatistics || user.seasonStatistics.length === 0) {
			return {
				id: 0,
				userId: user.id,
				seasonId: "",
				currentRank: undefined,
				highestAchievedRank: undefined,
				mmr: 0,
			} as unknown as SeasonStatistics;
		}
		if (this.season) {
			const match = user.seasonStatistics.find(
				(s) => s.seasonId === this.season!.id
			);
			if (match) return match;
		}
		return user.seasonStatistics.reduce((prev, curr) =>
			curr.id > prev.id ? curr : prev
		);
	}

	private get podium() {
		const rows = this.users
			.map((u) => {
				const s = this.getStatsForCurrentSeason(u);
				return { user: u, mmr: s?.mmr ?? 0, rank: s?.currentRank };
			})
			.sort((a, b) => (b.mmr ?? 0) - (a.mmr ?? 0))
			.slice(0, 3);

		if (rows.length === 3) return [rows[1], rows[0], rows[2]];
		if (rows.length === 2) return [rows[1], rows[0]];
		return rows;
	}

	private podiumCell(entry?: { user: User; rank: any; mmr: number }) {
		if (!entry) return html``;
		const alias = entry.user.alias ?? entry.user.name;
		const icon = getRankIcon(entry.rank);
		const label = getRankDisplayValue(entry.rank);
		return html`
			<div class="player">
				<div class="alias">${alias}</div>
				<img class="rank-icon" src=${icon} alt=${label} />
				<div class="rank-label">${label}</div>
				<div class="mmr">MMR ${entry.mmr}</div>
			</div>
		`;
	}
	private renderRuleRow(
		title: string,
		items: {value: number, execOrder?: number}[],
		definitions: RuleDefinition[]){

		if (!items?.length) return html``;
		return html`
		<section class="rules-section">
			<h3 class="rules-title">${title}</h3>
			<div class="rules-row">
			${items.map((item) => {
				const ruleDefinition = definitions.find(def => def.value === item.value)!
				return html`
				<details class="rule-card">
					<summary class="rule-summary">
					<div class="rule-title">
						${item.execOrder != undefined ? html`<span class="rule-pill">Order #${item.execOrder}</span>` : null}
						<span>${ruleDefinition.name}</span>
					</div>
					<div class="rule-sub">${ruleDefinition.description}</div>
					</summary>
					<div class="rule-body">
						${this.renderRuleCode(ruleDefinition.codeImplementation)}
					</div>
				</details>
				`;
			})}
			</div>
		</section>
		`;
	}

	override render() {
    const p = this.podium;

    return html`
      <section class="wrap">
        <h2 class="title">Season Podium</h2>

        ${p.length === 0
          ? html`<div class="empty">No players found for this season.</div>`
          : html`
              <div class="podium">
                <div class="column second">
                  ${this.podiumCell(p[0])}
                  <div class="step step-2"></div>
                </div>
                <div class="column first">
                  ${this.podiumCell(p[1] ?? p[0])}
                  <div class="step step-1"></div>
                </div>
                <div class="column third">
                  ${this.podiumCell(p[2])}
                  <div class="step step-3"></div>
                </div>
              </div>
            `
		}
		${this.season && Array.isArray(this.scoreModifiers) && this.scoreModifiers.length
			? html`
				${this.renderRuleRow(
					"Score modifiers",
					(this.season.scoreModifierRules ?? []).map(r => ({
						value: r.scoreModifier,
						execOrder: r.executionOrder,
					})),
					this.scoreModifiers
				)}
				`
			: html``}

		${this.season && Array.isArray(this.winConditions) && this.winConditions.length
			? html`
				${this.renderRuleRow(
					"Win conditions",
					(this.season.winConditionRules ?? []).map(r => ({
						value: r.winCondition,
						execOrder: undefined,
					})),
					this.winConditions,
				)}
				`
			: html``}

        
      </section>
    `;
  }

  static override styles = [
    sharedStyles,
    css`
      :host {
        display: block;
        height: auto !important;
        min-height: unset !important;
      }

      .wrap {
        padding: 1rem;
        text-align: center;
      }

      .title {
        margin-bottom: 2rem;
        font-size: 1.75rem;
        font-weight: 800;
      }

      .podium {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        align-items: end;
        gap: 2rem;
        max-width: 900px;
        margin: 0 auto 2rem auto;
      }
      .column {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-end;

      }
      .step {
        width: 100%;
        max-width: 220px;
        border-radius: 12px;
        background: #f3f3f3;
        box-shadow: inset 0 4px 6px rgba(0, 0, 0, 0.1);
      }
      .step-1 { height: 200px; background: #f2d14eff;}
      .step-2 { height: 140px; background: #C0C0C0; }
      .step-3 { height: 110px; background: #CD7F32; }

      .player {
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      .alias { font-weight: 800; font-size: 1.25rem; }
      .rank-icon {
        width: 128px; height: 128px; object-fit: contain;
        image-rendering: -webkit-optimize-contrast;
      }
      .rank-label { font-size: 1rem; font-weight: 600; opacity: 0.9; }
      .mmr {
        font-size: 0.9rem;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
          "Liberation Mono", "Courier New", monospace;
        color: #444;
        margin-top: 0.25rem;
        opacity: 0.8;
      }

      .empty {
        padding: 1rem;
        color: #666;
        background: #fafafa;
        border-radius: 12px;
      }

      @media (max-width: 700px) {
        .podium { grid-template-columns: 1fr; }
        .step-1, .step-2, .step-3 { height: 120px; }
      }

      .rules-section {
        max-width: 1000px;
        margin: 1.5rem auto 0 auto;
        text-align: left;
      }

      .rules-title {
        font-size: 1.25rem;
        font-weight: 800;
        margin: 0 0 0.75rem 0;
        padding-left: 0.25rem;
      }

      .rules-row {
        display: flex;
        gap: 0.75rem;
        flex-wrap: wrap;
      }

      /* Clickable card using <details> for native toggle */
      .rule-card {
	  	min-width: 250px;
        width: fit-content;
        border: 2px solid black;
        border-right-width: 3px;
        border-bottom-width: 3px;
        border-radius: 14px;
        background: white;
        box-shadow: 4px 6px 0 0 black;
        transition: transform 120ms ease, box-shadow 120ms ease;
      }
      .rule-card[open] {
        transform: translateY(-1px);
        box-shadow: 6px 8px 0 0 black;
      }

      .rule-summary {
        list-style: none;
        cursor: pointer;
        padding: 0.75rem 0.9rem;
        display: grid;
        gap: 0.25rem;
      }
      .rule-summary::-webkit-details-marker { display: none; }

      .rule-title {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-weight: 800;
      }

      .rule-pill {
        display: inline-block;
        padding: 0.1rem 0.5rem;
        border: 2px solid black;
        border-right-width: 3px;
        border-bottom-width: 3px;
        border-radius: 999px;
        background: #f5f5f5;
        font-size: 0.85rem;
      }

      .rule-sub {
        font-size: 0.9rem;
        opacity: 0.85;
		max-width: 250px;
		white-space: normal;
		word-break: break-word;
      }

      .rule-body {
        padding: 0.75rem 0.9rem 0.9rem;
        border-top: 1px dashed #ccc;
        font-size: 0.95rem;
        line-height: 1.35;
      }
		

	  .mmr, .alias, .rank-label, .player{
		height: fit-content; 
	  }
		/* ====== Highlight.js light theme ====== */
		pre.hljs {
			display: block;
			overflow-x: auto;
			padding: 1rem;
			border-radius: 12px;
			background: #f6f8fa;
			color: #24292e;
			line-height: 1.45;
			font-family: "Cascadia Code","Consolas",monospace;
			font-size: 0.9rem;
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
		
    `,
  ];
}