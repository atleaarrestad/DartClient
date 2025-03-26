import { injectable } from "tsyringe";
import { AaDialog } from "../components/aa-dialog.js";
import { TemplateResult, render } from "lit";

@injectable()
export class DialogService {
	open(content: HTMLElement | string | TemplateResult): Promise<void> {
		return new Promise((resolve) => {
			const dialog = document.createElement("aa-dialog") as AaDialog;

			if (typeof content === "string") {
				dialog.innerHTML += content;
			}
			else if (content instanceof HTMLElement) {
				dialog.appendChild(content);
			}
			else {
				const fragment = document.createDocumentFragment();
				render(content, fragment);
				dialog.appendChild(fragment);
			}

			dialog.addEventListener("dialog-closed", () => {
				dialog.remove();
				resolve();
			});

			document.body.appendChild(dialog);
		});
	}
}
