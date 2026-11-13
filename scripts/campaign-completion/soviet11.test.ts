import { expect, test } from 'bun:test';
import { parseMix } from '../../src/offline/retail';
import { requiredBytes, sha256 } from '../test-support/resources';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { CampaignTeams } from '../../src/game/campaign/CampaignTeams';
import { campaignPreflight } from '../../src/game/campaign/CampaignSupport';
import { CampaignRuntime, campaignCapabilities } from '../../src/game/campaign/CampaignRuntime';
import { EventType } from '../../src/game/event/EventType';

const bytes = parseMix(requiredBytes('assets/ra2/maps02.mix'), 'maps02.mix').openFile('sov11s.map').getBytes();
expect(sha256(bytes)).toBe('2f51c08a063f3c4d648bd486672eacc50d3f32903aa14e9566bfd2030464fc7f');
const original = new CampaignDefinition('ra2', 'sov11s.map', new TextDecoder().decode(bytes));

test('the original eleventh source retains its nonmonotonic delays, complete local records and actual Kremlin goal', () => {
    original.assertValid(); expect(campaignPreflight(original, campaignCapabilities)).toEqual([]);
    expect(original.triggers.size).toBe(46); expect(original.scripts.size).toBe(25); expect(original.teams.size).toBe(32);
    expect(original.ini.getSection('General')!.getNumberArray('TeamDelays')).toEqual([1000, 750, 500]);
    expect(original.ini.getSection('Basic')!.getString('Theme')).toBe('No theme');
    expect(original.triggers.get('089FDF3C')!.events[0].opcode).toBe(7);
    expect(original.triggers.get('092D6E5C')!.actions.some(action => action.opcode === 1)).toBe(true);
});

test('original targetless Enter preserves the HARV identity and spawn work without inventing a refinery or destination', () => {
    const unit: any = { name: 'HARV', id: 1, isUnit: () => true, isInfantry: () => false, isAircraft: () => false,
        guardMode: true, defaultToGuardArea: true, harvesterTrait: {}, unitOrderTrait: {
            addTask() { throw Error('Existing on-spawn tasks must remain untouched'); },
            cancelAllTasks() { throw Error('Existing on-spawn tasks must remain untouched'); },
        } };
    const placement = { owner: 'BadGuy2 House', rx: 86, ry: 79 };
    const teams: any = new CampaignTeams(original, { map: {} } as any, () => undefined, undefined, 13);
    teams.bindInitial(unit, placement);
    expect(teams.initial.get(unit)).toEqual({ group: -1, recruitable: true, mission: 'Enter' });
    expect(unit.guardMode).toBe(false); expect(unit.defaultToGuardArea).toBe(false);
    expect(teams.hunters.has(unit)).toBe(false);
    const frozen = new CampaignTeams(original, { map: {} } as any, () => undefined, undefined, 12);
    expect(() => frozen.bindInitial(unit, placement)).toThrow('unsupported initial mission Enter');
});

test('the original Kremlin destruction event accepts hostile owned blast damage without accepting friendly or environmental loss', () => {
    const owner = {}, player = {}, ally = {}, target = { id: 2795, owner };
    const trigger = original.triggers.get('089FDF3C')!, event = trigger.events[0];
    const host: any = { launch: { semanticsVersion: 13 }, events: [], targets: () => [target], targetId: () => 'object:2795',
        game: { alliances: { areAllied: (attacker: any) => attacker === ally } } };
    const check = () => (CampaignRuntime.prototype as any).check.call(host, event, trigger);
    const destroyed: any = { type: EventType.ObjectDestroy, target, incidental: true, attackerInfo: { player, weapon: {} } };
    host.events = [destroyed]; expect(check()).toEqual(['object:2795']);
    host.launch.semanticsVersion = 12; expect(check()).toEqual([]);
    host.launch.semanticsVersion = 13;
    for (const attacker of [owner, ally, undefined]) {
        destroyed.attackerInfo = { player: attacker, weapon: {} }; expect(check()).toEqual([]);
    }
    destroyed.attackerInfo = undefined; destroyed.incidental = false; expect(check()).toEqual([]);
    destroyed.attackerInfo = { player }; destroyed.incidental = true; expect(check()).toEqual([]);
    destroyed.incidental = false; expect(check()).toEqual(['object:2795']);
});
