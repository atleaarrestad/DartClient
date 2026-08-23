import '../../ui/form-field/aa-form-field.js';

import { html, LitElement, TemplateResult, unsafeCSS } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import { sharedStyles } from '../../styles/shared-styles.js';
import seasonBasicsEditorStyles from './season-basics-editor.css?inline';

export interface SeasonBasicsValue {
	name:      string;
	startDate: Date;
	endDate:   Date;
	goal:      number;
}

export type SeasonBasicsChangeDetail = {
	[Field in keyof SeasonBasicsValue]: {
		field: Field;
		value: SeasonBasicsValue[Field];
	};
}[keyof SeasonBasicsValue];

export type SeasonBasicsChangeEvent = CustomEvent<SeasonBasicsChangeDetail>;

export const seasonBasicsChangeEventName = 'season-basics-change';

@customElement('aa-season-basics-editor')
export class SeasonBasicsEditor extends LitElement {

	@property({ attribute: false }) value: SeasonBasicsValue = {
		name:      '',
		startDate: new Date(0),
		endDate:   new Date(0),
		goal:      1,
	};

	private emitChange<Field extends keyof SeasonBasicsValue>(
		field: Field,
		value: SeasonBasicsValue[Field],
	): void {
		this.dispatchEvent(new CustomEvent<SeasonBasicsChangeDetail>(
			seasonBasicsChangeEventName,
			{
				detail:   { field, value } as SeasonBasicsChangeDetail,
				bubbles:  true,
				composed: true,
			},
		));
	}

	private emitDateChange(field: 'startDate' | 'endDate', value: string): void {
		const date = new Date(value);
		if (!Number.isNaN(date.getTime()))
			this.emitChange(field, date);
	}

	private toDateTimeLocal(date: Date): string {
		const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);

		return localDate.toISOString().slice(0, 16);
	}

	reportValidity(): boolean {
		for (const input of this.renderRoot.querySelectorAll('input')) {
			if (!input.reportValidity())
				return false;
		}

		return true;
	}

	override render(): TemplateResult {
		return html`
			<section class="editor-section">
				<div class="field-grid">
					<aa-form-field label="Name">
						<input
							type="text"
							.value=${ this.value.name }
							@input=${ (event: InputEvent) =>
								this.emitChange(
									'name',
									(event.currentTarget as HTMLInputElement).value,
								) }
							required
						/>
					</aa-form-field>

					<aa-form-field label="Starts">
						<input
							type="datetime-local"
							.value=${ this.toDateTimeLocal(this.value.startDate) }
							@input=${ (event: InputEvent) =>
								this.emitDateChange(
									'startDate',
									(event.currentTarget as HTMLInputElement).value,
								) }
							required
						/>
					</aa-form-field>

					<aa-form-field label="Ends">
						<input
							type="datetime-local"
							.value=${ this.toDateTimeLocal(this.value.endDate) }
							@input=${ (event: InputEvent) =>
								this.emitDateChange(
									'endDate',
									(event.currentTarget as HTMLInputElement).value,
								) }
							required
						/>
					</aa-form-field>

					<aa-form-field label="Game goal">
						<input
							type="number"
							min="1"
							step="1"
							.value=${ String(this.value.goal) }
							@input=${ (event: InputEvent) =>
								this.emitChange(
									'goal',
									Number((event.currentTarget as HTMLInputElement).value),
								) }
							required
						/>
					</aa-form-field>
				</div>
			</section>
		`;
	}

	static override styles = [
		sharedStyles,
		unsafeCSS(seasonBasicsEditorStyles),
	];

}

declare global {

	interface HTMLElementTagNameMap {
		'aa-season-basics-editor': SeasonBasicsEditor;
	}

	interface HTMLElementEventMap {
		'season-basics-change': SeasonBasicsChangeEvent;
	}

}
