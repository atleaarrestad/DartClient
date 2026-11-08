import fontAwesomeCore from '@fortawesome/fontawesome-free/css/fontawesome.min.css?inline';
import fontAwesomeRegular from '@fortawesome/fontawesome-free/css/regular.min.css?inline';
import fontAwesomeSolid from '@fortawesome/fontawesome-free/css/solid.min.css?inline';
import { unsafeCSS } from 'lit';

// The app only uses the solid (and regular) free styles, so brands and the
// v4/v5 compatibility fonts are left out.
const fontAwesomeStyles = [ fontAwesomeCore, fontAwesomeSolid, fontAwesomeRegular ].join('\n');

/**
 * Icon class rules for shadow roots. `@font-face` has no effect inside a
 * shadow root, so it is stripped here and declared once on the document.
 */
export const faIcons = unsafeCSS(fontAwesomeStyles.replace(/@font-face\s*\{[^}]*\}/gu, ''));

// The document gets the full sheet: the font faces plus the class rules for
// icons rendered in light DOM (dialogs, templates). Sharing the inlined text
// keeps Font Awesome in the bundle once instead of as CSS and as a JS string.
if (typeof document !== 'undefined' && !document.querySelector('style[data-font-awesome]')) {
	const style = document.createElement('style');
	style.dataset['fontAwesome'] = '';
	style.textContent = fontAwesomeStyles;
	document.head.append(style);
}
