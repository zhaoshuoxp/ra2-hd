import { expect, test } from 'bun:test';
import { parseMix } from '../../src/offline/retail';
import { requiredBytes, sha256, retailMember } from '../test-support/resources';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { campaignMediaReferences } from '../../src/data/campaign/CampaignMedia';
import { campaignPreflight } from '../../src/game/campaign/CampaignSupport';
import { CampaignRuntime, campaignCapabilities } from '../../src/game/campaign/CampaignRuntime';
import { ScoreScreen } from '../../src/gui/screen/mainMenu/score/ScoreScreen';
import { IniFile } from '../../src/data/IniFile';

const bytes = parseMix(requiredBytes('assets/ra2/maps02.mix'), 'maps02.mix').openFile('sov12s.map').getBytes();
expect(sha256(bytes)).toBe('f69c18a54ce5915c9cdc08c2f10113853bc8656cf3e5f1392a64818a700d2720');
const original = new CampaignDefinition('ra2', 'sov12s.map', new TextDecoder().decode(bytes));

test('original final Soviet mission retains the chronosphere goal, full ending and delayed victory', () => {
    original.assertValid(); expect(campaignPreflight(original, campaignCapabilities)).toEqual([]);
    expect([original.triggers.size, original.scripts.size, original.teams.size, original.aiTriggers.size]).toEqual([54, 15, 37, 26]);
    const goal = original.triggers.get('0AC68F60')!, ending = original.triggers.get('0D10EF3C')!;
    expect(goal.events[0].opcode).toBe(48); expect(goal.actions[1].params[1]).toBe('0D10EF3C');
    expect(ending.actions.map(action => [action.opcode, action.params[1]])).toEqual([[10, '141'], [53, '0CDA6F3C'], [53, '0CDA750C']]);
    expect(original.triggers.get('0CDA750C')!.events[0].params[1]).toBe('7');
    const art = new IniFile(retailMember('ra2', 'art.ini').file.readAsString());
    expect(campaignMediaReferences(original, art).map(ref => [ref.name, ref.use]))
        .toEqual([['s12_f00e', 'before-mission'], ['s13_f01e', 'after-mission'], ['s13_f00e', 'fullscreen'], ['s12_p01e', 'transmission']]);
    expect(original.ini.getSection('Basic')!.getBool('EndOfGame')).toBe(true);
    expect(original.triggers.get('07F510FC')!.difficulties).toEqual({ easy: true, normal: true, hard: true });
    for (const id of ['08055CBC', '0BC66A2C', '0BC380EC', '0BC3E10C']) {
        expect(original.triggers.get(id)!.difficulties).toEqual({ easy: false, normal: true, hard: true });
    }
    expect(original.teams.get('0BB03DEC')!.properties.Full).toBe('yes');
    expect(original.taskForces.get(original.teams.get('0BB03DEC')!.taskForce)!.units)
        .toEqual([{ count: 4, type: 'GHOST' }, { count: 1, type: 'LCRF' }]);
});

test('source fullscreen submission is synchronous and versioned, while restore suppresses presentation only', () => {
    const trigger = original.triggers.get('0D10EF3C')!, action = trigger.actions[0], calls: unknown[] = [];
    const host: any = { launch: { semanticsVersion: 14 }, trace: [], machine: { tick: 123 }, restoring: false,
        uiAction: (value: unknown) => calls.push(value) };
    (CampaignRuntime.prototype as any).execute.call(host, action, trigger);
    expect(calls).toEqual([action]); expect(host.machine.tick).toBe(123);
    host.restoring = true; (CampaignRuntime.prototype as any).execute.call(host, action, trigger); expect(calls.length).toBe(1);
    host.launch.semanticsVersion = 13;
    expect(() => (CampaignRuntime.prototype as any).execute.call(host, action, trigger)).toThrow('interpreter 14');
});

test('defeat returns without loading the source winning post-score movie', async () => {
    const routes: unknown[] = [];
    const context: any = { generation: 1, leavingCampaign: false,
        controller: { goToScreenBlocking: async (...args: unknown[]) => { routes.push(args); } },
        strings: { get() { throw Error('No media failure should be reported'); } } };
    await (ScoreScreen.prototype as any).leaveCampaign.call(context,
        { campaign: { result: 'defeat', launch: { mission: 'sov12s.map', edition: 'ra2' }, definition: original } }, { mission: 'sov12s.map' });
    expect(routes.length).toBe(1); expect(context.leavingCampaign).toBe(false); expect(context.campaignError).toBeUndefined();
});
