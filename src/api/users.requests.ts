export interface UserQueryOptions {
	includeSeasonStatistics?: boolean;
	includeMatchSnapshots?: boolean;
	includeHitCounts?: boolean;
	includeFinishCounts?: boolean;
	limitToSeasonId?: string;
}

function appendUserQueryOptions(
	params: URLSearchParams,
	options?: UserQueryOptions,
): void {
	if (options?.includeSeasonStatistics) {
		params.set('includeSeasonStatistics', 'true');
	}

	if (options?.includeMatchSnapshots) {
		params.set('includeMatchSnapshots', 'true');
	}

	if (options?.includeHitCounts) {
		params.set('includeHitCounts', 'true');
	}

	if (options?.includeFinishCounts) {
		params.set('includeFinishCounts', 'true');
	}

	if (options?.limitToSeasonId) {
		params.set('limitToSeasonId', options.limitToSeasonId);
	}
}

export function buildGetUserByIdUrl(
	id: string,
	options?: UserQueryOptions,
): string {
	const params = new URLSearchParams();
	appendUserQueryOptions(params, options);

	const qs = params.toString();

	return qs
		? `users/GetById/${id}?${qs}`
		: `users/GetById/${id}`;
}

export function buildGetAllUsersUrl(
	options?: UserQueryOptions,
): string {
	const params = new URLSearchParams();
	appendUserQueryOptions(params, options);

	const qs = params.toString();

	return qs
		? `users/getall?${qs}`
		: 'users/getall';
}