import { expect, test } from 'bun:test';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { IniFile } from '../../src/data/IniFile';
import { CampaignRuntime, campaignStartingCredits } from '../../src/game/campaign/CampaignRuntime';
import { parseMix } from '../../src/offline/retail';
import { requiredBytes, retailMember, sha256 } from '../test-support/resources';

const maps = parseMix(requiredBytes('assets/ra2/maps02.mix'), 'maps02.mix');
function source(name: string) {
    const file = maps.openFile(name), definition = new CampaignDefinition('ra2', name, file.readAsString());
    const rules = new IniFile(retailMember('ra2', 'rules.ini').file.readAsString()).mergeWith(definition.ini);
    return { definition, rules, sha256: sha256(file.getBytes()) };
}

test('the original sixth map adds cash directly and reverses the usual team-delay ordering', () => {
    const f = source('sov06t.map');
    expect(f.sha256).toBe('bea4548cca589aa1caf6fbc4e69700f8b408d650b700b71c65242f0df9eeeb83');
    const credits = f.definition.houses.get('Player House')!.credits;
    expect(credits).toBe(10000); expect(f.rules.getSection('General')!.getNumberArray('TeamDelays')).toEqual([3500, 1800, 900]);
    expect(['easy', 'normal', 'hard'].map(difficulty => campaignStartingCredits(credits, true, difficulty as any, f.rules, true)))
        .toEqual([15000, 10000, 5000]);
    expect(campaignStartingCredits(50000, false, 'easy', f.rules, true)).toBe(50000);
    expect(campaignStartingCredits(0, true, 'hard', f.rules, true)).toBe(0);
});

test('new first-mission starts use original difficulty cash while legacy journal initialization stays frozen', () => {
    const f = source('sov01t.map'), credits = f.definition.houses.get('Player House')!.credits;
    expect(credits).toBe(5500);
    expect(['easy', 'normal', 'hard'].map(difficulty => campaignStartingCredits(credits, true, difficulty as any, f.rules, true)))
        .toEqual([7000, 5500, 4000]);
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
        expect(campaignStartingCredits(credits, true, difficulty, f.rules, false)).toBe(5500);
    }
});

test('all original PlayerControl houses receive the supplied flat delta without changing NPC money', () => {
    const f = source('sov05u.map');
    // The archived rules specify 50 credits. It is not 50 percent or 5000.
    expect(f.rules.getSection('General')!.getNumber('CampaignMoneyDeltaEasy')).toBe(50);
    const initialize = (launch: any) => {
        const players = new Map([...f.definition.houses].map(([id]) => [id, { credits: 0, radarTrait: { setDisabled() {} } }]));
        (CampaignRuntime.prototype as any).initialize.call({ definition: f.definition, houses: players, launch,
            game: { rules: { getIni: () => f.rules }, alliances: { setScenarioAllies() {} } } });
        return players;
    };
    const current = initialize({ difficulty: 'easy', semanticsVersion: 7, startingCreditsVersion: 1 });
    expect(current.get('Player House')!.credits).toBe(2550);
    expect(current.get('Other3 House')!.credits).toBe(50); expect(current.get('BadGuy3 House')!.credits).toBe(50);
    expect(current.get('BadGuy1 House')!.credits).toBe(f.definition.houses.get('BadGuy1 House')!.credits);
    const legacy = initialize({ difficulty: 'easy', semanticsVersion: 7 });
    expect(legacy.get('Player House')!.credits).toBe(2500); expect(legacy.get('Other3 House')!.credits).toBe(0);
});
