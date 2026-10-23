// Future overlay contract. No host, controls or viewport reservation until bound.
export interface OptionalToolbarSlot {
    mount(host: HTMLElement): () => void;
    readonly placement: 'overlay';
    readonly maxLogicalHeight: 32;
}
