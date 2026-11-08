import '../../../ui/dartboard/aa-dartboard.js';

import { html, LitElement, nothing, PropertyValues, TemplateResult, unsafeCSS } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import { bullLocation, doubleBullLocation } from '../../../helpers/dartboard.js';
import type { AchievementParameterDraft, AchievementValueDraft } from '../../../models/achievementBuilder.js';
import type { DartboardPick } from '../../../ui/dartboard/aa-dartboard.js';
import type { ParameterBinding } from '../achievement-draft.js';
import { parseTargetText } from '../rule-text/rule-text-parser.js';
import { printTarget } from '../rule-text/rule-text-printer.js';
import hitTargetPickerStyles from './aa-hit-target-picker.css?inline';
import {
	describeTarget,
	getTargetBoardZones,
	HitTarget,
	HitTargetContextId,
	hitTargetContexts,
	isBullLocation,
	resolveValueNumber,
	TargetThrowType,
	targetTypeHasLocation,
} from './hit-target.js';

export const hitTargetChangeEventName = 'hit-target-change';
export const hitTargetRemoveEventName = 'hit-target-remove';
export const hitTargetDoneEventName = 'hit-target-done';

type SourceMode = 'none' | 'fixed' | 'parameter' | 'neighbour' | 'offset';

const sourceLabels: Record<SourceMode, string> = {
	none:      'Any segment',
	fixed:     'Number',
	parameter: 'Parameter',
	neighbour: 'Neighbour',
	offset:    'Offset',
};

const typeLabels: Record<TargetThrowType, string> = {
	any:        'Any',
	anyScoring: 'Any scoring',
	single:     'Single',
	double:     'Double',
	triple:     'Triple',
	rim:        'Rim',
	miss:       'Miss',
};

const sourceModeOf = (location: AchievementValueDraft | undefined): SourceMode => {
	switch (location?.source) {
	case undefined:
		return 'none';
	case 'parameter':
		return 'parameter';
	case 'parameter.offset':
		return 'offset';
	case 'board.leftNeighbor':
	case 'board.rightNeighbor':
		return 'neighbour';
	default:
		return 'fixed';
	}
};

/** Picks a target on a dartboard: where (number, parameter, neighbour, offset) and how (type). */
@customElement('aa-hit-target-picker')
export class AaHitTargetPicker extends LitElement {

	@property({ attribute: false }) target:     HitTarget = { throwType: 'any' };
	@property({ type: String }) context:        HitTargetContextId = 'throw';
	@property({ attribute: false }) parameters: readonly AchievementParameterDraft[] = [];
	@property({ attribute: false }) binding?:   ParameterBinding;
	/** Shows "Remove step", e.g. for sequence steps. */
	@property({ type: Boolean }) removable = false;

	@state() private shorthand = '';
	@state() private shorthandError = '';

	protected override willUpdate(changed: PropertyValues<this>): void {
		if (changed.has('target')) {
			this.shorthand = printTarget(this.target, this.context);
			this.shorthandError = '';
		}
	}

	private get numberParameters(): AchievementParameterDraft[] {
		return this.parameters.filter(parameter => parameter.valueType === 'integer');
	}

	private emit(target: HitTarget): void {
		this.dispatchEvent(new CustomEvent<HitTarget>(hitTargetChangeEventName, {
			detail:   target,
			bubbles:  true,
			composed: true,
		}));
	}

	private signal(name: string): void {
		this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true }));
	}

	private setSourceMode(mode: SourceMode): void {
		const current = this.target.hitLocation;
		const parameter = current && current.source !== 'constant' && this.parameters.some(item => item.key === current.value)
			? current.value
			: this.numberParameters[0]?.key ?? '';
		const fixedValue = String(resolveValueNumber(current, this.binding) ?? 20);
		const locations: Record<SourceMode, AchievementValueDraft | undefined> = {
			none:      undefined,
			fixed:     { source: 'constant', value: fixedValue },
			parameter: { source: 'parameter', value: parameter },
			neighbour: { source: 'board.leftNeighbor', value: parameter },
			offset:    { source: 'parameter.offset', value: parameter, offset: 1 },
		};
		this.emit({ ...this.target, hitLocation: locations[mode] });
	}

	private setThrowType(throwType: TargetThrowType): void {
		if (!targetTypeHasLocation(throwType)) {
			this.emit({ throwType });

			return;
		}

		const context = hitTargetContexts[this.context];
		// A bull is always hit as a single: Double means the double bull, Triple leaves the bull.
		if (isBullLocation(this.target.hitLocation) && throwType !== context.defaultType) {
			if (throwType === 'triple') {
				this.emit({ throwType, hitLocation: { source: 'constant', value: '20' } });

				return;
			}

			const bull = throwType === 'double' ? doubleBullLocation : bullLocation;
			this.emit({ throwType: context.defaultType, hitLocation: { source: 'constant', value: String(bull) } });

			return;
		}

		const needsLocation = context.locationRequired && !this.target.hitLocation;
		const hitLocation = needsLocation
			? { source: 'constant' as const, value: '20' }
			: this.target.hitLocation;
		this.emit({ throwType, hitLocation });
	}

	private handlePick(event: CustomEvent<DartboardPick>): void {
		const { number, ring } = event.detail;
		const context = hitTargetContexts[this.context];
		if (ring === 'bull') {
			this.emit({ throwType: context.defaultType, hitLocation: { source: 'constant', value: String(number) } });

			return;
		}

		const throwType = context.throwTypes.includes(ring) ? ring : this.target.throwType;
		const mode = sourceModeOf(this.target.hitLocation);
		// A parameter keeps driving the segment; clicking only picks the ring.
		const hitLocation = mode === 'none' || mode === 'fixed'
			? { source: 'constant' as const, value: String(number) }
			: this.target.hitLocation;
		this.emit({ throwType, hitLocation });
	}

	private applyShorthand(): void {
		const { target, error } = parseTargetText(this.shorthand, this.context, this.parameters);
		if (target)
			this.emit(target);
		else
			this.shorthandError = error ?? 'That target can\'t be read.';
	}

	private renderSourceTabs(): TemplateResult | typeof nothing {
		if (!targetTypeHasLocation(this.target.throwType))
			return nothing;

		const context = hitTargetContexts[this.context];
		const modes: SourceMode[] = [
			...context.locationRequired ? [] : [ 'none' as const ],
			'fixed',
			...this.numberParameters.length > 0 ? [ 'parameter', 'neighbour', 'offset' ] as const : [],
		];
		const current = sourceModeOf(this.target.hitLocation);

		return html`
			<div class="tabs" role="group" aria-label="Segment">
				${ modes.map(mode => html`
					<button
						type="button"
						aria-pressed=${ String(mode === current) }
						@click=${ () => this.setSourceMode(mode) }
					>${ sourceLabels[mode] }</button>
				`) }
			</div>
		`;
	}

	private renderParameterControls(): TemplateResult | typeof nothing {
		const location = this.target.hitLocation;
		if (!location || location.source === 'constant')
			return nothing;

		const update = (patch: Partial<AchievementValueDraft>): void =>
			this.emit({ ...this.target, hitLocation: { ...location, ...patch } });

		return html`
			<label>
				<span>Parameter</span>
				<select
					.value=${ location.value }
					@change=${ (event: Event) => update({ value: (event.currentTarget as HTMLSelectElement).value }) }
				>
					${ this.numberParameters.map(parameter => html`
						<option value=${ parameter.key } ?selected=${ parameter.key === location.value }>{${ parameter.key }}</option>
					`) }
				</select>
			</label>
			${ location.source === 'board.leftNeighbor' || location.source === 'board.rightNeighbor'
				? html`
					<label>
						<span>Side</span>
						<select
							@change=${ (event: Event) => update({
								source: (event.currentTarget as HTMLSelectElement).value as AchievementValueDraft['source'],
							}) }
						>
							<option value="board.leftNeighbor" ?selected=${ location.source === 'board.leftNeighbor' }>Left</option>
							<option value="board.rightNeighbor" ?selected=${ location.source === 'board.rightNeighbor' }>Right</option>
						</select>
					</label>
				`
				: nothing }
			${ location.source === 'parameter.offset'
				? html`
					<label>
						<span>Offset</span>
						<input
							type="number"
							step="1"
							.value=${ String(location.offset ?? 0) }
							@change=${ (event: Event) => update({ offset: Number((event.currentTarget as HTMLInputElement).value) }) }
						/>
					</label>
				`
				: nothing }
		`;
	}

	override render(): TemplateResult {
		const context = hitTargetContexts[this.context];
		const zones = getTargetBoardZones(this.target, this.binding);
		const location = this.target.hitLocation;
		const preview = location && location.source !== 'constant' && this.binding
			? html`<span class="muted">with ${ location.value } = ${ String(this.binding[location.value] ?? '?') }</span>`
			: nothing;

		return html`
			<div class="picker">
				${ this.renderSourceTabs() }
				<div class="body">
					<aa-dartboard
						interactive
						label="Pick a segment"
						.zones=${ zones }
						@dartboard-pick=${ this.handlePick }
					></aa-dartboard>
					<div class="side">
						${ this.renderParameterControls() }
						<label>
							<span>Shorthand</span>
							<input
								class="shorthand"
								spellcheck="false"
								.value=${ this.shorthand }
								@input=${ (event: InputEvent) => {
									this.shorthand = (event.currentTarget as HTMLInputElement).value;
									this.shorthandError = '';
								} }
								@keydown=${ (event: KeyboardEvent) => {
									if (event.key === 'Enter') {
										event.preventDefault();
										this.applyShorthand();
									}
								} }
								@blur=${ () => {
									if (this.shorthand !== printTarget(this.target, this.context))
										this.applyShorthand();
								} }
							/>
						</label>
						${ this.shorthandError ? html`<span class="error" role="alert">${ this.shorthandError }</span>` : nothing }
					</div>
				</div>
				<div class="types" role="group" aria-label="Throw type">
					${ context.throwTypes.map(type => html`
						<button
							type="button"
							aria-pressed=${ String(type === this.target.throwType) }
							@click=${ () => this.setThrowType(type) }
						>${ typeLabels[type] }</button>
					`) }
				</div>
				<div class="footer">
					<span><b>${ describeTarget(this.target, this.binding) }</b> ${ preview }</span>
					<span class="actions">
						${ this.removable
							? html`
								<button type="button" class="link danger" @click=${ () => this.signal(hitTargetRemoveEventName) }>
									Remove step
								</button>
							`
							: nothing }
						<button type="button" class="done" @click=${ () => this.signal(hitTargetDoneEventName) }>Done</button>
					</span>
				</div>
			</div>
		`;
	}

	static override styles = unsafeCSS(hitTargetPickerStyles);

}

declare global {
	interface HTMLElementTagNameMap {
		'aa-hit-target-picker': AaHitTargetPicker;
	}
}
