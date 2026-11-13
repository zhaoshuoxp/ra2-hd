// Standalone storage experiment. It is intentionally separate from runtime selection.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { deflateRaw, inflateRaw } from 'node:zlib';
import { promisify } from 'node:util';

const deflate = promisify(deflateRaw), inflate = promisify(inflateRaw);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const validPath = name => typeof name === 'string' && name.length < 512 && !name.includes('\\')
    && !path.isAbsolute(name) && name.split('/').every(p => p && p !== '.' && p !== '..');
const checkAbort = signal => { if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError'); };
const plainObject = value => value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;

export async function writeContainer(root, names, directory, compressed, chunkBytes = 1024 * 1024) {
    if (!Number.isInteger(chunkBytes) || chunkBytes < 1024 || chunkBytes > 1024 * 1024) throw Error('Invalid chunk size');
    await fs.mkdir(directory, { recursive: false });
    const handle = await fs.open(path.join(directory, 'chunks.bin'), 'wx');
    const index = { schema: 'm4-resource-chunks-v1', chunkBytes, codec: compressed ? 'deflate-raw-or-raw' : 'raw', entries: {} };
    let offset = 0;
    try {
        for (const name of names) {
            if (!validPath(name) || index.entries[name]) throw Error('Invalid or duplicate virtual path');
            const file = path.join(root, name);
            if (await fs.realpath(file) !== file) throw Error('Source must be a regular canonical file');
            const input = await fs.open(file, 'r'), size = (await input.stat()).size, fileHash = createHash('sha256');
            const entry = { bytes: size, density: /(?:(?:^|\/)([24])\/|([24])x\.)/.exec(name)?.slice(1).find(Boolean) ?? null, chunks: [] };
            try {
                for (let start = 0; start < size; start += chunkBytes) {
                    const raw = Buffer.alloc(Math.min(chunkBytes, size - start));
                    const { bytesRead } = await input.read(raw, 0, raw.length, start);
                    if (bytesRead !== raw.length) throw Error('Source changed during packing');
                    fileHash.update(raw);
                    const encoded = compressed ? await deflate(raw, { level: 6 }) : raw;
                    const useDeflate = compressed && encoded.length < raw.length, stored = useDeflate ? encoded : raw;
                    await handle.writeFile(stored);
                    entry.chunks.push({ offset, encodedBytes: stored.length, bytes: raw.length,
                        codec: useDeflate ? 'deflate-raw' : 'raw', sha256: hash(raw), encodedSha256: hash(stored) });
                    offset += stored.length;
                }
            } finally { await input.close(); }
            entry.sha256 = fileHash.digest('hex'); index.entries[name] = entry;
        }
    } finally { await handle.close(); }
    await fs.writeFile(path.join(directory, 'index.json'), JSON.stringify(index) + '\n', { flag: 'wx' });
    return index;
}

export async function openContainer(directory, { cacheBytes = 8 * 1024 * 1024 } = {}) {
    if (!Number.isSafeInteger(cacheBytes) || cacheBytes < 0 || cacheBytes > 128 * 1024 * 1024) throw Error('Invalid cache budget');
    const index = JSON.parse(await fs.readFile(path.join(directory, 'index.json'), 'utf8'));
    if (!plainObject(index) || index.schema !== 'm4-resource-chunks-v1' || !Number.isSafeInteger(index.chunkBytes)
        || index.chunkBytes < 1024 || index.chunkBytes > 1024 * 1024 || !plainObject(index.entries)) throw Error('Invalid index');
    const handle = await fs.open(path.join(directory, 'chunks.bin'), 'r'), size = (await handle.stat()).size;
    let nextOffset = 0;
    try {
        for (const [name, entry] of Object.entries(index.entries)) {
            if (!validPath(name) || !plainObject(entry) || !Array.isArray(entry.chunks) || !Number.isSafeInteger(entry.bytes)
                || entry.bytes < 0 || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw Error('Invalid entry');
            let decoded = 0;
            for (const c of entry.chunks) {
                if (!plainObject(c) || c.offset !== nextOffset || !Number.isSafeInteger(c.encodedBytes) || c.encodedBytes <= 0
                    || c.encodedBytes > index.chunkBytes + 1024 || !Number.isSafeInteger(c.bytes) || c.bytes <= 0
                    || c.bytes > index.chunkBytes || !['raw', 'deflate-raw'].includes(c.codec)
                    || !/^[a-f0-9]{64}$/.test(c.sha256) || !/^[a-f0-9]{64}$/.test(c.encodedSha256)) throw Error('Invalid chunk');
                nextOffset += c.encodedBytes; decoded += c.bytes;
            }
            if (decoded !== entry.bytes) throw Error('Invalid decoded size');
        }
        if (nextOffset !== size) throw Error('Invalid container size');
    } catch (error) { await handle.close(); throw error; }
    const cache = new Map();
    const metrics = { cacheBytes: 0, peakCacheBytes: 0, readBytes: 0, inflatedBytes: 0, cacheHits: 0, chunksRead: 0,
        readMs: 0, decodeMs: 0, hashMs: 0, estimatedPeakBufferBytes: 0 };
    let closed = false, busy = false;
    async function chunk(c, signal) {
        checkAbort(signal);
        if (cache.has(c.offset)) {
            const bytes = cache.get(c.offset); cache.delete(c.offset); cache.set(c.offset, bytes); metrics.cacheHits++; return bytes;
        }
        const stored = Buffer.alloc(c.encodedBytes), readAt = performance.now();
        const { bytesRead } = await handle.read(stored, 0, stored.length, c.offset);
        metrics.readMs += performance.now() - readAt; metrics.readBytes += bytesRead; metrics.chunksRead++;
        if (bytesRead !== stored.length) throw Error('Truncated chunk');
        checkAbort(signal);
        let at = performance.now();
        if (hash(stored) !== c.encodedSha256) throw Error('Encoded checksum mismatch');
        metrics.hashMs += performance.now() - at;
        at = performance.now();
        const raw = c.codec === 'raw' ? stored : await inflate(stored, { maxOutputLength: c.bytes });
        metrics.decodeMs += performance.now() - at; if (c.codec !== 'raw') metrics.inflatedBytes += raw.length;
        checkAbort(signal); at = performance.now();
        if (raw.length !== c.bytes || hash(raw) !== c.sha256) throw Error('Decoded checksum mismatch');
        metrics.hashMs += performance.now() - at;
        if (raw.length <= cacheBytes) {
            while (metrics.cacheBytes + raw.length > cacheBytes) {
                const first = cache.keys().next().value; metrics.cacheBytes -= cache.get(first).length; cache.delete(first);
            }
            cache.set(c.offset, raw); metrics.cacheBytes += raw.length;
            metrics.peakCacheBytes = Math.max(metrics.peakCacheBytes, metrics.cacheBytes);
        }
        return raw;
    }
    return { index, metrics,
        async read(name, { offset = 0, length, signal } = {}) {
            if (closed || busy) throw Error('Reader is closed or busy; concurrency is bounded to one request');
            const entry = index.entries[name];
            if (!entry) throw Error('Unknown virtual path');
            length ??= entry.bytes - offset;
            if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > entry.bytes) throw Error('Invalid range');
            checkAbort(signal); busy = true;
            try {
                const result = Buffer.alloc(length);
                // Result + cache cap + encoded/decoded chunk buffers. Codec
                // working memory, V8 and caller-retained results are excluded.
                metrics.estimatedPeakBufferBytes = Math.max(metrics.estimatedPeakBufferBytes,
                    length + cacheBytes + index.chunkBytes * 2 + 1024);
                let start = 0;
                for (const c of entry.chunks) {
                    if (start < offset + length && start + c.bytes > offset) {
                        const bytes = await chunk(c, signal), from = Math.max(0, offset - start), to = Math.min(c.bytes, offset + length - start);
                        bytes.copy(result, Math.max(0, start - offset), from, to);
                    }
                    start += c.bytes;
                }
                checkAbort(signal);
                if (offset === 0 && length === entry.bytes && hash(result) !== entry.sha256) throw Error('File checksum mismatch');
                return result;
            } finally { busy = false; }
        },
        async close() { if (busy) throw Error('Cannot close an active read'); closed = true; cache.clear(); metrics.cacheBytes = 0; await handle.close(); },
    };
}
