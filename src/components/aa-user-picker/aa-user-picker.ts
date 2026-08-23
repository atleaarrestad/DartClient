import '../../ui/empty-state/aa-empty-state.js';

import { html, LitElement, type PropertyValues, unsafeCSS } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { when } from 'lit/directives/when.js';

import { User } from '../../models/schemas.js';
import { sharedStyles } from '../../styles/shared-styles.js';
import userPickerStyles from './aa-user-picker.css?inline';

@customElement('aa-user-picker')
export class AaUserPicker extends LitElement {

	@property({ type: Array }) users: User[] = [];

	@state() private query = '';
	@state() private activeIndex = 0;

	override firstUpdated(changedProperties: PropertyValues): void {
		super.firstUpdated(changedProperties);

		const input = this.renderRoot.querySelector('input[type="search"]') as HTMLInputElement | null;
		input?.focus();
	}

	private get filtered(): User[] {
		const q = this.query.trim().toLowerCase();
		if (!q)
			return this.users;

		return this.users.filter(
			(u) =>
				u.name.toLowerCase().includes(q) ||
        (u.alias ? u.alias.toLowerCase().includes(q) : false),
		);
	}

	private onInput(e: Event) {
		this.query = (e.target as HTMLInputElement).value;
		this.activeIndex = 0;
	}

	private onKeyDown(e: KeyboardEvent) {
		const items = this.filtered;
		if (!items.length)
			return;

		if (e.key === 'ArrowDown') {
			e.preventDefault();
			this.activeIndex = Math.min(this.activeIndex + 1, items.length - 1);
			this.updateComplete.then(() => this.scrollActiveIntoView());
		}
		else if (e.key === 'ArrowUp') {
			e.preventDefault();
			this.activeIndex = Math.max(this.activeIndex - 1, 0);
			this.updateComplete.then(() => this.scrollActiveIntoView());
		}
		else if (e.key === 'Enter') {
			e.preventDefault();
			const sel = items[this.activeIndex];
			if (sel)
				this.select(sel);
		}
	}

	private onMouseMove(i: number) {
		if (this.activeIndex !== i)
			this.activeIndex = i;
	}

	private select(user: User) {
		this.dispatchEvent(
			new CustomEvent<User>('user-selected', {
				detail:   user,
				bubbles:  true,
				composed: true,
			}),
		);
	}

	private scrollActiveIntoView() {
		const list = this.renderRoot.querySelector('ul');
		const active = list?.querySelector<HTMLLIElement>('li[aria-selected="true"]');
		active?.scrollIntoView({ block: 'nearest' });
	}

	override render(): unknown {
		const items = this.filtered;

		return html`
      <div class="field">
        <input
          type="search"
          placeholder="Search users…"
          aria-label="Search users"
          @input=${ this.onInput }
          @keydown=${ this.onKeyDown }
        />
      </div>

      ${ when(items.length === 0, () => html`
		<aa-empty-state compact>No users match “${ this.query }”.</aa-empty-state>
		`, () => html`
		<ul role="listbox" aria-activedescendant="opt-${ this.activeIndex }">
			${ items.map(
				(u, i) => html`
				<li
					id="opt-${ i }"
					aria-selected=${ i === this.activeIndex }
					@mousemove=${ () => this.onMouseMove(i) }
				>
					<button class="row" @click=${ () => this.select(u) }>
						<span class="name">${ u.name }</span>
						${ u.alias ? html`<span class="alias">@${ u.alias }</span>` : null }
					</button>
				</li>
				`,
			) }
		</ul>
		`) }
    `;
	}

	static override styles = [
		sharedStyles,
		unsafeCSS(userPickerStyles),
	];

}
