import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { writeContainer, openContainer } from './resource-container.mjs';
import { distribution } from './statistics.mjs';

const root = path.resolve(import.meta.dirname, '../..'), out = path.resolve(process.argv[2]);
await fs.mkdir(out, { recursive: false });
const resources = path.join(root, '.local'), plan = JSON.parse(await fs.readFile(process.argv[3]));
const selected = [...plan.files, ...plan.campaignFiles.map(n => 'campaign/' + n)];
const inventory = {}, sha = b => createHash('sha256').update(b).digest('hex');
const fileHashes = [];
for (const name of selected) {
    const file = path.join(resources, name), stat = await fs.stat(file);
    let category = name.split('/')[0];
    if (!name.includes('/')) category = 'registration';
    if (['ra2', 'yr', 'upstream-support'].includes(category)) category = 'original-import';
    const group = inventory[category] ??= { files: 0, bytes: 0 }; group.files++; group.bytes += stat.size;
    const hash = createHash('sha256'), handle = await fs.open(file, 'r');
    try { for await (const chunk of handle.createReadStream()) hash.update(chunk); }
    finally { await handle.close(); }
    fileHashes.push({ path: name, bytes: stat.size, sha256: hash.digest('hex') });
}
await fs.writeFile(path.join(out, 'selected-hashes.json'), JSON.stringify(fileHashes));
const names = [
    'terrain-packs/yr-temperate-dirtroads-r6/ground-2x.rgba',
    'terrain-packs/yr-temperate-dirtroads-r6/ground-4x.rgba',
    'prepared-hd/dd3f67f96968c4b821852728af618c4d4f1a2fac0b822e3d09c3ab8cf8da3a64/2/p0.bin',
    'prepared-hd/dd3f67f96968c4b821852728af618c4d4f1a2fac0b822e3d09c3ab8cf8da3a64/4/p0.bin',
    'media/hd-movies/downloaded-1080p-r1/ra2-a02_p01e.mp4',
];
const png = selected.find(name => name.startsWith('hd-packs/') && name.endsWith('.png') && name.includes('4x'))
    ?? selected.find(name => name.startsWith('hd-packs/') && name.endsWith('.png'));
if (png) names.push(png);
for (const name of names) assert(selected.includes(name), 'Prototype must use selected resources: ' + name);
const report = { schema: 'm4-storage-prototype-v1', status: 'RUNNING', inventory,
    selectedFiles: selected.length, selectedBytes: fileHashes.reduce((sum, f) => sum + f.bytes, 0),
    selectedHashManifestSha256: sha(Buffer.from(JSON.stringify(fileHashes))), names,
    chunkBytes: 1024 * 1024, cacheBytes: 8 * 1024 * 1024, concurrency: 1, modes: [],
    scope: 'Standalone selected-resource I/O and exact lossless decode. No runtime selector or shipped format changes.',
    osCache: 'First application read and repeated warm reads; OS filesystem cache is not flushed.',
    uploadMs: 'UNAVAILABLE: standalone prototype is not connected to the renderer',
    firstFrameWaitMs: 'UNAVAILABLE: no runtime integration',
    preparationMs: 'UNAVAILABLE: existing prepared-page consumer is unchanged',
    gpuMemory: 'UNAVAILABLE', updateScope: 'Independent 1MiB chunks; changed chunks require a new immutable index.' };
const source = {};
for (const name of names) source[name] = fileHashes.find(f => f.path === name);
const rss = [], monitor = setInterval(() => rss.push(process.memoryUsage().rss), 5);
try {
    for (const mode of ['scatter', 'indexed-raw', 'indexed-deflate']) {
        const directory = path.join(out, mode), packingAt = performance.now();
        if (mode !== 'scatter') await writeContainer(resources, names, directory, mode === 'indexed-deflate');
        const packingMs = performance.now() - packingAt, samples = [], first = [], reader = mode === 'scatter' ? null : await openContainer(directory);
        const residentAtStart = process.memoryUsage().rss;
        for (let repeat = 0; repeat < 5; repeat++) {
            const at = performance.now();
            for (const name of names) {
                const begun = performance.now(), bytes = reader ? await reader.read(name) : await fs.readFile(path.join(resources, name));
                assert.equal(bytes.length, source[name].bytes); assert.equal(sha(bytes), source[name].sha256);
                if (repeat === 0) first.push({ name, readVerifyMs: performance.now() - begun });
            }
            samples.push(performance.now() - at);
        }
        if (reader) {
            const movie = names.find(n => n.endsWith('.mp4')), bytes = await fs.readFile(path.join(resources, movie));
            for (const [offset, length] of [[0, 4096], [100001, 10000], [bytes.length - 1024, 1024]]) {
                assert.deepEqual(await reader.read(movie, { offset, length }), bytes.subarray(offset, offset + length));
            }
            const abort = new AbortController(); abort.abort();
            await assert.rejects(reader.read(names[0], { signal: abort.signal }));
            assert(reader.metrics.peakCacheBytes <= report.cacheBytes);
        }
        let bytes = names.reduce((sum, name) => sum + source[name].bytes, 0), files = names.length;
        if (reader) { files = 2; bytes = (await fs.stat(path.join(directory, 'index.json'))).size + (await fs.stat(path.join(directory, 'chunks.bin'))).size; }
        report.modes.push({ mode, bytes, files, packingMs, samplesMs: samples, firstPass: first,
            warmReadVerifyMs: distribution(samples.slice(1)), metrics: reader && { ...reader.metrics }, residentAtStart,
            residentAfter: process.memoryUsage().rss, exactDecodedBytes: true, rangeAndCancel: reader ? 'PASS' : 'Existing filesystem API',
            peakRssSoFar: Math.max(...rss, process.memoryUsage().rss) });
        if (reader) await reader.close();
    }
    report.status = 'PASS_STANDALONE_PROTOTYPE';
    report.decision = 'Keep current runtime storage. Compression reduces prototype bytes but adds verification/decompression work; no measured combat or first-frame benefit establishes runtime adoption.';
} finally {
    clearInterval(monitor); report.peakRss = Math.max(...rss, process.memoryUsage().rss);
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify({ status: report.status, selectedFiles: report.selectedFiles, selectedBytes: report.selectedBytes,
    inventory, modes: report.modes.map(m => ({ mode: m.mode, bytes: m.bytes, warmMs: m.warmReadVerifyMs.mean })) }));
