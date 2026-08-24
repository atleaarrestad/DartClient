import { html, LitElement, unsafeCSS } from 'lit';
import { customElement, property } from 'lit/decorators.js';

import { User } from '../../models/schemas.js';
import { sharedStyles } from '../../styles/shared-styles.js';
import comboboxStyles from './aa-combobox-cmp.css?inline';

@customElement('aa-combobox')
export class AaCombobox extends LitElement {

	@property({ type: Array }) users: User[] = [];

	@property({ type: String })
	searchQuery: string = '';

	@property({ type: Number })
	selectedIndex: number = -1;

	@property({ type: Object })
	selectedUser: User | null = null;

	@property({ type: Boolean })
	isDropdownOpen: boolean = false;

	get filteredUsers() {
		if (!this.searchQuery)
			return this.users;


		const query = this.searchQuery.toLowerCase();

		return this.users.filter(
			user =>
				user.alias.toLowerCase().includes(query)
				|| user.name.toLowerCase().includes(query),
		);
	}

	private handleUserSelect(user: User) {
		this.selectedUser = user;
		this.selectedIndex = this.filteredUsers.indexOf(user);
		this.isDropdownOpen = false;
		this.dispatchEvent(new CustomEvent('user-selected', { detail: user }));
	}

	private handleKeyDown(event: KeyboardEvent) {
		const userCount = this.filteredUsers.length;
		if (event.key === 'ArrowDown') {
			this.isDropdownOpen = true;
			if (this.selectedIndex < userCount - 1)
				this.selectedIndex++;
		}
		else if (event.key === 'ArrowUp') {
			if (this.selectedIndex > 0)
				this.selectedIndex--;
		}
		else if (event.key === 'Enter') {
			if (this.selectedIndex >= 0)
				this.handleUserSelect(this.filteredUsers[this.selectedIndex]!);

			else if (userCount === 1)
				this.handleUserSelect(this.filteredUsers[0]!);
		}

		this.scrollSelectedItemIntoView();
	}

	private scrollSelectedItemIntoView() {
		const listItems = this.shadowRoot?.querySelectorAll('.user-option');
		if (listItems && listItems[this.selectedIndex]) {
			(listItems[this.selectedIndex] as HTMLElement).scrollIntoView({
				behavior: 'instant',
				block:    'nearest',
			});
		}
	}

	private handleSearchChange(event: Event) {
		const input = event.target as HTMLInputElement;
		this.searchQuery = input.value;
		this.selectedIndex = -1;
		this.isDropdownOpen = true;
	}

	private handleInputFocus() {
		this.isDropdownOpen = true;
	}

	private handleInputBlur() {
		if (!this.shadowRoot?.activeElement?.closest('.user-list'))
			this.isDropdownOpen = false;
	}

	override focus(options?: FocusOptions): void {
		this.renderRoot.querySelector('input')?.focus(options);
	}

	override render() {
		return html`
			<div class="combobox-container">
				<input
					type="text"
					placeholder="Search users..."
					.value="${ this.selectedUser ? `${ this.selectedUser.alias }` : this.searchQuery }"
					@input="${ this.handleSearchChange }"
					@keydown="${ this.handleKeyDown }"
					@focus="${ this.handleInputFocus }"
					@blur="${ this.handleInputBlur }"
				/>
				${ this.isDropdownOpen
					? html`
					<ul class="user-list" tabindex="-1">
						${ this.filteredUsers.map(
							(user, index) => html`
								<li
									class="user-option ${ this.selectedIndex === index ? 'selected' : '' }"
									@click="${ () => this.handleUserSelect(user) }"
								>
									${ user.alias } ${ user.seasonStatistics?.length > 0 ? `- ${ user.seasonStatistics.at(-1)?.mmr }` : '' }
								</li>
						`,
						) }
					</ul>
					`
					: '' }
			</div>
    	`;
	}

	static override styles = [
		sharedStyles,
		unsafeCSS(comboboxStyles),
	];

}
