import { afterEach, expect, test } from 'bun:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openContainer, writeContainer } from './resource-container.mjs';

const directories: string[] = [];
afterEach(async () => { for (const d of directories.splice(0)) await fs.rm(d, { recursive: true }); });
async function fixture() {
    const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'm4-chunks-'))); directories.push(root);
    await fs.mkdir(path.join(root, 'source/2'), { recursive: true });
    await fs.mkdir(path.join(root, 'source/4'), { recursive: true });
    const a = Buffer.alloc(12000, 13), b = Buffer.from(Array.from({ length: 15000 }, (_, i) => (i * 71) % 251));
    await fs.writeFile(path.join(root, 'source/2/p0.bin'), a); await fs.writeFile(path.join(root, 'source/4/p0.bin'), b);
    return { root, a, b };
}

test('independent densities, cross-chunk range, eviction, owned results and disposal', async () => {
    const { root, a, b } = await fixture(), output = path.join(root, 'compressed');
    await writeContainer(path.join(root, 'source'), ['2/p0.bin', '4/p0.bin'], output, true, 4096);
    const reader = await openContainer(output, { cacheBytes: 4096 });
    expect(await reader.read('2/p0.bin')).toEqual(a);
    const range = await reader.read('4/p0.bin', { offset: 3500, length: 6000 });
    expect(range).toEqual(b.subarray(3500, 9500)); range.fill(0);
    expect(await reader.read('4/p0.bin', { offset: 3500, length: 6000 })).toEqual(b.subarray(3500, 9500));
    expect(reader.metrics.peakCacheBytes).toBeLessThanOrEqual(4096);
    expect(reader.index.entries['2/p0.bin'].density).toBe('2');
    expect(reader.index.entries['4/p0.bin'].density).toBe('4');
    await expect(reader.read('missing')).rejects.toThrow('Unknown virtual path');
    await reader.close(); expect(reader.metrics.cacheBytes).toBe(0);
    await expect(reader.read('2/p0.bin')).rejects.toThrow('closed');
});

test('abort never publishes partial data and corruption fails before exposure', async () => {
    const { root } = await fixture(), output = path.join(root, 'raw');
    await writeContainer(path.join(root, 'source'), ['2/p0.bin', '4/p0.bin'], output, false, 4096);
    const reader = await openContainer(output, { cacheBytes: 0 }), controller = new AbortController();
    controller.abort(); await expect(reader.read('4/p0.bin', { signal: controller.signal })).rejects.toThrow();
    expect(reader.metrics.chunksRead).toBe(0);
    const running = new AbortController(), pending = reader.read('4/p0.bin', { signal: running.signal });
    running.abort(); await expect(pending).rejects.toThrow(); expect(reader.metrics.cacheBytes).toBe(0);
    const file = await fs.open(path.join(output, 'chunks.bin'), 'r+'); await file.write(Buffer.from([255]), 0, 1, 0); await file.close();
    await expect(reader.read('2/p0.bin')).rejects.toThrow('checksum'); await reader.close();
    const index = JSON.parse(await fs.readFile(path.join(output, 'index.json'), 'utf8'));
    index.entries['2/p0.bin'].chunks[0].bytes = 2 ** 30;
    await fs.writeFile(path.join(output, 'index.json'), JSON.stringify(index));
    await expect(openContainer(output)).rejects.toThrow('Invalid chunk');
});

test('malformed index sizes and structures cannot bypass decode bounds', async () => {
    const { root } = await fixture(), output = path.join(root, 'raw');
    const index = await writeContainer(path.join(root, 'source'), ['2/p0.bin'], output, false, 4096);
    const cases = [
        { ...index, chunkBytes: undefined }, { ...index, chunkBytes: '4096' }, { ...index, chunkBytes: null },
        { ...index, chunkBytes: 4096.5 }, { ...index, entries: [] }, { ...index, entries: null },
        { ...index, entries: { '2/p0.bin': null } },
        { ...index, entries: { '2/p0.bin': { ...index.entries['2/p0.bin'], chunks: {} } } },
        { ...index, entries: { '2/p0.bin': { ...index.entries['2/p0.bin'], chunks: [null] } } },
    ];
    for (const invalid of cases) {
        await fs.writeFile(path.join(output, 'index.json'), JSON.stringify(invalid));
        await expect(openContainer(output)).rejects.toThrow('Invalid');
    }
});
