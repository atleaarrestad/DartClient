/**
 * True when a slot has assigned content other than whitespace-only text.
 * Accepts the slot itself or a `slotchange` event whose currentTarget is the slot.
 */
export const slotHasContent = (source: HTMLSlotElement | Event): boolean => {
	const slot = source instanceof Event
		? source.currentTarget as HTMLSlotElement
		: source;

	return slot.assignedNodes({ flatten: true })
		.some(node => node.nodeType !== Node.TEXT_NODE || Boolean(node.textContent?.trim()));
};
