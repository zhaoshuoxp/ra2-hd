import { expect, test } from 'bun:test';
import { GateTrait } from '../../src/game/gameobject/trait/GateTrait';
import { NotifyTick } from '../../src/game/gameobject/trait/interface/NotifyTick';

function fixture() {
    const gate = { art: { foundation: { width: 3, height: 1 } }, tile: { rx: 10, ry: 10 },
        isDestroyed: false, isSpawned: true, buildStatus: 1 };
    const unit = { isUnit: () => true, isSpawned: true, isDestroyed: false, onBridge: false };
    let tile: { rx: number; ry: number } | undefined, friendly = true;
    const game = { areFriendly: () => friendly, map: {
        tiles: { getByMapCoords: (rx: number, ry: number) => ({ rx, ry }) },
        getGroundObjectsOnTile: (at: { rx: number; ry: number }) =>
            at.rx === tile?.rx && at.ry === tile?.ry ? [unit] : [] } };
    const trait = new GateTrait(9, .044, .2);
    return { gate, unit, trait, place: (rx: number, ry: number) => { tile = { rx, ry }; },
        leave: () => { tile = undefined; }, enemy: () => { friendly = false; },
        tick: (count: number) => { for (let n = 0; n < count; n++) trait[NotifyTick.onTick](gate, game); } };
}

test('friendly approach opens every source phase before allowing passage; native delay precedes closing', () => {
    const f = fixture();
    f.place(10, 9);
    const phases = new Set<number>([f.trait.frame]);
    for (let n = 0; n < 40; n++) { f.tick(1); phases.add(f.trait.frame); }
    expect([...phases]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(f.trait.passable).toBe(true);
    f.leave(); f.tick(180);
    expect(f.trait.passable).toBe(true);
    f.tick(1);
    expect(f.trait.passable).toBe(false);
    f.tick(39);
    expect(f.trait.frame).toBe(0);
});

test('closed gates keep enemies blocked; an occupied foundation prevents closing on a passing unit', () => {
    const f = fixture();
    f.enemy(); f.place(10, 9); f.tick(250);
    expect(f.trait.frame).toBe(0);
    expect(f.trait.passable).toBe(false);
    f.place(11, 10); f.tick(250);
    expect(f.trait.passable).toBe(true);
    f.leave(); f.tick(220);
    expect(f.trait.frame).toBe(0);
});

test('dead, unspawned, bridge-level and unready objects do not drive gate phases', () => {
    const f = fixture();
    f.place(10, 9); f.unit.onBridge = true; f.tick(40);
    expect(f.trait.frame).toBe(0);
    f.unit.onBridge = false; f.unit.isDestroyed = true; f.tick(40);
    expect(f.trait.frame).toBe(0);
    f.unit.isDestroyed = false; f.gate.buildStatus = 0; f.tick(40);
    expect(f.trait.frame).toBe(0);
    f.gate.buildStatus = 1; f.gate.isSpawned = false; f.tick(40);
    expect(f.trait.frame).toBe(0);
    f.gate.isSpawned = true; f.gate.isDestroyed = true; f.tick(40);
    expect(f.trait.frame).toBe(0);
});
