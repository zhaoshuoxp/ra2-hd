import { expect, spyOn, test } from 'bun:test';
import * as THREE from 'three';
import { IniSection } from '../../src/data/IniSection';
import { Anim } from '../../src/engine/renderable/entity/Anim';
import { ShpRenderable } from '../../src/engine/renderable/ShpRenderable';
import { TriggerActionFxHandler } from '../../src/engine/renderable/fx/handler/TriggerActionFxHandler';
import { TriggerAnimEvent } from '../../src/game/event/TriggerAnimEvent';

test('deployment event binds owner, complete HD family and native shadow before reverse animation creation', () => {
    let handler: (event: any) => void = () => {};
    const sharedArt = new IniSection('SCHPDEPL').fromJson({ Shadow: 'yes', Rate: '900' });
    const image = { filename: 'schpdepl.shp', numImages: 22 };
    const bindings: unknown[] = [], colors: unknown[] = [];
    const palette: any = { clone: () => ({ remap: (color: any) => colors.push(color) }) };
    const finder: any = { getHdOverride: () => undefined, findByObjectArt: () => image,
        bindUnitAnimationHd: (...args: any[]) => { bindings.push(args.slice(0, 3)); return () => {}; } };
    const art: any = { art: sharedArt, flat: false };
    const anim = new Anim('SCHPDEPL', art, { x: 0, y: 0 }, finder,
        { getPalette: () => palette }, new THREE.Camera(), { value: false }, 1, false);
    const factory = spyOn(ShpRenderable, 'factory').mockReturnValue({ setHdLease() {}, setFlat() {} } as any);
    let disposed = false;
    const fx = new TriggerActionFxHandler({ events: { subscribe: callback => {
        handler = callback; return { dispose: () => { disposed = true; } };
    } } }, { createTransientAnim: (_, prepare) => {
        prepare(anim);
        (anim as any).createMainObject({ x: 0, y: 0 });
        return anim;
    } });
    try {
        fx.init();
        const color = { id: 'blue' };
        handler(new TriggerAnimEvent('SCHPDEPL', { rx: 1, ry: 2, z: 0 }, true,
            undefined, undefined, { identity: 'SCHP', color }));
        expect(bindings).toEqual([['SCHP', 'SCHPDEPL', image]]);
        expect(colors).toEqual([color]);
        expect(factory.mock.calls[0][4]).toBe(true);
        expect(anim.getAnimProps()?.reverse).toBe(true);
        expect(anim.getAnimProps()?.frameCount).toBe(11);
        expect(sharedArt.getBool('Reverse')).toBe(false);
        fx.dispose();
        expect(disposed).toBe(true);
    } finally { factory.mockRestore(); }
});

test('authored rotor occupies the native joint plane and keeps its reference projection', async () => {
    const { componentGeometry } = await import('../../src/engine/renderable/unitVxl/componentGeometry');
    const camera = new THREE.OrthographicCamera();
    camera.rotation.order = 'YXZ';
    camera.rotation.set(-Math.PI / 6, Math.PI / 4, 0);
    camera.updateMatrixWorld();
    const inverse = new THREE.Matrix4().makeRotationFromEuler(camera.rotation).invert();
    const part: any = { pageSize: [512, 256], override: { pages: [{ base: new THREE.Texture() }] },
        depthBounds: [-40, -46, 40, 26] };
    const frame: any = { rect: [4, 4, 240, 160], offset: [-30, -25], logicalSize: [60, 40],
        referenceOrigin: [0, 0, 0], referenceLinear: new THREE.Matrix4().toArray() };
    const flat = componentGeometry(part, frame, camera, false, 0);
    const rotor = componentGeometry(part, frame, camera, false, 0,
        { axis: new THREE.Vector3(0, 1, 0), center: new THREE.Vector3(0, 25, 0) });
    try {
        const original = flat.getAttribute('position'), projected = rotor.getAttribute('position');
        expect(projected.count).toBe(original.count);
        for (let i = 0; i < projected.count; i++) {
            const p = new THREE.Vector3().fromBufferAttribute(projected, i);
            expect(p.y).toBeCloseTo(25, 4);
            p.applyMatrix4(inverse);
            const q = new THREE.Vector3().fromBufferAttribute(original, i).applyMatrix4(inverse);
            expect(p.x).toBeCloseTo(q.x, 3);
            expect(p.y).toBeCloseTo(q.y, 3);
        }
    } finally { flat.dispose(); rotor.dispose(); }
});

test('retail helicopter rotor joints are supplied only when explicit rotor metadata is absent', async () => {
    const { ObjectArt } = await import('../../src/game/art/ObjectArt');
    const read = (imageName: string, metadata: Record<string, string> = {}) => {
        const art = Object.assign(Object.create(ObjectArt.prototype), {
            image: imageName, rules: { imageName }, isVoxel: false,
            art: new IniSection(imageName).fromJson({ Voxel: 'yes', ...metadata }),
        });
        art.readRotors();
        return art.rotors;
    };
    const rotors = read('SCHP');
    expect(rotors.map((r: any) => r.name)).toEqual(['CYLINDER19', 'CYLINDER57']);
    expect(rotors.map((r: any) => r.axis.toArray())).toEqual([[0, 0, 1], [1, 0, 0]]);
    expect(read('SHAD').map((r: any) => r.name)).toEqual(['CYLINDER18', 'CYLINDER09']);
    expect(read('SHAD').map((r: any) => r.axis.toArray())).toEqual([[0, 0, 1], [0, 0, 1]]);
    expect(read('HTNK')).toBeUndefined();
    expect(read('SCHP', { Rotors: 'custom', Rotor1Rate: '25' })[0].name).toBe('custom');
    expect(read('SHAD', { Rotors: 'custom', Rotor1Rate: '25' })[0].speed).toBe(25);
});
