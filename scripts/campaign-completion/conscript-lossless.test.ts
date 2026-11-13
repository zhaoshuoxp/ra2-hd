import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import * as THREE from 'three';
import { nativeShpSource, resourceRoot, sha256 } from '../test-support/resources';
import { disposeHdSprite, resolveHdSprite } from '../../src/engine/renderable/builder/resolveHdSprite';

const directory = path.join(resourceRoot, 'hd-packs/conscript-authored/owner-r3');
const bytes = readFileSync(path.join(directory, 'manifest.json')), manifest = JSON.parse(bytes.toString());
const manifestHash = 'ffe2bc12c03b3bdfe82c90d53a7200b423cc355a18e6ef6cbd94f17b79597dd0';
const { source } = nativeShpSource('ra2', 'cons.shp',
    'b60c5527b82a6e317e4958344443c4bbd9b2139e693f4641c470ff3f15f1f9f1', 301, manifest.source.theater);

function unpack(page: any, width: number, height: number) {
    const color = page.base.image, owner = page.data.image, lookup = page.tiles?.map.image;
    const rgba = new Uint8Array(width * height * 4), rg = new Uint8Array(width * height * 2);
    const channels = page.data.format === THREE.RGFormat ? 2 : 4;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        let pixel = y * width + x;
        if (lookup) {
            const at = (Math.floor(y / 4) * lookup.width + Math.floor(x / 4)) * 4;
            const id = lookup.data[at] + lookup.data[at + 1] * 256 + lookup.data[at + 2] * 65536;
            pixel = (Math.floor(id / (color.width / 4)) * 4 + y % 4) * color.width + id % (color.width / 4) * 4 + x % 4;
        }
        const output = y * width + x;
        rgba.set(color.data.subarray(pixel * 4, pixel * 4 + 4), output * 4);
        rg.set(owner.data.subarray(pixel * channels, pixel * channels + 2), output * 2);
    }
    return { rgba, rg };
}

for (const density of [2, 4]) test(`accepted Conscript ${density}X retains every color/ownership byte and all301 frame geometries in pooled storage`, async () => {
    expect(sha256(bytes)).toBe(manifestHash);
    const read = async (name: string, hash: string, size: number) => {
        const bytes = readFileSync(path.join(directory, name));
        if (bytes.length !== size || sha256(bytes) !== hash) throw Error('Accepted page identity changed');
        const png = PNG.sync.read(bytes);
        return { width: png.width, height: png.height, rgba: new Uint8Array(png.data) };
    };
    const raw = await resolveHdSprite(manifest, manifestHash, source, density, 2048, read, () => {}, false);
    const pooled = await resolveHdSprite(manifest, manifestHash, source, density, 2048, read, () => {}, false, true);
    try {
        expect(raw.density).toBe(density); expect(pooled.density).toBe(density);
        expect(raw.attempts).toEqual([]); expect(pooled.attempts).toEqual([]);
        expect(pooled.override!.frames).toEqual(raw.override!.frames);
        expect(pooled.override!.pages).toHaveLength(raw.override!.pages.length);
        expect(pooled.gpuBytes).toBeLessThan(raw.gpuBytes * .8);
        for (const [index, original] of raw.override!.pages.entries()) {
            const width = original.base.image.width, height = original.base.image.height;
            const page = pooled.override!.pages[index];
            expect(page.tiles?.virtualSize ?? [page.base.image.width, page.base.image.height]).toEqual([width, height]);
            const expected = unpack(original, width, height), actual = unpack(page, width, height);
            expect(sha256(actual.rgba)).toBe(sha256(expected.rgba)); expect(sha256(actual.rg)).toBe(sha256(expected.rg));
        }
    } finally { disposeHdSprite(raw.override); disposeHdSprite(pooled.override); }
});
