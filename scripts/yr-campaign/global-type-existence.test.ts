import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { CampaignYrRuntime } from '../../src/game/campaign/CampaignYrRuntime';

const source = readFileSync('.local/campaign/yr/sov04dmd/sov04dmd.map');
const original = new CampaignDefinition('yr', 'sov04dmd.map', source.toString(), undefined,
    { semanticsVersion: 34, sourceSha256: createHash('sha256').update(source).digest('hex') });
const killed = original.triggers.get('043915FC')!.events[0];

test('original Romanov death condition follows the live actor through Special ownership, transport and recovery', () => {
    expect(killed.opcode).toBe(61); expect(killed.params).toEqual(['2', '0', 'RMNV']);
    const russian = { units: [] as any[], getOwnedObjects: function(all: boolean) { expect(all).toBe(true); return this.units; } };
    const special = { ...russian, units: [] as any[] }, german = { ...russian, units: [] as any[] };
    const romanov = { name: 'RMNV', isDestroyed: false, isSpawned: true };
    const game: any = { gameOpts: { campaign: { edition: 'yr', semanticsVersion: 34 } },
        getCombatants: () => [russian, german], getAllPlayers: () => [russian, german, special] };
    const runtime = new CampaignYrRuntime(original, game, {} as any);
    german.units.push(romanov); expect(runtime.check(killed, [], [])).toBe(false);
    german.units.length = 0; special.units.push(romanov); expect(runtime.check(killed, [], [])).toBe(false);
    romanov.isSpawned = false; expect(runtime.check(killed, [], [])).toBe(false);
    special.units.length = 0; german.units.push(romanov); expect(runtime.check(killed, [], [])).toBe(false);
    romanov.isDestroyed = true; expect(runtime.check(killed, [], [])).toBe(true);
});

test('current global existence includes neutral owners while stored YR33 and RA2 policies retain their results', () => {
    const romanov = { name: 'RMNV', isDestroyed: false }, neutral = { getOwnedObjects: () => [romanov] };
    const game: any = { gameOpts: { campaign: { edition: 'yr', semanticsVersion: 34 } },
        getCombatants: () => [], getAllPlayers: () => [neutral] };
    const runtime = new CampaignYrRuntime(original, game, {} as any);
    const exists = { ...killed, opcode: 60, params: ['2', '1', 'RMNV'] };
    expect(runtime.check(exists, [], [])).toBe(true); expect(runtime.check(killed, [], [])).toBe(false);
    game.gameOpts.campaign.semanticsVersion = 33;
    expect(runtime.check(exists, [], [])).toBe(false); expect(runtime.check(killed, [], [])).toBe(true);
    game.gameOpts.campaign = { edition: 'ra2', semanticsVersion: 34 };
    expect(runtime.check(exists, [], [])).toBe(false); expect(runtime.check(killed, [], [])).toBe(true);
    game.gameOpts.campaign = { edition: 'yr', semanticsVersion: 34 }; romanov.isDestroyed = true;
    expect(runtime.check(exists, [], [])).toBe(false); expect(runtime.check(killed, [], [])).toBe(true);
});
