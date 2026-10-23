import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import * as THREE from 'three';
import { registerHdResources } from '../../desktop/hd-profile.mjs';
import type { HdSource, HdPageReader } from '../../src/engine/renderable/builder/resolveHdSprite';
import { createPreparedHdPage, type PreparedPageBinding } from '../../src/engine/renderable/builder/preparedHdPage';

const root = path.resolve('.local'), output = path.join(root, 'prepared-hd');
const edition = process.argv[2] ?? 'ra2';
assert(['ra2', 'yr'].includes(edition));
(globalThis as any).location = { search: `?edition=${edition}` };
const { resolveHdSprite, disposeHdSprite } = await import('../../src/engine/renderable/builder/resolveHdSprite');
await fs.mkdir(output, { recursive: true });
const hd = await registerHdResources(root);
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const members = new Map<string, { files: Record<string, string>; lossless: boolean }>();
for (const [route, selection] of hd.selections) {
    if (!route.startsWith('/local-hd/') || route.includes('/unit-') || selection.rulesIdentity) continue;
    const lossless = route !== '/local-hd/power-plant-selection.json' && route !== '/local-hd/selection.json';
    for (const binding of selection.members ?? (selection.sha256 && selection.files ? [selection] : []))
        members.set(binding.sha256, { files: binding.files, lossless });
}
let index: any = { schemaVersion: 1, storage: 'prepared-hd-pages-v1', members: {} };
let proof: any[] = [];
const excluded: any[] = [];
try {
    const contract = JSON.parse(await fs.readFile('desktop/prepared-hd-contract.json'));
    const bytes = await fs.readFile(path.join(root, contract.indexPath ?? 'prepared-hd/index.json'));
    assert.equal(digest(bytes), contract.sha256);
    const existingIndex = JSON.parse(bytes);
    const report = JSON.parse(await fs.readFile(path.join(output, 'proofs', contract.sha256 + '.json'))
        .catch(error => {
            if (error.code !== 'ENOENT') throw error;
            return fs.readFile('.artifacts/skirmish-loading/preparation.json');
        }));
    assert.equal(report.indexSha256, contract.sha256);
    for (const [hash, densities] of Object.entries(existingIndex.members) as any) for (const [density, pages] of Object.entries(densities))
        for (const [id, page] of Object.entries(pages) as any)
            assert.equal(digest(await fs.readFile(path.join(output, hash, density, id + '.bin'))), page.sha256);
    index = existingIndex;
    proof = report.proof;
} catch (error) { if (error.code !== 'ENOENT') throw error; }
const decodedRoot = path.resolve('.artifacts/skirmish-loading/decoded-pages');
await fs.mkdir(decodedRoot, { recursive: true });
const decoder = spawn(path.resolve('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
    [path.resolve('scripts/skirmish-loading/decode-electron.mjs'), path.resolve('.')], { stdio: ['pipe', 'pipe', 'inherit'] });
const responses = new Map<number, { resolve(): void; reject(error: Error): void }>();
let sequence = 0;
readline.createInterface({ input: decoder.stdout }).on('line', line => {
    try {
        const result = JSON.parse(line), waiting = responses.get(result.id);
        if (waiting) { responses.delete(result.id); result.error ? waiting.reject(Error(result.error)) : waiting.resolve(); }
    } catch { /* Electron diagnostic output is not a decoder response. */ }
});
decoder.on('exit', code => {
    responses.forEach(waiting => waiting.reject(Error(`Pixel decoder exited (${code})`)));
    responses.clear();
});
const decodePage = async (file: string, hash: string) => {
    const output = path.join(decodedRoot, hash + '.rgba');
    try { return await fs.readFile(output); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const id = ++sequence;
    await new Promise<void>((resolve, reject) => {
        responses.set(id, { resolve, reject });
        decoder.stdin.write(JSON.stringify({ id, file, output }) + '\n');
    });
    return fs.readFile(output);
};
let totalBytes = proof.reduce((sum, row) => sum + row.gpuBytes, 0);
let totalPages = proof.reduce((sum, row) => sum + row.pages, 0);
try {
    for (const [hash, binding] of members) {
        if (index.members[hash]?.[2] && index.members[hash]?.[4]) continue;
        const file = hd.routes.get(`/local-hd/${hash}/manifest.json`)!;
        assert(file, `Missing manifest route ${hash}`);
        const original = new Uint8Array(await fs.readFile(file));
        assert.equal(digest(original), hash);
        const manifest = JSON.parse(new TextDecoder().decode(original));
        const source: HdSource = { ...manifest.source, canvas: manifest.logical.canvas, frames: manifest.logical.frames };
        const decoded = new Map<string, any>();
        const read: HdPageReader = async (name, sha, bytes) => {
            if (decoded.has(name)) return decoded.get(name);
            const file = hd.routes.get(binding.files[name])!;
            assert(file, name);
            const encoded = new Uint8Array(await fs.readFile(file));
            assert.equal(encoded.byteLength, bytes); assert.equal(digest(encoded), sha);
            const result = await decodePage(file, sha);
            const width = result.readUInt32LE(0), height = result.readUInt32LE(4);
            assert.equal(result.length, width * height * 4 + 8);
            const page = { width, height, rgba: new Uint8Array(result.buffer, result.byteOffset + 8, width * height * 4) };
            decoded.set(name, page); return page;
        };
        index.members[hash] = {};
        for (const density of [2, 4]) {
            const result = await resolveHdSprite(manifest, hash, source, density, 2048, read, () => {}, false, binding.lossless);
            if (!result.override && result.attempts[0]?.reason === 'source-or-contract-mismatch') {
                delete index.members[hash];
                excluded.push({ manifestHash: hash, source: source.member, reason: result.attempts[0].reason });
                break;
            }
            assert(result.override, `${source.member}/${density}: ${JSON.stringify(result.attempts)}`);
            const sourceDensity = manifest.variants.some((v: any) => v.density === density) ? density : 4;
            const variant = manifest.variants.find((v: any) => v.density === sourceDensity);
            const directory = path.join(output, hash, String(density));
            await fs.mkdir(directory, { recursive: true });
            const descriptors: Record<string, PreparedPageBinding> = {};
            for (const [i, page] of result.override!.pages.entries()) {
                const id = variant.pages[i].id;
                assert(/^[a-zA-Z0-9_-]+$/.test(id));
                const entries = [['base', page.base], ['data', page.data], ['map', page.tiles?.map], ['dataMap', page.tiles?.dataMap]]
                    .filter(([, texture]) => !!texture) as [any, THREE.DataTexture][];
                let offset = 0;
                const textures = entries.map(([role, texture]) => {
                    const image = texture.image as any, channels = texture.format === THREE.RGFormat ? 2 : 4;
                    const entry = { role, width: image.width, height: image.height, channels,
                        offset, length: image.data.byteLength, flipY: texture.flipY, srgb: texture.colorSpace === THREE.SRGBColorSpace };
                    assert.equal(entry.length, entry.width * entry.height * channels);
                    offset += entry.length; return entry;
                });
                const payload = Buffer.concat(entries.map(([, texture]) => Buffer.from((texture.image as any).data)));
                const descriptor: PreparedPageBinding = { route: '', bytes: payload.length, gpuBytes: payload.length,
                    sha256: digest(payload), textures, compactData: page.data.format === THREE.RGFormat,
                    losslessTiles: binding.lossless, ...(page.tiles ? { virtualSize: page.tiles.virtualSize } : {}) };
                const roundTrip = createPreparedHdPage(descriptor, payload, 2048);
                const restored = [roundTrip.page.base, roundTrip.page.data, roundTrip.page.tiles?.map, roundTrip.page.tiles?.dataMap].filter(Boolean);
                for (const [n, [, expected]] of entries.entries()) {
                    const actual = restored[n]!;
                    assert.equal(actual.format, expected.format); assert.equal(actual.flipY, expected.flipY);
                    assert.equal(actual.colorSpace, expected.colorSpace);
                    assert.deepEqual((actual.image as any).data, new Uint8Array((expected.image as any).data));
                    actual.dispose();
                }
                const destination = path.join(directory, id + '.bin');
                try { await fs.writeFile(destination, payload, { flag: 'wx' }); }
                catch (error) {
                    if (error.code !== 'EEXIST') throw error;
                    assert.equal(digest(await fs.readFile(destination)), descriptor.sha256, destination);
                }
                descriptors[id] = descriptor; totalBytes += payload.length; totalPages++;
            }
            assert.equal(Object.values(descriptors).reduce((n, p) => n + p.bytes, 0), result.gpuBytes);
            index.members[hash][density] = descriptors;
            proof.push({ manifestHash: hash, source: source.member, theater: source.theater, density,
                sourceDensity, edition, pages: Object.keys(descriptors).length, gpuBytes: result.gpuBytes,
                nativeMetadataUnchanged: true, payloadRoundTrip: 'BYTE_IDENTICAL_TO_VALIDATED_RUNTIME_OUTPUT' });
            disposeHdSprite(result.override);
        }
        decoded.clear();
        console.log(`${proof.length / 2 + excluded.length}/${members.size} ${source.member} ${source.theater}`);
        Bun.gc(true);
    }
    const bytes = Buffer.from(JSON.stringify(index) + '\n');
    assert(bytes.length <= 4 * 1024 * 1024);
    const indexPath = `prepared-hd/indexes/${digest(bytes)}.json`;
    await fs.mkdir(path.dirname(path.join(root, indexPath)), { recursive: true });
    try { await fs.writeFile(path.join(root, indexPath), bytes, { flag: 'wx' }); }
    catch (error) {
        if (error.code !== 'EEXIST') throw error;
        assert.equal(digest(await fs.readFile(path.join(root, indexPath))), digest(bytes));
    }
    await fs.writeFile('desktop/prepared-hd-contract.json', JSON.stringify({ schemaVersion: 1, sha256: digest(bytes), indexPath }, null, 2) + '\n');
    const report = JSON.stringify({
        status: 'PASS_VALIDATED_RUNTIME_PAYLOAD_EQUIVALENCE', members: Object.keys(index.members).length, pages: totalPages,
        bytes: totalBytes, indexSha256: digest(bytes), proof, excluded, latestEdition: edition,
    }, null, 2) + '\n';
    await fs.mkdir(path.join(output, 'proofs'), { recursive: true });
    const proofPath = path.join(output, 'proofs', digest(bytes) + '.json');
    try { await fs.writeFile(proofPath, report, { flag: 'wx' }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    await fs.writeFile('.artifacts/skirmish-loading/preparation.json', report);
    console.log(`Prepared ${Object.keys(index.members).length} members, ${totalPages} pages, ${totalBytes} bytes`);
} finally { decoder.stdin.end(); }
