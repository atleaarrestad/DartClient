import type { ReactiveController, ReactiveControllerHost } from 'lit';

import type { LastDartHints } from '../../../models/achievementBuilderApi.js';

/** Whose last dart the hints are for, and the darts they are for. */
export interface LastDartHintsTarget {
	gameId:     string;
	playerId:   string;
	playerName: string;
	roundIndex: number;
	/** Changes whenever the player's darts in that round change, e.g. a corrected second dart. */
	key:        string;
}

export type LastDartHintsState =
	| { status: 'idle'; }
	| { status: 'loading'; target: LastDartHintsTarget; }
	| { status: 'ready'; target: LastDartHintsTarget; hints: LastDartHints | null; };

export type FetchLastDartHints = (
	gameId: string,
	playerId: string,
	signal: AbortSignal,
) => Promise<LastDartHints | null>;

/** A player already typing the third dart within this time sends no request at all. */
export const lastDartHintsDelayMs = 150;

/**
 * Fetches the last-dart hints for the dart being thrown, when it is a last dart (the game page
 * decides that), one request at a time, separately from saving throws. When the target changes or goes away (the third dart
 * entered, a correction, another player up), the waiting request is cancelled, which also
 * stops the work on the server, and its answer is ignored if it still arrives. Hints are
 * optional: a failed request shows as no hints.
 */
export class LastDartHintsLoader implements ReactiveController {

	state: LastDartHintsState = { status: 'idle' };

	private request?: AbortController;
	private timer?:   ReturnType<typeof setTimeout>;

	constructor(
		private readonly host: ReactiveControllerHost,
		private readonly fetchHints: FetchLastDartHints,
		private readonly delayMs = lastDartHintsDelayMs,
	) {
		host.addController(this);
	}

	hostDisconnected(): void {
		this.cancel();
		this.state = { status: 'idle' };
	}

	/**
	 * Called with the current target on every update (from `willUpdate`, so it causes no
	 * extra render); nothing happens while the target stays the same.
	 */
	sync(target: LastDartHintsTarget | undefined): void {
		const current = this.state.status === 'idle' ? undefined : this.state.target;
		if (target?.key === current?.key)
			return;

		this.cancel();
		if (!target) {
			this.setState({ status: 'idle' });

			return;
		}

		this.setState({ status: 'loading', target });
		const request = new AbortController();
		this.request = request;
		this.timer = setTimeout(() => void this.load(target, request.signal), this.delayMs);
	}

	private async load(target: LastDartHintsTarget, signal: AbortSignal): Promise<void> {
		let hints: LastDartHints | null;
		try {
			hints = await this.fetchHints(target.gameId, target.playerId, signal);
		}
		catch {
			hints = null;
		}

		if (signal.aborted)
			return;

		// Hints for another round mean the server saw other darts: none for this one.
		this.setState({ status: 'ready', target, hints: hints?.roundIndex === target.roundIndex ? hints : null });
	}

	private cancel(): void {
		clearTimeout(this.timer);
		this.timer = undefined;
		this.request?.abort();
		this.request = undefined;
	}

	private setState(state: LastDartHintsState): void {
		this.state = state;
		this.host.requestUpdate();
	}

}
