export interface UserQueryOptions {
	includeSeasonStatistics?: boolean;
	includeMatchSnapshots?:   boolean;
	includeHitCounts?:        boolean;
	includeFinishCounts?:     boolean;
}
export function buildGetUserByIdUrl(
	id: string,
	options?: UserQueryOptions,
): string {
	const params = new URLSearchParams();
	if (options?.includeSeasonStatistics)
		params.set('includeSeasonStatistics', 'true');
	if (options?.includeMatchSnapshots)
		params.set('includeMatchSnapshots', 'true');
	if (options?.includeHitCounts)
		params.set('includeHitCounts', 'true');
	if (options?.includeHitCounts)
		params.set('includeHitCounts', 'true');
	if (options?.includeFinishCounts)
		params.set('includeFinishCounts', 'true');

	const qs = params.toString();

	return qs
		? `users/GetById/${ id }?${ qs }`
		: `users/GetById/${ id }`;
}
