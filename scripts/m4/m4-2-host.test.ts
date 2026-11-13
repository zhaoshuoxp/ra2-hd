import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { decodeWavData, decodeWavDataReference } from '../../src/data/WavFile';
import { registerShadowOnlyMaterial, unregisterShadowOnlyMaterial, installShadowOnlyPass, shadowOnlyMaterialCount }
    from '../../src/engine/gfx/ShadowOnlyMaterials';
import { packagedLaunch } from '../m3-2/native-session.mjs';
import { MergedSpriteMesh } from '../../src/engine/gfx/batch/MergedSpriteMesh';

function imaWav(data: Uint8Array, blockAlign: number, channels = 1, extra?: Uint8Array) {
    const tail = extra ?? new Uint8Array(0);
    const out = new Uint8Array(60 + data.length + tail.length), view = new DataView(out.buffer);
    const put = (offset: number, text: string) => [...text].forEach((c, i) => out[offset + i] = c.charCodeAt(0));
    put(0, 'RIFF'); view.setUint32(4, 52 + data.length + tail.length, true); put(8, 'WAVE');
    put(12, 'fmt '); view.setUint32(16, 20, true); view.setUint16(20, 17, true); view.setUint16(22, channels, true);
    view.setUint32(24, 22050, true); view.setUint32(28, 11100, true); view.setUint16(32, blockAlign, true);
    view.setUint16(34, 4, true); view.setUint16(36, 2, true); view.setUint16(38, 1017, true);
    put(40, 'fact'); view.setUint32(44, 4, true); view.setUint32(48, 1017, true);
    put(52, 'data'); view.setUint32(56, data.length, true); out.set(data, 60); out.set(tail, 60 + data.length);
    return out;
}

test('fast IMA ADPCM decoding matches the library for mono, malformed and fallback layouts', () => {
    let seed = 7;
    const random = (length: number) => Uint8Array.from({ length }, () => ((seed = (seed * 1103515245 + 12345) >>> 0) >>> 16) & 255);
    const inputs = [
        imaWav(random(2048), 512), imaWav(random(1001), 512), imaWav(random(514), 512),
        imaWav(Uint8Array.from([1, 2, 200, 0, ...random(40)]), 44), imaWav(new Uint8Array(0), 512),
        imaWav(random(1024), 512, 2),
        // A trailing LIST chunk keeps the library path and its chunk serialization.
        imaWav(random(1024), 512, 1, Uint8Array.from([...'LIST'].map(c => c.charCodeAt(0)).concat([4, 0, 0, 0, ...'INFO'.split('').map(c => c.charCodeAt(0))]))),
    ];
    for (const input of inputs) expect(decodeWavData(input.slice())).toEqual(decodeWavDataReference(input.slice()));
});

test('shadow-only materials are hidden from projection and visible only inside the shadow pass', () => {
    const material = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    expect(() => registerShadowOnlyMaterial(new THREE.MeshBasicMaterial())).toThrow();
    const before = shadowOnlyMaterialCount();
    registerShadowOnlyMaterial(material);
    expect(material.visible).toBe(false);
    const observed: boolean[] = [];
    const shadowMap = { render() { observed.push(material.visible); } };
    const renderer = { shadowMap } as unknown as THREE.WebGLRenderer;
    installShadowOnlyPass(renderer); installShadowOnlyPass(renderer);
    renderer.shadowMap.render([] as any, new THREE.Scene(), new THREE.Camera());
    expect(observed).toEqual([true]);
    expect(material.visible).toBe(false);
    const failing = { shadowMap: { render() { observed.push(material.visible); throw new Error('shadow failure'); } } };
    installShadowOnlyPass(failing as unknown as THREE.WebGLRenderer);
    expect(() => failing.shadowMap.render()).toThrow('shadow failure');
    expect(observed).toEqual([true, true]);
    expect(material.visible).toBe(false);
    unregisterShadowOnlyMaterial(material);
    expect(material.visible).toBe(true);
    expect(shadowOnlyMaterialCount()).toBe(before);
});

test('merged sprite batches keep the per-instance index layout', () => {
    for (const IndexArray of [Uint16Array, Uint32Array]) {
        const source = new THREE.PlaneGeometry(1, 1, 2, 1);
        source.setIndex(new THREE.BufferAttribute(new IndexArray(source.index!.array), 1));
        const merged = MergedSpriteMesh.createMergedGeometry(source, 7, new THREE.MeshBasicMaterial());
        const vertexCount = source.getAttribute('position').count, stride = source.index!.array.length;
        const expected = new Uint32Array(7 * stride);
        for (let i = 0; i < 7; i++)
            expected.set(Uint32Array.from(source.index!.array, (index: number) => index + i * vertexCount), i * stride);
        expect(merged.index!.array).toBeInstanceOf(Uint32Array);
        expect(merged.index!.array).toEqual(expected);
    }
});

test('Windows portable launches use the transfer executable and shared resources', () => {
    expect(packagedLaunch('C:/RA2', 'win32')).toEqual({ executablePath: expect.stringMatching(/Red Alert 2 HD\.exe$/),
        resources: expect.stringMatching(/GameResources$/) });
    expect(packagedLaunch('/Apps/RA2.app', 'darwin').executablePath).toMatch(/Contents[\\/]MacOS[\\/]RA2 HD Editions$/);
});
