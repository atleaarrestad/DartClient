/**
 * The CodeMirror setup for rule text. Loaded on demand by `aa-rule-text-editor`, so the
 * builder only downloads the editor when someone opens the Split or Text view.
 */
import {
	acceptCompletion,
	autocompletion,
	closeBrackets,
	closeBracketsKeymap,
	Completion,
	CompletionContext,
	completionKeymap,
	CompletionResult,
} from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import {
	bracketMatching,
	HighlightStyle,
	indentUnit,
	StreamLanguage,
	syntaxHighlighting,
} from '@codemirror/language';
import { Diagnostic, setDiagnostics } from '@codemirror/lint';
import { Annotation, Compartment, EditorState } from '@codemirror/state';
import {
	drawSelection,
	EditorView,
	highlightActiveLine,
	highlightActiveLineGutter,
	hoverTooltip,
	keymap,
	lineNumbers,
} from '@codemirror/view';
import { tags } from '@lezer/highlight';

import type { RuleTextCompletionResult, RuleTextCompletionType } from './rule-text-completions.js';
import type { RuleTextDiagnostic } from './rule-text-parser.js';

export interface RuleTextEditorCallbacks {
	/** The text changed by typing (not by `setText`). */
	onTextChange: (text: string) => void;
	onCursor:     (position: number) => void;
	complete:     (text: string, position: number) => RuleTextCompletionResult | undefined;
	/** A tooltip for the word at a position, e.g. a small board for a target. */
	hover:        (text: string, position: number) => { from: number; to: number; dom: HTMLElement; } | undefined;
}

export interface RuleTextEditorHandle {
	setText:        (text: string) => void;
	setDiagnostics: (diagnostics: readonly RuleTextDiagnostic[]) => void;
	setReadOnly:    (readOnly: boolean) => void;
	select:         (from: number, to: number) => void;
	destroy:        () => void;
}

/** Marks changes made by `setText`, so they aren't reported back as typing. */
const external = Annotation.define<boolean>();

const keywords = /^(?:hit|every|dart|count|winning|sequence|round|all|any|not|raw|collect|none|tier|skip|if|and|otherwise)\b/;
const statuses = /^(?:valid|victory|overshoot|failed|bronze|silver|gold|platinum|diamond)\b/;

/** Highlighting only; the real parser runs separately and reports diagnostics. */
const ruleTextLanguage = StreamLanguage.define<null>({
	name:  'achievement-rule',
	token: stream => {
		if (stream.eatSpace())
			return null;
		if (stream.match(/^#.*/))
			return 'comment';
		if (stream.match(/^\{(?:left |right |ladder )?[A-Za-z_]\w*(?:[+-]\d+)?\}/))
			return 'string';
		if (stream.match(/^(?:round|game)\.[A-Za-z]+/))
			return 'propertyName';
		if (stream.match(keywords))
			return 'keyword';
		if (stream.match(statuses))
			return 'typeName';
		if (stream.match(/^"[^"]*"?/))
			return 'string';
		if (stream.match(/^(?:DBull|Bull|rim|miss|true|false)\b/) || stream.match(/^[SDT](?:\d+\b|(?=\{)|\b)/))
			return 'atom';
		if (stream.match(/^\d+/))
			return 'number';
		if (stream.match(/^(?:[<>!]=|[<>=|{}()+-])/))
			return 'operator';

		stream.next();

		return null;
	},
	languageData: { closeBrackets: { brackets: [ '{', '(' ] } },
});

const highlightStyle = HighlightStyle.define([
	{ tag: tags.keyword, color: '#7df9ff' },
	{ tag: tags.propertyName, color: '#ffb86b' },
	{ tag: tags.typeName, color: '#ffb86b' },
	{ tag: tags.atom, color: '#f2d14e', fontWeight: '700' },
	{ tag: tags.string, color: '#9ef0b6' },
	{ tag: tags.number, color: '#ff9ad5' },
	{ tag: tags.operator, color: '#a9a4cf' },
	{ tag: tags.comment, color: '#8a85b0', fontStyle: 'italic' },
]);

const theme = EditorView.theme({
	'&': {
		height:          '100%',
		color:           '#f2f0ff',
		backgroundColor: '#1b1a28',
		fontSize:        '13.5px',
	},
	'.cm-scroller': {
		fontFamily: '\'JetBrains Mono\', ui-monospace, \'Cascadia Mono\', Consolas, monospace',
		lineHeight: '1.75',
	},
	'.cm-content':                { caretColor: '#fff', fontVariantLigatures: 'none' },
	'.cm-cursor, .cm-dropCursor': { borderLeftColor: '#fff' },
	'.cm-gutters':                { backgroundColor: '#1b1a28', color: '#6f6a94', border: 'none' },
	'.cm-activeLine':             { backgroundColor: 'rgb(125 249 255 / 0.07)' },
	'.cm-activeLineGutter':       { backgroundColor: 'rgb(125 249 255 / 0.12)', color: '#c9c5e6' },
	'.cm-matchingBracket':        { backgroundColor: 'rgb(242 209 78 / 0.25)', outline: 'none' },
	'.cm-tooltip':                {
		color:           '#000',
		backgroundColor: '#fffdf8',
		border:          '2px solid #000',
		borderRadius:    '10px',
		boxShadow:       '4px 4px 0 #000',
		fontFamily:      '\'Space Grotesk\', system-ui, sans-serif',
		overflow:        'hidden',
	},
	'.cm-tooltip-autocomplete > ul':                     { fontFamily: 'inherit', maxHeight: '16em' },
	'.cm-tooltip-autocomplete > ul > li':                { padding: '3px 10px' },
	'.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: '#7df9ff', color: '#000' },
	'.cm-completionDetail':                              { fontStyle: 'normal', opacity: '0.65', marginLeft: '0.8em' },
	'.cm-completionSection':                             {
		fontSize:      '11px',
		fontWeight:    '700',
		textTransform: 'uppercase',
		opacity:       '0.6',
	},
	'.cm-tooltip-lint':       { padding: '0' },
	'.cm-diagnostic':         { padding: '6px 10px', borderLeftWidth: '6px' },
	'.cm-diagnostic-error':   { borderLeftColor: '#ed807f' },
	'.cm-diagnostic-warning': { borderLeftColor: '#f2d14e' },
	'.cm-diagnosticAction':   {
		backgroundColor: '#fff',
		color:           '#000',
		border:          '2px solid #000',
		borderRadius:    '8px',
		padding:         '1px 8px',
		marginLeft:      '0',
		marginRight:     '6px',
		font:            '600 12px \'Space Grotesk\', sans-serif',
	},
	'.cm-lintRange-error': {
		backgroundImage:     'none',
		textDecoration:      'underline wavy #ff6b6b',
		textUnderlineOffset: '4px',
	},
	'.cm-lintRange-warning': {
		backgroundImage:     'none',
		textDecoration:      'underline wavy #f2d14e',
		textUnderlineOffset: '4px',
	},
}, { dark: true });

/** Kept apart from the theme above only because its selector is very long. */
const selectionTheme = EditorView.theme({
	'&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
		backgroundColor: 'rgb(125 249 255 / 0.25)',
	},
}, { dark: true });

const completionTypes: Record<RuleTextCompletionType, string> = {
	keyword:   'keyword',
	field:     'property',
	parameter: 'variable',
	target:    'constant',
	status:    'enum',
};

const toCompletion = (option: RuleTextCompletionResult['options'][number]): Completion => ({
	label:   option.label,
	type:    completionTypes[option.type],
	detail:  option.disabledReason ? `${ option.detail ?? '' } · ${ option.disabledReason }` : option.detail,
	boost:   option.disabledReason ? -99 : 0,
	section: option.disabledReason ? 'Not available here' : undefined,
	// Unavailable options are shown to explain the scope, but picking one changes nothing.
	apply:   option.disabledReason ? () => undefined : option.apply ?? option.label,
});

const toDiagnostic = (diagnostic: RuleTextDiagnostic, length: number): Diagnostic => ({
	from:     Math.min(diagnostic.from, length),
	to:       Math.min(Math.max(diagnostic.to, diagnostic.from), length),
	severity: diagnostic.severity,
	message:  diagnostic.message,
	actions:  diagnostic.fixes?.map(fix => ({
		name:  fix.label,
		apply: (view: EditorView) => view.dispatch({ changes: fix.changes }),
	})),
});

export const createRuleTextEditor = (
	parent: HTMLElement,
	root: ShadowRoot,
	initial: { text: string; readOnly: boolean; },
	callbacks: RuleTextEditorCallbacks,
): RuleTextEditorHandle => {
	const readOnlyCompartment = new Compartment();
	const readOnlyExtensions = (readOnly: boolean): ReturnType<Compartment['of']> =>
		readOnlyCompartment.of([ EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly) ]);

	const completionSource = (context: CompletionContext): CompletionResult | null => {
		const result = callbacks.complete(context.state.doc.toString(), context.pos);
		if (!result || (!context.explicit && result.from === context.pos && !context.matchBefore(/[\s({>=<|.]$/)))
			return null;

		return { from: result.from, options: result.options.map(toCompletion), validFor: /^[\w.{}+-]*$/ };
	};

	const view = new EditorView({
		parent,
		root,
		state: EditorState.create({
			doc:        initial.text,
			extensions: [
				lineNumbers(),
				highlightActiveLineGutter(),
				highlightActiveLine(),
				drawSelection(),
				history(),
				closeBrackets(),
				bracketMatching(),
				indentUnit.of('  '),
				ruleTextLanguage,
				syntaxHighlighting(highlightStyle),
				autocompletion({ override: [ completionSource ], icons: false }),
				hoverTooltip((hoverView, position) => {
					const hover = callbacks.hover(hoverView.state.doc.toString(), position);

					return hover
						? { pos: hover.from, end: hover.to, above: false, create: () => ({ dom: hover.dom }) }
						: null;
				}, { hoverTime: 250 }),
				// Tab accepts an open suggestion, like Enter; without one it indents as usual.
				keymap.of([
					{ key: 'Tab', run: acceptCompletion },
					...closeBracketsKeymap,
					...completionKeymap,
					...historyKeymap,
					...defaultKeymap,
					indentWithTab,
				]),
				readOnlyExtensions(initial.readOnly),
				theme,
				selectionTheme,
				EditorView.updateListener.of(update => {
					const isExternal = update.transactions.some(transaction => transaction.annotation(external));
					if (update.docChanged && !isExternal)
						callbacks.onTextChange(update.state.doc.toString());
					if (update.selectionSet && !isExternal)
						callbacks.onCursor(update.state.selection.main.head);
				}),
			],
		}),
	});

	return {
		setText: text => {
			if (text === view.state.doc.toString())
				return;

			const head = Math.min(view.state.selection.main.head, text.length);
			view.dispatch({
				changes:     { from: 0, to: view.state.doc.length, insert: text },
				selection:   { anchor: head },
				annotations: external.of(true),
			});
		},
		setDiagnostics: diagnostics => {
			const length = view.state.doc.length;
			view.dispatch(setDiagnostics(view.state, diagnostics.map(diagnostic => toDiagnostic(diagnostic, length))));
		},
		setReadOnly: readOnly => view.dispatch({
			effects: readOnlyCompartment.reconfigure([ EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly) ]),
		}),
		select: (from, to) => {
			const length = view.state.doc.length;
			view.dispatch({
				selection:      { anchor: Math.min(from, length), head: Math.min(to, length) },
				scrollIntoView: true,
				annotations:    external.of(true),
			});
		},
		destroy: () => view.destroy(),
	};
};
