import { defineConfig } from 'vitest/config';

import { getPublicBase } from './scripts/public-base.js';


export default defineConfig(({ command }) => ({
	base:   getPublicBase({ command }),
	envDir: './env',
	test:   {
		include:       [ 'src/**/*.test.ts' ],
		environment:   'node',
		unstubGlobals: true,
		restoreMocks:  true,
		env:           { VITE_SERVER_URL: 'http://test.invalid/' },
	},
}));
