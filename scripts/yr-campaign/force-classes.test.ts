import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { CampaignRuntime } from '../../src/game/campaign/CampaignRuntime';

const bytes = readFileSync('.local/campaign/yr/all06umd/all06umd.map');
const source = new CampaignDefinition('yr', 'all06umd.map', bytes.toString(), undefined,
    { semanticsVersion: 45, sourceSha256: createHash('sha256').update(bytes).digest('hex') });
const trigger = source.triggers.get('06C3694C')!;
const actor = (name: string, type: string, naval = false, spawned = true) => ({ name,
    isDestroyed: false, isSpawned: spawned, rules: { naval, insignificant: false },
    isUnit: () => type !== 'building', isBuilding: () => type === 'building',
    isTechno: () => true, isAircraft: () => type === 'aircraft' });

test('YR45 original land-force victory excludes AircraftClass, including stored submarine ammunition', () => {
    expect(trigger.events[0].opcode).toBe(56); expect(trigger.events[0].params).toEqual(['0', '9']);
    const units = [actor('BSUB', 'vehicle', true), actor('CMISL', 'aircraft', false, false),
        actor('CMISL', 'aircraft', false, false), actor('YAYARD', 'building'), actor('CAOILD', 'building')];
    const host: any = { launch: { edition: 'yr', semanticsVersion: 45 }, events: [], targets: () => [],
        resolveHouse: (index: number) => { expect(index).toBe(9); return { getOwnedObjects: () => units }; } };
    const check = () => (CampaignRuntime.prototype as any).check.call(host, trigger.events[0], trigger);
    expect(check()).toBe(true);
    units.push(actor('ORCA', 'aircraft')); expect(check()).toBe(true);
    for (const unit of [actor('MIND', 'vehicle'), actor('DISK', 'vehicle'), actor('JUMPJET', 'infantry'),
        actor('INIT', 'infantry', false, false)]) {
        units.push(unit); expect(check()).toBe(false); units.pop();
    }
    host.launch.semanticsVersion = 44; expect(check()).toBe(false);
    host.launch = { edition: 'ra2', semanticsVersion: 45 }; expect(check()).toBe(false);
});

test('original all-unit and all-force events retain buildings, naval vehicles, infantry and transported actors', () => {
    const units = [actor('CMISL', 'aircraft', false, false), actor('HORNET', 'aircraft')];
    const host: any = { launch: { edition: 'yr', semanticsVersion: 45 }, events: [], targets: () => [],
        resolveHouse: () => ({ getOwnedObjects: () => units }) };
    const check = (opcode: number) => (CampaignRuntime.prototype as any).check.call(host,
        { ...trigger.events[0], opcode }, trigger);
    for (const opcode of [9, 10, 11, 55, 56]) expect(check(opcode)).toBe(true);
    const building = actor('YACNST', 'building'); units.push(building);
    expect(check(9)).toBe(true); expect(check(10)).toBe(false); expect(check(11)).toBe(false); units.pop();
    const submarine = actor('BSUB', 'vehicle', true); units.push(submarine);
    expect(check(9)).toBe(false); expect(check(11)).toBe(false); expect(check(55)).toBe(false); expect(check(56)).toBe(true); units.pop();
    const passenger = actor('ENGINEER', 'infantry', false, false); units.push(passenger);
    expect(check(9)).toBe(false); expect(check(11)).toBe(false); expect(check(55)).toBe(true); expect(check(56)).toBe(false);
    passenger.isDestroyed = true;
    for (const opcode of [9, 10, 11, 55, 56]) expect(check(opcode)).toBe(true);
});
