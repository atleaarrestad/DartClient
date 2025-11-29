import 'reflect-metadata';
import '@fortawesome/fontawesome-free/css/all.min.css';
import './router.js';
import './components/navigationbar-cmp.js';
import './components/pages/index-page.js';
import './components/pages/users-page.js';
import './components/pages/user-page.js';
import './components/pages/season-page.js';
import './components/pages/sessions-page.js';
import './components/aa-notification-cmp.js';
import './components/aa-notification-container-cmp.js';
import './components/aa-dart-throw-cmp.js';
import './components/aa-combobox-cmp.js';
import './components/aa-info-card.js';
import './components/aa-match-snapshot-chart.js';
import './components/aa-heatmap-chart.js';
import './components/aa-finish-count-chart.js';
import './components/aa-user-picker.js';
import './components/aa-dialog.js';
import './getAbsoluteBase.js';
import './utils/cookie.js';

import hljs from 'highlight.js/lib/core';
import csharp from 'highlight.js/lib/languages/csharp';
import { container } from 'tsyringe';

import { CacheService } from './services/cacheService.js';
import { DataService } from './services/dataService.js';
import { DialogService } from './services/dialogService.js';
import { GameService } from './services/gameService.js';
import { NotificationService } from './services/notificationService.js';
import { RuleService } from './services/ruleService.js';
import { SeasonService } from './services/seasonService.js';
import { signalRService } from './services/signalRService.js';
import { UserService } from './services/userService.js';

container.register(DataService,         { useClass: DataService });
container.register(NotificationService, { useClass: NotificationService });
container.register(DialogService,       { useClass: DialogService });
container.register(SeasonService,       { useClass: SeasonService });
container.register(UserService,         { useClass: UserService });
container.register(CacheService,        { useClass: CacheService });
container.register(GameService,         { useClass: GameService });
container.register(RuleService,         { useClass: RuleService });
container.register(signalRService,      { useClass: signalRService });

hljs.registerLanguage('csharp', csharp);
