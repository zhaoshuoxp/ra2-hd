import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { OctreeContainer } from '../../src/engine/gfx/OctreeContainer';
import { UnitHdDemand, type DemandSelection } from '../../src/engine/renderable/builder/UnitHdDemand';
import { AnimationType } from '../../src/engine/renderable/entity/building/AnimationType';

(globalThis as any).location ??= { search: '?edition=ra2' };
const { Building } = await import('../../src/engine/renderable/entity/Building');

function fixture(viewportDemand = true) {
    const released: string[] = [], sprites = Array.from({ length: 5 }, () => ({
        hd: undefined as any, setHdOverride(hd: any) { this.hd = hd; },
    }));
    const image = { filename: 'family.shp' };
    const demand = new UnitHdDemand(new Set(['NACNST', 'MGTK']), 8, async (name, budget): Promise<DemandSelection> =>
        budget < 8 ? { members: new Map(), gpuBytes: 0, density: 1, attempts: [{ reason: 'combined-budget' }] }
            : { members: new Map([[image.filename, { image, override: { identity: name, pages: [], frames: [] } }]]),
                gpuBytes: 8, density: 4, attempts: [] }, family => {
        // A released GPU allocation must have no surviving sprite reference.
        const identity = family.members.get(image.filename)!.override.identity;
        expect(sprites.some(sprite => sprite.hd?.identity === identity)).toBe(false);
        released.push(identity);
    });
    const camera = new THREE.OrthographicCamera(-1000, 1000, 600, -600, -5000, 5000);
    camera.position.set(0, 0, 100); camera.updateMatrixWorld();
    const container = OctreeContainer.factory(camera), target = new THREE.Object3D();
    const building: any = Object.create(Building.prototype);
    Object.assign(building, { target, mainObj: sprites[0], bib: sprites[1], rubbleObj: sprites[2],
        animObjects: new Map([[AnimationType.BUILDUP, [sprites[3], sprites[4]]]]), animations: new Map(),
        gameObject: { name: 'NACNST', isBuilding: () => true, getFoundation: () => ({ width: 3, height: 3 }) },
        imageFinder: { usesViewportBuildingDemand: () => viewportDemand,
            bindBuildingHd: (_name: string, _aggregate: any, apply: any) =>
                demand.bind('NACNST', image, apply) }, aggregatedImageData: {},
        setPosition() {}, create3DObject() {}, update() {} });
    container.add(building);
    const frame = () => { container.update(0); container.cullRenderables(1000); };
    building.bindBuildingHd();
    return { demand, building, sprites, image, released, frame, move: (x: number) => target.position.x = x };
}

test('offscreen building yields its complete allocation, then rebinds after a real unit releases', async () => {
    const f = fixture(); await f.demand.idle(); f.frame();
    expect(f.sprites.every(sprite => sprite.hd?.identity === 'NACNST')).toBe(true);
    f.move(9000); f.frame();
    expect(f.sprites.every(sprite => !sprite.hd)).toBe(true);
    let unit: any;
    const leaveUnit = f.demand.bind('MGTK', f.image, hd => unit = hd);
    await f.demand.idle();
    expect(f.released).toEqual(['NACNST']); expect(unit.identity).toBe('MGTK');
    expect(f.demand.report.families.MGTK.density).toBe(4);
    f.move(0); f.frame(); await f.demand.idle();
    expect(f.sprites.every(sprite => !sprite.hd)).toBe(true);
    expect(f.demand.report.families.NACNST.status).toBe('BUDGET_FALLBACK');
    leaveUnit(); await f.demand.idle();
    expect(f.sprites.every(sprite => sprite.hd?.identity === 'NACNST')).toBe(true);
    expect(f.demand.report.peakBytes).toBe(8);
    f.building.onViewCullChanged(false); f.demand.dispose();
    expect(f.demand.report.gpuBytes).toBe(0);
});

test('culling clears a pending construction publication before its family can be evicted', async () => {
    const f = fixture(); f.building.currentAnimType = AnimationType.BUILDUP;
    await f.demand.idle(); expect(f.building.pendingBuildingHd).toBeFunction();
    f.move(9000); f.frame();
    expect(f.building.pendingBuildingHd).toBeUndefined();
    const leave = f.demand.bind('MGTK', f.image, () => {}); await f.demand.idle();
    expect(f.released).toEqual(['NACNST']);
    expect(f.sprites.every(sprite => !sprite.hd)).toBe(true);
    leave(); f.demand.dispose();
});

test('legacy building leases retain their allocation outside the camera view', async () => {
    const f = fixture(false); await f.demand.idle(); f.move(9000); f.frame();
    const leave = f.demand.bind('MGTK', f.image, () => {}); await f.demand.idle();
    expect(f.sprites.every(sprite => sprite.hd?.identity === 'NACNST')).toBe(true);
    expect(f.demand.report.families.MGTK.status).toBe('BUDGET_FALLBACK');
    f.building.applyBuildingHd(); f.building.releaseBuildingHd(); leave(); f.demand.dispose();
});
