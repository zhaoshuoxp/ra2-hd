import { resourceRoot } from '../test-support/resources';
import { describe, test, expect } from 'bun:test';
import * as THREE from 'three';
import { nativeTerrainMetadata, checkTerrainRect, checkTerrainCoverage } from '../../src/engine/renderable/entity/map/terrainHdContract';
import { SpriteUtils } from '../../src/engine/gfx/SpriteUtils';
import { TmpFile } from '../../src/data/TmpFile';
import { VirtualFile } from '../../src/data/vfs/VirtualFile';
import { readFileSync } from 'node:fs';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { resolveMember } from '../../src/offline/retail';
import { TerrainHd } from '../../src/engine/renderable/entity/map/TerrainHd';

describe('TMP terrain geometry and resource contract', () => {
    test('2X/4X sampling preserves every native world vertex and offsets', () => {
        const camera = new THREE.PerspectiveCamera();
        camera.rotation.set(-Math.PI / 6, Math.PI / 4, 0, 'YXZ');
        const positions: number[][] = [];
        for (const density of [1, 2, 4]) {
            const texture = new THREE.DataTexture(new Uint8Array(256 * 256 * 4), 256, 256);
            const geometry = SpriteUtils.createSpriteGeometry({ texture,
                textureArea: { x: 2, y: 2, width: 60 * density, height: 48 * density },
                logicalSize: { width: 60, height: 48 }, offset: { x: 0, y: -18 },
                align: { x: 0, y: -1 }, camera, scale: 1,
            });
            positions.push(Array.from(geometry.getAttribute('position').array));
            geometry.dispose(); texture.dispose();
        }
        expect(positions[1]).toEqual(positions[0]);
        expect(positions[2]).toEqual(positions[0]);
    });
    test('rejects logical-size inflation, out-of-bounds sampling and native alpha holes', () => {
        expect(() => checkTerrainRect([2, 2, 240, 120], [60, 30], 4, [256, 128])).not.toThrow();
        expect(() => checkTerrainRect([2, 2, 244, 120], [60, 30], 4, [256, 128])).toThrow();
        expect(() => checkTerrainRect([250, 2, 240, 120], [60, 30], 4, [256, 128])).toThrow();
        const rgba = new Uint8Array(8 * 8 * 4);
        for (let y = 2; y < 4; y++) for (let x = 2; x < 4; x++) rgba[(y * 8 + x) * 4 + 3] = 255;
        expect(() => checkTerrainCoverage(rgba, 8, [2, 2, 2, 2], new Uint8Array([1]), [1, 1], 2)).not.toThrow();
        rgba[(2 * 8 + 2) * 4 + 3] = 0;
        expect(() => checkTerrainCoverage(rgba, 8, [2, 2, 2, 2], new Uint8Array([1]), [1, 1], 2)).toThrow();
    });
    test('cliff/ramp extra regions and native depth metadata survive identity decoding', () => {
        const tree = editionRetailTree(new Map(['ra2.mix', 'language.mix', 'multi.mix'].map(name =>
            [name, readFileSync(`${resourceRoot}/assets/ra2/${name}`)])), 'ra2');
        const source = resolveMember(tree, 'Cliff01.tem').file;
        const file = new TmpFile(VirtualFile.fromBytes(source.getBytes(), 'Cliff01.tem'));
        expect(file.filename).toBe('cliff01.tem');
        expect(file.sourceBytes).toEqual(source.getBytes());
        const metadata = nativeTerrainMetadata(file, 0);
        expect(metadata.hasExtraData).toBe(true);
        expect(metadata.extra).toEqual([file.images[0].extraX, file.images[0].extraY,
            file.images[0].extraWidth, file.images[0].extraHeight]);
        expect(metadata.hasZData).toBe(file.images[0].hasZData);
        expect(metadata.rampType).toBe(file.images[0].rampType);
        expect(metadata.terrainType).toBe(file.images[0].terrainType);
    });
    test('opt-in cliff contours allow bounded edges and protect the exact ground footprint', () => {
        const native = new Uint8Array(8 * 8);
        for (let y = 0; y < 8; y++) for (let x = 2; x < 6; x++) native[y * 8 + x] = 1;
        const policy = { schema: 'hd-extra-contours-v1', maximumNativeDistance: 1, protectMainBlock: true };
        const metadata = { hasExtraData: true, offset: [0, -5], block: [8, 3] };
        for (const density of [2, 4]) {
            const size = 8 * density + 4, rect = [2, 2, 8*density, 8*density];
            const bytes = new Uint8Array(size * size * 4);
            for (let y = 0; y < rect[3]; y++) for (let x = 0; x < rect[2]; x++)
                bytes[((y+2)*size+x+2)*4+3] = native[Math.floor(y/density)*8+Math.floor(x/density)] ? 255 : 0;
            const setAlpha = (x: number, y: number, alpha: number) => {
                bytes[((y*density+2)*size+x*density+2)*4+3] = alpha;
            };
            setAlpha(2, 1, 160);
            expect(() => checkTerrainCoverage(bytes, size, rect, native, [8, 8], density)).toThrow();
            expect(() => checkTerrainCoverage(bytes, size, rect, native, [8, 8], density, policy, metadata)).not.toThrow();
            setAlpha(4, 1, 0);
            expect(() => checkTerrainCoverage(bytes, size, rect, native, [8, 8], density, policy, metadata)).toThrow();
            setAlpha(4, 1, 255); setAlpha(2, 6, 160);
            expect(() => checkTerrainCoverage(bytes, size, rect, native, [8, 8], density, policy, metadata)).toThrow();
            setAlpha(2, 6, 255);
            expect(() => checkTerrainCoverage(bytes, size, rect, native, [8, 8], density,
                { ...policy, maximumNativeDistance: 2 }, metadata)).toThrow();
        }
    });
    test('teardown releases all shared textures once and clears runtime bindings', () => {
        const terrain = new TerrainHd();
        let released = 0;
        const texture = new THREE.DataTexture();
        texture.addEventListener('dispose', () => released++);
        terrain.textures.push(texture);
        terrain.report.gpuBytes = 4096;
        terrain.report.retainedCpuBytes = 4096;
        terrain.report.worldChargeBytes = 8192;
        terrain.dispose(); terrain.dispose();
        expect(released).toBe(1);
        expect(terrain.report.worldChargeBytes).toBe(0);
        expect(terrain.report.gpuBytes).toBe(0);
        expect(terrain.report.disposed).toBe(true);
        expect(terrain.bindings.size).toBe(0);
    });
});
