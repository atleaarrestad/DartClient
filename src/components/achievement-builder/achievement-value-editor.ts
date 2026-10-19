import { html, nothing, TemplateResult } from 'lit';

import type {
	AchievementParameterDraft,
	AchievementValueDraft,
	AchievementValueSource,
} from '../../models/achievementBuilder.js';
import {
	BuilderScope,
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
		return {
			source: choice as AchievementValueSource,
			value:  choice === 'constant' ? current.value || '0' : '',
		};
	}

	const source = choice.slice(0, separator) as AchievementValueSource;
	const value = choice.slice(separator + 1);
	if (source !== 'parameter.offset')
		return { source, value };

	const keepsOffset = current.source === source && current.value === value;

	return { source, value, offset: keepsOffset ? current.offset ?? 1 : 1 };
};

export interface ValueEditorOptions {
	value:      AchievementValueDraft;
	parameters: AchievementParameterDraft[];
	scope:      BuilderScope;
	role?:      ValueEditorRole;
	onChange:   (value: AchievementValueDraft) => void;
}

export const renderValueEditor = ({
	value,
	parameters,
	scope,
	role = 'hit-location',
	onChange,
}: ValueEditorOptions): TemplateResult => {
	const available = getAvailableValueSources(scope, role);
	const fixedSources = valueSources.filter(source =>
		available.includes(source.value) && !isParameterValueSource(source.value));
	const integerParameters = parameters.filter(parameter => parameter.valueType === 'integer');

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
				${ parameters.length > 0
					? html`
						<optgroup label="Achievement values">
							${ parameters.map(parameter => html`
								<option value=${ `parameter:${ parameter.key }` }>
									${ parameter.key }
								</option>
							`) }
						</optgroup>
						<optgroup label="Adjusted achievement values">
							${ integerParameters.map(parameter => html`
								<option value=${ `parameter.offset:${ parameter.key }` }>
									${ parameter.key } with offset
								</option>
							`) }
						</optgroup>
						<optgroup label="Dartboard neighbors">
							${ integerParameters.map(parameter => html`
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
