import fontAwesomeStyles from '@fortawesome/fontawesome-free/css/all.css?inline';
import { css, unsafeCSS } from 'lit';

export const sharedStyles = css`
	* {
		margin: 0;
		padding: 0;
		box-sizing: border-box;
		font-family: var(--font-family-first);
	}
	input {
		font-size: 1rem;
	}
	li {
		list-style: none;
	}
	a {
		display: block;
		text-decoration: none;
	}
	${ unsafeCSS(fontAwesomeStyles) }
`;
