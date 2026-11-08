import type { ReactiveController, ReactiveControllerHost } from 'lit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LastDartHints } from '../../../models/achievementBuilderApi.js';
import { createAchievementInstance, createLastDartHints, testGameId, testPlayerId } from '../../../test/gameFixtures.js';
import { lastDartHintsDelayMs, LastDartHintsLoader, LastDartHintsTarget } from './last-dart-hints-loader.js';

/** A request the test answers (or the loader cancels) whenever it likes. */
interface PendingRequest {
	playerId: string;
	signal:   AbortSignal;
	answer:   (hints: LastDartHints | null) => void;
	fail:     (error: unknown) => void;
}

class FakeHost implements ReactiveControllerHost {

	readonly controllers: ReactiveController[] = [];
	updates = 0;
	readonly updateComplete = Promise.resolve(true);
	addController(controller: ReactiveController): void {
		this.controllers.push(controller);
	}

	removeController(): void {}

	requestUpdate(): void {
		this.updates++;
	}

}

const target = (key: string, roundIndex = 2, playerId = testPlayerId): LastDartHintsTarget => ({
	gameId:     testGameId,
	playerId,
	playerName: 'Atle',
	roundIndex,
	key,
});

const hintsFor = (roundIndex = 2): LastDartHints => ({
	...createLastDartHints(createAchievementInstance('8d3b5c6f-1e9d-4e4b-8f5a-6f7a8b9c0d14', 'Hinted')),
	roundIndex,
});

describe('LastDartHintsLoader', () => {
	let host: FakeHost;
	let requests: PendingRequest[];
	let loader: LastDartHintsLoader;

	beforeEach(() => {
		vi.useFakeTimers();
		host = new FakeHost();
		requests = [];
		loader = new LastDartHintsLoader(host, (_gameId, playerId, signal) => new Promise((answer, fail) => {
			requests.push({ playerId, signal, answer, fail });
		}));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	const settle = async (): Promise<void> => {
		await vi.advanceTimersByTimeAsync(0);
	};

	it('waits a moment before asking, then shows the hints', async () => {
		loader.sync(target('a'));

		expect(loader.state).toMatchObject({ status: 'loading', target: { key: 'a' } });
		expect(host.updates).toBe(1);
		expect(requests).toHaveLength(0);

		await vi.advanceTimersByTimeAsync(lastDartHintsDelayMs);
		expect(requests).toHaveLength(1);

		const hints = hintsFor();
		requests[0]!.answer(hints);
		await settle();

		expect(loader.state).toEqual({ status: 'ready', target: target('a'), hints });
		expect(host.updates).toBe(2);
	});

	it('asks once while the darts stay the same', async () => {
		loader.sync(target('a'));
		await vi.advanceTimersByTimeAsync(lastDartHintsDelayMs);
		requests[0]!.answer(hintsFor());
		await settle();

		loader.sync(target('a'));
		loader.sync(target('a'));
		await vi.advanceTimersByTimeAsync(lastDartHintsDelayMs);

		expect(requests).toHaveLength(1);
		expect(loader.state.status).toBe('ready');
	});

	it('sends nothing for a dart the player moved past before the delay', async () => {
		loader.sync(target('a'));
		await vi.advanceTimersByTimeAsync(lastDartHintsDelayMs - 1);
		loader.sync(undefined);
		await vi.advanceTimersByTimeAsync(lastDartHintsDelayMs);

		expect(requests).toHaveLength(0);
		expect(loader.state).toEqual({ status: 'idle' });
	});

	it('cancels the waiting request when the darts change, and ignores its late answer', async () => {
		loader.sync(target('a'));
		await vi.advanceTimersByTimeAsync(lastDartHintsDelayMs);
		loader.sync(target('b'));

		expect(requests[0]!.signal.aborted).toBe(true);
		expect(loader.state).toMatchObject({ status: 'loading', target: { key: 'b' } });

		requests[0]!.answer(hintsFor());
		await settle();
		expect(loader.state).toMatchObject({ status: 'loading', target: { key: 'b' } });

		await vi.advanceTimersByTimeAsync(lastDartHintsDelayMs);
		const hints = hintsFor();
		requests[1]!.answer(hints);
		await settle();

		expect(loader.state).toEqual({ status: 'ready', target: target('b'), hints });
	});

	it('cancels the waiting request when the last dart is no longer up', async () => {
		loader.sync(target('a'));
		await vi.advanceTimersByTimeAsync(lastDartHintsDelayMs);
		loader.sync(undefined);

		expect(requests[0]!.signal.aborted).toBe(true);
		expect(loader.state).toEqual({ status: 'idle' });

		requests[0]!.fail(new DOMException('Cancelled', 'AbortError'));
		await settle();
		expect(loader.state).toEqual({ status: 'idle' });
	});

	it('shows no hints when the request fails or the server answers for another round', async () => {
		loader.sync(target('a'));
		await vi.advanceTimersByTimeAsync(lastDartHintsDelayMs);
		requests[0]!.fail(new Error('Offline'));
		await settle();

		expect(loader.state).toEqual({ status: 'ready', target: target('a'), hints: null });

		loader.sync(target('b'));
		await vi.advanceTimersByTimeAsync(lastDartHintsDelayMs);
		requests[1]!.answer(hintsFor(3));
		await settle();

		expect(loader.state).toEqual({ status: 'ready', target: target('b'), hints: null });
	});

	it('cancels when the page goes away', async () => {
		loader.sync(target('a'));
		await vi.advanceTimersByTimeAsync(lastDartHintsDelayMs);
		host.controllers.forEach(controller => controller.hostDisconnected?.());

		expect(requests[0]!.signal.aborted).toBe(true);
		expect(loader.state).toEqual({ status: 'idle' });
	});
});
