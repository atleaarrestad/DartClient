import "reflect-metadata";
import '@fortawesome/fontawesome-free/css/all.min.css';

import "./router";
import "./components/pages/index-page.js";
import "./components/aa-notification-cmp.js"
import "./components/aa-notification-container-cmp.js"

import "./components/aa-player-cmp.js" 
import "./components/aa-dartthrow-cmp.js"
import "./components/aa-combobox-cmp.js"

import { container } from "tsyringe";
import { DataService } from "./services/dataService.js";
import { NotificationService } from "./services/notificationService.js";

container.register(DataService, { useClass: DataService });
container.register(NotificationService, { useClass: NotificationService });

