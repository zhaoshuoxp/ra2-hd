import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { createHash, randomBytes } from 'node:crypto';
import { retainHdTextureSource } from '../../src/engine/gfx/retainedHdTextureSource';

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

test('RGBA, ownership and tile lookup bytes survive repeated uploads and context recovery without a raw resident copy', () => {
    for (const channels of [2, 4]) {
        const pixels = new Uint8Array(512 * 256 * channels);
        for (let i = 0; i < pixels.length; i++) pixels[i] = (i >> 4) % 251;
        const expected = sha(pixels);
        const texture = new THREE.DataTexture(pixels, 512, 256, channels === 2 ? THREE.RGFormat : THREE.RGBAFormat);
        const flags = [texture.format, texture.colorSpace, texture.flipY, texture.minFilter, texture.magFilter];
        let previousUploads = 0;
        texture.onUpdate = () => { previousUploads++; };
        const backing = retainHdTextureSource(texture);
        expect(backing.retainedCpuBytes).toBeLessThan(pixels.byteLength / 2);
        expect(backing.encodingWorkingBytes).toBe(pixels.byteLength + backing.retainedCpuBytes);
        backing.releaseDecoded();
        for (let upload = 0; upload < 3; upload++) {
            const restored = texture.image.data as Uint8Array;
            expect(restored).not.toBe(pixels);
            expect(sha(restored)).toBe(expected);
            expect(texture.image.data).toBe(restored);
            texture.onUpdate!(texture);
        }
        expect(previousUploads).toBe(3);
        expect(texture.userData.hdSourceRetention.uploads).toBe(3);
        expect([texture.format, texture.colorSpace, texture.flipY, texture.minFilter, texture.magFilter]).toEqual(flags);
        texture.dispose();
        expect(texture.userData.hdSourceRetention.disposed).toBe(true);
        expect(() => texture.image.data).toThrow('disposed-hd-texture-source');
    }
});

test('incompressible and tiny texture sources keep their exact original storage', () => {
    for (const pixels of [new Uint8Array([0, 255]), new Uint8Array(randomBytes(65536))]) {
        const texture = new THREE.DataTexture(pixels, pixels.length / 2, 1, THREE.RGFormat);
        const backing = retainHdTextureSource(texture);
        expect(backing.encodedBytes).toBe(0);
        expect(backing.retainedCpuBytes).toBe(pixels.byteLength);
        backing.releaseDecoded();
        expect(texture.image.data).toBe(pixels);
        texture.dispose();
    }
});
