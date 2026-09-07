export function el<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	options?: {
		cls?: string;
		text?: string;
		type?: string;
		placeholder?: string;
		title?: string;
		attr?: Record<string, string>;
	},
): HTMLElementTagNameMap[K] {
	const node = document.createElement(tag);
	if (options?.cls) node.className = options.cls;
	if (options?.text) node.textContent = options.text;
	if (options?.type) node.setAttribute("type", options.type);
	if (options?.placeholder) node.setAttribute("placeholder", options.placeholder);
	if (options?.title) node.title = options.title;
	if (options?.attr) {
		for (const [key, value] of Object.entries(options.attr)) {
			node.setAttribute(key, value);
		}
	}
	return node;
}

export function div(cls?: string, text?: string): HTMLDivElement {
	return el("div", { cls, text });
}

export function mount(parent: HTMLElement, child: HTMLElement): HTMLElement {
	parent.appendChild(child);
	return child;
}
