import '../components/player-chip/aa-player-chip.js';
import '../components/rank-display/aa-rank-display.js';

import { html, TemplateResult } from 'lit';

import type { User } from '../models/schemas.js';

/** One chip per user (rank icon + alias), as shown for rematch players. */
export const renderPlayerChips = (users: readonly User[], listClass: string): TemplateResult => html`
	<div class=${ listClass }>
		${ users.map(user => html`
			<aa-player-chip>
				<aa-rank-display
					.rank=${ user.seasonStatistics[0]?.currentRank }
					icon-only
				></aa-rank-display>
				<span>${ user.alias || user.name }</span>
			</aa-player-chip>
		`) }
	</div>
`;
