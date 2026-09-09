/**
 * Browser preview shim for Obsidian DOM helpers used by `src/`.
 * Keep createElement / createElementNS out of plugin source so prefer-create-el stays clean.
 */

function installCreateEl(): void {
	const createEl = <K extends keyof HTMLElementTagNameMap>(
		tag: K,
		_o?: unknown,
		callback?: (el: HTMLElementTagNameMap[K]) => void,
	): HTMLElementTagNameMap[K] => {
		const node = document.createElement(tag);
		callback?.(node);
		return node;
	};

	const createSvg = <K extends keyof SVGElementTagNameMap>(
		tag: K,
		_o?: unknown,
		callback?: (el: SVGElementTagNameMap[K]) => void,
	): SVGElementTagNameMap[K] => {
		const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
		callback?.(node);
		return node;
	};

	// Preview has no Obsidian globals; assign helpers for src/dom and src/ui-helpers.
	(window as unknown as { createEl: typeof createEl }).createEl = createEl;
	(window as unknown as { createSvg: typeof createSvg }).createSvg = createSvg;

	const proto = HTMLElement.prototype as HTMLElement & {
		createEl?: typeof createEl;
		createSvg?: typeof createSvg;
	};
	if (typeof proto.createEl !== "function") {
		proto.createEl = function (this: HTMLElement, tag, o, callback) {
			const node = createEl(tag, o, callback);
			this.appendChild(node);
			return node;
		};
	}
	if (typeof proto.createSvg !== "function") {
		proto.createSvg = function (this: HTMLElement, tag, o, callback) {
			const node = createSvg(tag, o, callback);
			this.appendChild(node);
			return node;
		};
	}
}

installCreateEl();
