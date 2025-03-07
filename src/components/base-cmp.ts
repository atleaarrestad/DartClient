import { html, css } from "lit";
import { customElement, property } from "lit/decorators.js";
import { sharedStyles } from "../../styles.js";
import { LitElement } from "lit";

@customElement("change-me")
export class changeMe extends LitElement {

  public override connectedCallback(): void {
    super.connectedCallback();
  }

  override render() {
    return html`
     
    `;
  }

  static override styles = [sharedStyles, css`
    :host {
        
      }`];
}
