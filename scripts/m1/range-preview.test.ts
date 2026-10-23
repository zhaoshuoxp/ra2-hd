import { test, expect } from 'bun:test';
import { OverlayUtils } from '../../src/engine/gfx/OverlayUtils';
import { Coords } from '../../src/game/Coords';
import { SuperWeaponType as SW } from '../../src/game/type/SuperWeaponType';
import { superWeaponRange, SuperWeaponRangePreview } from '../../src/gui/screen/game/worldInteraction/SuperWeaponRangePreview';
import { SpecialActionMode } from '../../src/gui/screen/game/worldInteraction/SpecialActionMode';
import { PlacementGrid } from '../../src/gui/screen/game/worldInteraction/placementMode/PlacementGrid';
import { targetCursorFamily } from '../../src/gui/HdTargetCursor';

const tiles = { getByMapCoords: (rx: number, ry: number) => rx >= 0 && ry >= 0 ? { rx, ry, z: 0, rampType: 0 } : undefined };
const rules = { getWeapon: (name: string) => ({ warhead: name === 'NukePayload' ? 'NUKE' : 'launch' }),
    getWarhead: (name: string) => name === 'launch' ? { nukeMaker: true, cellSpread: 0 } : { cellSpread: 10 },
    general: { lightningStorm: { cellSpread: 10, warhead: 'storm' } } };

test('range band has logical width and contrasting borders, independent of output density', () => {
    const radius = 6 * Coords.getWorldTileSize();
    const ring = OverlayUtils.createGroundCircle(radius, 0x000080);
    expect(ring.isMesh).toBe(true);
    const p = ring.geometry.attributes.position;
    const radii = Array.from({ length: p.count }, (_, i) => Math.hypot(p.getX(i), p.getY(i)));
    expect(Math.max(...radii) - Math.min(...radii)).toBeCloseTo(4 * Coords.ISO_WORLD_SCALE, 2);
    expect((Math.max(...radii) + Math.min(...radii)) / 2).toBeCloseTo(radius, 2);
    expect(ring.material.depthTest).toBe(false);
    expect(ring.material.transparent).toBe(true);
    const c = ring.geometry.attributes.color;
    expect(c.getX(129)).toBeGreaterThan(c.getX(0));
    ring.geometry.dispose(); ring.material.dispose();
});

test('nuke preview resolves the detonating payload rather than the zero-spread launch warhead', () => {
    expect(superWeaponRange(SW.MultiMissile, rules, 'NukeCarrier')?.radius).toBe(10);
});

test('Iron Curtain keeps the native aim center with concentric rings and no tile fill', () => {
    let added = 0, removed = 0;
    const scene = { camera: {}, add: (grid: PlacementGrid) => { added++; grid.create3DObject(); }, remove: () => { removed++; } };
    const preview = new SuperWeaponRangePreview({ rules, map: { tiles } }, scene);
    const tile = tiles.getByMapCoords(8, 9)!;
    preview.hover(tile, SW.IronCurtain);
    expect(preview.model.tiles).toEqual([]);
    expect(preview.model.rangeIndicator.concentric).toBe(true);
    expect(preview.model.rangeIndicator.radius).toBe(1.5 * Math.SQRT2);
    expect(preview.model.rangeIndicator.center).toEqual({ x: 8.5, y: 9.5 });
    preview.hover(undefined, SW.IronCurtain); expect(preview.model.visible).toBe(false);
    preview.hover(tile, SW.IronCurtain); expect(added).toBe(1);
    preview.dispose(); preview.dispose(); expect(removed).toBe(1);
});

test('changing a range at the same tile retains its world position and frees the old band', () => {
    const model = { visible: true, tiles: [], rangeIndicator: { center: { x: 8.5, y: 9.5 }, radius: 4 }, rangeIndicatorColor: 0x00ff00 };
    const grid = new PlacementGrid(model, {}, tiles); grid.create3DObject(); grid.update();
    const old = grid.get3DObject()!.children.find(c => (c as any).isMesh)! as any; let disposed = 0;
    old.geometry.addEventListener('dispose', () => disposed++);
    const position = old.position.clone(); model.rangeIndicator.radius = 8; grid.update();
    const band = grid.get3DObject()!.children.find(c => (c as any).isMesh)!;
    expect(band.position.toArray()).toEqual(position.toArray()); expect(disposed).toBe(1); grid.dispose();
});

test('successful targeting and cancellation both remove the preview, without changing the command tile', () => {
    for (const execute of [true, false]) {
        let disposed = 0, result: any;
        const preview = { hover: () => {}, dispose: () => disposed++ };
        const mode = new SpecialActionMode(new Map(), { type: SW.IronCurtain }, {}, { setPointerType: () => {} }, { play: () => {} }, preview as any);
        mode.onExecute.subscribe(value => result = value); const tile = { rx: 4, ry: 5 };
        mode.enter(); mode.hover({ tile });
        if (execute) { mode.execute({ tile }); expect(result.tile).toBe(tile); }
        else mode.cancel();
        expect(disposed).toBe(1);
    }
});

test('HD target cursors cover all native animation frames and leave adjacent cursors original', () => {
    for (const [start, count, name] of [[319,10,'nuke'],[346,5,'iron'],[357,12,'chrono'],[279,20,'storm']] as const) {
        for (let n = 0; n < count; n++) expect(targetCursorFamily(start+n)).toEqual({name, phase:n, count});
        expect(targetCursorFamily(start-1)).toBeUndefined(); expect(targetCursorFamily(start+count)).toBeUndefined();
    }
    const target = OverlayUtils.createGroundTarget(1000, 0xff0000);
    expect(target.userData.ringCount).toBe(3);
    expect(target.geometry.attributes.position.count).toBe(3 * 4 * 129);
    target.geometry.dispose(); target.material.dispose();
});
