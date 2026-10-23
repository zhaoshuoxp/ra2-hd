import { retailIni } from '../../test-support/resources';
import { expect, test } from 'bun:test';
import fs from 'node:fs';
import * as THREE from 'three';
import { IniFile } from '../../../src/data/IniFile';
import { WeaponRules } from '../../../src/game/rules/WeaponRules';
import { weaponAreaTarget } from '../../../src/game/weaponAreaTarget';
import { TurretTrait } from '../../../src/game/gameobject/trait/TurretTrait';
import { NotifySpawn } from '../../../src/game/gameobject/trait/interface/NotifySpawn';
import { NotifyTick } from '../../../src/game/gameobject/trait/interface/NotifyTick';
import { DiscLaserFx, nativeDiscRadius } from '../../../src/engine/renderable/fx/DiscLaserFx';
import { MagneticLiftBeamPlugin } from '../../../src/engine/renderable/entity/plugin/MagneticLiftBeamPlugin';
import { MindControlLinkPlugin } from '../../../src/engine/renderable/entity/plugin/MindControlLinkPlugin';
import { mindControlSource } from '../../../src/engine/renderable/entity/plugin/mindControlSource';
import { MindControlLinkFx } from '../../../src/engine/renderable/fx/MindControlLinkFx';
import { MagneticBeamFx } from '../../../src/engine/renderable/fx/MagneticBeamFx';
import { setMeshLineViewportResolution } from '../../../src/engine/renderable/fx/MeshLineResolution';
import { magneticFoot, magneticMuzzle } from '../../../src/engine/renderable/entity/plugin/magneticBeamAttachments';

test('disc circumference radius is invariant under native turret bearings rather than the rotated box diagonal', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(50, 50, 18), new THREE.MeshBasicMaterial());
    for (let heading = 0; heading < 360; heading += 15) {
        mesh.matrixWorld.makeRotationY(heading * Math.PI / 180)
            .multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2))
            .scale(new THREE.Vector3(6, 6, 6));
        expect(nativeDiscRadius(mesh)).toBeCloseTo(150, 5);
    }
    mesh.geometry.dispose(); mesh.material.dispose();
});

test('retail normal and elite disc weapons admit their ring flag and explicit native colors', () => {
    const ini = retailIni('yr');
    for (const name of ['DiskLaser', 'DiskLaserE']) {
        const rules = new WeaponRules(ini.getSection(name));
        expect(rules.diskLaser).toBe(true); expect(rules.isLaser).toBe(false);
        expect(rules.laserInnerColor).toEqual([216, 0, 184]);
        expect(rules.laserOuterColor).toEqual([80, 0, 88]); expect(rules.laserDuration).toBe(15);
    }
    expect(new WeaponRules(ini.getSection('MagneticBeam')).diskLaser).toBe(false);
});
test('AreaFire centers on the live caster without mutating an ordinary enemy target', () => {
    const source: any = { tile: {}, isOverlay: () => false, isBuilding: () => false,
        position: { worldPosition: new THREE.Vector3(100, 20, 300) } };
    const ordered = { obj: { name: 'enemy' }, getWorldCoords: () => new THREE.Vector3(900, 0, 300) };
    expect(weaponAreaTarget(source, ordered, false, {})).toBe(ordered);
    const area = weaponAreaTarget(source, ordered, true, {});
    expect(area.obj).toBe(source); expect(area.getWorldCoords()).toEqual(source.position.worldPosition);
    source.position.worldPosition.x = 200;
    expect(area.getWorldCoords().x).toBe(200); expect(ordered.obj.name).toBe('enemy');
});
test('native TurretSpins completes headings independently of target acquisition; ordinary turrets retain aim', () => {
    const trait: any = new TurretTrait();
    const unit = { direction: 0, isUnit: () => true, rules: { turretSpins: true, rot: 11.25 } };
    trait[NotifySpawn.onSpawn](unit);
    const headings = new Set();
    for (let tick = 0; tick < 32; tick++) { trait[NotifyTick.onTick](unit); headings.add(Math.floor(trait.facing / 45)); }
    expect(headings.size).toBe(8); expect(trait.facing).toBe(0);
    unit.rules.turretSpins = false; trait.desiredFacing = 90;
    trait[NotifyTick.onTick](unit); expect(trait.facing).toBe(11.25);
});
test('disc ring precedes the outgoing ray and expires as one disposable effect', () => {
    const removed: any[] = [], fx = new DiscLaserFx(new THREE.OrthographicCamera(),
        () => new THREE.Vector3(10, 50, 20), () => new THREE.Vector3(400, 0, 20), 100, 1,
        new THREE.Color(0xd800b8), new THREE.Color(0x500058));
    fx.setContainer({ remove: (effect: any) => removed.push(effect) }); fx.create3DObject();
    fx.update(0); fx.update(300); expect(fx.phase).toBe('ring');
    expect(fx.get3DObject()!.children[1].visible).toBe(false);
    fx.update(800); expect(fx.phase).toBe('ray'); expect(fx.get3DObject()!.children[1].visible).toBe(true);
    fx.update(1000); expect(removed).toEqual([fx]); expect(fx.get3DObject()).toBeUndefined();
});
test('magnetic ribbon follows elevated victim endpoints and releases at beam interruption', () => {
    let controller: any = { isSpawned: true, position: { worldPosition: new THREE.Vector3(0, 0, 0) },
        art: { primaryFireFlh: { vertical: 100 } } };
    const victim = { position: { worldPosition: new THREE.Vector3(300, 250, 0) },
        magneticLiftTrait: { getController: () => controller } };
    let effect: any, removed = 0;
    const plugin = new MagneticLiftBeamPlugin(victim, new THREE.OrthographicCamera(), new THREE.Color(0xffc8ff));
    const container = { remove: () => removed++ };
    plugin.onCreate({ addEffect: (value: any) => { effect = value; value.setContainer(container); value.create3DObject(); } });
    plugin.update(); effect.update(0);
    expect(effect.get3DObject().userData.target).toEqual([300, 250, 0]);
    victim.position.worldPosition.y = 500; effect.update(100);
    expect(effect.get3DObject().userData.target).toEqual([300, 500, 0]);
    expect(effect.get3DObject().userData.source).toEqual([0, 100, 0]);
    controller = undefined; plugin.update(); expect(removed).toBe(1); expect(effect.get3DObject()).toBeUndefined();
});
test('magnetic muzzle follows turret facing, body mount and full native FLH', () => {
    const unit = { position: { worldPosition: new THREE.Vector3(1000, 250, 2000) }, direction: 0,
        turretTrait: { facing: 270 }, art: { primaryFireFlh: { forward: 85, lateral: 0, vertical: 130 }, turretOffset: -100 } };
    expect(magneticMuzzle(unit, {}).distanceTo(new THREE.Vector3(1085, 380, 2100))).toBeLessThan(.001);
    unit.turretTrait.facing = 90;
    expect(magneticMuzzle(unit, {}).distanceTo(new THREE.Vector3(915, 380, 2100))).toBeLessThan(.001);
    unit.direction = 90;
    expect(magneticMuzzle(unit, {}).distanceTo(new THREE.Vector3(1015, 380, 2000))).toBeLessThan(.001);
});
test('magnetic muzzle uses the displayed paired-tip point at both independent HD densities', () => {
    for (const density of [2, 4]) {
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(40, 30));
        mesh.position.set(100, 200, 300);
        const frame = { batch: mesh, translucent: { visible: false }, frame: { heading: 315, rect: [0, 0, 40 * density, 30 * density] },
            part: { member: 'teletur.vxl', pageSize: [40 * density, 30 * density] } };
        const point = magneticMuzzle({ name: 'TELE' }, { unitVxlHd: { active: true, layers: [{ turret: true, frames: [frame] }] } });
        expect(point.distanceTo(new THREE.Vector3(118.8, 202.1, 300))).toBeLessThan(.001);
        mesh.position.x += 50;
        expect(magneticMuzzle({ name: 'TELE' }, { unitVxlHd: { active: true, layers: [{ turret: true, frames: [frame] }] } }).x).toBeCloseTo(168.8);
        mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose();
    }
});
test('magnetic contact stays on the nearest bottom footprint edge through lift and rotation', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(100, 60, 40));
    mesh.position.set(300, 280, 0);
    const renderable = { bodyVxlBuilder: { sections: new Map([['body', mesh]]) } };
    const target = { position: { worldPosition: new THREE.Vector3(300, 250, 0) } };
    const source = new THREE.Vector3(0, 350, 0), camera = new THREE.OrthographicCamera();
    let foot = magneticFoot(target, renderable, source, camera);
    expect(foot.x).toBeCloseTo(250); expect(foot.y).toBeCloseTo(250);
    mesh.position.y += 200; mesh.rotation.y = Math.PI / 2;
    foot = magneticFoot(target, renderable, source, camera);
    expect(foot.x).toBeCloseTo(280); expect(foot.y).toBeCloseTo(450);
    mesh.rotation.y = 0; mesh.position.y = 280;
    camera.rotation.set(-Math.PI / 6, Math.PI / 4, 0, 'YXZ'); camera.updateMatrixWorld();
    foot = magneticFoot(target, renderable, source, camera);
    expect(foot.distanceTo(new THREE.Vector3(250, 250, 0))).toBeLessThan(.001);
    mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose();
});
test('magnetic HD contact excludes transparent padding and follows the visible lower silhouette through lift', () => {
    const pixels = new Uint8Array(4 * 4 * 4);
    pixels[(2 * 4) * 4 + 3] = 255; pixels[(3 * 4 + 3) * 4 + 3] = 255;
    const texture = new THREE.DataTexture(pixels, 4, 4);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(40, 40)); mesh.position.set(100, 200, 300);
    const frame = { batch: mesh, translucent: { visible: false }, frame: { rect: [0, 0, 4, 4] },
        part: { override: { pages: [{ base: texture }] } } };
    const renderable = { unitVxlHd: { active: true, layers: [{ turret: false, frames: [frame] }] } };
    const target = { position: { worldPosition: mesh.position } }, source = new THREE.Vector3(-100, 195, 300);
    expect(magneticFoot(target, renderable, source, new THREE.OrthographicCamera())).toEqual(new THREE.Vector3(85, 195, 300));
    mesh.position.y += 60;
    expect(magneticFoot(target, renderable, source, new THREE.OrthographicCamera()).y).toBeCloseTo(255);
    mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); texture.dispose();
});
test('control arcs obey native selection and intel visibility for vehicle and infantry controllers', () => {
    for (const name of ['MIND', 'YURIPR']) {
        let selected = false; const effects: any[] = [];
        const victim = { position: { worldPosition: new THREE.Vector3(300, 0, 0) } };
        const source = { name, owner: { color: { asHex: () => 0xff1818 } },
            position: { worldPosition: new THREE.Vector3() }, mindControllerTrait: { getTargets: () => [victim] } };
        const plugin = new MindControlLinkPlugin(source, { isSelected: () => selected },
            { haveSharedIntel: () => true }, { value: {} }, { isSelected: () => false });
        plugin.onCreate({ addEffect: (effect: any) => { effects.push(effect); effect.create3DObject(); } });
        plugin.update(); expect(effects).toHaveLength(0);
        selected = true; plugin.update(); expect(effects).toHaveLength(1);
        expect(effects[0].get3DObject().name).toBe('fx_mclink');
        selected = false; plugin.update(); plugin.dispose();
    }
});

test('an inactive HD controller retains its Original roof while the complete family loads', () => {
    const source = { position: { worldPosition: new THREE.Vector3(100, 50, 200) } };
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(80, 120, 60));
    mesh.position.set(100, 110, 200);
    const renderable = { unitVxlHd: { active: false, layers: [] },
        bodyVxlBuilder: { sections: new Map([['body', mesh]]) } };
    expect(mindControlSource(source, renderable)).toEqual(new THREE.Vector3(100, 170, 200));
    mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose();
});

test('control source follows the rotated elevated vehicle roof and the camera-facing infantry crown', () => {
    const source = { position: { worldPosition: new THREE.Vector3(100, 50, 200) } };
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(80, 120, 60));
    mesh.position.copy(source.position.worldPosition).add(new THREE.Vector3(0, 60, 0));
    const body = { sections: new Map([['body', mesh]]) };
    for (const yaw of [0, Math.PI / 4, Math.PI]) {
        mesh.rotation.y = yaw;
        expect(mindControlSource(source, { bodyVxlBuilder: body })).toEqual(new THREE.Vector3(100, 170, 200));
    }
    const camera = new THREE.OrthographicCamera();
    camera.rotation.set(-Math.PI / 6, Math.PI / 4, 0, 'YXZ');
    const shape = new THREE.Mesh(new THREE.PlaneGeometry(60, 160));
    shape.quaternion.copy(camera.quaternion);
    shape.position.copy(source.position.worldPosition);
    const crown = new THREE.Vector3(0, 80, 0).applyQuaternion(camera.quaternion).add(shape.position);
    expect(mindControlSource(source, { shpRenderable: { getShapeMesh: () => shape } }, camera).distanceTo(crown)).toBeLessThan(.001);
    source.position.worldPosition.y += 90; shape.position.y += 90;
    expect(mindControlSource(source, { shpRenderable: { getShapeMesh: () => shape } }, camera).y).toBeCloseTo(crown.y + 90);
    mesh.geometry.dispose(); shape.geometry.dispose();
});

test('control line touches both supplied attachment points without a hidden vertical bias', () => {
    const source = new THREE.Vector3(100, 220, 300), target = new THREE.Vector3(500, 64, 300);
    const effect = new MindControlLinkFx(source, target, new THREE.Color(0xff1818), 2);
    effect.create3DObject(); effect.update(100);
    const positions = effect.get3DObject()!.geometry.getAttribute('position');
    expect(new THREE.Vector3().fromBufferAttribute(positions, 0).distanceTo(source)).toBeLessThan(.001);
    expect(new THREE.Vector3().fromBufferAttribute(positions, positions.count - 1).distanceTo(target)).toBeLessThan(.001);
    effect.dispose();
});

test('the sprite crown excludes transparent padding and decodes lossless pooled alpha', () => {
    for (const pooled of [false, true]) {
        const pixels = new Uint8Array(4 * 4 * 4);
        pixels[(2 * 4 + 1) * 4 + 3] = 255;
        const texture = new THREE.DataTexture(pixels, 4, 4);
        const material = new THREE.MeshBasicMaterial({ map: texture }) as any;
        material.uniforms = { remapMap: { value: texture } };
        if (pooled) material.uniforms = { ...material.uniforms, hdVirtualSize: { value: [4, 4] },
            hdTileMap: { value: new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1) } };
        const shape = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), material);
        shape.position.set(100, 200, 300);
        const source = { position: { worldPosition: new THREE.Vector3(100, 0, 300) } };
        const point = mindControlSource(source, { shpRenderable: { getShapeMesh: () => shape } });
        expect(point.distanceTo(new THREE.Vector3(95, 195, 300))).toBeLessThan(.001);
        shape.position.x += 60;
        expect(mindControlSource(source, { shpRenderable: { getShapeMesh: () => shape } }).x).toBeCloseTo(155);
        shape.geometry.dispose(); material.dispose(); texture.dispose();
    }
});

test('magnetic field retains reference width and straight endpoints while animating without replacing geometry', () => {
    const camera = new THREE.OrthographicCamera(-800, 800, 450, -450);
    setMeshLineViewportResolution(camera, 1600, 900);
    const source = new THREE.Vector3(), target = new THREE.Vector3(300, 150, 0);
    const effect = new MagneticBeamFx(camera, () => source, () => target, new THREE.Color(0xffc8ff));
    effect.create3DObject(); effect.update(0);
    const mesh = effect.get3DObject()!.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
    const geometry = mesh.geometry, positions = geometry.getAttribute('position');
    const left = new THREE.Vector3().fromBufferAttribute(positions, 64).project(camera);
    const right = new THREE.Vector3().fromBufferAttribute(positions, 65).project(camera);
    const pixels = Math.hypot((left.x - right.x) * 800, (left.y - right.y) * 450);
    expect(pixels).toBeCloseTo(10, 2);
    for (const i of [0, 16, 32, 48, 64]) {
        const a = new THREE.Vector3().fromBufferAttribute(positions, i * 2);
        const b = new THREE.Vector3().fromBufferAttribute(positions, i * 2 + 1);
        expect(a.clone().add(b).multiplyScalar(.5).distanceTo(source.clone().lerp(target, i / 64))).toBeLessThan(.0001);
        expect(a.distanceTo(b)).toBeCloseTo(10, 2);
    }
    target.y += 100; effect.update(400);
    expect(mesh.geometry).toBe(geometry);
    expect(effect.get3DObject()!.userData.target).toEqual([300, 250, 0]);
    expect(mesh.material.uniforms.time.value).toBeCloseTo(.4);
    expect(mesh.material.uniforms.beamLength.value).toBeCloseTo(Math.hypot(300, 250));
    expect(effect.get3DObject()!.userData.opacityRange).toEqual([.22, .38]);
    expect(mesh.material.blendSrc).toBe(THREE.OneFactor);
    expect(mesh.material.blendDst).toBe(THREE.OneMinusSrcAlphaFactor);
    let disposed = 0; geometry.addEventListener('dispose', () => disposed++);
    effect.dispose(); expect(disposed).toBe(1); expect(effect.get3DObject()).toBeUndefined();
});
