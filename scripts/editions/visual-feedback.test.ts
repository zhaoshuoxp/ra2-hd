import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { AirstrikeLinePlugin } from '../../src/engine/renderable/entity/plugin/AirstrikeLinePlugin';
import { PipOverlay } from '../../src/engine/renderable/entity/PipOverlay';

test('airstrike designation draws after sprites and releases only its own target marker', () => {
    const markers = new Set<object>(), target = {}, root = new THREE.Object3D();
    let active = true;
    const unit = {
        airstrikeTrait: { getTarget: () => active ? target : undefined },
        armedTrait: { getWeapons: () => [{ rules: { isLine: true }, flh: { lateral: 0, forward: 0, vertical: 20 }, getMuzzleFacing: () => 0 }] },
        isSpawned: true, isDestroyed: false, warpedOutTrait: { isActive: () => false },
        position: { worldPosition: new THREE.Vector3(100, 0, 100) },
        attackTrait: { currentTarget: { getWorldCoords: () => new THREE.Vector3(200, 0, 250) } },
    };
    const manager = { getRenderableByGameObject: () => ({ setAirstrikeDesignator: (source: object, enabled: boolean) => {
        if (enabled) markers.add(source); else markers.delete(source);
    } }) };
    const first = new AirstrikeLinePlugin(unit, { get3DObject: () => root });
    const second = new AirstrikeLinePlugin(unit, { get3DObject: () => root });
    first.onCreate(manager); second.onCreate(manager); first.update(); second.update();
    expect(markers.size).toBe(2);
    const line = root.children[0] as THREE.Line;
    const material = line.material as THREE.LineBasicMaterial;
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(Array.from(line.geometry.attributes.position.array)).toEqual([0, 20, -0, 100, 0, 150]);
    first.dispose(); expect(markers.size).toBe(1);
    active = false; second.update(); expect(markers.size).toBe(0); expect(root.children.length).toBe(0);
    second.dispose();
});

test('repair indicator repeats its native animation and disposes it on stop or replacement', () => {
    const animations: any[] = [], root = new THREE.Object3D();
    const overlay = Object.assign(Object.create(PipOverlay.prototype), {
        rootObj: root, animFactory: () => {
            const node = new THREE.Object3D();
            const anim = { overrides: undefined, disposed: false, setArtOverrides(value: any) { this.overrides = value; },
                setRenderOrder() {}, create3DObject() {}, get3DObject: () => node,
                dispose() { this.disposed = true; } };
            animations.push(anim); return anim;
        },
    });
    overlay.updateRepairWrenchSprite(true);
    expect(animations[0].overrides).toEqual({ LoopCount: '-1' });
    overlay.updateRepairWrenchSprite(true);
    expect(animations[0].disposed).toBe(true); expect(root.children.length).toBe(1);
    overlay.updateRepairWrenchSprite(false);
    expect(animations[1].disposed).toBe(true); expect(root.children.length).toBe(0);
    expect(overlay.repairWrench).toBeUndefined();
});
