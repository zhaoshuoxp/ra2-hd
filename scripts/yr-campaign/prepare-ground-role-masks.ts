import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Palette } from '../../src/data/Palette';
import { TmpFile } from '../../src/data/TmpFile';
import { TmpDrawable } from '../../src/engine/gfx/drawable/TmpDrawable';
import { retailMember, sha256 } from '../test-support/resources';

const [regionsFile, output] = process.argv.slice(2);
const regions = JSON.parse(fs.readFileSync(regionsFile, 'utf8'));
assert.equal(regions.theater, 'NEWURBAN');
fs.mkdirSync(output, { recursive: false });
const palettePins: Record<string, [string, string]> = {
    NEWURBAN: ['isoubn.pal', '1aa49468a9439a5cff3e5f66fae0678501e9dc3ef7a4d90f23127c38ad6e4676'],
    URBAN: ['isourb.pal', 'b1f4c15b7b91130736b4dffeb189ca32621bf606afbc0b2d02eb5584b6921fe3'],
};
const members: Record<string, any> = {}, cache = new Map<string, any>();
for (const [name, roles] of Object.entries(regions.members) as [string, any][]) {
    members[name] = {};
    for (const [role, region] of Object.entries(roles) as [string, any][]) {
        if (region.sampling) continue;
        const donor = region.donor, key = `${region.donorTheater}/${donor.member}/${donor.subTile}/${role}`;
        let record = cache.get(key);
        if (!record) {
            const native = new TmpFile(retailMember(donor.edition, donor.member, donor.sourceSha256).file);
            const [paletteMember, paletteSha256] = palettePins[region.donorTheater];
            const palette = new Palette(retailMember(donor.edition, paletteMember, paletteSha256).file);
            const bitmap = new TmpDrawable().draw(native.images[donor.subTile] as any, native.blockWidth, native.blockHeight);
            assert.equal(bitmap.data.length, 1800);
            const mask = new Uint8Array(1800);
            const nativeRgb = new Uint8Array(5400);
            bitmap.data.forEach((index, pixel) => {
                if (!index) return;
                const { r, g, b } = palette.colors[index], maximum = Math.max(r, g, b), minimum = Math.min(r, g, b);
                nativeRgb.set([r, g, b], pixel*3);
                const valid = role === 'sidewalk' ? r+g+b > 420 && maximum-minimum < 60
                    : role === 'asphalt' ? maximum < 95 && maximum-minimum < 24
                    : role === 'paving' ? r-g > 32 && r-b > 32
                    : g-r > 8 && g-b > 8;
                mask[pixel] = Number(valid);
            });
            assert(mask.some(value => value));
            const file = `${donor.member.replace('.', '-')}-sub${donor.subTile}-${role}.mask`;
            fs.writeFileSync(path.join(output, file), mask, { flag: 'wx' });
            const rgbFile = file.replace(/\.mask$/, '-source-control.rgb');
            fs.writeFileSync(path.join(output, rgbFile), nativeRgb, { flag: 'wx' });
            record = { file: path.resolve(output, file), sha256: sha256(mask), nativeSize: [60, 30],
                sourceMember: donor.member, sourceSha256: donor.sourceSha256, subTile: donor.subTile,
                role, palette: { member: paletteMember, sha256: paletteSha256 },
                sourceColorControls: { file: path.resolve(output, rgbFile), sha256: sha256(nativeRgb),
                    scope: 'Original palette controls only; never used as output material pixels.' },
                classifiedSourcePixels: [...mask].reduce((sum, value) => sum+value, 0) };
            cache.set(key, record);
        }
        members[name][role] = record;
    }
}
fs.writeFileSync(path.join(output, 'index.json'), JSON.stringify({ schema: 'yr-source-ground-role-masks-v1',
    status: 'SOURCE_ROLE_MASKS_FOR_HD_INTERIOR_BOUNDARY_SAMPLING',
    regionsFile: path.resolve(regionsFile), regionsSha256: sha256(fs.readFileSync(regionsFile)),
    members, masks: cache.size, sourceRgbUsedAsOutputTexture: false,
    sourceMapsAndGameRulesModified: false, paletteAliasesAdded: false }, null, 2)+'\n', { flag: 'wx' });
console.log(JSON.stringify({ targets: Object.keys(members).length, masks: cache.size, output }));
