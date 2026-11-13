import { expect, test } from 'bun:test';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { IniFile } from '../../src/data/IniFile';
import { retailMember, requiredBytes, sha256 } from '../test-support/resources';
import { parseMix } from '../../src/offline/retail';

const aiMember = retailMember('ra2', 'ai.ini');
expect(aiMember.sha256).toBe('1feac6ddea6886b177ddf7e5f8580b7a99a63f12684f2cbb42831671bb7a8a79');
const globalAi = new IniFile(aiMember.file.readAsString());
const bytes = parseMix(requiredBytes('assets/ra2/maps02.mix'), 'maps02.mix').openFile('sov04s.map').getBytes();
expect(sha256(bytes)).toBe('a0a95b26639cc1d4d916dea3a264a18e409bef3d2b84c245e67cd250defc2100');
const source = new TextDecoder().decode(bytes);

test('the original global AI library expands source metadata without changing any native mission records or map INI', () => {
    const local = new CampaignDefinition('ra2', 'sov04s.map', source);
    const expanded = new CampaignDefinition('ra2', 'sov04s.map', source, globalAi);
    expanded.assertValid(); expect(expanded.source).toBe(source); expect(expanded.ini.toString()).toBe(local.ini.toString());
    expect([...expanded.triggers]).toEqual([...local.triggers]); expect([...expanded.houses]).toEqual([...local.houses]);
    expect([...expanded.waypoints]).toEqual([...local.waypoints]); expect([...expanded.cellTags]).toEqual([...local.cellTags]);
    expect([expanded.aiTriggers.size, expanded.teams.size, expanded.scripts.size]).toEqual([128, 156, 98]);
    const globals = [...expanded.aiTriggers.values()].filter(trigger => trigger.global);
    expect(globals.length).toBe(107); expect(globals.every(trigger => trigger.skirmish)).toBe(true);
    for (const trigger of globals) expect(trigger.raw).toBe(globalAi.getSection('AITriggerTypes')!.getString(trigger.id));
    expect(expanded.aiTriggers.get('0B9E3EEC')!.enabled).toBe(false);
    expect([...expanded.teams.values()].some(team => team.global && team.house === '<none>')).toBe(true);
});

test('IgnoreGlobalAITriggers suppresses global trigger eligibility without dropping reusable original templates', () => {
    const fixture = new IniFile(source); fixture.getSection('Basic')!.set('IgnoreGlobalAITriggers', 'yes');
    const definition = new CampaignDefinition('ra2', 'global-ai-isolation-fixture.map', fixture.toString(), globalAi);
    definition.assertValid(); expect(definition.aiTriggers.size).toBe(21);
    expect([...definition.aiTriggers.values()].some(trigger => trigger.global)).toBe(false);
    expect(definition.teams.size).toBe(156); expect(definition.scripts.size).toBe(98);
});

test('scenario list positions do not replace global identities and local properties override only their named source template', () => {
    const condition = '0000000002000000' + '0'.repeat(48);
    const library = new IniFile('[TeamTypes]\n0=G\n[ScriptTypes]\n0=GS\n[TaskForces]\n0=GF\n'
        + '[G]\nHouse=<none>\nScript=GS\nTaskForce=GF\nMax=2\n[GS]\n0=0,1\n[GF]\n0=1,E1\n'
        + `[AITriggerTypes]\nGA=Global,G,<all>,1,0,E1,${condition},50,1,100,1,0,1,0,<none>,1,1,1\n`);
    const map = '[Basic]\nPlayer=P\n[Houses]\n0=P\n[P]\nCountry=P\n[TeamTypes]\n0=L\n1=G\n'
        + '[ScriptTypes]\n0=LS\n[TaskForces]\n0=LF\n[L]\nHouse=P\nScript=LS\nTaskForce=LF\n'
        + '[LS]\n0=5,3\n[LF]\n0=1,E2\n[G]\nMax=3\n';
    const definition = new CampaignDefinition('ra2', 'library-overlay-fixture.map', map, library);
    definition.assertValid(); expect([...definition.teams.keys()]).toEqual(['G', 'L']);
    expect(definition.teams.get('G')!.properties.Max).toBe('3'); expect(definition.teams.get('G')!.script).toBe('GS');
    expect(definition.teams.get('G')!.global).toBe(true); expect(definition.teams.get('L')!.global).toBe(false);
    expect(definition.scripts.get('GS')!.instructions[0].raw).toBe('0,1');
});
