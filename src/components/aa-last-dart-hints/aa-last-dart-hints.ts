import type { PropertyValues } from 'lit';
import { html, LitElement, nothing, unsafeCSS } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { getAchievementTierIcon } from '../../helpers/achievementHelper.js';
import {
	describeWinningHits,
	easiestTargets,
	formatHit,
	getHitKind,
	listWinningHits,
	selectVisibleHints,
	VISIBLE_LAST_DART_HINTS,
} from '../../helpers/lastDartHints.js';
import type { LastDartHint, LastDartHints } from '../../models/achievementBuilderApi.js';
import { AchievementTier } from '../../models/enums.js';
import { visuallyHiddenStyles } from '../../styles/shared-styles.js';
import lastDartHintsStyles from './aa-last-dart-hints.css?inline';

interface DisplayedHints {
	playerName: string;
	hints:      LastDartHints;
}

/**
 * Up to three achievements the last dart can still unlock, each with the easiest throws
 * that unlock it, and how many more achievements there are. The geometry never changes:
 * empty slots stay in place and hiding only fades the dock, so showing or clearing hints
 * moves nothing on the page. Takes data only; the game page decides whose hints to show.
 * The player's name is only announced to screen readers; the board already shows who is up.
 */
@customElement('aa-last-dart-hints')
export class AaLastDartHints extends LitElement {

	@property({ type: String }) playerName = '';
	@property({ attribute: false }) hints: LastDartHints | null = null;

	@property({ type: Boolean, reflect: true }) visible = false;

	// Kept while fading out, so the dock does not empty itself before it disappears.
	@state() private displayed?: DisplayedHints;

	protected override willUpdate(changedProperties: PropertyValues<this>): void {
		if (!changedProperties.has('hints') && !changedProperties.has('playerName'))
			return;

		const hasHints = (this.hints?.hints.length ?? 0) > 0;
		this.visible = hasHints;
		if (hasHints)
			this.displayed = { playerName: this.playerName, hints: this.hints! };
	}

	override render(): unknown {
		const displayed = this.displayed;
		const visibleHints = displayed ? selectVisibleHints(displayed.hints) : [];
		const extraHints = displayed?.hints.hints.slice(VISIBLE_LAST_DART_HINTS) ?? [];
		const moreCount = displayed ? displayed.hints.totalCount - visibleHints.length : 0;
		const summary = this.visible && displayed
			? `${ displayed.playerName }: ${ displayed.hints.totalCount } `
				+ `${ displayed.hints.totalCount === 1 ? 'achievement' : 'achievements' } `
				+ 'in reach with the last dart'
			: '';

		// The live region stays outside the hidden dock so the change is announced.
		return html`
			<span class="visually-hidden" role="status" aria-live="polite">${ summary }</span>
			<section class="dock" aria-hidden=${ this.visible ? 'false' : 'true' }>
				<ol class="hints">
					${ Array.from({ length: VISIBLE_LAST_DART_HINTS }, (_, index) =>
						this.renderSlot(visibleHints[index])) }
				</ol>
				<span
					class="more"
					?hidden=${ moreCount <= 0 }
					title=${ this.getMoreTitle(extraHints, moreCount) }
				>
					<span class="more__count">+${ moreCount }</span>
					<span class="more__label">more</span>
				</span>
			</section>
		`;
	}

	private renderSlot(hint: LastDartHint | undefined): unknown {
		if (!hint)
			return html`<li class="hint hint--empty" aria-hidden="true"></li>`;

		const { achievement, winningHits } = hint;
		const tier = achievement.achievementTier as AchievementTier;
		const tierName = AchievementTier[tier] ?? 'achievement';
		const targets = easiestTargets(winningHits);
		const title = [
			`${ achievement.renderedName } (${ tierName })`,
			achievement.renderedDescription,
			`Hit: ${ listWinningHits(winningHits) }`,
		].filter(line => line.length > 0).join('\n');

		return html`
			<li class="hint" title=${ title }>
				<img class="hint__tier" src=${ getAchievementTierIcon(tier) } alt="${ tierName }" />
				<span class="hint__name">${ achievement.renderedName }</span>
				<span class="targets" aria-label="Hit ${ listWinningHits(winningHits) }">
					<span class="targets__label" aria-hidden="true">Hit</span>
					${ targets.map((target, index) => html`
						<span class="target target--${ getHitKind(target) } target--${ index + 1 }">${ formatHit(target) }</span>
					`) }
					${ [ 1, 2, 3 ].map(shown => this.renderMoreTargets(shown, winningHits.length - shown)) }
				</span>
			</li>
		`;
	}

	/**
	 * Narrow cards show fewer targets (see the card container queries), so there is one
	 * "+N" per number of targets shown and CSS keeps the one that matches.
	 */
	private renderMoreTargets(shown: number, count: number): unknown {
		if (count <= 0)
			return nothing;

		return html`<span class="targets__more targets__more--${ shown }" aria-hidden="true">+${ count }</span>`;
	}

	private getMoreTitle(extraHints: LastDartHint[], moreCount: number): string | typeof nothing {
		if (moreCount <= 0)
			return nothing;

		const names = extraHints.map(hint =>
			`${ hint.achievement.renderedName }: ${ describeWinningHits(hint.winningHits) }`);
		const unnamed = moreCount - names.length;
		if (unnamed > 0)
			names.push(`and ${ unnamed } more`);

		return names.join('\n');
	}

	static override styles = [
		visuallyHiddenStyles,
		unsafeCSS(lastDartHintsStyles),
	];

}

declare global {

	interface HTMLElementTagNameMap {
		'aa-last-dart-hints': AaLastDartHints;
	}
}
