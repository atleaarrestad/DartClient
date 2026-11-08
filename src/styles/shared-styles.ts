import { css } from 'lit';

/** Hidden visually but still read by screen readers. */
export const visuallyHiddenStyles = css`
	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
`;

export const sharedStyles = css`
	* {
		margin: 0;
		padding: 0;
		box-sizing: border-box;
	}

	li {
		list-style: none;
	}

	a {
		display: block;
		text-decoration: none;
	}

	${ visuallyHiddenStyles }
`;
