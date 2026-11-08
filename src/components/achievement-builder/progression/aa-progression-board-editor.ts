import '../hit-target/aa-hit-target-chip.js';
import '../../../ui/dartboard/aa-dartboard.js';

import { html, LitElement, nothing, TemplateResult, unsafeCSS } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import { bullLocation, dartboardNumbers, doubleBullLocation } from '../../../helpers/dartboard.js';
import {
	AchievementParameterDraft,
	AchievementProgressionDraft,
	AchievementProgressionTargetDraft,
	createAchievementBuilderId,
	createDefaultAchievementProgression,
} from '../../../models/achievementBuilder.js';
import type { DartboardPick, DartboardZone } from '../../../ui/dartboard/aa-dartboard.js';
import type { ParameterBinding } from '../achievement-draft.js';
import { HitTarget, resolveValueNumber } from '../hit-target/hit-target.js';
import { ruleChangeEventName } from '../rule-events.js';
import progressionBoardEditorStyles from './aa-progression-board-editor.css?inline';

type Ring = AchievementProgressionTargetDraft['throwType'];

const rings: readonly Ring[] = [ 'single', 'double', 'triple' ];
const ringTones: Record<Ring, DartboardZone['tone']> = { single: 'primary', double: 'secondary', triple: 'tertiary' };
const ringLabels: Record<Ring, string> = { single: 'singles', double: 'doubles', triple: 'triples' };
const statusLabels = { valid: 'Valid', victory: 'Victory' } as const;

const isFixedAt = (target: AchievementProgressionTargetDraft, number: number, ring: Ring): boolean =>
	target.throwType === ring
	&& target.hitLocation.source === 'constant'
	&& Number(target.hitLocation.value) === number;

const fixedTarget = (number: number, throwType: Ring): AchievementProgressionTargetDraft => ({
	id:          createAchievementBuilderId(),
	throwType,
	hitLocation: { source: 'constant', value: String(number) },
});

/**
 * Edits a progression achievement on a dartboard: click a ring segment to add or remove it as a
 * target to collect across games. Every target, including parameter targets, is also a chip.
 */
@customElement('aa-progression-board-editor')
export class AaProgressionBoardEditor extends LitElement {

	@property({ attribute: false }) progression?: AchievementProgressionDraft;
	@property({ attribute: false }) parameters:   readonly AchievementParameterDraft[] = [];
	@property({ attribute: false }) binding?:     ParameterBinding;
	@property({ type: Boolean }) readOnly = false;

	private get current(): AchievementProgressionDraft {
		return this.progression ?? createDefaultAchievementProgression();
	}

	private emit(patch: Partial<AchievementProgressionDraft>): void {
		this.dispatchEvent(new CustomEvent(ruleChangeEventName, {
			detail:   { progression: { ...this.current, ...patch } },
			bubbles:  true,
			composed: true,
		}));
	}

	private setTargets(targets: AchievementProgressionTargetDraft[]): void {
		this.emit({ targets });
	}

	private toggle(number: number, ring: Ring): void {
		const { targets } = this.current;
		const existing = targets.find(target => isFixedAt(target, number, ring));
		this.setTargets(existing
			? targets.filter(target => target !== existing)
			: [ ...targets, fixedTarget(number, ring) ]);
	}

	/** The bull and double bull are collected as singles, like the built-ins store them. */
	private handlePick(event: CustomEvent<DartboardPick>): void {
		const { number, ring } = event.detail;
		this.toggle(number, ring === 'bull' ? 'single' : ring);
	}

	/** Adds both bulls, or removes them when both already are targets. */
	private toggleBulls(): void {
		const { targets } = this.current;
		const bulls = [ bullLocation, doubleBullLocation ];
		const both = bulls.every(number => targets.some(target => isFixedAt(target, number, 'single')));
		this.setTargets(both
			? targets.filter(target => !bulls.some(number => isFixedAt(target, number, 'single')))
			: [
				...targets,
				...bulls
					.filter(number => !targets.some(target => isFixedAt(target, number, 'single')))
					.map(number => fixedTarget(number, 'single')),
			]);
	}

	/** Adds the whole ring, or removes it when every number already is a target. */
	private toggleRing(ring: Ring): void {
		const { targets } = this.current;
		const complete = dartboardNumbers.every(number => targets.some(target => isFixedAt(target, number, ring)));
		this.setTargets(complete
			? targets.filter(target => !dartboardNumbers.some(number => isFixedAt(target, number, ring)))
			: [
				...targets,
				...dartboardNumbers
					.filter(number => !targets.some(target => isFixedAt(target, number, ring)))
					.map(number => fixedTarget(number, ring)),
			]);
	}

	private toggleStatus(status: 'valid' | 'victory'): void {
		const { statuses } = this.current;
		this.emit({
			statuses: statuses.includes(status)
				? statuses.filter(item => item !== status)
				: ([ 'valid', 'victory' ] as const).filter(item => item === status || statuses.includes(item)),
		});
	}

	private get zones(): DartboardZone[] {
		return this.current.targets.flatMap(target => {
			const number = resolveValueNumber(target.hitLocation, this.binding);
			if (number === undefined)
				return [];

			return [
				{
					number,
					ring: target.throwType,
					tone: target.hitLocation.source === 'constant' ? ringTones[target.throwType] : 'soft' as const,
				},
			];
		});
	}

	private renderRaw(): TemplateResult {
		return html`
			<div class="raw">
				<p>This progression logic can't be shown on the board. Saving keeps it unchanged.</p>
				${ this.readOnly
					? nothing
					: html`
						<button
							type="button"
							@click=${ () => {
								if (window.confirm('Replace the stored progression logic with an empty target set?')) {
this.dispatchEvent(new CustomEvent(ruleChangeEventName, {
										detail:   { progression: createDefaultAchievementProgression() },
										bubbles:  true,
										composed: true,
									}));
}
							} }
						>Replace with a target set</button>
					` }
			</div>
		`;
	}

	override render(): TemplateResult {
		if (this.current.raw)
			return this.renderRaw();

		const { statuses, targets } = this.current;

		return html`
			<section class="editor" ?inert=${ this.readOnly }>
				<header>
					<span class="tag">Collect across games</span>
					<span class="muted">from rounds that are</span>
					${ ([ 'valid', 'victory' ] as const).map(status => html`
						<button
							type="button"
							class="toggle"
							aria-pressed=${ String(statuses.includes(status)) }
							@click=${ () => this.toggleStatus(status) }
						>${ statusLabels[status] }</button>
					`) }
				</header>
				<div class="body">
					<aa-dartboard
						?interactive=${ !this.readOnly }
						label="Progression targets"
						.zones=${ this.zones }
						@dartboard-pick=${ this.handlePick }
					></aa-dartboard>
					<div class="side">
						<p>
							<b>${ targets.length }</b> target${ targets.length === 1 ? '' : 's' } to collect.
							Click a ring segment to add or remove it.
						</p>
						<div class="shortcuts">
							${ rings.map(ring => html`
								<button type="button" @click=${ () => this.toggleRing(ring) }>All ${ ringLabels[ring] }</button>
							`) }
							<button type="button" @click=${ () => this.toggleBulls() }>Bulls</button>
							<button type="button" @click=${ () => this.setTargets([]) }>Clear</button>
						</div>
						<div class="chips" aria-label="Targets">
							${ targets.map(target => html`
								<aa-hit-target-chip
									context="progression"
									removable
									.target=${ { throwType: target.throwType, hitLocation: target.hitLocation } }
									.parameters=${ this.parameters }
									.binding=${ this.binding }
									?readOnly=${ this.readOnly }
									@hit-target-change=${ (event: CustomEvent<HitTarget>) => {
										event.stopPropagation();
										this.setTargets(targets.map(item => item.id === target.id
											? {
												...item,
												throwType:   event.detail.throwType as Ring,
												hitLocation: event.detail.hitLocation ?? item.hitLocation,
											}
											: item));
									} }
									@hit-target-remove=${ () => this.setTargets(targets.filter(item => item.id !== target.id)) }
								></aa-hit-target-chip>
							`) }
							<button
								type="button"
								class="add"
								@click=${ () => this.setTargets([ ...targets, fixedTarget(20, 'double') ]) }
							>+ target</button>
						</div>
					</div>
				</div>
			</section>
		`;
	}

	static override styles = unsafeCSS(progressionBoardEditorStyles);

}

declare global {
	interface HTMLElementTagNameMap {
		'aa-progression-board-editor': AaProgressionBoardEditor;
	}
}
