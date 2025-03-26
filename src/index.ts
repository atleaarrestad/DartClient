import "reflect-metadata";
import "@fortawesome/fontawesome-free/css/all.min.css";

import "./router";
import "./components/pages/index-page.js";
import "./components/aa-notification-cmp.js";
import "./components/aa-notification-container-cmp.js";

import "./components/aa-dartthrow-cmp.js";
import "./components/aa-combobox-cmp.js";

import "./components/aa-dialog.js";

import { container } from "tsyringe";
import { DataService } from "./services/dataService.js";
import { NotificationService } from "./services/notificationService.js";
import { DialogService } from "./services/dialogService.js";

container.register(DataService, { useClass: DataService });
container.register(NotificationService, { useClass: NotificationService });
container.register(DialogService, { useClass: DialogService });
