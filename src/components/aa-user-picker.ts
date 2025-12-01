import { css, html, LitElement, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { when } from 'lit/directives/when.js';

import { User } from '../models/schemas.js';
import { sharedStyles } from '../styles.js';

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
		<div class="empty">No users match “${ this.query }”.</div>
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
		css`
		:host {
			display: block;
			position: relative;
			width: 400px;
			font-size: 1.5em;
		}
		.field {
			margin-bottom: 0.5em;
		}
		input[type="search"] {
			width: 100%;
			box-sizing: border-box;
			padding: 0.5em 0.75em;
			font-size: 1em;
			border: 2px solid black;
			border-right-width: 3px;
			border-bottom-width: 3px;
			border-radius: 12px;
			outline: none;
		}
		ul {
			list-style: none;
			margin: 0;
			padding: 1px;
			max-height: 50vh;
			overflow: auto;
			border: 1px solid #ddd;
			border-radius: 8px;
			background: white;
			display:grid;
			grid-auto-rows: max-content;
		}
		li {
			border-bottom: 1px solid #eee;
		}
		li:last-child {
			border-bottom: none;
		}
		.row {
			width: 100%;
			display: flex;
			justify-content: space-between;
			gap: 0.5em;
			align-items: center;
			padding: 0.5em 0.75em;
			text-align: left;
			background: transparent;
			border: 0;
			cursor: pointer;
			font-size: 0.95em;
		}
		.row:hover,
		li[aria-selected="true"] > .row {
			background: #e5e4e4;
			outline: 2px solid rgb(0, 0, 0, 0.5);
			border-radius: 8px;
		}
		.alias {
			opacity: 0.7;
			font-size: 0.9em;
		}
		.empty {
			padding: 0.75em;
			color: #666;
			border: 1px solid #ddd;
			border-radius: 8px;
			background: #fafafa;
		}
		`,
	];

}
