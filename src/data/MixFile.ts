import { DataStream } from "./DataStream";
import { Blowfish } from "./encoding/Blowfish";
import { BlowfishKey } from "./encoding/BlowfishKey";
import { MixEntry } from "./MixEntry";
import { VirtualFile } from "./vfs/VirtualFile";
enum MixFileFlags {
    Checksum = 0x00010000,
    Encrypted = 0x00020000
}
export class MixFile {
    private stream: DataStream;
    private headerStart = 84;
    private index: Map<number, MixEntry>;
    private dataStart: number = 0;
    private declaredDataSize = 0;
    constructor(stream: DataStream) {
        this.stream = stream;
        this.index = new Map<number, MixEntry>();
        this.stream.dynamicSize = false;
        this.parseHeader();
        if (this.dataStart + this.declaredDataSize > this.stream.byteLength) {
            throw new Error("MIX data region exceeds archive bounds");
        }
        for (const entry of this.index.values()) {
            if (entry.offset + entry.length > this.declaredDataSize) {
                throw new Error(`MIX member ${entry.hash.toString(16)} exceeds data bounds`);
            }
        }
    }
    private parseHeader(): void {
        const flags = this.stream.readUint32();
        const isWestwoodMix = (flags & ~(MixFileFlags.Checksum | MixFileFlags.Encrypted)) === 0;
        if (isWestwoodMix) {
            if ((flags & MixFileFlags.Encrypted) !== 0) {
                this.dataStart = this.parseRaHeader();
                return;
            }
        }
        else {
            this.stream.seek(0);
        }
        this.dataStart = this.parseTdHeader(this.stream);
    }
    private parseRaHeader(): number {
        const e = this.stream;
        var t: any = e.readUint8Array(80), i: any = new BlowfishKey().decryptKey(t), r: any = e.readUint32Array(2);
        const s = new Blowfish(i);
        let a = new DataStream(s.decrypt(r));
        t = a.readUint16();
        a.readUint32(), (e.position = this.headerStart);
        (i = 6 + t * MixEntry.size),
            (t = ((3 + i) / 4) | 0),
            (r = e.readUint32Array(t + (t % 2)));
        a = new DataStream(s.decrypt(r));
        i = this.headerStart + i + ((1 + (~i >>> 0)) & 7);
        this.parseTdHeader(a);
        return i;
    }
    private parseTdHeader(e: DataStream): number {
        const count = e.readUint16();
        this.declaredDataSize = e.readUint32();
        if (e.position + count * MixEntry.size > e.byteLength) {
            throw new Error("Truncated MIX index");
        }
        for (let i = 0; i < count; i++) {
            const entry = new MixEntry(e.readUint32(), e.readUint32(), e.readUint32());
            if (this.index.has(entry.hash)) {
                throw new Error(`Duplicate MIX member ID ${entry.hash.toString(16)}`);
            }
            this.index.set(entry.hash, entry);
        }
        return e.position;
    }
    public getEntries(): readonly MixEntry[] {
        return Array.from(this.index.values());
    }
    public containsFile(filename: string): boolean {
        return this.index.has(MixEntry.hashFilename(filename));
    }
    public openFile(filename: string): VirtualFile {
        const fileId = MixEntry.hashFilename(filename);
        const entry = this.index.get(fileId);
        if (!entry) {
            throw new Error(`File "${filename}" not found`);
        }
        return VirtualFile.factory(this.stream, filename, this.dataStart + entry.offset, entry.length);
    }
}
