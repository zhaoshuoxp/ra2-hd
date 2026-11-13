import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { retailMember } from '../test-support/resources';
import { IniFile } from '../../src/data/IniFile';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { DifficultyRules } from '../../src/game/rules/DifficultyRules';
import { AiDifficulty } from '../../src/game/gameopts/GameOpts';
import { Warhead } from '../../src/game/Warhead';
import { WarheadRules } from '../../src/game/rules/WarheadRules';
import { Weapon } from '../../src/game/Weapon';
import { CampaignTriggerMachine } from '../../src/game/campaign/CampaignTriggerMachine';
import { campaignSaveRecord, validateCampaignSaveRecord } from '../../src/gui/campaign/CampaignSaveLibrary';
import { campaignSaveSlot } from '../../src/gui/campaign/CampaignSaveStore';
import { completeCampaignProgress } from '../../src/gui/campaign/CampaignProgress';
import { campaignRanking } from '../../src/gui/campaign/CampaignScoreModel';
import { Country } from '../../src/game/Country';
import { CountryRules } from '../../src/game/rules/CountryRules';
import { TechnoRules } from '../../src/game/rules/TechnoRules';
import { CampaignRuntime } from '../../src/game/campaign/CampaignRuntime';

const source = retailMember('ra2', 'rules.ini', 'fd1e95cea0306ea78049dc81c8cd816e18c28c496872a1ff02edd50bd082062f');
const rules = new IniFile(source.file.readAsString());
const definition = new CampaignDefinition('ra2', 'sov01t.map', readFileSync('.local/campaign/ra2/sov01t/sov01t.map', 'utf8'));

test('pre-inheritance first-mission journals retain the actual Soviet engineer production decision', () => {
    const merged = rules.clone().mergeWith(definition.ini), names = [...new Set(merged.getSection('Countries')!.entries.values())];
    const game: any = { map: { tiles: { getByMapCoords: (rx: number, ry: number) => ({ rx, ry }) } },
        world: { getAllObjects: () => [] }, addPlayer() {}, rules: { colors: { get: () => ({}) }, getIni: () => merged,
            getCountry: (name: string) => new CountryRules(names.indexOf(name) as any).readIni(merged.getSection(name)!) } };
    const sourceEngineer = merged.getSection('SENGINEER')!;
    const available = (country: Country) => TechnoRules.prototype.isAvailableTo.call({
        requiredHouses: sourceEngineer.getArray('RequiredHouses'), forbiddenHouses: sourceEngineer.getArray('ForbiddenHouses') }, country);
    expect(merged.getSection('Player')!.getString('ParentCountry')).toBe('Americans');
    for (const [version, identityVersion, inherits] of [[undefined, undefined, false], [2, undefined, false],
        [4, undefined, false], [5, undefined, true], [5, 1, false], [6, undefined, true]] as const) {
        const runtime = new CampaignRuntime(definition, { edition: 'ra2', mission: 'sov01t.map', difficulty: 'normal',
            diagnostic: false, semanticsVersion: version, countryIdentityVersion: identityVersion,
            sourceSha256: 'source', provenanceDigest: 'fixture' }, game);
        runtime.createPlayers({ createCombatant: (name: string, country: Country) => ({ name, country }) });
        const player = runtime.houses.get('Player House').country;
        expect(player.matchesCountry('Player')).toBe(true);
        expect(player.matchesCountry('Americans')).toBe(inherits);
        expect(available(player)).toBe(!inherits);
    }
    // Ordinary countries and later interpreter policies retain inheritance.
    expect(available(Country.factory('Russians', game.rules))).toBe(true);
});

test('campaign applies the original opposing handicaps and preserves both Normal and skirmish behavior', () => {
    for (const [difficulty, human, ai, delay] of [
        ['easy', [1.2, .8, .8], [.8, 1.2, 1], 3500],
        ['normal', [1, 1, 1], [1, 1, 1], 2500],
        ['hard', [.8, 1.2, 1], [1.2, .8, .8], 2000],
    ] as const) {
        const player = DifficultyRules.readCampaign(rules, true, difficulty);
        const enemy = DifficultyRules.readCampaign(rules, false, difficulty);
        expect([player.armor, player.rof, player.buildTime]).toEqual(human);
        expect([enemy.armor, enemy.rof, enemy.buildTime]).toEqual(ai);
        expect(enemy.teamDelay).toBe(delay);
        expect([player.firepower, player.cost, player.groundSpeed, player.airSpeed]).toEqual([1, 1, 1, 1]);
    }
    expect(DifficultyRules.readCampaign(rules, true, 'normal')).toEqual(DifficultyRules.read(rules, false));
    expect(DifficultyRules.readCampaign(rules, false, 'normal')).toEqual(DifficultyRules.read(rules, true, AiDifficulty.Medium));
    for (const difficulty of [AiDifficulty.Easy, AiDifficulty.Medium, AiDifficulty.Brutal]) {
        expect(DifficultyRules.read(rules, false, difficulty)).toEqual(DifficultyRules.read(rules, false));
    }
    expect(() => DifficultyRules.readCampaign(rules, false, 'unknown' as any)).toThrow('Unsupported');
    const missionRules = new IniFile(source.file.readAsString());
    missionRules.mergeWith(definition.ini);
    expect(['easy', 'normal', 'hard'].map(d => DifficultyRules.readCampaign(missionRules, false, d as any).teamDelay))
        .toEqual([500, 750, 1000]);
});

test('campaign armor and firing interval affect actual damage and weapon calculations', () => {
    const unit: any = { owner: {}, rules: { armor: 0 }, crateBonuses: { armor: 1 },
        invulnerableTrait: { isActive: () => false }, isTechno: () => true, isUnit: () => true,
        isInfantry: () => false, isAircraft: () => false, isBuilding: () => false, isTerrain: () => false, isOverlay: () => false };
    const wh = new Warhead(new WarheadRules(new IniFile('[WH]\nVerses=100%,100%,100%,100%,100%,100%,100%,100%,100%,100%,100%').getSection('WH')!) as any);
    const rof = Object.getOwnPropertyDescriptor(Weapon.prototype, 'rof')!.get!;
    for (const [difficulty, damage, interval] of [['easy', 100, 80], ['normal', 120, 100], ['hard', 150, 120]] as const) {
        unit.owner.handicap = DifficultyRules.readCampaign(rules, true, difficulty);
        expect(wh.computeDamage(120, unit, { gameOpts: { destroyableBridges: true } } as any)).toBe(damage);
        expect(rof.call({ gameObject: unit, rules: { rof: 100 } })).toBe(interval);
    }
});

test('enabled original GI and production records still obey their source difficulty flags', () => {
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
        const actions: { key: string; opcode: number }[] = [];
        const machine = new CampaignTriggerMachine(definition, difficulty, {
            targets: () => [], condition: () => false, action: action => { actions.push(action); },
        });
        machine.bindTargets();
        for (const id of ['084584CC', '084581DC', '079EF4FC', '08458F3C', '0BB24A9C']) machine.setEnabled(id, true);
        for (let tick = 0; tick < 31; tick++) machine.update();
        expect(actions.filter(a => ['084584CC', '084581DC', '079EF4FC', '08458F3C'].includes(a.key) && a.opcode === 80))
            .toHaveLength(difficulty === 'easy' ? 0 : 4);
        expect(actions.some(a => a.key === '0BB24A9C' && a.opcode === 3)).toBe(difficulty !== 'easy');
        expect([...definition.triggers.values()].filter(t => t.difficulties[difficulty]))
            .toHaveLength(difficulty === 'easy' ? 127 : 132);
    }
    const normal = definition.aiTriggers.get('080D348C')!, hard = definition.aiTriggers.get('080D326C')!;
    expect(normal.difficulties).toEqual({ easy: false, normal: true, hard: false });
    expect(hard.difficulties).toEqual({ easy: false, normal: false, hard: true });
    expect(definition.taskForces.get(definition.teams.get(normal.team)!.taskForce)!.units).toEqual([{ count: 1, type: 'E1' }]);
    expect(definition.taskForces.get(definition.teams.get(hard.team)!.taskForce)!.units).toEqual([{ count: 2, type: 'E1' }]);
});

test('all three save envelopes retain their difficulty and reject a changed or unknown difficulty', async () => {
    const fixture = JSON.parse(readFileSync('scripts/m3-1/fixtures/mid-mission-checkpoint.json', 'utf8'));
    const sign = async (value: unknown) => [...new Uint8Array(await crypto.subtle.digest('SHA-256',
        new TextEncoder().encode(JSON.stringify(value))))].map(b => b.toString(16).padStart(2, '0')).join('');
    for (const difficulty of ['easy', 'normal', 'hard'] as const) {
        const checkpoint = structuredClone(fixture); checkpoint.options.campaign.difficulty = difficulty;
        const { checksum: _, ...payload } = checkpoint; checkpoint.checksum = await sign(payload);
        const record = await campaignSaveRecord(checkpoint, 'Difficulty metadata', 'test-' + difficulty);
        await validateCampaignSaveRecord(record); expect(record.gameOpts.campaign.difficulty).toBe(difficulty);
        const changed = structuredClone(record); changed.checkpoint.options.campaign.difficulty = 'unknown';
        await expect(validateCampaignSaveRecord(changed)).rejects.toThrow();
    }
    expect(campaignSaveSlot('normal')).toBe('ra2/sov01t.map/normal');
    expect(new Set(['easy', 'normal', 'hard'].map(d => campaignSaveSlot(d as any))).size).toBe(3);
    expect(() => campaignSaveSlot('unknown' as any)).toThrow('Unsupported');
});

test('completion preserves the legacy Normal entry and each difficulty uses its source par time', () => {
    const launch = { mission: 'sov01t.map', difficulty: 'normal' as const, sourceSha256: 'a'.repeat(64), provenanceDigest: 'b'.repeat(64) };
    const original = completeCampaignProgress(null, launch, 'first');
    const easy = completeCampaignProgress(JSON.stringify(original), { ...launch, difficulty: 'easy' }, 'second');
    const hard = completeCampaignProgress(JSON.stringify(easy), { ...launch, difficulty: 'hard' }, 'third');
    const repeated = completeCampaignProgress(JSON.stringify(hard), { ...launch, difficulty: 'hard' }, 'fourth');
    expect(repeated.completed.map(entry => entry.difficulty)).toEqual(['normal', 'easy', 'hard']);
    expect(repeated.completed[0]).toEqual(original.completed[0]); expect(repeated.completed[2].completedAt).toBe('fourth');
    expect(repeated.nextPlayable).toBe(false);
    expect(completeCampaignProgress('invalid', launch).completed).toHaveLength(1);
    expect(['easy', 'normal', 'hard'].map(d => campaignRanking(definition, d as any, 0).parSeconds)).toEqual([1500, 900, 360]);
});
