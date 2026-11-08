import { describe, expect, it } from 'vitest';

import { getLadderStep } from '../../helpers/dartboard.js';
import { parameter } from '../../test/achievementFixtures.js';
import {
	formatParameterForm,
	getLadderStepError,
	getTemplateTokenProblem,
	hasMalformedTokens,
	readTemplateTokens,
	renameTemplateParameter,
	renderTemplate,
	resolveParameterForm,
} from './parameter-forms.js';

describe('the dart ladder', () => {
	it('runs 1–20, then the bull and the double bull', () => {
		expect(getLadderStep(5, 1)).toBe(6);
		expect(getLadderStep(20, 1)).toBe(25);
		expect(getLadderStep(20, 2)).toBe(50);
		expect(getLadderStep(50, -2)).toBe(20);
	});

	it('has no step off either end or from a number not on it', () => {
		expect(getLadderStep(50, 1)).toBeUndefined();
		expect(getLadderStep(1, -1)).toBeUndefined();
		expect(getLadderStep(21, 1)).toBeUndefined();
	});
});

describe('parameter forms', () => {
	const ladder = { source: 'parameter.ladder' as const, value: 'start', offset: 2 };

	it('writes and resolves a ladder step', () => {
		expect(formatParameterForm(ladder)).toBe('{ladder start+2}');
		expect(formatParameterForm({ ...ladder, offset: -1 })).toBe('{ladder start-1}');
		expect(resolveParameterForm(ladder, 19)).toBe(25);
		expect(resolveParameterForm(ladder, 20)).toBe(50);
		expect(resolveParameterForm(ladder, 25)).toBeUndefined();
	});

	it('reports a ladder step that leaves the ladder for some parameter value', () => {
		expect(getLadderStepError(ladder, [ 1, 18 ])).toBeUndefined();
		expect(getLadderStepError(ladder, [ 1, 25 ]))
			.toBe('{ladder start+2} leaves the ladder (1–20, 25, 50) when {start} is 25.');
		expect(getLadderStepError(ladder, [ 21 ])).toContain('needs {start} to be on the ladder');
		expect(getLadderStepError({ ...ladder, offset: 0 }, [ 1 ])).toContain('other than 0');
	});
});

describe('name and description templates', () => {
	it('fills in every form', () => {
		const { text, problems } = renderTemplate(
			'Hit {start}, {ladder start+1} and {ladder start+2} ({start+1}, {left start}, {right start})',
			{ start: 19 },
		);

		expect(text).toBe('Hit 19, 20 and 25 (20, 3, 7)');
		expect(problems).toEqual([]);
	});

	it('leaves a step off the ladder as written and reports it', () => {
		const { text, problems } = renderTemplate('Then {ladder start+1}', { start: 50 });

		expect(text).toBe('Then {ladder start+1}');
		expect(problems).toEqual([ '{ladder start+1} leaves the ladder (1–20, 25, 50) when {start} is 50' ]);
	});

	it('reports tokens that do not fit their parameter', () => {
		const problem = (template: string, valueType: 'integer' | 'string' = 'integer'): string | undefined =>
			getTemplateTokenProblem(readTemplateTokens(template)[0]!, parameter('n', { valueType }));

		expect(problem('{ladder n}')).toBe('{ladder n} needs a step, such as {ladder n+1}');
		expect(problem('{left n+1}')).toBe('{left n+1} can’t add a number to a board neighbour');
		expect(problem('{n+1}', 'string')).toBe('{n+1} needs a number parameter');
		expect(problem('{ladder n-2}')).toBeUndefined();
		expect(hasMalformedTokens('Hit {n*2}')).toBe(true);
	});

	it('renames a parameter in every form', () => {
		expect(renameTemplateParameter('{n} {n+1} {ladder n-1} {left n} {nn}', 'n', 'start'))
			.toBe('{start} {start+1} {ladder start-1} {left start} {nn}');
	});
});
