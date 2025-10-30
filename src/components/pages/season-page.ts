import { html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { sharedStyles } from "../../../styles.js";
import { LitElement } from "lit";
import { NotificationService } from "../../services/notificationService.js";
import { DialogService } from "../../services/dialogService.js";
import { container } from "tsyringe";
import { User, SeasonStatistics, Season } from "../../models/schemas.js";
import { getRankDisplayValue, getRankIcon } from "../../models/rank.js";
import { SeasonService } from "../../services/seasonService.js";
import { UserService } from "../../services/userService.js";
import { Router } from "@vaadin/router";


@customElement("season-page")
export class SeasonPage extends LitElement {
	private notificationService: NotificationService;
	private dialogService: DialogService;
	private seasonService: SeasonService;
	private userService: UserService;

	@state() private season?: Season;
	@state() private users: User[] = [];

	constructor() {
		super();
		this.userService = container.resolve(UserService);
		this.notificationService = container.resolve(NotificationService);
		this.seasonService = container.resolve(SeasonService);
		this.dialogService = container.resolve(DialogService);
	}

	public override async connectedCallback(): Promise<void> {
		super.connectedCallback();
		this.season = await this.seasonService.getCurrentSeason();
	}

	private getStatsForCurrentSeason(user: User): SeasonStatistics {
		if (!user.seasonStatistics || user.seasonStatistics.length === 0) {
			return { id: 0, userId: user.id, seasonId: "", currentRank: undefined, highestAchievedRank: undefined, mmr: 0 } as unknown as SeasonStatistics;
		}
		if (this.season) {
			const match = user.seasonStatistics.find(s => s.seasonId === this.season!.id);
			if (match) {
				return match;
			}
		}
		return user.seasonStatistics.reduce((prev, curr) => curr.id > prev.id ? curr : prev);
	}

	

	override render() {
		return html`
			yo
    `;
	}

	static override styles = [
		sharedStyles,
		css`
      
    `,
	];
}
