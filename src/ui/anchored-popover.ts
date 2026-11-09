/**
 * Places a shown `popover` element next to an anchor, inside the viewport. Popovers live in
 * the top layer, so they escape scrolling, clipping and transformed (zoomed) ancestors.
 */
export const placePopover = (
	popover: HTMLElement,
	anchor: Element,
	gap = 6,
	align: 'start' | 'center' = 'start',
): void => {
	const anchorBox = anchor.getBoundingClientRect();
	const margin = 8;
	popover.style.position = 'fixed';
	popover.style.inset = 'auto';
	popover.style.margin = '0';

	const { offsetWidth: width, offsetHeight: height } = popover;
	const preferredLeft = align === 'center'
		? anchorBox.left + (anchorBox.width - width) / 2
		: anchorBox.left;
	const left = Math.min(Math.max(margin, preferredLeft), window.innerWidth - width - margin);
	const below = anchorBox.bottom + gap;
	const top = below + height <= window.innerHeight - margin
		? below
		: Math.max(margin, anchorBox.top - height - gap);

	popover.style.left = `${ Math.max(margin, left) }px`;
	popover.style.top = `${ top }px`;
};

/** Shows a popover and places it next to the anchor. */
export const showPopoverAt = (popover: HTMLElement, anchor: Element): void => {
	if (!popover.matches(':popover-open'))
		popover.showPopover();

	placePopover(popover, anchor);
};

export const hidePopover = (popover: HTMLElement | null | undefined): void => {
	if (popover?.matches(':popover-open'))
		popover.hidePopover();
};
