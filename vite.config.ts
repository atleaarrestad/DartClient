import { defineConfig } from 'vite';

import { getPublicBase } from './scripts/public-base.js';


export default defineConfig(({ command }) => ({
	base:   getPublicBase({ command }),
	envDir: './env',
}));
