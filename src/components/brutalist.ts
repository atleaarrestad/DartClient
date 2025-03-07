import { LitElement, html, css } from 'lit';

class BrutalistButton extends LitElement {
  static override styles = css`
    button {
      //font-family: 'Space Grotesk', sans-serif;
      font-family: 'Bitter', sans-serif;
    



      background: #a8dadc;
      color: #000;
      font-size: 18px;
      font-weight: 800;
      padding: 12px 20px;
      border: 2px solid black;
      border-bottom-width: 5px;
      border-right-width: 5px;
      border-radius: 12px;
      cursor: pointer;
      transition: transform 0.2s ease-out, box-shadow 0.2s ease-out;
      margin-left:50px;
    }

    button:hover {
      transform: translate(-.5px, -.5px);
      box-shadow: 2px 2px 0px black;
      background: orange
    }
  `;

  override render() {
    return html`<button><slot></slot></button>`;
  }
}

customElements.define('brutalist-button', BrutalistButton);
