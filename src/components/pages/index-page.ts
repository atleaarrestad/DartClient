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

  @property({ type: Array }) players : User[] = [];

  constructor() {
    super();
    this.dataService = container.resolve(DataService);
    this.notificationService = container.resolve(NotificationService);
  }

  public override connectedCallback(): void {
    this.healthCheckServer();
    this.LoadPlayers();
    super.connectedCallback();
  }
  
  
  private async healthCheckServer(): Promise<void> {
    this.dataService.Ping().catch(error => this.notificationService.addNotification(error, "danger"));
  }
  private async LoadPlayers(): Promise<void> {
    this.dataService.GetAllUsers()
        .then(users => {
            if (users) {
                this.players = [...users];
            } else {
                this.players = [];
            }
        })
        .catch(error => {
            this.notificationService.addNotification(error, "danger");
        });
}

  override render() {
    return html`
      <aa-button @click="${this.LoadPlayers}">get all users</aa-button>
      <player-container>
        <aa-player .players=${this.players}></aa-player>
        <aa-player .players=${this.players}></aa-player>
        <aa-player .players=${this.players}></aa-player>

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
