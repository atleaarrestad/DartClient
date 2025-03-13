import { html, css, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { sharedStyles } from "../../styles.js"; // Adjust import based on your project setup
import { User } from '../models/userSchema.js'; // Adjust the import according to your actual file structure

@customElement("aa-combobox")
export class AaCombobox extends LitElement {
  @property({ type: Array })
  users: User[] = [
    { alias: "kristoffer", name: "kristoffer", id: "toto", seasonStatistics: [] },
    { alias: "atle", name: "atle", id: "toto2", seasonStatistics: [] },
    { alias: "frisbeeguden", name: "frisbeeguden", id: "toto3", seasonStatistics: [] },
    { alias: "ikkjeroenlie", name: "ikkjeroenlie", id: "toto4", seasonStatistics: [] },
    { alias: "kristoffer", name: "kristoffer", id: "toto", seasonStatistics: [] },
    { alias: "atle", name: "atle", id: "toto2", seasonStatistics: [] },
    { alias: "frisbeeguden", name: "frisbeeguden", id: "toto3", seasonStatistics: [] },
    { alias: "ikkjeroenlie", name: "ikkjeroenlie", id: "toto4", seasonStatistics: [] },
    { alias: "kristoffer", name: "kristoffer", id: "toto", seasonStatistics: [] },
    { alias: "atle", name: "atle", id: "toto2", seasonStatistics: [] },
    { alias: "frisbeeguden", name: "frisbeeguden", id: "toto3", seasonStatistics: [] },
    { alias: "ikkjeroenlie", name: "ikkjeroenlie", id: "toto4", seasonStatistics: [] },
    { alias: "kristoffer", name: "kristoffer", id: "toto", seasonStatistics: [] },
    { alias: "atle", name: "atle", id: "toto2", seasonStatistics: [] },
    { alias: "frisbeeguden", name: "frisbeeguden", id: "toto3", seasonStatistics: [] },
    { alias: "ikkjeroenlie", name: "ikkjeroenlie", id: "toto4", seasonStatistics: [] },
    { alias: "kristoffer", name: "kristoffer", id: "toto", seasonStatistics: [] },
    { alias: "atle", name: "atle", id: "toto2", seasonStatistics: [] },
    { alias: "frisbeeguden", name: "frisbeeguden", id: "toto3", seasonStatistics: [] },
    { alias: "ikkjeroenlie", name: "ikkjeroenlie", id: "toto4", seasonStatistics: [] },
  ];

  @property({ type: String })
  searchQuery: string = "";

  @property({ type: Number })
  selectedIndex: number = -1;

  @property({ type: Object })
  selectedUser: User | null = null;

  @property({ type: Boolean })
  isDropdownOpen: boolean = false; // Controls visibility of the dropdown

  // Filtered users based on search query
  get filteredUsers() {
    if (!this.searchQuery) {
      return this.users;
    }

    const query = this.searchQuery.toLowerCase();
    return this.users.filter(
      (user) =>
        user.alias.toLowerCase().includes(query) ||
        user.name.toLowerCase().includes(query)
    );
  }

  // Handle user selection from the list
  private handleUserSelect(user: User) {
    this.selectedUser = user;
    this.selectedIndex = this.filteredUsers.indexOf(user);
    this.isDropdownOpen = false; // Close the dropdown on selection
    this.dispatchEvent(new CustomEvent("user-selected", { detail: user }));
  }

  // Handle keyboard events for navigation
  private handleKeyDown(event: KeyboardEvent) {
    const userCount = this.filteredUsers.length;
    if (event.key === "ArrowDown") {
      if (this.selectedIndex < userCount - 1) {
        this.selectedIndex++;
      }
    } else if (event.key === "ArrowUp") {
      if (this.selectedIndex > 0) {
        this.selectedIndex--;
      }
    } else if (event.key === "Enter" && this.selectedIndex >= 0) {
      this.handleUserSelect(this.filteredUsers[this.selectedIndex]!);
    }

    // After selection or navigation, ensure the selected item is visible
    this.scrollSelectedItemIntoView();
  }

  // Scroll the selected item into view
  private scrollSelectedItemIntoView() {
    const listItems = this.shadowRoot?.querySelectorAll('.user-option');
    if (listItems && listItems[this.selectedIndex]) {
      (listItems[this.selectedIndex] as HTMLElement).scrollIntoView({
        behavior: 'instant',
        block: 'nearest', // Ensures the item scrolls into view
      });
    }
  }

  // Handle input change for the search functionality
  private handleSearchChange(event: Event) {
    const input = event.target as HTMLInputElement;
    this.searchQuery = input.value;
    this.selectedIndex = -1; // Reset the selected index when searching
    this.isDropdownOpen = true; // Open the dropdown when typing starts
  }

  // Handle input focus
  private handleInputFocus() {
    this.isDropdownOpen = true; // Open dropdown on focus
  }

  // Handle input blur (optional if you want to close on blur)
  private handleInputBlur() {
    setTimeout(() => {
      // Delay to allow clicks to register, then close
      if (!this.shadowRoot?.activeElement?.closest('.user-list')) {
        this.isDropdownOpen = false;
      }
    }, 200);
  }

  // Render the combobox UI
  override render() {
    return html`
      <div class="combobox-container">
        <input
          type="text"
          placeholder="Search users..."
          .value="${this.selectedUser ? this.selectedUser.alias : this.searchQuery}"
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
                      ${user.alias}
                    </li>
                  `
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
      }

      .user-list {
        list-style-type: none;
        margin: 0;
        padding: 0;
        max-height: 30vh; /* 30% of the screen height */
        height: fit-content;
        overflow-y: auto; /* Allow scrolling */
        border: 1px solid #ccc;
        border-top: none;
        position: absolute;
        top: 100%;
        width: 100%;
        background-color: white;
        box-shadow: 0 0 5px rgba(0, 0, 0, 0.2);
        z-index: 10;
        background-color: white; /* Ensure consistent background */
      }

      .user-option {
        height: max-content;
        padding: 8px;
        cursor: pointer;
        background-color: white; /* Ensure consistent background */
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
