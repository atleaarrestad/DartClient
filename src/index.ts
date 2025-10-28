import "reflect-metadata";
import "@fortawesome/fontawesome-free/css/all.min.css";

import "./router";
import "./components/navigationbar-cmp.js";
import "./components/pages/index-page.js";
import "./components/pages/users-page.js";
import "./components/pages/user-page.js";
import "./components/aa-notification-cmp.js";
import "./components/aa-notification-container-cmp.js";

import "./components/aa-dartthrow-cmp.js";
import "./components/aa-combobox-cmp.js";
import "./components/aa-info-card.js";
import "./components/aa-match-snapshot-chart.js";
import "./components/aa-heatmap-chart.js";
import "./components/aa-finish-count-chart.js";
import "./components/aa-user-picker.js";

import "./components/aa-dialog.js";

import { container } from "tsyringe";
import { DataService } from "./services/dataService.js";
import { NotificationService } from "./services/notificationService.js";
import { DialogService } from "./services/dialogService.js";
import { SeasonService } from "./services/seasonService.js";
import { UserService } from "./services/userService.js";
import { CacheService } from "./services/cacheService.js";
import { GameService } from "./services/gameService.js";

container.register(DataService, { useClass: DataService });
container.register(NotificationService, { useClass: NotificationService });
container.register(DialogService, { useClass: DialogService });
container.register(SeasonService, { useClass: SeasonService });
container.register(UserService, { useClass: UserService });
container.register(CacheService, { useClass: CacheService });
container.register(GameService, { useClass: GameService });
