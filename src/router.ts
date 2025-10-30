import { Router } from "@vaadin/router";

const outlet = document.getElementById("outlet")!;
const router = new Router(outlet);

router.setRoutes([
	{ path: "/", component: "index-page" },
	{ path: "/users", component: "users-page" },
	{ path: "/user/:id", component: "user-page" },
	{ path: "/season/:id", component: "season-page"}
]);
