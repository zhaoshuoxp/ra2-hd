// Cache immutable, hash-checked CPU payloads. Every match creates its own textures.
export class PreparedHdCache {
    private entries = new Map<string, Uint8Array>();
    private pending = new Map<string, Promise<Uint8Array>>();
    private generation = 0;
    readonly report = { bytes: 0, peakBytes: 0, pendingBytes: 0, hits: 0, misses: 0, shared: 0, evictions: 0, uncached: 0 };
    constructor(readonly limit = 128 * 1024 * 1024, readonly maximumEntry = 16 * 1024 * 1024) {
        if (!Number.isSafeInteger(limit) || limit < 0 || !Number.isSafeInteger(maximumEntry) || maximumEntry < 1)
            throw Error('prepared-cache-limit');
    }
    private makeRoom(size: number) {
        while (this.report.bytes + this.report.pendingBytes + size > this.limit && this.entries.size) {
            const oldest = this.entries.keys().next().value!;
            this.report.bytes -= this.entries.get(oldest)!.byteLength;
            this.entries.delete(oldest); this.report.evictions++;
        }
    }
    async read(key: string, size: number, load: () => Promise<Uint8Array>): Promise<Uint8Array> {
        if (!Number.isSafeInteger(size) || size < 1) throw Error('prepared-payload-size');
        const cached = this.entries.get(key);
        if (cached) {
            if (cached.byteLength !== size) throw Error('prepared-payload-size');
            this.entries.delete(key); this.entries.set(key, cached);
            this.report.hits++;
            return cached;
        }
        const pending = this.pending.get(key);
        if (pending) {
            this.report.shared++;
            const bytes = await pending;
            if (bytes.byteLength !== size) throw Error('prepared-payload-size');
            return bytes;
        }
        this.report.misses++;
        // Large one-off pages must not flush a nearly fitting set of smaller
        // reusable pages on every map entry. They still use prepared pixels.
        if (size > Math.min(this.limit, this.maximumEntry) || this.pending.size >= 4 || this.report.pendingBytes + size > this.limit) {
            this.report.uncached++;
            const bytes = await load();
            if (bytes.byteLength !== size) throw Error('prepared-payload-size');
            return bytes;
        }
        const generation = this.generation;
        this.makeRoom(size);
        this.report.pendingBytes += size;
        let reserved = true;
        const request = Promise.resolve().then(load).then(bytes => {
            if (bytes.byteLength !== size) throw Error('prepared-payload-size');
            if (generation === this.generation && size <= this.limit) {
                this.report.pendingBytes -= size; reserved = false;
                this.makeRoom(size);
                this.entries.set(key, bytes);
                this.report.bytes += size;
                this.report.peakBytes = Math.max(this.report.peakBytes, this.report.bytes);
            }
            return bytes;
        }).finally(() => {
            if (this.pending.get(key) === request) {
                this.pending.delete(key);
                if (reserved) this.report.pendingBytes -= size;
            }
        });
        this.pending.set(key, request);
        return request;
    }
    clear() {
        this.entries.clear();
        this.pending.clear();
        this.generation++;
        this.report.bytes = 0;
        this.report.pendingBytes = 0;
    }
}
