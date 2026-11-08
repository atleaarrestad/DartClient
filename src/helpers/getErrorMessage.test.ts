import { describe, expect, it } from 'vitest';

import { getErrorMessage } from './getErrorMessage.js';

describe('getErrorMessage', () => {
	it('uses the message of an Error or a string', () => {
		expect(getErrorMessage(new Error('Boom'))).toBe('Boom');
		expect(getErrorMessage('Plain failure')).toBe('Plain failure');
	});

	it('falls back for blank messages and other values', () => {
		expect(getErrorMessage(new Error('  '))).toBe('Something went wrong.');
		expect(getErrorMessage('')).toBe('Something went wrong.');
		expect(getErrorMessage(undefined)).toBe('Something went wrong.');
		expect(getErrorMessage({ message: 'not an Error' })).toBe('Something went wrong.');
	});

	it('uses a custom fallback', () => {
		expect(getErrorMessage(null, 'Could not save.')).toBe('Could not save.');
	});
});
