import { html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import { sharedStyles } from "../../../styles.js";

import { LitElement } from "lit";
import { DataService } from "../../services/dataService.js";
import { NotificationService } from "../../services/notificationService.js";
import { container } from "tsyringe";

import { User } from "../../models/userSchema.js";

import "../aa-player-cmp.js"
import "../aa-button-cmp.js";

@customElement("index-page")
export class IndexPage extends LitElement {
  private dataService: DataService;
  private notificationService: NotificationService;

  @property({ type: String }) mydata = "";
  @property({ type: Array }) players : User[] = [];

  constructor() {
    super();
    this.dataService = container.resolve(DataService);
    this.notificationService = container.resolve(NotificationService);
  }

  public override connectedCallback(): void {
    this.healthCheckServer();
    this.dataService.GetAllUsers()
      .then(users => {
        debugger;
        this.players = users!;
      })
      .catch(error => {
        this.notificationService.addNotification(error, "danger")
      });
      
    super.connectedCallback();
  }
  
  
  private async healthCheckServer(): Promise<void> {
    this.dataService.Ping().catch(error => this.notificationService.addNotification(error, "danger"));
  }
  private async LoadPlayers(): Promise<void> {
    const users = await this.dataService.GetAllUsers();
    if (users) {
      this.players = users;
      this.mydata = this.players[0]!.name;
    } else {
      this.players = [];
    }
    this.requestUpdate();
    this.notificationService.addNotification("test success", "success");
    this.notificationService.addNotification("test danger", "danger");
    this.notificationService.addNotification("test info", "info");
    this.notificationService.addNotification("Could not parse user model from server! shieeet", "danger");
  }

  override render() {
    return html`
      <aa-button @click="${this.LoadPlayers}">get all users</aa-button>
      <h4>Server responze: ${this.mydata}</h4>
      <player-container>
        <aa-player name="Kreegsoffer"></aa-player>
        <aa-player name="Kreegsoffer"></aa-player>
        <aa-player name="Kreegsoffer"></aa-player>

      </player-container>
    `;
  }

  static override styles = [sharedStyles, css`
    :host {
        
    }
    player-container {

      display: flex;
      place-items: center;
      place-content: center;
      flex-grow: 1;
    }
      
      `];
}
