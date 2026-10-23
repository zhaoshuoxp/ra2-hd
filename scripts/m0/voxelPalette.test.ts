import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { VplFile } from '../../src/data/VplFile';
import { VirtualFile } from '../../src/data/vfs/VirtualFile';
import { PalettePhongMaterial } from '../../src/engine/gfx/material/PalettePhongMaterial';

function fixture() {
    const bytes = new Uint8Array(16 + 768 + 32 * 256);
    const view = new DataView(bytes.buffer);
    [16, 31, 32, 0xcdcdcdcd].forEach((value, i) => view.setUint32(i * 4, value, true));
    bytes.fill(63, 16, 784);
    for (let row = 0; row < 32; row++) for (let index = 0; index < 256; index++) {
        bytes[784 + row * 256 + index] = (index + row) % 256;
    }
    return bytes;
}
const parse = (bytes: Uint8Array) => new VplFile(VirtualFile.fromBytes(bytes, 'synthetic.vpl'));

test('VPL takes lookup indices after the embedded palette and owns its bytes', () => {
    const bytes = fixture(), vpl = parse(bytes);
    expect(vpl.tables.length).toBe(8192);
    expect(vpl.tables[31 * 256 + 255]).toBe(30);
    expect(vpl.tables[16]).toBe(16);
    bytes.fill(0);
    expect(vpl.tables[31 * 256 + 255]).toBe(30);
});

test('VPL rejects truncated, extended and incompatible RA2 tables', () => {
    expect(() => parse(fixture().slice(0, -1))).toThrow('length');
    expect(() => parse(new Uint8Array(8977))).toThrow('length');
    for (const [offset, value] of [[0, 0], [4, 255], [8, 0], [8, 33]]) {
        const bytes = fixture();
        new DataView(bytes.buffer).setUint32(offset, value, true);
        expect(() => parse(bytes)).toThrow('Unsupported');
    }
});

test('voxel material cloning retains shared lookup ownership and independent lighting', () => {
    const lookup = new THREE.DataTexture(parse(fixture()).tables, 256, 32, THREE.RedFormat);
    const material = new PalettePhongMaterial({ voxelLookup: lookup, extraLight: new THREE.Vector3(5, 5, 5) });
    const clone = material.clone();
    expect(clone.uniforms.useVoxelLookup.value).toBe(true);
    expect(clone.uniforms.voxelLookup.value).toBe(lookup);
    clone.extraLight.setScalar(0);
    expect(material.extraLight.x).toBe(5);
    const fallback = new PalettePhongMaterial();
    expect(fallback.uniforms.useVoxelLookup.value).toBe(false);
    clone.dispose(); material.dispose(); fallback.dispose(); lookup.dispose();
});
