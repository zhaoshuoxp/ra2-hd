import { resourceRoot } from '../../test-support/resources';
import { expect, test } from 'bun:test';
import { cpSync, mkdtempSync, readFileSync, realpathSync, unlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import catalog from '../../../desktop/allied-unit-contracts.json';
import { registerHdResources } from '../../../desktop/hd-profile.mjs';
import { unitHdFamilies } from '../../../src/engine/renderable/builder/unitHdFamilies';
import { vxlUnitFamilies } from '../../../src/engine/renderable/unitVxl/identities';
import { unitHdAvailableInEdition } from '../../../src/engine/renderable/builder/sharedAlliedUnitHd';

test('Allied contracts retain native identity and edition boundaries', () => {
    expect(unitHdAvailableInEdition(unitHdFamilies.GGI, 'ra2')).toBe(false);
    expect(unitHdAvailableInEdition(unitHdFamilies.GGI, 'yr')).toBe(true);
    expect(vxlUnitFamilies.MTNK.members).toEqual(['gtnk.vxl', 'gtnkbarl.vxl', 'gtnktur.vxl']);
    expect(vxlUnitFamilies.APOC.members).toEqual(['mtnk.vxl', 'mtnktur.vxl', 'mtnkbarl.vxl']);
    expect(vxlUnitFamilies.MTNK.hash).not.toBe(vxlUnitFamilies.APOC.hash);
    expect(vxlUnitFamilies.MTNK.density).toBe(4);
    expect(vxlUnitFamilies.APOC.density ?? 4).toBe(4);
});

test('a missing Allied atlas publishes no partial family and preserves an independent peer', async () => {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'allied-hd-failure-')));
    try {
        const ggi = catalog.shp.GGI, amcv = catalog.vxl.AMCV;
        const family = JSON.parse(readFileSync(path.join(resourceRoot, ggi.familyPath), 'utf8'));
        const copyDirectory = (relative: string) => cpSync(path.join(resourceRoot, relative),
            path.join(root, relative), { recursive: true });
        copyDirectory(path.dirname(ggi.familyPath));
        copyDirectory(path.dirname(amcv.path));
        for (const member of family.members) copyDirectory(`hd-packs/${member.packId}/${member.revision}`);
        const member = family.members[0], packRoot = path.join(root, 'hd-packs', member.packId, member.revision);
        const manifest = JSON.parse(readFileSync(path.join(packRoot, 'manifest.json'), 'utf8'));
        // Reject the complete member only when every available density is broken.
        for (const variant of manifest.variants) unlinkSync(path.join(packRoot, variant.pages[0].base));
        const result = await registerHdResources(root);
        expect(result.availability['unit-ggi']).toBe('Original fallback');
        expect(result.selections.has('/local-hd/unit-ggi-selection.json')).toBe(false);
        expect([...result.routes.keys()].some(route => route.includes(member.sha256))).toBe(false);
        expect(result.availability['unit-amcv']).toBe('HD available at 4x');
        expect(result.routes.has(`/local-vxl/${amcv.hash}/manifest.json`)).toBe(true);
    } finally { rmSync(root, { recursive: true, force: true }); }
}, 30000);
