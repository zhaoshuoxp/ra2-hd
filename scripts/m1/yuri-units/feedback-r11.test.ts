import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { Animation } from '../../../src/engine/Animation';
import { BoxedVar } from '../../../src/util/BoxedVar';
import { AnimProps } from '../../../src/engine/AnimProps';
import { IniSection } from '../../../src/data/IniSection';
import { DiscRotation, enableDiscSurfaceSpin } from '../../../src/engine/renderable/unitVxl/DiscSurfaceSpin';
import { HdSpriteMaterial } from '../../../src/engine/gfx/material/HdSpriteMaterial';
import { BatchedMesh } from '../../../src/engine/gfx/batch/BatchedMesh';
import { MergedSpriteMesh } from '../../../src/engine/gfx/batch/MergedSpriteMesh';
import { ChaosGasMotion } from '../../../src/engine/renderable/entity/ChaosGasMotion';
import { ShpBuilder } from '../../../src/engine/renderable/builder/ShpBuilder';
import { TextureUtils } from '../../../src/engine/gfx/TextureUtils';
import { componentPose } from '../../../src/engine/renderable/unitVxl/VxlUnitRenderer';

test('gas interpolation cannot advance native animation frames or lifetime', () => {
    const art = new IniSection('CDGAS'); art.set('Rate', '450');
    const speed = new BoxedVar(1), animation = new Animation(new AnimProps(art, 40), speed);
    animation.start(0); animation.update(100);
    expect(animation.getCurrentFrame()).toBe(0);
    expect(animation.getFrameFraction(100)).toBeCloseTo(.75);
    animation.update(140);
    expect(animation.getCurrentFrame()).toBe(1);
    // Frame 1 was due at 133.3 ms (7.5 fps); the clock keeps that phase, so 180 ms is 1.35 frames in.
    expect(animation.getFrameFraction(180)).toBeCloseTo(.35);
    animation.pause(); expect(animation.getFrameFraction(200)).toBe(0);
    animation.unpause(); speed.value = 2;
    expect(animation.getFrameFraction(180)).toBeCloseTo(.70);
    animation.stop(); expect(animation.getFrameFraction(9999)).toBe(0);
});

test('disc motion crosses zero in the native direction and stops with the simulation', () => {
    const rotation = new DiscRotation();
    expect(rotation.update(348.75, 100, 20)).toBe(348.75);
    expect(rotation.update(0, 120, 20)).toBe(348.75);
    expect(rotation.update(0, 130, 20)).toBeCloseTo(354.375);
    expect(rotation.update(0, 140, 20)).toBe(360);
    expect(rotation.update(0, 900, 20)).toBe(360);
    expect(rotation.update(11.25, 920, 20)).toBe(360);
    expect(rotation.update(11.25, 930, 20)).toBeCloseTo(365.625);
    expect(rotation.update(236.25, 1400, 20)).toBe(585);
    expect(rotation.update(236.25, 1420, 20)).toBe(596.25);
});

test('canonical disc silhouette retains translation and pitch at every native yaw', () => {
    const reference = new THREE.Matrix4().makeRotationX(.6), translation = new THREE.Vector3(40, 30, 20);
    const attitude = new THREE.Matrix4().makeRotationZ(.13).setPosition(translation);
    for (let facing = 0; facing < 360; facing += 11.25) {
        const current = attitude.clone().multiply(new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(facing)))
            .multiply(reference);
        const actual = componentPose(new THREE.Matrix4(), current, reference.elements, facing, 0);
        actual.elements.forEach((value, i) => expect(value).toBeCloseTo(attitude.elements[i], 8));
    }
});

test('disc depth, opaque, edge and cloak passes keep fixed alpha and paired owner sampling', () => {
    for (const density of [2, 4]) {
        const texture = new THREE.DataTexture(new Uint8Array(128 * 128 * 4), 128, 128);
        const material = new HdSpriteMaterial({ map: texture, remapMap: texture });
        const geometry = new THREE.PlaneGeometry(16, 16), source = new BatchedMesh(geometry, material);
        const batch = new MergedSpriteMesh(geometry, material, 1); batch.updateFromMeshes([source]);
        const depth = (batch.material as HdSpriteMaterial).clone(), cloak = depth.clone();
        depth.enableFiltering('full'); cloak.enableFiltering('full');
        const passes = [batch.material, depth, cloak, ...batch.children.map(child => (child as THREE.Mesh).material)] as HdSpriteMaterial[];
        for (const pass of passes) {
            enableDiscSurfaceSpin(pass, { pageSize: [128, 128] } as any,
                { rect: [4, 4, 16 * density, 12 * density] } as any);
            expect(pass.fragmentShader).toContain('return vec4(color.rgb, coverage.a)');
            expect(pass.fragmentShader).toContain('vec4 coverage = texture2D(map, hdSpriteUv(uv))');
            expect(pass.fragmentShader).toContain('hdSpriteUv(discColorUv(uv))');
            expect(pass.fragmentShader).toContain('vec4 base = discSample(uv)');
            expect(pass.uniforms.discRect.value.z).toBe(16 * density / 128);
            expect(pass.fragmentShader.indexOf('vec4 discSample')).toBeLessThan(pass.fragmentShader.indexOf('vec4 hdResolve'));
        }
        batch.updateFromMeshes([source]);
        expect(passes.every(pass => pass.uniforms.discPhase)).toBe(true);
        batch.dispose(); depth.dispose(); cloak.dispose(); material.dispose(); geometry.dispose(); texture.dispose();
    }
});

test('gas instances share native atlas and palette, interpolate trimmed frames and release only owned geometry/material', () => {
    const map = new THREE.DataTexture(new Uint8Array(32 * 32 * 4), 32, 32);
    const paletteTexture = new THREE.DataTexture(new Uint8Array(256 * 4), 256, 1);
    const palette = { hash: 73102711 }, shp = { width: 20, height: 12, numImages: 40,
        getImage: (frame: number) => ({ x: frame % 3, y: frame % 2, width: 8, height: 6 }) };
    ShpBuilder.textureCache.set(shp, { getTexture: () => map,
        getTextureArea: (frame: number) => ({ x: frame % 4 * 8, y: Math.floor(frame / 4), width: 8, height: 6 }) });
    TextureUtils.cache.set(palette.hash, paletteTexture);
    const camera = new THREE.PerspectiveCamera(); camera.rotation.x = -.6; camera.rotation.y = -.7;
    const clouds = [0, 1].map(() => new ChaosGasMotion(shp, palette, camera, { x: 0, y: 0 }, true));
    let sharedDisposals = 0, ownedDisposals = 0;
    map.addEventListener('dispose', () => sharedDisposals++);
    paletteTexture.addEventListener('dispose', () => sharedDisposals++);
    for (const cloud of clouds) {
        expect(cloud.mesh.material.map).toBe(map); expect(cloud.mesh.material.palette).toBe(paletteTexture);
        cloud.mesh.geometry.addEventListener('dispose', () => ownedDisposals++);
        cloud.mesh.material.addEventListener('dispose', () => ownedDisposals++);
    }
    clouds[0].update(12, .5); clouds[1].update(39, 1);
    expect(clouds[0].mesh.material.uniforms.gasPhase.value).toBe(12.5);
    expect(clouds[1].mesh.material.uniforms.gasTrims.value[0].toArray())
        .toEqual(clouds[1].mesh.material.uniforms.gasTrims.value[1].toArray());
    expect(clouds[0].mesh.material.uniforms.gasBlend).not.toBe(clouds[1].mesh.material.uniforms.gasBlend);
    clouds.forEach(cloud => cloud.dispose()); expect(sharedDisposals).toBe(0); expect(ownedDisposals).toBe(4);
    ShpBuilder.textureCache.delete(shp); TextureUtils.cache.delete(palette.hash); map.dispose(); paletteTexture.dispose();
});
