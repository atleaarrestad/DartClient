import { render, TemplateResult } from 'lit';
import { injectable } from 'tsyringe';

import type { AaDialog } from '../components/aa-dialog/aa-dialog.js';

@injectable()
export class DialogService {

	open<T = void>(
		content: TemplateResult,
		options?: {
			title?: string;
			fixedHeight?: boolean;
			large?: boolean;
			/** A narrow dialog for a short form or question. */
			compact?: boolean;
			canClose?: () => boolean;
		},
	): Promise<T | undefined> {
		return new Promise((resolve, reject) => {
			if (document.querySelector('aa-dialog')) {
				reject(new Error('A dialog is already open'));

				return;
			}

			const dialog = document.createElement('aa-dialog') as AaDialog;
			if (options?.title)
				dialog.heading = options.title;
			if (options?.fixedHeight)
				dialog.fixedHeight = true;
			if (options?.large)
				dialog.large = true;
			if (options?.compact)
				dialog.compact = true;
			if (options?.canClose)
				dialog.canClose = options.canClose;

			const fragment = document.createDocumentFragment();
			render(content, fragment);
			dialog.appendChild(fragment);

			dialog.addEventListener('dialog-closed', (e: Event) => {
				const customEvent = e as CustomEvent<{ result?: T; }>;
				dialog.remove();
				resolve(customEvent.detail?.result);
			});

			document.body.appendChild(dialog);

			queueMicrotask(() => {
				const autofocusElement = dialog.querySelector<HTMLElement>('[data-autofocus]');
				autofocusElement?.focus();
			});
		});
	}

}
