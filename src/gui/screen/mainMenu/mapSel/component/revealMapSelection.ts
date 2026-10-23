// Scroll only the map list. DOM scrollIntoView also moves the scaled menu's ancestors.
export function revealMapSelection(list: HTMLElement, selected: HTMLElement): void {
    if (!list.contains(selected) || !list.clientHeight) return;
    const viewport = list.getBoundingClientRect();
    const row = selected.getBoundingClientRect();
    const scale = viewport.height / list.offsetHeight;
    if (!Number.isFinite(scale) || scale <= 0) return;
    const top = viewport.top + list.clientTop * scale;
    const bottom = top + list.clientHeight * scale;
    if (row.top < top || row.height > bottom - top) {
        list.scrollTop += (row.top - top) / scale;
    } else if (row.bottom > bottom) {
        list.scrollTop += (row.bottom - bottom) / scale;
    }
}
