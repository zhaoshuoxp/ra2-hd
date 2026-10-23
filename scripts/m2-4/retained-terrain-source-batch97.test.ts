import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { encodeRgbaRuns, decodeRgbaRuns, retainTerrainSource }
    from '../../src/engine/renderable/entity/map/retainedTerrainSource';

const sha = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');

test('All selected NewUrban terrain atlases restore every RGBA byte including hidden color', () => {
    const selected = JSON.parse(readFileSync('.local/terrain-newurban-selection.json', 'utf8'));
    const root = `.local/terrain-packs/${selected.revision}`;
    const manifest = JSON.parse(readFileSync(`${root}/manifest.json`, 'utf8'));
    let decodedBytes = 0, retainedBytes = 0;
    for (const group of manifest.groups) for (const variant of group.variants) {
        const rgba = new Uint8Array(readFileSync(`${root}/${variant.file}`));
        expect(sha(rgba)).toBe(variant.sha256);
        const packed = encodeRgbaRuns(rgba);
        if (packed) expect(sha(decodeRgbaRuns(packed, rgba.byteLength))).toBe(variant.sha256);
        decodedBytes += rgba.byteLength;
        retainedBytes += packed?.byteLength ?? rgba.byteLength;
    }
    expect(manifest.groups.length).toBe(110);
    expect(retainedBytes).toBeLessThan(decodedBytes * .75);
});

test('Lossless backing survives repeated GPU upload callbacks and disposal', () => {
    const rgba = new Uint8Array(256 * 128 * 4);
    for (let i = 0; i < rgba.length / 2; i++) rgba[i] = i * 131 % 256;
    const hash = sha(rgba);
    const texture = new THREE.DataTexture(rgba, 256, 128);
    let previousUpdates = 0;
    texture.onUpdate = () => { previousUpdates++; };
    const backing = retainTerrainSource(texture, rgba);
    expect(backing.retainedCpuBytes).toBeLessThan(rgba.byteLength);
    expect(backing.uploadWorkingBytes).toBe(rgba.byteLength + backing.retainedCpuBytes);
    for (let upload = 0; upload < 4; upload++) {
        expect(sha(texture.image.data as Uint8Array)).toBe(hash);
        texture.onUpdate!(texture);
        expect(texture.userData.terrainSourceRetention.uploads).toBe(upload + 1);
    }
    expect(previousUpdates).toBe(4);
    backing.releaseDecoded();
    texture.dispose();
    expect(texture.userData.terrainSourceRetention.disposed).toBe(true);
    expect(() => texture.image.data).toThrow('disposed-terrain-source');
});

test('Unhelpful compression uses raw storage and malformed runs cannot fabricate pixels', () => {
    const raw = new Uint8Array(new Uint32Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer);
    const texture = new THREE.DataTexture(raw, 4, 2);
    const backing = retainTerrainSource(texture, raw);
    expect(backing.encodedBytes).toBe(0);
    expect(texture.image.data).toBe(raw);
    for (const runs of [[0], [4], [-4, 1], [5, 7], [1, 7]])
        expect(() => decodeRgbaRuns(new Uint32Array(runs), 16)).toThrow();
    expect(() => decodeRgbaRuns(new Uint32Array([4, 1]), 15)).toThrow('terrain-source-decode-size');
});
