import './management-access.css';
import '../../ui/button/aa-button.js';

import { html } from 'lit';

import { getErrorMessage } from '../../helpers/getErrorMessage.js';
import type { DialogService } from '../../services/dialogService.js';
import type { AaButton } from '../../ui/button/aa-button.js';
import type { AaDialog } from '../aa-dialog/aa-dialog.js';

/** sessionStorage key for the season management code, shared by every management page. */
export const managementKeyStorageKey = 'season-management-key';

export const readStoredManagementKey = (): string => {
	try {
		return sessionStorage.getItem(managementKeyStorageKey) ?? '';
	}
	catch {
		return '';
	}
};

export const storeManagementKey = (key: string): void => {
	try {
		sessionStorage.setItem(managementKeyStorageKey, key);
	}
	catch {
		// Without storage the code is asked for again on the next page load.
	}
};

export const clearStoredManagementKey = (): void => {
	try {
		sessionStorage.removeItem(managementKeyStorageKey);
	}
	catch {
		// Nothing stored, nothing to clear.
	}
};

type VerifyManagementKey = (key: string) => Promise<void>;

/** The stored code when the server still accepts it; a rejected code is forgotten. */
export const restoreManagementAccess = async (verify: VerifyManagementKey): Promise<string> => {
	const key = readStoredManagementKey();
	if (!key)
		return '';

	try {
		await verify(key);

		return key;
	}
	catch {
		clearStoredManagementKey();

		return '';
	}
};

export interface ManagementUnlockOptions {
	dialogService: DialogService;
	verify:        VerifyManagementKey;
	/** Shown above the code field, e.g. what unlocking allows. */
	description:   string;
	submitLabel:   string;
	initialKey?:   string;
}

/**
 * Asks for the management code and checks it with the server. Resolves with the accepted code
 * (also stored for this browser session), or undefined when the dialog is closed.
 */
export const openManagementUnlockDialog = async ({
	dialogService,
	verify,
	description,
	submitLabel,
	initialKey = '',
}: ManagementUnlockOptions): Promise<string | undefined> => {
	const formId = 'management-unlock-form';

	const submit = async (event: SubmitEvent): Promise<void> => {
		event.preventDefault();
		const form = event.currentTarget as HTMLFormElement;
		const dialog = form.closest<AaDialog>('aa-dialog');
		const input = form.elements.namedItem('management-key') as HTMLInputElement;
		const errorElement = form.querySelector<HTMLElement>('.management-unlock__error');
		const submitButton = dialog?.querySelector<AaButton>(`aa-button[form="${ formId }"]`);
		const setBusy = (busy: boolean): void => {
			input.disabled = busy;
			if (submitButton) {
				submitButton.disabled = busy;
				submitButton.loading = busy;
			}
		};

		setBusy(true);
		if (errorElement)
			errorElement.textContent = '';

		try {
			await verify(input.value);
			if (!dialog?.isConnected)
				return;

			storeManagementKey(input.value);
			dialog.close(input.value);
		}
		catch (error) {
			clearStoredManagementKey();
			if (errorElement)
				errorElement.textContent = getErrorMessage(error, 'That management code was not accepted.');

			setBusy(false);
			input.select();
		}
	};

	return dialogService.open<string>(
		html`
			<aa-button
				slot="footer-secondary"
				type="button"
				variant="secondary"
				@click=${ (event: Event) =>
					(event.currentTarget as HTMLElement).closest<AaDialog>('aa-dialog')?.close() }
			>
				Cancel
			</aa-button>
			<aa-button slot="footer-primary" type="submit" variant="primary" form=${ formId }>
				${ submitLabel }
			</aa-button>
			<form id=${ formId } class="management-unlock" @submit=${ submit }>
				<p>${ description }</p>
				<label>
					<span>Management code</span>
					<input
						name="management-key"
						type="password"
						autocomplete="current-password"
						.value=${ initialKey }
						data-autofocus
						required
					/>
				</label>
				<p class="management-unlock__error" aria-live="polite"></p>
			</form>
		`,
		{ title: 'Unlock management' },
	);
};
