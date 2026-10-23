import { test, expect } from 'bun:test';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { importAssets, selectNames } from './import';
import { parseMix, retailTree } from '../../src/offline/retail';
import { MixEntry } from '../../src/data/MixEntry';

function mix(files: Record<string, Uint8Array>) {
    const entries = Object.entries(files);
    const total = entries.reduce((n, [, b]) => n + b.length, 0);
    const out = Buffer.alloc(10 + entries.length * 12 + total);
    out.writeUInt16LE(entries.length, 4); out.writeUInt32LE(total, 6);
    let offset = 0;
    entries.forEach(([name, bytes], i) => {
        const pos = 10 + i * 12;
        out.writeUInt32LE(MixEntry.hashFilename(name), pos);
        out.writeUInt32LE(offset, pos + 4); out.writeUInt32LE(bytes.length, pos + 8);
        out.set(bytes, 10 + entries.length * 12 + offset); offset += bytes.length;
    });
    return out;
}
const text = (s: string) => new TextEncoder().encode(s);
function csf() {
    const out = Buffer.alloc(24); out.writeUInt32LE(0x43534620); out.writeUInt32LE(3,4);
    return out;
}
function vpl() {
    const out = Buffer.alloc(8976);
    [16, 31, 32].forEach((value, i) => out.writeUInt32LE(value, i * 4));
    return out;
}
async function fixture(run: (source: string, local: string) => Promise<void>) {
    const root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'm01-test-'));
    const source = path.join(root, 'source'); const local = path.join(root, 'local');
    await fs.mkdir(source);
    await fs.writeFile(path.join(source, 'RA2.MIX'), mix({ 'local.mix': mix({
        'rules.ini': text('[General]\nUnitCount=1'), 'art.ini': text('[Synthetic]\nImage=TEST'),
        'ai.ini': text('[AI]\nTest=yes'),
        'voxels.vpl': vpl(),
        'missions.pkt': text('[MultiMaps]\n1=TEST\n[TEST]\nMinPlayers=2\nMaxPlayers=4'),
    }) }));
    await fs.writeFile(path.join(source, 'language.mix'), mix({ 'ra2.csf': csf() }));
    await fs.writeFile(path.join(source, 'MULTI.MIX'), mix({ 'TEST.map': text('[Basic]\nName=Synthetic') }));
    try { await run(source, local); } finally { await fs.rm(root, { recursive: true, force: true }); }
}
test('missing and ambiguous case inputs fail', () => {
    expect(() => selectNames([], ['ra2.mix'])).toThrow('Missing');
    expect(() => selectNames(['ra2.mix', 'RA2.MIX'], ['ra2.mix'])).toThrow('Ambiguous');
});
test('reject truncated headers, indices, duplicate IDs and out-of-range members', () => {
    expect(() => parseMix(Buffer.alloc(3), 'test')).toThrow();
    const valid = mix({ 'a.ini': text('x'), 'b.ini': text('y') });
    expect(() => parseMix(valid.subarray(0, 15), 'test')).toThrow();
    const duplicate = Buffer.from(valid); duplicate.writeUInt32LE(duplicate.readUInt32LE(10),22);
    expect(() => parseMix(duplicate, 'test')).toThrow('Duplicate');
    const bounds = Buffer.from(valid); bounds.writeUInt32LE(999999,14);
    expect(() => parseMix(bounds, 'test')).toThrow('bounds');
});
test('nested malformed archives fail through the upstream parser', () => {
    expect(() => retailTree(new Map([['ra2.mix', mix({ 'local.mix': Buffer.alloc(2) })]]))).toThrow();
});
test('dry run does not copy; overlays are excluded; repeat import preserves file inode', async () => {
    await fixture(async (source, local) => {
        await fs.writeFile(path.join(source,'ra2.csf'), 'excluded overlay');
        await fs.writeFile(path.join(source,'cameo.mix'), 'excluded overlay');
        await fs.writeFile(path.join(source,'ra2md.mix'), 'excluded expansion');
        const dry = await importAssets(source, 'ra2-core', true, local);
        expect(dry.files.length).toBe(3);
        expect(await fs.stat(path.join(local,'assets')).catch(() => null)).toBeNull();
        const first = await importAssets(source, 'ra2-core', false, local);
        const before = await fs.stat(first.files[0].destination);
        const again = await importAssets(source, 'ra2-core', false, local);
        expect(again.files.every(f => f.copy === 'unchanged')).toBe(true);
        expect((await fs.stat(first.files[0].destination)).ino).toBe(before.ino);
        expect((await fs.readdir(path.join(local,'assets/ra2'))).sort()).toEqual(['language.mix','multi.mix','ra2.mix']);
    });
});
test('conflicting destination is preserved', async () => {
    await fixture(async (source, local) => {
        await fs.mkdir(path.join(local,'assets/ra2'), { recursive: true });
        const target = path.join(local,'assets/ra2/ra2.mix'); await fs.writeFile(target, 'conflict');
        await expect(importAssets(source,'ra2-core',false,local)).rejects.toThrow('Conflicting');
        expect(await fs.readFile(target,'utf8')).toBe('conflict');
    });
});
test('source symlinks and output symlink directories are rejected', async () => {
    await fixture(async (source, local) => {
        const original = path.join(source,'RA2.MIX'); await fs.rename(original, path.join(source,'real.mix'));
        await fs.symlink(path.join(source,'real.mix'),original);
        await expect(importAssets(source,'ra2-core',false,local)).rejects.toThrow('regular');
    });
    await fixture(async (source, local) => {
        await fs.mkdir(local); await fs.symlink(source,path.join(local,'assets'));
        await expect(importAssets(source,'ra2-core',false,local)).rejects.toThrow('Symlink');
    });
});
test('missing required archive member blocks the entire import', async () => {
    await fixture(async (source, local) => {
        await fs.writeFile(path.join(source,'MULTI.MIX'),mix({}));
        await expect(importAssets(source,'ra2-core',false,local)).rejects.toThrow('four-player');
        expect(await fs.stat(path.join(local,'assets')).catch(() => null)).toBeNull();
    });
});
test('malformed archived CSF cannot pass as a readable language resource', async () => {
    await fixture(async (source, local) => {
        await fs.writeFile(path.join(source, 'language.mix'), mix({ 'ra2.csf': Buffer.alloc(24) }));
        await expect(importAssets(source, 'ra2-core', false, local)).rejects.toThrow('Invalid CSF signature');
        expect(await fs.stat(path.join(local, 'assets')).catch(() => null)).toBeNull();
    });
});
