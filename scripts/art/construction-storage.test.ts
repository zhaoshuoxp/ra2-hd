import { resourceRoot } from '../test-support/resources';
import { expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { PNG } from 'pngjs';
import { resolveHdSprite, disposeHdSprite } from '../../src/engine/renderable/builder/resolveHdSprite';

const authoringFile = process.env.BUILDUP_STORAGE_AUTHORING ?? 'desktop/buildup-art-final.json';
const run = test;
const authoring = existsSync(authoringFile) ? JSON.parse(readFileSync(authoringFile, 'utf8')) : { families: [] };
const records = (authoring.records ?? authoring.families)
    .filter((f: any) => ['GAYARD', 'NACNST', 'NAIRON', 'NAMISL'].includes(f.identity))
    .map((f: any) => ({ ...f, newMember: f.newMember ?? f.member }));
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
function sourceOf(raw: any, count: number, theater: string) {
    return { member: raw.source.member, sha256: raw.source.sha256, theater, canvas: raw.canvas,
        frames: raw.frames.slice(0, count).map((f: any, nativeFrame: number) => ({ nativeFrame,
            trimOrigin: [f.x, f.y], trimSize: [f.width, f.height], legacyRenderSize: f.legacyRenderSize, empty: f.empty })) };
}
function fixture(record: any) {
    const folder = path.join(`${resourceRoot}/hd-packs`, record.newMember.packId, record.newMember.revision);
    const bytes = readFileSync(path.join(folder, 'manifest.json'));
    expect(digest(bytes)).toBe(record.newMember.sha256);
    const manifest = JSON.parse(bytes.toString());
    const source = typeof record.nativeSource === 'object' ? record.nativeSource
        : sourceOf(JSON.parse(readFileSync(record.nativeSource, 'utf8')), record.frames, manifest.source.theater);
    const read = async (name: string, hash: string, size: number) => {
        const bytes = readFileSync(path.join(folder, name));
        expect(bytes.length).toBe(size); expect(digest(bytes)).toBe(hash);
        const png = PNG.sync.read(bytes);
        return { width: png.width, height: png.height, rgba: new Uint8Array(png.data) };
    };
    return { manifest, source, read };
}

run('actual Allied and Soviet construction pools retain native metadata at both densities', async () => {
    expect(records).toHaveLength(8);
    for (const record of records) {
        const f = fixture(record);
        for (const density of [2, 4]) {
            const result = await resolveHdSprite(f.manifest, record.newMember.sha256, f.source, density, 2048,
                f.read, () => {}, false, true);
            expect(result.attempts, record.key).toEqual([]);
            expect(result.density).toBe(density);
            expect(result.override!.frames).toHaveLength(record.frames);
            expect(result.gpuBytes).toBeLessThan(64 * 1024 * 1024);
            expect(result.override!.pages.every(page => !!page.tiles?.dataMap)).toBe(true);
            disposeHdSprite(result.override);
        }
    }
}, 120000);

run('the construction format extension rejects a matched Allied body source', async () => {
    const record = records.find((r: any) => r.key === 'gayard-temperate');
    const f = fixture(record);
    const familyFile = record.familyPath ? path.join(resourceRoot, record.familyPath) : record.newFamilyPath;
    const family = JSON.parse(readFileSync(familyFile, 'utf8'));
    const body = family.members.find((member: any) => member.member === 'ggyard.shp');
    const bodyBytes = readFileSync(path.join(`${resourceRoot}/hd-packs`, body.packId, body.revision, 'manifest.json'));
    expect(digest(bodyBytes)).toBe(body.sha256);
    const raw = JSON.parse(bodyBytes.toString());
    const source = { member: raw.source.member, sha256: raw.source.sha256, theater: raw.source.theater,
        canvas: raw.logical.canvas, frames: raw.logical.frames };
    // Exercise the storage allowlist independently of the construction-only completion marker.
    const manifest = { ...f.manifest, paintedBuildup: undefined, source: { ...f.manifest.source, ...source },
        logical: { canvas: source.canvas, frames: source.frames } };
    let reads = 0;
    const result = await resolveHdSprite(manifest, record.newMember.sha256, source, 4, 2048,
        async () => { reads++; throw Error('Rejected source must not decode'); }, () => {}, false, true);
    expect(result.override).toBeUndefined();
    expect(result.attempts[0].reason).toBe('unsupported-hd-storage');
    expect(reads).toBe(0);
});

run('construction pools require both pinned native identity and lossless building mode', async () => {
    const record = records[0], f = fixture(record);
    const unknown = { ...f.source, sha256: '0'.repeat(64) };
    const bad = await resolveHdSprite(f.manifest, record.newMember.sha256, unknown, 4, 2048, f.read, () => {}, false, true);
    expect(bad.override).toBeUndefined();
    expect(bad.attempts[0].reason).toBe('source-or-contract-mismatch');
    const disabled = await resolveHdSprite(f.manifest, record.newMember.sha256, f.source, 4, 2048, f.read, () => {}, false, false);
    expect(disabled.override).toBeUndefined();
    expect(disabled.attempts[0].reason).toBe('unsupported-hd-storage');
});

run('completion presentation resolves only the supported marker on a construction member', async () => {
    const record = records[0], f = fixture(record);
    const marked = { ...f.manifest, paintedBuildup: { ...f.manifest.paintedBuildup,
        completionPresentation: 'retained-idle-v1' } };
    const result = await resolveHdSprite(marked, record.newMember.sha256, f.source, 2, 2048,
        f.read, () => {}, false, true);
    expect(result.attempts).toEqual([]);
    expect(result.override!.constructionCompletionFrame).toBe(record.frames - 1);
    disposeHdSprite(result.override);
    let reads = 0;
    for (const completionPresentation of ['unknown', null, 24]) {
        const invalid = { ...marked, paintedBuildup: { ...marked.paintedBuildup, completionPresentation } };
        const rejected = await resolveHdSprite(invalid, record.newMember.sha256, f.source, 2, 2048,
            async () => { reads++; throw Error('Invalid declaration must not decode'); }, () => {}, false, true);
        expect(rejected.override).toBeUndefined();
        expect(rejected.attempts[0].reason).toBe('source-or-contract-mismatch');
    }
    const body = { ...f.source, member: f.source.member.replace('mk.shp', '.shp') };
    const invalid = { ...marked, source: { ...marked.source, member: body.member } };
    const rejected = await resolveHdSprite(invalid, record.newMember.sha256, body, 2, 2048,
        async () => { reads++; throw Error('Body declaration must not decode'); }, () => {}, false, true);
    expect(rejected.override).toBeUndefined();
    expect(rejected.attempts[0].reason).toBe('source-or-contract-mismatch');
    expect(reads).toBe(0);
});
