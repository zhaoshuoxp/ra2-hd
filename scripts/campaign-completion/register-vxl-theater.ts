import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { VxlFile } from '../../src/data/VxlFile';
import { VplFile } from '../../src/data/VplFile';
import { retailMember, sha256 } from '../test-support/resources';

const [authoring, target, identity, receiptName] = process.argv.slice(2).filter(value => value !== '--admit');
const palettes: Record<string, string> = { TEMPERATE: 'unittem.pal', SNOW: 'unitsno.pal', URBAN: 'uniturb.pal' };
assert(palettes[authoring] && palettes[target] && /^[a-z0-9-]+\.json$/.test(receiptName));
const root = path.resolve(import.meta.dir, '../..'), suffix = authoring === 'TEMPERATE' ? '' : '-' + authoring.toLowerCase();
const file = path.join(root, `desktop/environment${suffix}-hd-contract.json`), before = fs.readFileSync(file);
const contract = JSON.parse(before.toString()), family = contract.vxl[identity];
assert(family && family.authoringTheater === authoring);
assert.deepEqual(family.variants.map((variant: any) => variant.density).sort(), [2, 4]);
const sourcePalette = retailMember('ra2', palettes[authoring]), targetPalette = retailMember('ra2', palettes[target]);
const originalColors = sourcePalette.file.getBytes(), targetColors = targetPalette.file.getBytes();
const vpl = retailMember('ra2', 'voxels.vpl'), lighting = new VplFile(vpl.file), used = new Set<number>();
const sources: Record<string, string> = {}, variants: any[] = [];
for (const variant of family.variants) {
    const filename = path.join(root, '.local', variant.path), bytes = fs.readFileSync(filename);
    assert.equal(sha256(bytes), variant.hash);
    const manifest = JSON.parse(bytes.toString());
    assert.equal(manifest.identity, identity); assert.equal(manifest.theater, authoring); assert.equal(manifest.density, variant.density);
    assert.deepEqual([...new Set(manifest.parts.map((part: any) => part.member))].sort(), [...family.members].sort());
    for (const [member, hash] of Object.entries(manifest.sources)) {
        assert(/^[a-z0-9]+\.(vxl|hva)$/.test(member)); const source = retailMember('ra2', member, hash as string);
        sources[member] = source.sha256;
        if (member.endsWith('.vxl')) for (const section of new VxlFile(source.file).sections) {
            for (const span of section.spans) for (const voxel of span.voxels) used.add(voxel.colorIndex);
        }
    }
    const pages: any[] = [];
    for (const part of manifest.parts) {
        assert(part.frames.length && new Set(part.frames.map((frame: any) => frame.heading)).size === part.frames.length);
        for (const role of ['base', 'data']) {
            const entry = part.files[role], bytes = fs.readFileSync(path.join(path.dirname(filename), entry.file));
            assert.equal(bytes.length, entry.bytes); assert.equal(sha256(bytes), entry.sha256); pages.push(entry);
        }
    }
    variants.push({ density: variant.density, manifestSha256: variant.hash, pages });
}
const shaded = new Set([...used].flatMap(color => Array.from({ length: 32 }, (_, row) => lighting.tables[row * 256 + color])));
const differences = [...shaded].filter(index => index && !(index >= 16 && index <= 31)
    && [0, 1, 2].some(channel => originalColors[index * 3 + channel] !== targetColors[index * 3 + channel]));
assert.deepEqual(differences, []);
assert(family.theaters.includes(authoring)); if (!family.theaters.includes(target)) family.theaters.push(target);
const after = Buffer.from(JSON.stringify(contract, null, 2) + '\n'), admit = process.argv.includes('--admit');
if (admit) fs.writeFileSync(file, after);
fs.writeFileSync(path.join(root, '../project-history/ra2-campaign-completion-20261026', receiptName), JSON.stringify({
    status: admit ? 'PASS_COMPLETE_SOURCE_PALETTE_VPL_AND_PAYLOAD_IDENTITY_THEATER_ADMITTED_NATIVE_PENDING'
        : 'PASS_COMPLETE_SOURCE_PALETTE_VPL_AND_PAYLOAD_IDENTITY_DRY_RUN',
    identity, authoring, target, sources, sourcePalette: { member: palettes[authoring], sha256: sourcePalette.sha256 },
    targetPalette: { member: palettes[target], sha256: targetPalette.sha256 }, vplSha256: vpl.sha256,
    sourceColorIndices: [...used].sort((a, b) => a - b), shadedPaletteDifferences: differences, variants,
    contractBeforeSha256: sha256(before), contractAfterSha256: sha256(after), addedPayloadFiles: 0, modifiedAcceptedPayloads: 0,
    qualification: 'All original VXL/HVA identities and every used fixed VPL palette sample match. Complete accepted independent 2X/4X payloads and geometry remain byte-identical. Native bindings and runtime/user visual acceptance remain separate.'
}, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ identity, target, admitted: admit, newArt: 0, overwrittenPayloads: 0 }));
