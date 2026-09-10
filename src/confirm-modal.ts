import { Modal, type App } from "obsidian";

/** Small confirm dialog — avoids window.confirm for Obsidian plugin lint. */
export class ConfirmModal extends Modal {
	private resolved = false;

	constructor(
		app: App,
		private message: string,
		private onConfirm: () => void | Promise<void>,
		private confirmLabel = "Delete",
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("p", { cls: "byc-confirm-msg", text: this.message });
		const row = contentEl.createDiv({ cls: "modal-button-container" });
		const cancel = row.createEl("button", { text: "Cancel" });
		cancel.addEventListener("click", () => this.close());
		const ok = row.createEl("button", { text: this.confirmLabel, cls: "mod-warning" });
		ok.addEventListener("click", () => {
			if (this.resolved) return;
			this.resolved = true;
			void Promise.resolve(this.onConfirm()).finally(() => this.close());
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
