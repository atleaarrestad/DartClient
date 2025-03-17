import { html, css, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { sharedStyles } from "../../styles.js";
import { User } from "../models/userSchema.js";

@customElement("aa-combobox")
export class AaCombobox extends LitElement {
	@property({ type: Array }) users: User[] = [];

	@property({ type: String })
	searchQuery: string = "";

	@property({ type: Number })
	selectedIndex: number = -1;

	@property({ type: Object })
	selectedUser: User | null = null;

	@property({ type: Boolean })
	isDropdownOpen: boolean = false;

	get filteredUsers() {
		if (!this.searchQuery) {
			return this.users;
		}

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
		this.dispatchEvent(new CustomEvent("user-selected", { detail: user }));
	}

	private handleKeyDown(event: KeyboardEvent) {
		const userCount = this.filteredUsers.length;
		if (event.key === "ArrowDown") {
			this.isDropdownOpen = true;
			if (this.selectedIndex < userCount - 1) {
				this.selectedIndex++;
			}
		}
		else if (event.key === "ArrowUp") {
			if (this.selectedIndex > 0) {
				this.selectedIndex--;
			}
		}
		else if (event.key === "Enter" && this.selectedIndex >= 0) {
			this.handleUserSelect(this.filteredUsers[this.selectedIndex]!);
		}

		this.scrollSelectedItemIntoView();
	}

	private scrollSelectedItemIntoView() {
		const listItems = this.shadowRoot?.querySelectorAll(".user-option");
		if (listItems && listItems[this.selectedIndex]) {
			(listItems[this.selectedIndex] as HTMLElement).scrollIntoView({
				behavior: "instant",
				block: "nearest",
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
		setTimeout(() => {
			if (!this.shadowRoot?.activeElement?.closest(".user-list")) {
				this.isDropdownOpen = false;
			}
		}, 200);
	}

	override render() {
		return html`
      <div class="combobox-container">
        <input
          type="text"
          placeholder="Search users..."
          .value="${this.selectedUser ? `${this.selectedUser.alias}` : this.searchQuery}"
          @input="${this.handleSearchChange}"
          @keydown="${this.handleKeyDown}"
          @focus="${this.handleInputFocus}"
          @blur="${this.handleInputBlur}"
        />
        ${this.isDropdownOpen
			? html`
              <ul class="user-list">
                ${this.filteredUsers.map(
					(user, index) => html`
                    <li
                      class="user-option ${this.selectedIndex === index ? "selected" : ""}"
                      @click="${() => this.handleUserSelect(user)}"
                    >
                      ${user.alias} ${user.seasonStatistics?.length > 0 ? `- ${user.seasonStatistics.at(-1)?.mmr}` : ""}
                    </li>
                  `,
				)}
              </ul>
            `
			: ""}
      </div>
    `;
	}

	static override styles = [
		sharedStyles,
		css`
      :host {
        display: block;
        position: relative;
        width: 200px;
      }

      .combobox-container {
        position: relative;
      }

      input {
        width: 100%;
        padding: 8px;
        border: 1px solid #ccc;
        border-radius: 4px;
        font-size: 14px;
        text-align: center;
        background-color: rgba(0, 0, 0, 0);
        border: unset;
        font-size: 24px;
      }

      .user-list {
        list-style-type: none;
        margin: 0;
        padding: 0;
        max-height: 35vh;
        height: fit-content;
        overflow-y: auto;
        border: 1px solid #ccc;
        border-top: none;
        position: absolute;
        top: 100%;
        width: 100%;
        background-color: white;
        box-shadow: 0 0 5px rgba(0, 0, 0, 0.2);
        z-index: 10;
        background-color: white;
      }

      .user-option {
        height: max-content;
        padding: 8px;
        cursor: pointer;
        background-color: white;
      }

      .user-option.selected {
        background-color: #d3e4f1;
      }

      .user-option:hover {
        background-color: #f1f1f1;
      }
    `,
	];
}
