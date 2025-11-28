import { Router } from '@vaadin/router';

import { getAbsoluteBase } from './getAbsoluteBase.js';

const outlet = document.getElementById('outlet')!;
const base = getAbsoluteBase();

const router = new Router(outlet, { baseUrl: base });
router.setRoutes([
	{ path: '/', component: 'index-page' },
	{ path: '/users', component: 'users-page' },
	{ path: '/user/:id', component: 'user-page' },
	{ path: '/season/:id', component: 'season-page' },
	{ path: '/sessions', component: 'sessions-page' },
]);
