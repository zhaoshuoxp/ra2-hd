import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { ArmedTrait } from '../../../src/game/gameobject/trait/ArmedTrait';
import { AttackTrait } from '../../../src/game/gameobject/trait/AttackTrait';
import { WeaponType } from '../../../src/game/WeaponType';
import { TurretTrait } from '../../../src/game/gameobject/trait/TurretTrait';
import { NotifySpawn } from '../../../src/game/gameobject/trait/interface/NotifySpawn';
import { NotifyTick } from '../../../src/game/gameobject/trait/interface/NotifyTick';
import { enableGattlingSpin, gattlingMuzzle, isGattlingBarrel } from '../../../src/engine/renderable/unitVxl/GattlingBarrelSpin';
import { HdSpriteMaterial } from '../../../src/engine/gfx/material/HdSpriteMaterial';
import { BatchedMesh } from '../../../src/engine/gfx/batch/BatchedMesh';
import { MergedSpriteMesh } from '../../../src/engine/gfx/batch/MergedSpriteMesh';

test('Chaos Drone default scanner deploy selects usable gas while explicit and infantry weapons retain selection', () => {
    const gas = { rules: { areaFire: true } }, scanner = { rules: { neverUse: true } };
    const unit: any = { rules: { deployFire: true, deployFireWeapon: WeaponType.Secondary },
        primaryWeapon: gas, secondaryWeapon: scanner, isVehicle: () => true, isInfantry: () => false,
        deployerTrait: { isDeployed: () => false } };
    const armed = Object.assign(Object.create(ArmedTrait.prototype),
        { gameObject: unit, primaryWeapon: gas, secondaryWeapon: scanner });
    unit.armedTrait = armed;
    expect(armed.getDeployFireWeapon()).toBe(gas);
    const attack = Object.create(AttackTrait.prototype);
    for (const deployed of [false, true]) {
        unit.deployerTrait.isDeployed = () => deployed;
        expect(attack.selectDefaultWeapon(unit)).toBe(gas);
        expect(attack.getAvailableWeapons(unit, false, false)).toEqual([gas]);
    }
    unit.isVehicle = () => false; unit.isInfantry = () => true;
    expect(armed.getDeployFireWeapon()).toBe(scanner);
    unit.rules.deployFireWeapon = WeaponType.Primary;
    expect(armed.getDeployFireWeapon()).toBe(gas);
    unit.rules.deployFire = false; expect(armed.getDeployFireWeapon()).toBeUndefined();
});

test('DISK idle spin separates the fast retail turn ROT from its full revolution cadence', () => {
    const trait: any = new TurretTrait(), unit = { direction: 0, isUnit: () => true,
        rules: { turretSpins: true, rot: 140.625 } };
    trait[NotifySpawn.onSpawn](unit);
    for (let tick = 1; tick <= 32; tick++) {
        trait[NotifyTick.onTick](unit); expect(trait.facing).toBe((tick * 11.25) % 360);
    }
    unit.rules.turretSpins = false; trait.desiredFacing = 90;
    trait[NotifyTick.onTick](unit); expect(trait.facing).toBe(90);
});

test('gattling face spin preserves paired base and owner sampling and only selects the native gun sections', () => {
    const part = { actor: 'YTNK', member: 'ytnktur.vxl', section: 'CYLINDER14', pageSize: [256, 256] };
    expect(isGattlingBarrel(part)).toBe(true);
    expect(isGattlingBarrel({ ...part, actor: 'YAGGUN' })).toBe(false);
    expect(isGattlingBarrel({ ...part, section: 'DUMMY01' })).toBe(false);
    const texture = new THREE.DataTexture(new Uint8Array(256 * 256 * 4), 256, 256);
    const material = new HdSpriteMaterial({ map: texture, remapMap: texture });
    material.enableFiltering('full');
    enableGattlingSpin(material, part, { heading: 45, rect: [0, 0, 64, 64], logicalSize: [16, 16] });
    expect(material.fragmentShader).toContain('hdSpriteUv(gattlingUv(vMapUv))');
    expect(material.fragmentShader).toContain('hdSpriteUv(gattlingUv(uv))');
    expect(material.fragmentShader.indexOf('vec2 gattlingUv')).toBeLessThan(material.fragmentShader.indexOf('hdSpriteUv(gattlingUv'));
    expect(material.uniforms.gattlingFace.value.z).toBeCloseTo(4.6 / 256);
    material.dispose(); texture.dispose();
});

test('gattling muzzle uses the live selected paired gun surface and retains the Original fallback', () => {
    for (const density of [2, 4]) {
        const frame = { heading: 45, rect: [0, 0, 16 * density, 20 * density] };
        const part = { actor: 'YTNK', member: 'ytnktur.vxl', section: 'CYLINDER14', pageSize: [16 * density, 20 * density] };
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(16, 20)); mesh.visible = true; mesh.position.set(10, 20, 30);
        const hd = { unitVxlHd: { active: true, layers: [{ frames: [{ part, frame, batch: mesh, translucent: { visible: false } }] }] } };
        const native = new THREE.Vector3(0, 0, 0);
        expect(gattlingMuzzle(hd, native).distanceTo(new THREE.Vector3(10, 12.2, 30))).toBeLessThan(.001);
        mesh.position.x += 70; expect(gattlingMuzzle(hd, native).x).toBeCloseTo(80);
        hd.unitVxlHd.active = false; expect(gattlingMuzzle(hd, native)).toBe(native);
        mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose();
    }
});

test('barrel coverage initializes its deferred edge draw before installing the shared spin uniforms', () => {
    const texture = new THREE.DataTexture(new Uint8Array(64 * 64 * 4), 64, 64);
    const material = new HdSpriteMaterial({ map: texture, remapMap: texture });
    const geometry = new THREE.PlaneGeometry(16, 16), source = new BatchedMesh(geometry, material);
    const batch = new MergedSpriteMesh(geometry, material, 1);
    expect(batch.children).toHaveLength(0);
    batch.updateFromMeshes([source]); expect(batch.children).toHaveLength(1);
    const passes = [batch.material, ...batch.children.map(child => (child as THREE.Mesh).material)] as HdSpriteMaterial[];
    for (const pass of passes) enableGattlingSpin(pass,
        { actor: 'YTNK', member: 'ytnktur.vxl', section: 'CYLINDER14', pageSize: [64, 64] },
        { heading: 45, rect: [0, 0, 64, 64], logicalSize: [16, 16] });
    batch.updateFromMeshes([source]);
    expect(passes.every(pass => pass.uniforms.gattlingPhase && pass.uniforms.gattlingActive)).toBe(true);
    batch.dispose(); geometry.dispose(); material.dispose(); texture.dispose();
});
