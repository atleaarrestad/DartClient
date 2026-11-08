import { html, nothing, TemplateResult } from 'lit';

import type {
	AchievementParameterDraft,
	AchievementValueDraft,
	AchievementValueSource,
} from '../../../models/achievementBuilder.js';
import {
	BuilderScope,
	canUseParameterAs,
	getAvailableValueSources,
	isParameterValueSource,
	ValueEditorRole,
	valueSources,
} from '../achievement-draft.js';

interface ValueChipOptions {
	value:        AchievementValueDraft;
	parameters:   readonly AchievementParameterDraft[];
	scope:        BuilderScope;
	role:         ValueEditorRole;
	label:        string;
	/** Counts need numbers; comparisons also take text and yes/no parameters. */
	numericOnly?: boolean;
	onChange:     (value: AchievementValueDraft) => void;
}

/** A select option value: the source, plus the parameter key for parameter forms. */
const choiceOf = (value: AchievementValueDraft): string =>
	isParameterValueSource(value.source) ? `${ value.source }:${ value.value }` : value.source;

const valueOfChoice = (choice: string, current: AchievementValueDraft): AchievementValueDraft => {
	const separator = choice.indexOf(':');
	if (separator < 0) {
		const source = choice as AchievementValueSource;
		if (source === 'constant')
			return { source, value: current.source === 'constant' ? current.value : '0' };

		return { source, value: '' };
	}

	const source = choice.slice(0, separator) as AchievementValueSource;
	const key = choice.slice(separator + 1);

	return source === 'parameter.offset' || source === 'parameter.ladder'
		? { source, value: key, offset: current.source === source ? current.offset ?? 1 : 1 }
		: { source, value: key };
};

/**
 * A value as a chip-sized select (number, round or game value, or a parameter form) with an
 * inline number field for numbers and offsets. Only sources valid in the scope are offered.
 */
export const renderValueChip = ({
	value,
	parameters,
	scope,
	role,
	label,
	numericOnly = true,
	onChange,
}: ValueChipOptions): TemplateResult => {
	const available = getAvailableValueSources(scope, role);
	const fields = valueSources.filter(source =>
		available.includes(source.value) && !isParameterValueSource(source.value) && source.value !== 'constant');
	const fits = (parameter: AchievementParameterDraft, source: AchievementValueSource): boolean =>
		canUseParameterAs(parameter, source, numericOnly)
		|| (value.source === source && value.value === parameter.key);
	const choice = choiceOf(value);

	return html`
		<span class="value-chip">
			<select
				class="chip-select"
				aria-label=${ label }
				@change=${ (event: Event) => onChange(valueOfChoice((event.currentTarget as HTMLSelectElement).value, value)) }
			>
				<option value="constant" ?selected=${ choice === 'constant' }>a number</option>
				${ parameters.filter(parameter => fits(parameter, 'parameter')).map(parameter => html`
					<option value=${ `parameter:${ parameter.key }` } ?selected=${ choice === `parameter:${ parameter.key }` }>
						{${ parameter.key }}
					</option>
				`) }
				${ parameters.filter(parameter => fits(parameter, 'parameter.offset')).map(parameter => html`
					<option
						value=${ `parameter.offset:${ parameter.key }` }
						?selected=${ choice === `parameter.offset:${ parameter.key }` }
					>{${ parameter.key }} + offset</option>
				`) }
				${ parameters.filter(parameter => fits(parameter, 'parameter.ladder')).map(parameter => html`
					<option
						value=${ `parameter.ladder:${ parameter.key }` }
						?selected=${ choice === `parameter.ladder:${ parameter.key }` }
						title="Steps along 1–20, 25, 50"
					>{${ parameter.key }} along the ladder</option>
				`) }
				${ parameters.filter(parameter => fits(parameter, 'board.leftNeighbor')).flatMap(parameter =>
					([ [ 'board.leftNeighbor', 'left' ], [ 'board.rightNeighbor', 'right' ] ] as const).map(([ source, side ]) => html`
						<option value=${ `${ source }:${ parameter.key }` } ?selected=${ choice === `${ source }:${ parameter.key }` }>
							${ side } of {${ parameter.key }}
						</option>
					`)) }
				${ fields.length > 0
					? html`
						<optgroup label=${ scope === 'round' ? 'This round' : 'This game' }>
							${ fields.map(source => html`
								<option value=${ source.value } ?selected=${ choice === source.value }>
									${ source.label.toLowerCase() }
								</option>
							`) }
						</optgroup>
					`
					: nothing }
			</select>
			${ value.source === 'constant'
				? html`
					<input
						class="chip-number"
						type="number"
						step="1"
						aria-label=${ `${ label } number` }
						.value=${ value.value }
						@change=${ (event: Event) => onChange({ ...value, value: (event.currentTarget as HTMLInputElement).value }) }
					/>
				`
				: nothing }
			${ value.source === 'parameter.offset' || value.source === 'parameter.ladder'
				? html`
					<input
						class="chip-number"
						type="number"
						step="1"
						aria-label=${ `${ label } ${ value.source === 'parameter.ladder' ? 'ladder steps' : 'offset' }` }
						.value=${ String(value.offset ?? 0) }
						@change=${ (event: Event) => onChange({
							...value,
							offset: Number((event.currentTarget as HTMLInputElement).value),
						}) }
					/>
				`
				: nothing }
		</span>
	`;
};
