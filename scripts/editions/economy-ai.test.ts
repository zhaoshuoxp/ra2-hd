import { expect, test } from 'bun:test';
import { requestEconomyUnits } from '../../src/game/ai/thirdpartbot/builtIn/bot/logic/building/economyRequests';

test('combat demand does not prevent replacing a lost miner, and refineries bound demand', () => {
    let units: any[] = [{ name: 'GAREFN', refinery: true }, { name: 'CMIN', harvester: true }];
    const game: any = { getCurrentTick: () => 20000, getPlayerData: () => ({}), getVisibleUnits: (_name: string, _side: string, filter: any) => units.filter(filter) };
    const production: any = { getAvailableObjects: () => [{ name: 'CMIN', harvester: true }] };
    const requests = new Map<string, any>([['MTNK', { priority: 50 }]]);
    requestEconomyUnits(game, production, 'bot', requests);
    expect(requests.get('CMIN').priority).toBeGreaterThan(requests.get('MTNK').priority);
    units.push({ name: 'CMIN', harvester: true });
    const filled = new Map(); requestEconomyUnits(game, production, 'bot', filled);
    expect(filled.size).toBe(0);
    units = units.filter(u => !u.refinery);
    const homeless = new Map(); requestEconomyUnits(game, production, 'bot', homeless);
    expect(homeless.size).toBe(0);
});

test('deployed slave miners count toward the same mobile mining capacity', () => {
    const units = [{ name: 'YAREFN' }, { name: 'YAREFN' }, { name: 'SMIN' }];
    const game: any = { getCurrentTick: () => 20000, getPlayerData: () => ({}), getVisibleUnits: (_name: string, _side: string, filter: any) => units.filter(filter) };
    const production: any = { getAvailableObjects: () => [{ name: 'SMIN' }] };
    const requests = new Map(); requestEconomyUnits(game, production, 'bot', requests);
    expect(requests.size).toBe(0);
    units.pop(); requestEconomyUnits(game, production, 'bot', requests);
    expect(requests.has('SMIN')).toBe(true);
});
