function normalizeBase(value) {
	const trimmed = value.trim();

	if (!trimmed || trimmed === '.' || trimmed === './')
		return '/';

	const withoutOrigin = trimmed.replace(/^https?:\/\/[^/]+/u, '');
	const withLeadingSlash = withoutOrigin.startsWith('/') ? withoutOrigin : `/${ withoutOrigin }`;

	return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${ withLeadingSlash }/`;
}

export function getPublicBase({ command = 'build', env = process.env } = {}) {
	const configuredBase = env.PUBLIC_BASE ?? env.VITE_PUBLIC_BASE;

	if (configuredBase)
		return normalizeBase(configuredBase);

	if (command === 'serve')
		return '/';

	if (env.GITHUB_ACTIONS !== 'true')
		return '/';

	const repositoryName = env.GITHUB_REPOSITORY?.split('/')[1];

	return repositoryName ? normalizeBase(repositoryName) : '/';
}
