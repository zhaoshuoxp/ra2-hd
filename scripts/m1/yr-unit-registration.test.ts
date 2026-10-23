import { resourceRoot } from '../test-support/resources';
import {test, expect} from 'bun:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {registerHdResources, sovietUnitIdentities, vxlUnitIdentities} from '../../desktop/hd-profile.mjs';

// Exercise the actual pinned mixed family, without changing the resource install.
for (const identity of ['SCHP', 'BORIS']) for (const damage of ['none', 'voxel-page', 'animation-pages']) {
    test(`${identity} desktop registration is atomic: ${damage}`, async () => {
        const root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), 'yr-mixed-registration-'));
        try {
            for (const name of (identity === 'SCHP' ? ['yr-soviet-schp-family', 'yr-soviet-schpdepl-authored', 'yr-soviet-schp-vxl'] : ['yr-soviet-boris-family', 'yr-soviet-boris-authored', 'yr-soviet-boris-vxl'])) {
                const target = path.join(root, 'hd-packs', name);
                await fs.mkdir(path.dirname(target), {recursive:true});
                await fs.cp(path.resolve(`${resourceRoot}/hd-packs`, name), target, {recursive:true});
            }
            const family = sovietUnitIdentities[identity], voxel = vxlUnitIdentities[identity];
            const vxlPath = path.join(root, voxel.path);
            if (damage === 'voxel-page') {
                const manifest = JSON.parse(await fs.readFile(vxlPath, 'utf8'));
                const asset: any = Object.values(manifest.parts[0].files)[0];
                await fs.unlink(path.join(path.dirname(vxlPath), asset.file));
            }
            const familyData = JSON.parse(await fs.readFile(path.join(root, family.familyPath), 'utf8'));
            const member = familyData.members[0];
            const packPath = path.join(root, 'hd-packs', member.packId, member.revision);
            if (damage === 'animation-pages') {
                const manifest = JSON.parse(await fs.readFile(path.join(packPath, 'manifest.json'), 'utf8'));
                for (const variant of manifest.variants)
                    await fs.unlink(path.join(packPath, variant.pages[0].base));
            }
            const result = await registerHdResources(root);
            const selected = result.selections.has(`/local-hd/unit-${identity.toLowerCase()}-selection.json`);
            const shpRoutes = [...result.routes.keys()].filter(r=>r.startsWith(`/local-hd/${member.sha256}/`));
            const voxelRoutes = [...result.routes.keys()].filter(r=>r.startsWith(`/local-vxl/${voxel.hash}/`));
            expect(selected).toBe(damage === 'none');
            if (damage === 'none') {
                expect(shpRoutes.length).toBeGreaterThan(0);
                expect(voxelRoutes.length).toBeGreaterThan(0);
            } else {
                expect(shpRoutes).toEqual([]);
                expect(voxelRoutes).toEqual([]);
                expect(result.availability[`unit-${identity.toLowerCase()}`]).toBe('Original fallback');
            }
        } finally { await fs.rm(root, {recursive:true,force:true}); }
    });
}
