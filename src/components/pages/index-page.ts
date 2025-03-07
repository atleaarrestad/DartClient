import { html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import { sharedStyles } from "../../../styles.js";

import { LitElement } from "lit";
import { DataService } from "../../services/dataService.js";
import { NotificationService } from "../../services/notificationService.js";
import { container } from "tsyringe";

import { User } from "../../models/userSchema.js";

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
    super.connectedCallback();
  }

  override render() {
    return html`
      <aa-button @click="${this.LoadPlayers}">get all users</aa-button>
      <h4>Server responze: ${this.mydata}</h4>
    `;
  }

  private async TestDataService(): Promise<void> {
    console.log(this.dataService);
    const result = await this.dataService.Ping();
    console.log(result);
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
    this.notificationService.addNotification("yoyoyoy", "title", "success");
  }
  private async PingServer(): Promise<void> {
    try {
      const response = await fetch("https://localhost:5068/api/ping", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ key: "value" }),
      });
      const data = await response.text(); 
      this.mydata = data;
    } catch (error) {
      console.error("Error pinging server:", error);
      this.mydata = "Error pinging server";
    }
  }

  static override styles = [sharedStyles, css`
    :host {
        
      }`];
}
