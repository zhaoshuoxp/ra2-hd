import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { BatchShpBuilder } from '../../src/engine/renderable/builder/BatchShpBuilder';
import { ShpBuilder } from '../../src/engine/renderable/builder/ShpBuilder';
import { TextureUtils } from '../../src/engine/gfx/TextureUtils';
import { MapSpriteBatchLayer } from '../../src/engine/renderable/entity/map/MapSpriteBatchLayer';
import type { HdSpriteOverride } from '../../src/engine/renderable/builder/HdSpriteOverride';
import { fnv32a } from '../../src/util/math';

test('bridge depth policy survives HD page changes and Original fallback without leaking into actors', () => {
    const indexed = new THREE.DataTexture(new Uint8Array(128 * 128 * 4), 128, 128);
    const file: any = { width: 64, height: 64, numImages: 2,
        getImage: () => ({ x: 0, y: 0, width: 20, height: 20 }) };
    const area = { x: 2, y: 2, width: 20, height: 20 };
    const atlas: any = { getTexture: () => indexed, getTextureArea: () => area };
    const palette: any = { hash: 194774 };
    TextureUtils.cache.set(palette.hash, indexed);
    TextureUtils.cache.set(fnv32a([palette.hash]), indexed);
    ShpBuilder.textureCache.set(file, atlas);
    const pages = [0, 1].map(() => ({ base: new THREE.DataTexture(new Uint8Array(128 * 128 * 4), 128, 128),
        data: new THREE.DataTexture(new Uint8Array(128 * 128 * 4), 128, 128) }));
    const override: HdSpriteOverride = { identity: 'bridge-depth-fixture', pages,
        frames: [0, 1].map(page => ({ page, sampleRect: { x: 2, y: 2, width: 40, height: 40 } })) };
    for (const batched of [false, true]) {
        const bridge: any = new ShpBuilder(file, palette, new THREE.OrthographicCamera());
        bridge.setBatched(batched);
        if (batched) bridge.setBatchPalettes([palette]);
        bridge.setDepthOptions(false, false); bridge.setHdOverride(override);
        const mesh = bridge.build();
        const check = () => {
            expect(mesh.material.depthTest).toBe(false);
            expect(mesh.material.depthWrite).toBe(false);
        };
        check(); bridge.setFrame(1); check(); bridge.setHdOverride(undefined); check();
        const actor: any = new ShpBuilder(file, palette, new THREE.OrthographicCamera());
        actor.setBatched(batched);
        if (batched) actor.setBatchPalettes([palette]);
        const actorMesh = actor.build();
        expect(actorMesh.material.depthTest).toBe(true);
        expect(actorMesh.material.depthWrite).toBe(true);
        bridge.dispose(); actor.dispose();
    }
    ShpBuilder.textureCache.delete(file);
    TextureUtils.cache.delete(palette.hash); TextureUtils.cache.delete(fnv32a([palette.hash]));
    indexed.dispose(); pages.forEach(p => { p.base.dispose(); p.data.dispose(); });
});

test('filtered native shadow batches clamp each frame and retain visibility and borrowed textures', () => {
    const texture = new THREE.DataTexture(new Uint8Array(128 * 64 * 4), 128, 64);
    const file: any = { width: 64, height: 64,
        getImage: () => ({ x: 0, y: 0, width: 30, height: 20 }) };
    const areas = [{ x: 2, y: 2, width: 30, height: 20 }, { x: 34, y: 2, width: 30, height: 20 }];
    const atlas: any = { getTexture: () => texture, getTextureArea: (frame: number) => areas[frame] };
    const palette: any = { hash: 194773 };
    TextureUtils.cache.set(palette.hash, texture);
    const builder = new BatchShpBuilder(file, palette, new THREE.OrthographicCamera(),
        new Map([[file, atlas]]), .38, true, 4, 1, undefined, true);
    const item = { shpFile: file, frameNo: 0, position: new THREE.Vector3(),
        offset: { x: 0, y: 0 }, flat: true, depth: false };
    builder.add(item);
    const mesh = builder.build(), uv = mesh.geometry.getAttribute('uv');
    expect(mesh.material.type).toBe('ShpShadowMaterial');
    expect((mesh.material as THREE.Material).transparent).toBe(false);
    expect((mesh.material as THREE.Material).depthWrite).toBe(false);
    const rect = mesh.geometry.getAttribute('shadowFrameRect');
    for (let i = 0; i < builder.verticesPerSprite; i++) {
        expect(rect.getX(i)).toBeCloseTo(2 / 128);
        expect(rect.getZ(i)).toBeCloseTo(32 / 128);
        expect(uv.getX(i)).toBeGreaterThanOrEqual(rect.getX(i));
        expect(uv.getX(i)).toBeLessThanOrEqual(rect.getZ(i));
    }
    item.frameNo = 1;
    builder.update(item);
    expect(rect.getX(0)).toBeCloseTo(34 / 128);
    expect(rect.getZ(0)).toBeCloseTo(64 / 128);
    builder.remove(item);
    expect(mesh.geometry.getAttribute('vertexColorMult').getW(0)).toBe(0);
    let disposed = 0;
    texture.addEventListener('dispose', () => disposed++);
    builder.dispose();
    expect(disposed).toBe(0);
    TextureUtils.cache.delete(palette.hash);
    texture.dispose();
});

test('water material opacity composes with native fade and clears on Original fallback', () => {
    const builder: any = Object.create(ShpBuilder.prototype);
    builder.opacity = 1;
    builder.hdOverride = { visualOpacity: .64 };
    builder.mesh = { material: { opacity: 1, transparent: false } };
    builder.updateOpacity();
    builder.updateTransparency();
    expect(builder.mesh.material.opacity).toBe(.64);
    expect(builder.mesh.material.transparent).toBe(true);
    builder.setOpacity(.8);
    expect(builder.mesh.material.opacity).toBeCloseTo(.512);
    builder.getHdPage = () => undefined;
    builder.setFrame = () => {};
    builder.setHdOverride(undefined);
    expect(builder.mesh.material.opacity).toBe(.8);
    builder.setOpacity(1);
    expect(builder.mesh.material.opacity).toBe(1);
    expect(builder.mesh.material.transparent).toBe(false);
});

test('HD map batches preserve individual native geometry, pooled UVs, lighting and borrowed texture lifetime', () => {
    const camera = new THREE.OrthographicCamera(-100, 100, 100, -100, 1, 1000);
    camera.rotation.set(-Math.PI / 6, Math.PI / 4, 0);
    const image = { x: 7, y: 9, width: 67, height: 58 };
    const file: any = { width: 141, height: 99, numImages: 1, getImage: () => image };
    const indexed = new THREE.DataTexture(new Uint8Array(128 * 128 * 4), 128, 128);
    const area = { x: 2, y: 2, width: 68, height: 58 };
    const atlas: any = { getTexture: () => indexed, getTextureArea: () => area };
    const palette: any = { hash: 194772 };
    TextureUtils.cache.set(palette.hash, indexed);
    ShpBuilder.textureCache.set(file, atlas);
    for (const density of [2, 4]) {
        const base = new THREE.DataTexture(new Uint8Array(64 * 64 * 4), 64, 64);
        const data = new THREE.DataTexture(new Uint8Array(2), 1, 1);
        const lookup = new THREE.DataTexture(new Uint8Array(256), 8, 8);
        const override: HdSpriteOverride = { identity: `fixture-${density}`, pages: [{ base, data,
            tiles: { map: lookup, virtualSize: [512, 512] } as any }],
            frames: [{ page: 0, sampleRect: { x: 2, y: 4, width: 68 * density, height: 58 * density } }] };
        const offset = { x: 3.25, y: 5.75 }, position = new THREE.Vector3(30, 4, 70);
        const single = new ShpBuilder(file, palette, camera, 1, false, 0);
        single.setOffset(offset);
        single.setHdOverride(override);
        const mesh = single.build();
        const batch = new BatchShpBuilder(file, palette, camera, new Map([[file, atlas]]), 1, false, 8, 1, override);
        const item = { shpFile: file, frameNo: 0, position, offset, flat: false, depth: false,
            lightMult: new THREE.Vector3(.8, .7, .6) };
        batch.add(item);
        const merged = batch.build();
        const expected = mesh.geometry.clone().translate(position.x, position.y, position.z);
        for (const attribute of ['position', 'uv']) {
            const values = expected.getAttribute(attribute).array;
            expect(Array.from(merged.geometry.getAttribute(attribute).array).slice(0, values.length))
                .toEqual(Array.from(values));
        }
        expect((merged.material as any).uniforms.hdVirtualSize.value).toEqual([512, 512]);
        expect((merged.material as any).uniforms.hdTileMap.value).toBe(lookup);
        expect((merged.material as any).uniforms.remapMap.value).toBe(data);
        const color = merged.geometry.getAttribute('vertexColorMult');
        expect(color.getX(0)).toBeCloseTo(.8);
        expect(color.getW(0)).toBe(1);
        batch.remove(item);
        expect(color.getW(0)).toBe(0);
        const removedVersion = color.version;
        batch.add(item);
        expect(color.getW(0)).toBe(1);
        expect(color.version).toBeGreaterThan(removedVersion);
        const addedVersion = color.version;
        const lateItem = { ...item, position: new THREE.Vector3(50, 4, 90) };
        batch.add(lateItem);
        expect(color.getW(batch.verticesPerSprite)).toBe(1);
        expect(color.version).toBeGreaterThan(addedVersion);
        let disposed = 0;
        for (const texture of [base, data, lookup]) texture.addEventListener('dispose', () => disposed++);
        batch.dispose();
        single.dispose();
        expect(disposed).toBe(0);
        for (const texture of [base, data, lookup]) texture.dispose();
        expect(disposed).toBe(3);
        expected.dispose();
    }
    ShpBuilder.textureCache.delete(file);
    TextureUtils.cache.delete(palette.hash);
    indexed.dispose();
});

test('native overlay state changes keep HD body-local frames and original aggregate shadow frames separate', () => {
    const layer: any = Object.create(MapSpriteBatchLayer.prototype);
    const file = { numImages: 24 }, object = { art: { paletteType: 0 } };
    const override = { identity: 'ore-fixture', frames: Array.from({ length: 12 }, () => ({ page: 0 })) };
    const main = { shpFile: file, frameNo: 0, hdOverride: override }, shadow = { frameNo: 240 };
    let bodyUpdates = 0, shadowUpdates = 0;
    layer.imageFinder = { findByObjectArt: () => file, getHdOverride: () => override };
    layer.aggregatedImageData = { file: { numImages: 480 }, imageIndexes: new Map([[file, 41]]) };
    layer.batchShpSpecsByObject = new Map([[object, { main, shadow }]]);
    layer.batchShpBuilders = new Map([['0_undefined_ore-fixture', [{ has: () => true, update: () => bodyUpdates++ }]]]);
    layer.shadowBatchShpBuilders = [{ has: () => true, update: () => shadowUpdates++ }];
    layer.setObjectFrame(object, 7);
    expect(main.frameNo).toBe(7);
    expect(shadow.frameNo).toBe(288);
    expect(bodyUpdates).toBe(1);
    expect(shadowUpdates).toBe(1);
    expect(layer.getObjectHdBinding(object)).toEqual({ identity: 'ore-fixture', frame: 7 });
    layer.setObjectFrame(object, 12);
    expect(bodyUpdates).toBe(1);
});
