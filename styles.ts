import { css, unsafeCSS } from "lit";
import fontAwesomeStyles from '@fortawesome/fontawesome-free/css/all.css?inline';

export const sharedStyles = css`
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    line-height: 1.5;
    font-family: var(--font-family-first);
    
  }
  ${unsafeCSS(fontAwesomeStyles)}
`;
