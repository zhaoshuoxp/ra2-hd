import { expect, test } from 'bun:test';
import { useSpecialPowers } from '../../src/game/ai/thirdpartbot/builtIn/bot/logic/specialPowers';
import { SuperWeaponType as Power } from '../../src/game/type/SuperWeaponType';
import { ObjectType } from '../../src/engine/type/ObjectType';

function fixture() {
    const own = { id: 1, tile: { rx: 10, ry: 10 }, rules: { type: ObjectType.Vehicle, cost: 900, primary: '120mm' } };
    const near = { id: 2, tile: { rx: 18, ry: 10 }, rules: { type: ObjectType.Vehicle, cost: 700 } };
    const base = { id: 3, tile: { rx: 50, ry: 50 }, rules: { type: ObjectType.Building, cost: 3000, constructionYard: true } };
    const units = [own, near, base];
    const powers = [Power.MultiMissile, Power.LightningStorm, Power.IronCurtain, Power.ChronoSphere, Power.ParaDrop, Power.AmerParaDrop];
    const fired: any[] = [];
    const game: any = {
        getCurrentTick: () => 20000, getPlayerData: () => ({}),
        getAllSuperWeaponData: () => powers.map(type => ({ type, playerName: 'bot', status: 2 })),
        getVisibleUnits: (_name: string, relationship: string) => relationship === 'self' ? [1] : [2, 3],
        getGameObjectData: (id: number) => units.find(u => u.id === id),
        mapApi: { getTile: (rx: number, ry: number) => ({ rx, ry }), isPassableTile: () => true, getObjectsOnTile: () => [] },
    };
    const actions: any = { activateSuperWeapon: (...args: any[]) => fired.push(args) };
    return { game, actions, fired, base, own };
}

test('classic AI powers choose enemy structures, protect own armor, and validate a complete chrono destination', () => {
    const f = fixture();
    useSpecialPowers(f.game, f.actions, 'bot');
    expect(f.fired).toHaveLength(6);
    for (const type of [Power.MultiMissile, Power.LightningStorm, Power.ParaDrop, Power.AmerParaDrop]) {
        expect(f.fired.find(([p]) => p === type)[1]).toEqual(f.base.tile);
    }
    expect(f.fired.find(([p]) => p === Power.IronCurtain)[1]).toEqual(f.own.tile);
    const chrono = f.fired.find(([p]) => p === Power.ChronoSphere);
    expect(chrono[1]).toEqual(f.own.tile);
    expect(chrono[2]).toBeDefined();
    f.fired.length = 0;
    f.game.mapApi.isPassableTile = () => false;
    useSpecialPowers(f.game, f.actions, 'bot');
    expect(f.fired.some(([p]) => p === Power.ChronoSphere)).toBe(false);
});

test('classic support powers do not target collectors or organic vehicles', () => {
    const f = fixture();
    (f.own.rules as any).harvester = true;
    useSpecialPowers(f.game, f.actions, 'bot');
    expect(f.fired.some(([p]) => p === Power.ChronoSphere || p === Power.IronCurtain)).toBe(false);
});
