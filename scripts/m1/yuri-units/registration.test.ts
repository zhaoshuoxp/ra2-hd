import { resourceRoot } from '../../test-support/resources';
import { test, expect } from 'bun:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import catalog from '../../../desktop/yuri-unit-contracts.json';
import { registerHdResources } from '../../../desktop/hd-profile.mjs';

test('miner registration retains manifests and selects one complete density for body and workers', async () => {
    const root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'ra2-miner-registration-'));
    try {
        const copy = async (relative: string) => {
            await fs.mkdir(path.dirname(path.join(root, relative)), { recursive: true });
            await fs.cp(path.resolve(resourceRoot, relative), path.join(root, relative), { recursive: true });
        };
        const entry = catalog.shp.SMIN;
        await copy(path.dirname(entry.familyPath));
        const family = JSON.parse(await fs.readFile(path.join(root, entry.familyPath), 'utf8'));
        const worker = family.members[0], workerDirectory = `hd-packs/${worker.packId}/${worker.revision}`;
        await copy(workerDirectory);
        const manifest = JSON.parse(await fs.readFile(path.join(root, workerDirectory, 'manifest.json'), 'utf8'));
        const voxel = catalog.vxl.SMIN;
        for (const variant of voxel.variants) await copy(path.dirname(variant.path));
        const key = `/local-hd/${entry.selection}-selection.json`;
        const complete = await registerHdResources(root);
        expect(complete.selections.has(key)).toBe(true);
        expect(complete.routes.has(`/local-hd/${worker.sha256}/manifest.json`)).toBe(true);
        expect(complete.availability[entry.selection]).toBe('HD available');
        for (const variant of voxel.variants) expect(complete.routes.has(`/local-vxl/${variant.hash}/manifest.json`)).toBe(true);

        const four = voxel.variants.find(v => v.density === 4)!;
        const fourManifest = JSON.parse(await fs.readFile(path.join(root, four.path), 'utf8'));
        const missing = path.join(root, path.dirname(four.path), fourManifest.parts[1].files.data.file);
        await fs.rename(missing, missing + '.held');
        const fallback = await registerHdResources(root);
        expect(fallback.availability[entry.selection]).toBe('HD available at 2x');
        expect(fallback.selections.has(key)).toBe(true);
        expect(fallback.routes.has(`/local-vxl/${four.hash}/manifest.json`)).toBe(false);
        expect(fallback.routes.has(`/local-hd/${worker.sha256}/manifest.json`)).toBe(true);
        for (const page of manifest.variants.find((v: any) => v.density === 4).pages)
            expect(fallback.routes.has(`/local-hd/${worker.sha256}/4/${page.id}/base.png`)).toBe(false);

        const two = voxel.variants.find(v => v.density === 2)!;
        const twoManifest = JSON.parse(await fs.readFile(path.join(root, two.path), 'utf8'));
        const secondMissing = path.join(root, path.dirname(two.path), twoManifest.parts[0].files.data.file);
        await fs.rename(secondMissing, secondMissing + '.held');
        const original = await registerHdResources(root);
        expect(original.availability[entry.selection]).toBe('Original fallback');
        expect(original.selections.has(key)).toBe(false);
        expect([...original.routes.keys()].some(route => route.startsWith(`/local-hd/${worker.sha256}/`))).toBe(false);
        expect([...original.routes.keys()].some(route => route.startsWith(`/local-vxl/${two.hash}/`))).toBe(false);
    } finally { await fs.rm(root, { recursive: true, force: true }); }
});
