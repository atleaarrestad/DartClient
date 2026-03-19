import { writeFileSync } from 'node:fs';

import { getPublicBase } from './public-base.js';

const base = getPublicBase();

const html = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta http-equiv="X-UA-Compatible" content="IE=edge" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>Redirecting…</title>
	<script>
		const routeStorageKey = 'gh-pages-route';
		const basePath = ${ JSON.stringify(base) };
		const requestedUrl = new URL(window.location.href);
		const baseUrl = new URL(basePath, requestedUrl.origin);
		const requestedPath = requestedUrl.pathname.startsWith(baseUrl.pathname)
			? requestedUrl.pathname.slice(baseUrl.pathname.length)
			: requestedUrl.pathname.replace(/^\\//u, '');

		sessionStorage.setItem(routeStorageKey, \`\${requestedPath}\${requestedUrl.search}\${requestedUrl.hash}\`);
		window.location.replace(baseUrl.href);
	</script>
</head>
<body></body>
</html>
`;

writeFileSync('dist/404.html', html);
