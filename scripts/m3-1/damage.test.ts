import { expect, spyOn, test } from 'bun:test';
import { ApplyDamageExecutor } from '../../src/game/trigger/executor/ApplyDamageExecutor';
import { Warhead } from '../../src/game/Warhead';

test('retail scripted HE collapses a protected bridge using the numeric waypoint', () => {
    const bridge = { isSpawned: true, isDestroyed: false, tileElevation: 4 };
    const destroyed: unknown[] = [];
    const tile = { rx: 84, ry: 45, z: 0 };
    const context: any = { campaign: {}, gameOpts: { destroyableBridges: false },
        map: { getTileAtWaypoint: (id: number) => id === 72 ? tile : undefined,
            tileOccupation: { getBridgeOnTile: () => bridge }, getTileZone: () => 0 },
        rules: { getWarhead: (name: string) => { expect(name).toBe('HE'); return {}; } },
        createTarget: (obj: unknown) => ({ obj }), destroyObject: (obj: unknown) => destroyed.push(obj) };
    const burst = spyOn(Warhead.prototype, 'detonate').mockImplementation(() => {});
    try {
        new ApplyDamageExecutor({ params: [0, '72', 0, 0, 0, 0, 999] }, {}, 100).execute(context);
        expect(burst.mock.calls).toHaveLength(5);
        expect(burst.mock.calls.every(call => call[1] === 100 && call[2] === tile)).toBe(true);
        expect(destroyed).toEqual([bridge]);
        expect(context.gameOpts.destroyableBridges).toBe(false);
        expect(() => new ApplyDamageExecutor({ params: [0, 999] }, {}, 100).execute(context)).toThrow('Missing damage waypoint: 999');
    } finally { burst.mockRestore(); }
});
