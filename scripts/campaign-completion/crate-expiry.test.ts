import { expect, test } from 'bun:test';
import { CrateGeneratorTrait } from '../../src/game/trait/CrateGeneratorTrait';
import { NotifyTick } from '../../src/game/trait/interface/NotifyTick';
import { PowerupType } from '../../src/game/type/PowerupType';

function fixture(ticksLeft: number) {
    const generator: any = new CrateGeneratorTrait(false), events: any[] = [];
    let removals = 0, disposals = 0, draws = 0;
    const crate = { isSpawned: true, isDestroyed: false, tile: {}, dispose() { disposals++; } };
    const powerup = { type: PowerupType.Money, data: '1000' };
    generator.crates.push({ obj: crate, powerup, ticksLeft });
    const game = {
        unspawnObject(object: typeof crate) {
            if (!object.isSpawned) throw new Error('Removing a non-existent crate');
            object.isSpawned = false; removals++;
        },
        generateRandom() { draws++; return .5; },
        rules: { powerups: { powerups: [powerup] } },
        events: { dispatch(event: any) { events.push(event); } },
    };
    return { generator, crate, game, events, tick: () => generator[NotifyTick.onTick](game),
        counts: () => ({ removals, disposals, draws }) };
}

test('combat-destroyed crates retain their original expiry without a second removal or disposal', () => {
    const f = fixture(2);
    f.game.unspawnObject(f.crate); f.crate.isDestroyed = true; f.crate.dispose();
    f.tick(); expect(f.generator.crates).toHaveLength(1);
    expect(f.generator.crates[0].ticksLeft).toBe(1);
    f.tick(); f.tick();
    expect(f.generator.crates).toEqual([]);
    expect(f.counts()).toEqual({ removals: 1, disposals: 1, draws: 0 });
    expect(f.events).toEqual([]);
});

test('an untouched crate expires exactly once without consuming gameplay random numbers', () => {
    const f = fixture(1); f.tick(); f.tick();
    expect(f.generator.crates).toEqual([]);
    expect(f.counts()).toEqual({ removals: 1, disposals: 1, draws: 0 });
});

test('ordinary collection grants the original money once and leaves no later expiry', () => {
    const f = fixture(1), owner = { credits: 200, cratesPickedUp: 0, isCombatant: () => true };
    const unit = { owner };
    expect(f.generator.pickupCrate(unit, f.crate, f.game)).toBe(PowerupType.Money);
    expect(f.generator.pickupCrate(unit, f.crate, f.game)).toBeUndefined();
    f.tick();
    expect(owner).toMatchObject({ credits: 1200, cratesPickedUp: 1 });
    expect(f.counts()).toEqual({ removals: 1, disposals: 1, draws: 1 });
    expect(f.events).toHaveLength(1); expect(f.generator.crates).toEqual([]);
});
