const focusableSelector = [
	'a[href]',
	'area[href]',
	'button',
	'input',
	'select',
	'textarea',
	'iframe',
	'summary',
	'[tabindex]',
	'[contenteditable]:not([contenteditable="false"])',
].join(', ');

const isTabbable = (element: HTMLElement): boolean => {
	if (!element.matches(focusableSelector) || element.tabIndex < 0)
		return false;
	if ('disabled' in element && element.disabled)
		return false;
	if (element instanceof HTMLInputElement && element.type === 'hidden')
		return false;

	// Not rendered (display: none, or inside a hidden ancestor).
	return element.getClientRects().length > 0;
};

/**
 * Tabbable elements under `root` in flat-tree order: open shadow roots are
 * entered and slots are replaced by their assigned (or fallback) content.
 */
export const getTabbableElements = (root: Element): HTMLElement[] => {
	const tabbables: HTMLElement[] = [];

	const visit = (element: Element): void => {
		if (element instanceof HTMLElement && (element.inert || element.hidden))
			return;
		if (element instanceof HTMLElement && isTabbable(element))
			tabbables.push(element);

		const children = element instanceof HTMLSlotElement
			? element.assignedElements({ flatten: true })
			: Array.from(element.shadowRoot?.children ?? element.children);

		children.forEach(visit);
	};

	visit(root);

	return tabbables;
};

/** The focused element, looking through open shadow roots. */
export const getDeepActiveElement = (): Element | null => {
	let active = document.activeElement;
	while (active?.shadowRoot?.activeElement)
		active = active.shadowRoot.activeElement;

	return active;
};

/** Whether `node` is `container` or inside it, crossing shadow boundaries. */
export const containsComposed = (container: Node, node: Node | null): boolean => {
	let current: Node | null = node;
	while (current) {
		if (current === container)
			return true;

		current = current.parentNode ?? (current instanceof ShadowRoot ? current.host : null);
	}

	return false;
};
