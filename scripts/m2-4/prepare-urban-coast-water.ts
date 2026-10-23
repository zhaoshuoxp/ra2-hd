import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { IndexedBitmap } from '../../src/data/Bitmap';
import { TmpFile } from '../../src/data/TmpFile';
import { VirtualFile } from '../../src/data/vfs/VirtualFile';
import { TmpDrawable } from '../../src/engine/gfx/drawable/TmpDrawable';

const [root, prepared] = process.argv.slice(2);
const seaPaletteIndices = process.argv.includes('--sea-palette-indices');
const connectedVisibleSea = process.argv.includes('--connected-visible-sea');
const structures = process.argv.includes('--structures');
const continuousStructureGlints = process.argv.includes('--continuous-structure-glints');
const option = (name: string) => {
    const index = process.argv.indexOf(name);
    assert(index < 0 || process.argv[index + 1], 'Missing value for ' + name);
    return index < 0 ? undefined : process.argv[index + 1];
};
const donorRoot = option('--sea-donor-root');
const donorPrepared = option('--sea-donor-prepared');
assert.equal(Boolean(donorRoot), Boolean(donorPrepared), 'Sea donor requires both authoring and prepared evidence');
assert(!structures || connectedVisibleSea && donorRoot, 'Structures require connected palette ownership and a pinned sea donor');
assert(!connectedVisibleSea || seaPaletteIndices, 'Connected visible sea requires source-pinned palette evidence');
const version = continuousStructureGlints ? 'v7' : structures ? 'v5' : connectedVisibleSea ? 'v3' : seaPaletteIndices ? 'v2' : 'v1';
assert(root && prepared, 'Expected authoring and prepared folders');
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const source = JSON.parse(readFileSync(join(root, 'source.json'), 'utf8'));
const layout = JSON.parse(readFileSync(join(root, 'layout.json'), 'utf8'));
const theater = process.argv.find(arg => arg.startsWith('--theater='))?.slice(10) ?? 'URBAN';
assert(['URBAN', 'NEWURBAN', 'DESERT'].includes(theater));
assert.equal(source.theater, theater);
assert(!structures || ['URBAN', 'NEWURBAN'].includes(theater), 'Structure ownership requires audited Urban sources');
assert(!continuousStructureGlints || structures && theater === 'NEWURBAN',
    'Enclosed sea glints are audited only for NewUrban structures');
const extension = theater === 'URBAN' ? 'urb' : theater === 'NEWURBAN' ? 'ubn' : 'des';
const reefs = ['water07', 'water08', 'water14'].map(name => `${name}.${extension}`);
assert.equal(source.preparedSourceSha256, sha(readFileSync(join(prepared, 'source.json'))));
const profile: Record<string, any> = {
    schema: structures ? `m2-4-${theater.toLowerCase()}-structure-native-water-ownership-v1` : `m2-4-${theater.toLowerCase()}-coast-native-water-ownership-v1`,
    waterRegistration: true, waterRegistrationSetIndices: structures ? theater === 'URBAN' ? [19, 81] : [19]
        : theater === 'URBAN' ? [12, 15, 21, 85, 106, 107, 110] : [12, 15, 21],
    nativeSubTileContacts: true, mixedWaterMembers: {},
};
const drawable = new TmpDrawable();
const records = [];
const seaIndices = new Set<number>();
const seaSources = [];
const donor = donorRoot ? JSON.parse(readFileSync(join(donorRoot, 'source.json'), 'utf8')) : source;
assert.equal(donor.theater, theater);
assert.equal(donor.preparedSourceSha256, sha(readFileSync(join(donorPrepared ?? prepared, 'source.json'))));
if (seaPaletteIndices) for (const member of donor.members.filter((row: any) => row.setIndex === 21
    && !reefs.includes(row.member))) {
    const bytes = readFileSync(join(donorPrepared ?? prepared, 'native', member.native.nativeFile));
    assert.equal(sha(bytes), member.native.sha256);
    const tmp = new TmpFile(VirtualFile.fromBytes(bytes, member.member));
    assert(tmp.images.every(tile => tile.height === 0 && !tile.hasExtraData));
    for (const tile of tmp.images) for (const index of tile.tileData) if (index) seaIndices.add(index);
    seaSources.push({ member: member.member, sourceSha256: member.native.sha256,
        paletteSha256: member.native.palette.sha256 });
}
assert(!seaPaletteIndices || seaSources.length === 11 && seaIndices.size > 0);

for (const member of source.members.filter((row: any) => profile.waterRegistrationSetIndices.includes(row.setIndex))) {
    const native = member.native, info = layout[member.member];
    const bytes = readFileSync(join(prepared, 'native', native.nativeFile));
    assert.equal(sha(bytes), native.sha256);
    const tmp = new TmpFile(VirtualFile.fromBytes(bytes, member.member));
    const pureSea = member.setIndex === 21 && !reefs.includes(member.member);
    if (pureSea) assert(tmp.images.every(tile => tile.height === 0 && !tile.hasExtraData),
        'Pure sea cannot contain raised or extra-layer artwork');
    const palette = readFileSync(join(prepared, 'native', native.palette.sha256 + '.pal'));
    assert.equal(sha(palette), native.palette.sha256);
    if (seaPaletteIndices) assert(seaSources.every(row => row.paletteSha256 === native.palette.sha256));
    const [, , width, height] = info.bounds;
    const assembly = new Uint8Array(width * height * 4), mask = new Uint8Array(width * height);
    const extraOwnership = new Uint8Array(width * height);
    const visibleSea = new Uint8Array(width * height);
    const nativeSeaGlints = new Uint8Array(width * height);
    const blueSea = new Uint8Array(width * height);
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
            const nativeSea = seaPaletteIndices ? seaIndices.has(index) : blue;
            visibleSea[target] = Number(nativeSea && Math.max(...rgb) <= 128);
            nativeSeaGlints[target] = Number(Math.max(...rgb) <= 128 && b >= r && g >= r - 8);
            blueSea[target] = Number(nativeSea && b > g + 8 && b > r + 3 && Math.max(...rgb) <= 128);
            mask[target] = Number(tile.height === 0 && !extra.data[i] && (pureSea || (nativeSea && Math.max(...rgb) <= 128)));
        }
    }
    if (structures) {
        // Neutral sea glints share palette entries with grass and concrete. Require
        // a local blue water body before permitting connected neutral glints.
        const waterBridges = (theater === 'URBAN' ? [2, 5, 12] : [2, 5])
            .map(index => `ovrps${String(index).padStart(2, '0')}.${extension}`);
        const hasWater = member.setIndex === 81 || waterBridges.includes(member.member);
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
            let blue = 0, count = 0;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                if (x + dx < 0 || x + dx >= width || y + dy < 0 || y + dy >= height) continue;
                blue += blueSea[(y + dy) * width + x + dx]; count++;
            }
            const index = y * width + x;
            visibleSea[index] &&= Number(hasWater && blue / count >= .3);
            mask[index] &&= Number(Boolean(visibleSea[index] && blueSea[index]));
        }
    }
    const additionalSeaPixels: number[] = [];
    if (connectedVisibleSea) {
        const queue = Array.from(mask.keys()).filter(index => mask[index]);
        for (let cursor = 0; cursor < queue.length; cursor++) {
            const index = queue[cursor], x = index % width;
            const neighbors = [index - width, index + width];
            if (x) neighbors.push(index - 1);
            if (x + 1 < width) neighbors.push(index + 1);
            for (const next of neighbors) if (next >= 0 && next < mask.length && !mask[next] && visibleSea[next]) {
                mask[next] = 1; queue.push(next); additionalSeaPixels.push(next);
            }
        }
    }
    const discardedIslands: number[] = [];
    const enclosedSeaGlints: number[] = [];
    if (structures) {
        const visited = new Uint8Array(mask.length), bodies: number[][] = [];
        for (let index = 0; index < mask.length; index++) if (mask[index] && !visited[index]) {
            const body = [index]; visited[index] = 1;
            for (let cursor = 0; cursor < body.length; cursor++) {
                const current = body[cursor], x = current % width;
                const neighbors = [current - width, current + width];
                if (x) neighbors.push(current - 1);
                if (x + 1 < width) neighbors.push(current + 1);
                for (const next of neighbors) if (next >= 0 && next < mask.length && mask[next] && !visited[next]) {
                    visited[next] = 1; body.push(next);
                }
            }
            if (body.length >= 64) bodies.push(body);
            else for (const pixel of body) { mask[pixel] = 0; discardedIslands.push(pixel); }
        }
        const expected = member.member === 'wash01.urb' ? 2
            : ['wash02.urb', 'ovrps02.urb', 'ovrps05.urb', 'ovrps12.urb',
                'ovrps02.ubn', 'ovrps05.ubn'].includes(member.member) ? 1 : 0;
        assert.equal(bodies.length, expected, member.member + ': unexpected native water body count');
    }
    if (continuousStructureGlints && mask.some(Boolean)) {
        // A tiny enclosed blue-gray native glint belongs to the surrounding sea.
        // Never expand into open shoreline, connected bridge shadows, void or warm colors.
        const visited = new Uint8Array(mask.length);
        for (let start = 0; start < mask.length; start++) if (!mask[start] && !visited[start]) {
            const body = [start]; visited[start] = 1;
            let touchesBoundary = false;
            for (let cursor = 0; cursor < body.length; cursor++) {
                const current = body[cursor], x = current % width, y = Math.floor(current / width);
                touchesBoundary ||= x === 0 || y === 0 || x + 1 === width || y + 1 === height;
                const neighbors = [current - width, current + width];
                if (x) neighbors.push(current - 1);
                if (x + 1 < width) neighbors.push(current + 1);
                for (const next of neighbors) if (next >= 0 && next < mask.length && !mask[next] && !visited[next]) {
                    visited[next] = 1; body.push(next);
                }
            }
            if (!touchesBoundary && body.length <= 16 && body.every(index => nativeSeaGlints[index]))
                for (const index of body) { mask[index] = 1; enclosedSeaGlints.push(index); }
        }
    }
    const waterPixels = mask.reduce((a, b) => a + b, 0);
    const active = assembly.filter((_, i) => i % 4 === 3).reduce((n, a) => n + Number(a > 0), 0);
    assert(connectedVisibleSea || mask.every((value, i) => !value || !extraOwnership[i]),
        'Extra-layer artwork requires an explicit connected visible-sea declaration');
    if (pureSea) {
        assert.equal(waterPixels, active, member.member + ': pure sea requires exact full coverage');
        records.push({ member: member.member, waterPixels, activePixels: active, classification: 'PURE_NATIVE_WATER' });
        continue;
    }
    if (!waterPixels) {
        records.push({ member: member.member, waterPixels, activePixels: active, classification: 'NO_NATIVE_MAIN_LAYER_WATER' });
        continue;
    }
    assert(waterPixels < active, member.member + ': mixed material requires retained land');
    const file = member.member + (continuousStructureGlints ? '-water-connected-mask-v7.bin'
        : structures ? '-water-connected-mask-v5.bin' : connectedVisibleSea ? '-water-connected-mask-v3.bin'
        : seaPaletteIndices ? '-water-palette-mask-v2.bin' : '-water-mask.bin');
    writeFileSync(join(root, file), mask, { flag: 'wx' });
    profile.mixedWaterMembers[member.member] = {
        sourceSha256: native.sha256, classification: structures
            ? theater === 'URBAN' ? 'NATIVE_URBAN_STRUCTURE_WITH_WATER' : 'NATIVE_THEATER_STRUCTURE_WITH_WATER'
            : theater === 'URBAN' ? 'NATIVE_URBAN_COAST_WITH_WATER' : 'NATIVE_THEATER_COAST_WITH_WATER',
        maximumNativeWaterChannel: 128,
        mask: { file, sha256: sha(mask), nativeRgbaSha256: sha(assembly), logical: [width, height],
            policy: structures
                ? 'Source-pinned native water-bearing structures only; exact pure-sea palette entries with a local blue water body, connected to height-zero main-layer sea; verified water-body counts; isolated components below 64 native pixels excluded'
                    + (continuousStructureGlints ? '; enclosed source-blue-gray sea glints of at most 16 native pixels included, even when their palette entries are absent from pure sea; open shore, connected bridge shadows, void and warm colors excluded' : '; neutral concrete and grass excluded')
                : connectedVisibleSea
                ? 'Exact pure-sea palette indices, four-connected to verified native height-zero main-layer sea; visible extra-layer sea is included, disconnected shadows and non-sea materials excluded'
                : seaPaletteIndices
                ? 'Exact native palette indices observed in eleven source-pinned pure-sea members, including neutral glints; height-zero main layer only, all extra-layer artwork excluded'
                : 'Visible native sea palette on height-zero main layer; all nonzero extra-layer rocks and masonry excluded' },
    };
    records.push({ member: member.member, waterPixels, activePixels: active,
        classification: profile.mixedWaterMembers[member.member].classification, additionalConnectedSeaPixels: additionalSeaPixels.length,
        discardedIslands: structures ? discardedIslands : undefined,
        enclosedSeaGlints: continuousStructureGlints ? enclosedSeaGlints : undefined,
        additionalConnectedSeaIndices: connectedVisibleSea ? additionalSeaPixels : undefined });
}
writeFileSync(join(root, `water-material-profile-${version}.json`), JSON.stringify(profile, null, 2) + '\n', { flag: 'wx' });
writeFileSync(join(root, `native-water-ownership-${version}.json`), JSON.stringify({
    status: 'PASS_NATIVE_TMP_LAYER_AND_PALETTE_OWNERSHIP', sourceSha256: sha(readFileSync(join(root, 'source.json'))),
    records, seaPaletteIndices: seaPaletteIndices ? [...seaIndices].sort((a, b) => a - b) : undefined,
    seaDonor: donorRoot ? { root: donorRoot, sourceSha256: sha(readFileSync(join(donorRoot, 'source.json'))),
        prepared: donorPrepared, preparedSourceSha256: donor.preparedSourceSha256 } : undefined,
    seaPaletteSources: seaSources, note: 'Authoring ownership only; generated material, native display and visual acceptance are separate.',
}, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ members: records.length, mixedMembers: Object.keys(profile.mixedWaterMembers).length }));
