import { test, expect } from 'bun:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { validateHdPack } from '../../desktop/profile.mjs';
const bytes = Buffer.from('synthetic-page-fixture');
const sha256 = createHash('sha256').update(bytes).digest('hex');
async function fixture(run: (root: string, pack: string, manifest: any) => Promise<void>) {
    const root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'm11-hd-'));
    const pack = path.join(root, 'hd-packs/test/1'); await fs.mkdir(pack, { recursive: true });
    const manifest = { schemaVersion: 2, packId: 'test', packRevision: '1', source: { member: 'cons.shp' },
        variants: [{ density: 2, pages: [{ id: 'p0', base: 'base.png', data: 'data.png',
            baseSha256: sha256, dataSha256: sha256, baseBytes: bytes.length, dataBytes: bytes.length }] }] };
    await fs.writeFile(path.join(pack, 'manifest.json'), JSON.stringify(manifest));
    await fs.writeFile(path.join(pack, 'base.png'), bytes); await fs.writeFile(path.join(pack, 'data.png'), bytes);
    try { await run(root, pack, manifest); } finally { await fs.rm(root, { recursive: true, force: true }); }
}
test('deferred startup validates page paths and sizes while strict audits still reject changed content', async () => fixture(async (root, pack) => {
    await fs.writeFile(path.join(pack, 'base.png'), Buffer.alloc(bytes.length, 1));
    await expect(validateHdPack(root, 'test', '1')).rejects.toThrow('integrity');
    const deferred = await validateHdPack(root, 'test', '1', { deferPageHashes: true });
    expect(deferred.routes.size).toBe(3);
    await fs.writeFile(path.join(pack, 'base.png'), Buffer.alloc(bytes.length + 1));
    await expect(validateHdPack(root, 'test', '1', { deferPageHashes: true })).rejects.toThrow('size');
    await fs.rm(path.join(pack, 'base.png'));
    await fs.symlink(path.join(pack, 'data.png'), path.join(pack, 'base.png'));
    await expect(validateHdPack(root, 'test', '1', { deferPageHashes: true })).rejects.toThrow('Unsafe');
}));
test('profile registers only content-identified declared files', async () => fixture(async root => {
    const selected = await validateHdPack(root, 'test', '1');
    expect(selected.routes.size).toBe(3);
    expect([...selected.routes.keys()].every(p => p.startsWith(`/local-hd/${selected.sha256}/`))).toBe(true);
    await expect(validateHdPack(root, '../test', '1')).rejects.toThrow('identity');
    await expect(validateHdPack(root, 'test', '..')).rejects.toThrow('identity');
}));
test('only the 4x shipyard crane admits sixteen bounded pages', async () => fixture(async (root, pack, manifest) => {
    const page = manifest.variants[0].pages[0];
    for (const [member, density, count, allowed] of [
        ['ngyard_d.shp', 4, 16, true], ['ngyard_d.shp', 4, 17, false],
        ['ngyard_d.shp', 2, 9, false], ['cons.shp', 4, 9, false],
    ] as const) {
        manifest.source.member = member;
        manifest.source.theater = 'TEMPERATE';
        manifest.variants = [{ density, pages: Array.from({ length: count }, (_, i) => ({ ...page, id: `p${i}` })) }];
        await fs.writeFile(path.join(pack, 'manifest.json'), JSON.stringify(manifest));
        if (allowed) expect((await validateHdPack(root, 'test', '1')).routes.size).toBe(33);
        else await expect(validateHdPack(root, 'test', '1')).rejects.toThrow('Invalid HD variant');
    }
}));
test('profile rejects missing, tampered, symlinked and undeclared paths', async () => {
    for (const change of ['missing', 'hash', 'symlink', 'traversal']) await fixture(async (root, pack, manifest) => {
        const file = path.join(pack, 'base.png');
        if (change === 'missing') await fs.unlink(file);
        if (change === 'hash') await fs.writeFile(file, Buffer.alloc(bytes.length));
        if (change === 'symlink') { await fs.unlink(file); await fs.symlink(path.join(pack, 'data.png'), file); }
        if (change === 'traversal') { manifest.variants[0].pages[0].base = '../base.png';
            await fs.writeFile(path.join(pack, 'manifest.json'), JSON.stringify(manifest)); }
        await expect(validateHdPack(root, 'test', '1')).rejects.toThrow();
    });
});

test('optional building routes withhold a broken complete density and retain valid lower density', async () => {
    await fixture(async (root, pack, manifest) => {
        manifest.source = { member: 'ggpowr.shp', theater: 'TEMPERATE' };
        const four = structuredClone(manifest.variants[0]); four.density = 4;
        four.pages[0].base = 'missing-4x.png';
        manifest.variants.push(four);
        await fs.writeFile(path.join(pack, 'manifest.json'), JSON.stringify(manifest));
        await expect(validateHdPack(root, 'test', '1')).rejects.toThrow();
        const selected = await validateHdPack(root, 'test', '1', { allowUnavailableVariants: true });
        expect(selected.unavailableVariants).toEqual([4]);
        expect(selected.routes.size).toBe(3);
        expect([...selected.routes.keys()].some(route => route.includes('/4/'))).toBe(false);
        expect([...selected.routes.keys()].filter(route => route.includes('/2/')).length).toBe(2);
        manifest.source.theater = 'SNOW';
        await fs.writeFile(path.join(pack, 'manifest.json'), JSON.stringify(manifest));
        await expect(validateHdPack(root, 'test', '1', { allowUnavailableVariants: true })).rejects.toThrow();
    });
});
