import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { IndexedBitmap } from '../../src/data/Bitmap';
import { TmpFile } from '../../src/data/TmpFile';
import { VirtualFile } from '../../src/data/vfs/VirtualFile';
import { TmpDrawable } from '../../src/engine/gfx/drawable/TmpDrawable';

const [root, prepared] = process.argv.slice(2);
assert(root && prepared, 'Expected authoring and prepared native folders');
const woodBridge = process.argv.includes('--wood-bridge');
assert(!(woodBridge && process.argv.includes('--bridge')), 'Choose one explicit bridge source group');
const bridge = woodBridge || process.argv.includes('--bridge');
const setIndex = woodBridge ? 73 : bridge ? 19 : 79;
const bridgeSeaMembers = woodBridge
    ? ['ovrpsb02.sno', 'ovrpsb02a.sno', 'ovrpsb05.sno', 'ovrpsb05a.sno']
    : ['ovrps02.sno', 'ovrps05.sno'];
const classification = bridge ? 'NATIVE_SNOW_BRIDGE_WITH_WATER' : 'NATIVE_SNOW_ICE_WITH_WATER';
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const source = JSON.parse(readFileSync(join(root, 'source.json'), 'utf8'));
const layout = JSON.parse(readFileSync(join(root, 'layout.json'), 'utf8'));
assert.equal(source.theater, 'SNOW');
assert.equal(source.preparedSourceSha256, sha(readFileSync(join(prepared, 'source.json'))));
const profile: Record<string, unknown> = {
    schema: bridge ? 'm2-4-snow-bridge-water-material-profile-v1' : 'm2-4-snow-ice-water-material-profile-v1',
    waterRegistration: true, waterRegistrationSetIndices: [setIndex],
    nativeSubTileContacts: true, mixedWaterMembers: {},
};
if (bridge) profile.waterRegistrationMembers = bridgeSeaMembers;
const entries = profile.mixedWaterMembers as Record<string, unknown>;
const records = [];
const drawable = new TmpDrawable();
for (const member of source.members.filter((entry: any) => entry.setIndex === setIndex
    && (!bridge || bridgeSeaMembers.includes(entry.member)))) {
    const native = member.native;
    const bytes = readFileSync(join(prepared, 'native', native.nativeFile));
    assert.equal(sha(bytes), native.sha256);
    const tmp = new TmpFile(VirtualFile.fromBytes(bytes, member.member));
    const palette = readFileSync(join(prepared, 'native', native.palette.sha256 + '.pal'));
    assert.equal(sha(palette), native.palette.sha256);
    const info = layout[member.member];
    const [, , width, height] = info.bounds;
    const assembly = new Uint8Array(width * height * 4);
    const mask = new Uint8Array(width * height);
    const extraOwnership = new Uint8Array(width * height);
    for (const part of [...info.parts].sort((a, b) => a.rect[1] - b.rect[1])) {
        const tile = tmp.images[part.subTile];
        const descriptor = { ...tile, tileData: Array.from(tile.tileData),
            extraData: tile.extraData && Array.from(tile.extraData) };
        const bitmap = drawable.draw(descriptor, tmp.blockWidth, tmp.blockHeight);
        const extra = new IndexedBitmap(bitmap.width, bitmap.height);
        if (tile.hasExtraData) drawable.drawExtraData({ ...descriptor,
            extraData: descriptor.extraData!.map(value => value ? 1 : 0) }, extra);
        const frame = native.images[part.subTile];
        assert.deepEqual([bitmap.width, bitmap.height], frame.logical);
        const rgba = readFileSync(join(prepared, 'native', frame.file));
        assert.equal(sha(rgba), frame.rgbaSha256);
        for (let y = 0; y < bitmap.height; y++) for (let x = 0; x < bitmap.width; x++) {
            const i = y * bitmap.width + x, index = bitmap.data[i];
            if (!index) { assert.equal(rgba[i * 4 + 3], 0); continue; }
            const rgb = [palette[index * 3] * 4, palette[index * 3 + 1] * 4, palette[index * 3 + 2] * 4];
            assert.deepEqual(Array.from(rgba.subarray(i * 4, i * 4 + 4)), [...rgb, 255]);
            const target = (part.rect[1] + y) * width + part.rect[0] + x;
            assembly.set(rgba.subarray(i * 4, i * 4 + 4), target * 4);
            extraOwnership[target] = extra.data[i];
            const [r, g, b] = rgb;
            const blue = (b > g + 8 && b > r + 3) || (g > r + 4 && b > r - 12);
            mask[target] = Number(tile.height === 0 && !extra.data[i] && blue && Math.max(...rgb) <= 128);
        }
    }
    const waterPixels = mask.reduce((a, b) => a + b, 0);
    assert(waterPixels > 0, member.member + ': no native main-layer sea pixels');
    assert(mask.every((value, i) => !value || !extraOwnership[i]), 'Nonzero extra pixels must stay excluded');
    const file = member.member + '-water-mask.bin';
    writeFileSync(join(root, file), mask, { flag: 'wx' });
    const declaration = {
        sourceSha256: native.sha256, classification,
        maximumNativeWaterChannel: 128,
        mask: { file, sha256: sha(mask), nativeRgbaSha256: sha(assembly), logical: [width, height],
            policy: bridge
                ? 'Visible native level-zero main-tile dark sea pixels; nonzero bridge supports and raised deck excluded'
                : 'Visible native level-zero main-tile dark sea pixels; nonzero extra ice and raised snow excluded' },
    };
    entries[member.member] = declaration;
    records.push({ member: member.member, ...declaration, waterPixels,
        excludedExtraPixels: extraOwnership.reduce((a, b) => a + Number(Boolean(b)), 0) });
}
assert.equal(records.length, bridge ? bridgeSeaMembers.length : 19);
writeFileSync(join(root, 'material-profile.json'), JSON.stringify(profile, null, 2) + '\n', { flag: 'wx' });
writeFileSync(join(root, 'native-water-mask-evidence.json'), JSON.stringify({
    schema: bridge ? 'm2-4-native-bridge-water-mask-v1' : 'm2-4-native-ice-water-mask-v1', records,
    basis: 'Runtime TmpFile and TmpDrawable; exact original palette/RGBA and original composition order',
}, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ members: records.length, waterPixels: records.reduce((sum, row) => sum + row.waterPixels, 0) }));
