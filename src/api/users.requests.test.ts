import { describe, expect, it } from 'vitest';

import { buildGetAllUsersUrl, buildGetUserByIdUrl } from './users.requests.js';

describe('users requests', () => {
	it('builds plain urls without options', () => {
		expect(buildGetAllUsersUrl()).toBe('users/getall');
		expect(buildGetUserByIdUrl('user-id')).toBe('users/GetById/user-id');
		expect(buildGetAllUsersUrl({ includeHitCounts: false })).toBe('users/getall');
	});

	it('adds only the enabled includes and the season filter', () => {
		expect(buildGetAllUsersUrl({
			includeSeasonStatistics: true,
			includeMatchSnapshots:   true,
			includeHitCounts:        true,
			includeFinishCounts:     true,
			limitToSeasonId:         'season-id',
		})).toBe('users/getall?includeSeasonStatistics=true&includeMatchSnapshots=true'
			+ '&includeHitCounts=true&includeFinishCounts=true&limitToSeasonId=season-id');
		expect(buildGetUserByIdUrl('user-id', { includeHitCounts: true }))
			.toBe('users/GetById/user-id?includeHitCounts=true');
	});

	it('encodes the user id and the season filter', () => {
		expect(buildGetUserByIdUrl('a/b?c', { limitToSeasonId: 'x&y' }))
			.toBe('users/GetById/a%2Fb%3Fc?limitToSeasonId=x%26y');
	});
});
