import { TmpImage } from "./TmpImage";
import { VirtualFile } from "./vfs/VirtualFile";
import { DataStream } from "./DataStream";
export class TmpFile {
    public images: TmpImage[] = [];
    public width: number = 0;
    public height: number = 0;
    public blockWidth: number = 0;
    public blockHeight: number = 0;
    public filename = '';
    public sourceBytes?: Uint8Array;
    public emptySlots: number[] = [];
    constructor(file?: VirtualFile) {
        if (file instanceof VirtualFile) {
            this.fromVirtualFile(file);
        }
    }
    private fromVirtualFile(file: VirtualFile): void {
        this.filename = file.filename.toLowerCase();
        this.sourceBytes = file.getBytes();
        const stream = file.stream as DataStream;
        stream.seek(0);
        if (stream.byteLength < 16) throw Error(`Invalid TMP header: ${this.filename}`);
        this.width = stream.readInt32();
        this.height = stream.readInt32();
        this.blockWidth = stream.readInt32();
        this.blockHeight = stream.readInt32();
        const numberOfTiles = this.width * this.height;
        if (!Number.isSafeInteger(numberOfTiles) || this.width < 0 || this.height < 0
            || numberOfTiles > (stream.byteLength - 16) / 4) {
            throw Error(`Invalid TMP offset table: ${this.filename}`);
        }
        if (numberOfTiles <= 0)
            return;
        const imageOffsets: number[] = [];
        for (let i = 0; i < numberOfTiles; i++) {
            imageOffsets.push(stream.readInt32());
        }
        // A header/table-only container with zero pointers declares empty slots.
        // Keep their indices and the owning TileSetEntry; it supplies no terrain image.
        if (stream.byteLength === 16 + numberOfTiles * 4 && imageOffsets.every(offset => offset === 0)) {
            if (this.blockWidth <= 0 || this.blockHeight <= 0) throw Error(`Invalid empty TMP dimensions: ${this.filename}`);
            this.emptySlots = imageOffsets.map((_, index) => index);
            this.images = new Array(numberOfTiles);
            return;
        }
        this.images = [];
        for (let i = 0; i < numberOfTiles; i++) {
            let offset = imageOffsets[i];
            if (offset < 0) {
                throw Error(`Invalid TMP image offset ${offset}: ${this.filename}`);
            }
            stream.seek(offset);
            const image = new TmpImage(stream, this.blockWidth, this.blockHeight);
            this.images.push(image);
        }
    }
    public getTile(tileX: number, tileY: number): TmpImage | undefined {
        if (tileX < 0 || tileX >= this.width || tileY < 0 || tileY >= this.height) {
            return undefined;
        }
        const index = tileY * this.width + tileX;
        return this.images[index];
    }
}
