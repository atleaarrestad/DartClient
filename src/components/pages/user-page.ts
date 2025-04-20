import { html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { sharedStyles } from "../../../styles.js";
import { LitElement } from "lit";
import { NotificationService } from "../../services/notificationService.js";
import { DialogService } from "../../services/dialogService.js";
import { container } from "tsyringe";
import { User } from "../../models/schemas.js";
import { getRankDisplayValue, getRankIcon } from "../../models/rank.js";
import { SeasonService } from "../../services/seasonService.js";
import { UserService } from "../../services/userService.js";
import { Season } from "../../models/schemas.js";
import type { Location } from "@vaadin/router"; // ← import the type

@customElement("user-page")
export class UserPage extends LitElement {
	private seasonService: SeasonService;
	private notificationService: NotificationService;
	private dialogService: DialogService;
	private userService: UserService;
	private user?: User;
	@state() private userId!: string;
	@state() private season?: Season;

	@property({ type: Array }) users: User[] = [];

	constructor() {
		super();
		this.userService = container.resolve(UserService);
		this.notificationService = container.resolve(NotificationService);
		this.seasonService = container.resolve(SeasonService);
		this.dialogService = container.resolve(DialogService);
	}

	public onBeforeEnter(location: Location): void {
		this.userId = location.params.id!;
	}

	public override async connectedCallback(): Promise<void> {
		super.connectedCallback();
		this.user = await this.userService.getUserWithHistoricData(this.userId);
		this.season = await this.seasonService.getCurrentSeason();
	}

	private editUser(user: User): void {
		// TODO: implement the edit dialog or navigation
		this.dialogService.open("editUserTemplate", { user });
	}

	override render() {
		if (!this.season || this.user === undefined) {
			return html`<p>Loading data…</p>`;
		}

		return html`
      		is loaded yo
    `;
	}

	static override styles = [
		sharedStyles,
		css`
      .users-table {
        width: 100%;
        border-collapse: collapse;
      }
      .users-table th,
      .users-table td {
        padding: 0.5rem;
        border: 1px solid var(--border-color, #ccc);
        text-align: left;
      }
	  .users-table th:nth-child(4),
      .users-table td:nth-child(4) {
        text-align: center;

      }
      .users-table img {
        width: 1.5rem;
        height: 1.5rem;
      }
      button {
        padding: 0.25rem 0.5rem;
        border: none;
        background-color: var(--button-bg, #007bff);
        color: white;
        border-radius: 0.25rem;
        cursor: pointer;
      }
      button:hover {
        background-color: var(--button-bg-hover, #0056b3);
      }
	  .users-table tbody tr:nth-child(even) {
		  background-color: var(--row-even-bg, #f9f9f9);
		}
		.users-table tbody tr:hover {
		  background-color: #e5fbe7;
		}
	  .users-table tbody tr {
        cursor: pointer;
      }
	  
    `,
	];
}
