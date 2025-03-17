import { css, unsafeCSS } from "lit";
import fontAwesomeStyles from "@fortawesome/fontawesome-free/css/all.css?inline";

export const sharedStyles = css`
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    line-height: 1.5;
    font-family: var(--font-family-first);
    list-style-type: none;
    width: 100%;
    height: 100%;
  }
  input {
    font-size: var(--font-size-input);
  }
  ${unsafeCSS(fontAwesomeStyles)}
`;
