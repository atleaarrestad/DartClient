import { LitElement, html, css} from 'lit';
import { property, customElement } from 'lit/decorators.js';
import { sharedStyles } from "../../styles.js";



@customElement('aa-notification-cmp')
export class NotificationElement extends LitElement {
  @property() message: string = '';
  @property() messageTitle: string = '';
  @property() type: 'success' | 'danger' | 'info' = 'success';
  @property({ type: Boolean }) visible: boolean = true;

  static override styles = [
    sharedStyles,
    css`
    :host {
      background-color: #333;
      color: #fff;
      width: 300px;
      padding: 12px 20px;
      border: 3px solid black;
      border-bottom-width: 6px;
      border-right-width: 6px;
      border-radius: 5px;
      font-family: 'Bitter', serif;
      font-weight: bold;
      text-align: left;
      opacity: 1;
      transform: translateY(-10px);
      transition: opacity 0.3s, transform 0.3s;
      pointer-events: none;
      box-shadow: 0px 4px 10px rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
    }

    :host([hidden]) {
      opacity: 0;
      transform: translateY(-20px);
    }

    :host(:hover) {
      background-color: #444;
      box-shadow: 2px 2px 5px rgba(0, 0, 0, 0.8);
      transform: translateY(-5px);
    }

    .icon {
      font-size: 24px;
      margin-right: 12px;
    }

    .content {
      flex-grow: 1;
    }

    .title {
      font-size: 18px;
      margin-bottom: 5px;
    }

    .message {
      font-size: 14px;
      word-wrap: break-word;
      white-space: normal;
    }
  `];
  
override firstUpdated() {
    setTimeout(() => {
      this.visible = false;
      setTimeout(() => {
        this.remove();
      }, 300);
    }, 3000);
  }

  override updated(changedProperties: any) {
    super.updated(changedProperties);
    if (changedProperties.has('visible') && !this.visible) {
      this.setAttribute('hidden', '');
    } else {
      this.removeAttribute('hidden');
    }
  }
  private getIconClass() {
    switch (this.type) {
      case 'success': return 'fas fa-check-circle success';
      case 'danger': return 'fas fa-exclamation-triangle danger';
      case 'info': return 'fas fa-info-circle info';
      default: return 'fas fa-info-circle info';
    }
  }

  override render() {
    return html`
      <div class="icon">
        <i class="${this.getIconClass()}"></i>
      </div>
      <div class="content">
        <div class="title">${this.title}</div>
        <div class="message">${this.message}</div>
      </div>
    `;
  }
}
