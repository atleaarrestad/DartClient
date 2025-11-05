import { injectable } from "tsyringe";
import { AaDialog } from "../components/aa-dialog.js";
import { TemplateResult, render } from "lit";

@injectable()
export class DialogService {
  open<T = void>(content: HTMLElement | string | TemplateResult, options?: { title?: string }): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      if (document.querySelector("aa-dialog")) {
        reject(new Error("A dialog is already open"));
        return;
      }

      const dialog = document.createElement("aa-dialog") as AaDialog;
		if (options?.title) {
			dialog.title = options.title;
		}
      if (typeof content === "string") {
        dialog.innerHTML += content;
      } else if (content instanceof HTMLElement) {
        dialog.appendChild(content);
      } else {
        const fragment = document.createDocumentFragment();
        render(content, fragment);
        dialog.appendChild(fragment);
      }

      dialog.addEventListener("dialog-closed", (e: Event) => {
        const customEvent = e as CustomEvent<{ result?: T }>;
        dialog.remove();
        resolve(customEvent.detail?.result);
      });

      document.body.appendChild(dialog);
    });
  }
}
