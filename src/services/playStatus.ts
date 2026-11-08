import type { SignalRConnectionStatus } from './signalRService.js';

/**
 * What a game page tells the navigation bar while it shows a game: whether live sync is up,
 * and how to open the gameplay shortcuts. Undefined while no game page is shown.
 */
export interface PlayStatus {
	/** The navigation link of the page showing the game; it carries the sync dot. */
	link:           'play' | 'sessions';
	sync:           SignalRConnectionStatus;
	/** Why sync isn't live, for its tooltip. */
	syncMessage:    string;
	/** Present when the page has gameplay shortcuts to show. */
	openShortcuts?: () => void;
}

export const playStatusChangedEventName = 'play-status-changed';

let current: PlayStatus | undefined;

export const getPlayStatus = (): PlayStatus | undefined => current;

export const setPlayStatus = (status: PlayStatus | undefined): void => {
	current = status;
	window.dispatchEvent(new CustomEvent<PlayStatus | undefined>(playStatusChangedEventName, { detail: status }));
};

/** How each sync state reads in the bar. */
export const syncStatusLabels: Readonly<Record<SignalRConnectionStatus, string>> = {
	connected:    'Live',
	connecting:   'Connecting…',
	reconnecting: 'Reconnecting…',
	disconnected: 'Offline',
};
