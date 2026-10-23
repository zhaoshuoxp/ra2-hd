import { VirtualFile } from './vfs/VirtualFile';

/** RA2's 32 normal-lighting lookup rows. The embedded palette is not the unit palette. */
export class VplFile {
    readonly remapStart: number;
    readonly remapEnd: number;
    readonly tables: Uint8Array;

    constructor(file: VirtualFile) {
        const bytes = file.getBytes();
        if (bytes.length !== 16 + 768 + 32 * 256) throw new Error('Invalid RA2 VPL length');
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        this.remapStart = view.getUint32(0, true);
        this.remapEnd = view.getUint32(4, true);
        if (view.getUint32(8, true) !== 32 || this.remapStart !== 16 || this.remapEnd !== 31) {
            throw new Error('Unsupported RA2 VPL sections or player remap range');
        }
        this.tables = bytes.slice(16 + 768);
    }
}
