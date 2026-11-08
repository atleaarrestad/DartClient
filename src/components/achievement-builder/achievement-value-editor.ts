import { html, nothing, TemplateResult } from 'lit';

import type {
	AchievementParameterDraft,
	AchievementValueDraft,
	AchievementValueSource,
} from '../../models/achievementBuilder.js';
import {
	BuilderScope,
	canUseParameterAs,
	getAvailableValueSources,
	isParameterValueSource,
	ValueEditorRole,
	valueSources,
} from './achievement-draft.js';

const getValueEditorChoice = (value: AchievementValueDraft): string =>
	isParameterValueSource(value.source)
		? `${ value.source }:${ value.value }`
		: value.source;

const parseValueEditorChoice = (
	choice: string,
	current: AchievementValueDraft,
): AchievementValueDraft => {
	const separator = choice.indexOf(':');
	if (separator < 0) {
		// A number starts at 0 unless it already was one; a parameter key is not a number.
		const keepsNumber = choice === 'constant' && current.source === 'constant' && current.value;

		return {
			source: choice as AchievementValueSource,
			value:  keepsNumber ? current.value : choice === 'constant' ? '0' : '',
		};
	}

	const source = choice.slice(0, separator) as AchievementValueSource;
	const value = choice.slice(separator + 1);
	if (source !== 'parameter.offset')
		return { source, value };

	const keepsOffset = current.source === source && current.value === value;

	return { source, value, offset: keepsOffset ? current.offset ?? 1 : 1 };
};

interface ValueEditorOptions {
	value:        AchievementValueDraft;
	parameters:   AchievementParameterDraft[];
	scope:        BuilderScope;
	role?:        ValueEditorRole;
	/** Only number parameters fit; comparisons also take text and yes/no parameters. */
	numericOnly?: boolean;
	onChange:     (value: AchievementValueDraft) => void;
}

export const renderValueEditor = ({
	value,
	parameters,
	scope,
	role = 'hit-location',
	numericOnly = true,
	onChange,
}: ValueEditorOptions): TemplateResult => {
	const available = getAvailableValueSources(scope, role);
	const fixedSources = valueSources.filter(source =>
		available.includes(source.value) && !isParameterValueSource(source.value));
	// The current choice stays listed even when it doesn't fit, so the select still shows it.
	const parametersFor = (source: AchievementValueSource): AchievementParameterDraft[] =>
		parameters.filter(parameter => canUseParameterAs(parameter, source, numericOnly)
			|| (value.source === source && value.value === parameter.key));
	const directParameters = parametersFor('parameter');
	const offsetParameters = parametersFor('parameter.offset');
	const neighborParameters = parameters.filter(parameter =>
		canUseParameterAs(parameter, 'board.leftNeighbor', numericOnly)
		|| (value.value === parameter.key
			&& (value.source === 'board.leftNeighbor' || value.source === 'board.rightNeighbor')));

	return html`
		<div class="value-editor">
			<select
				aria-label="Value"
				.value=${ getValueEditorChoice(value) }
				@change=${ (event: Event) => onChange(parseValueEditorChoice(
					(event.currentTarget as HTMLSelectElement).value,
					value,
				)) }
			>
				${ fixedSources.map(source => html`
					<option value=${ source.value }>${ source.label }</option>
				`) }
				${ directParameters.length > 0
					? html`
						<optgroup label="Achievement values">
							${ directParameters.map(parameter => html`
								<option value=${ `parameter:${ parameter.key }` }>
									${ parameter.key }
								</option>
							`) }
						</optgroup>
					`
					: nothing }
				${ offsetParameters.length > 0 || neighborParameters.length > 0
					? html`
						<optgroup label="Adjusted achievement values">
							${ offsetParameters.map(parameter => html`
								<option value=${ `parameter.offset:${ parameter.key }` }>
									${ parameter.key } with offset
								</option>
							`) }
						</optgroup>
						<optgroup label="Dartboard neighbors">
							${ neighborParameters.map(parameter => html`
								<option value=${ `board.leftNeighbor:${ parameter.key }` }>
									Left of ${ parameter.key }
								</option>
								<option value=${ `board.rightNeighbor:${ parameter.key }` }>
									Right of ${ parameter.key }
								</option>
							`) }
						</optgroup>
					`
					: nothing }
			</select>
			${ value.source === 'constant'
				? html`
					<input
						type="number"
						step="1"
						aria-label="Number"
						.value=${ value.value }
						@input=${ (event: InputEvent) => onChange({
							...value,
							value: (event.currentTarget as HTMLInputElement).value,
						}) }
					/>
				`
				: nothing }
			${ value.source === 'parameter.offset'
				? html`
					<input
						type="number"
						step="1"
						aria-label="Parameter offset"
						.value=${ String(value.offset ?? 1) }
						@input=${ (event: InputEvent) => onChange({
							...value,
							offset: Number((event.currentTarget as HTMLInputElement).value),
						}) }
					/>
				`
				: nothing }
		</div>
	`;
};
