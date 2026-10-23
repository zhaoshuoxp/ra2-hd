import { expect, test } from 'bun:test';
import { IniFile } from '../../src/data/IniFile';
import { DifficultyRules } from '../../src/game/rules/DifficultyRules';
import { AiDifficulty } from '../../src/game/gameopts/GameOpts';
import { BotFactory } from '../../src/game/bot/BotFactory';
import { BuiltInBotAdapter } from '../../src/game/ai/thirdpartbot/builtIn/BuiltInBotAdapter';
import { Weapon } from '../../src/game/Weapon';
import { Warhead } from '../../src/game/Warhead';
import { WarheadRules } from '../../src/game/rules/WarheadRules';

const ini = new IniFile('[General]\nTeamDelays=2000,2500,3500\n[Easy]\nArmor=1.2\nROF=.8\nBuildTime=.8\n[Normal]\nArmor=1\nROF=1\n[Difficult]\nArmor=.8\nROF=1.2');

test('all selectable skirmish difficulties construct an active strategic bot', () => {
    const factory = new BotFactory(undefined);
    for (const aiDifficulty of [AiDifficulty.Easy, AiDifficulty.Normal, AiDifficulty.Brutal, AiDifficulty.Medium]) {
        expect(factory.create({ isAi: true, name: 'AI', country: { name: 'YuriCountry' }, aiDifficulty })).toBeInstanceOf(BuiltInBotAdapter);
    }
});

test('retail AI indexes select separate handicaps and leave a human on Normal', () => {
    const easy = DifficultyRules.read(ini, true, AiDifficulty.Easy);
    const hard = DifficultyRules.read(ini, true, AiDifficulty.Brutal);
    const human = DifficultyRules.read(ini, false, AiDifficulty.Brutal);
    expect([easy.armor, easy.rof, easy.teamDelay]).toEqual([.8, 1.2, 3500]);
    expect([hard.armor, hard.rof, hard.buildTime, hard.teamDelay]).toEqual([1.2, .8, .8, 2000]);
    expect([human.armor, human.rof, human.buildTime]).toEqual([1, 1, 1]);
});

test('ownership changes immediately change difficulty armor and firing intervals', () => {
    const unit: any = { owner: { handicap: DifficultyRules.read(ini, true, AiDifficulty.Brutal) },
        rules: { armor: 0 }, crateBonuses: { armor: 1 }, invulnerableTrait: { isActive: () => false },
        isTechno: () => true, isUnit: () => true, isInfantry: () => false, isAircraft: () => false,
        isBuilding: () => false, isTerrain: () => false, isOverlay: () => false };
    const wh = new Warhead(new WarheadRules(new IniFile('[WH]\nVerses=100%,100%,100%,100%,100%,100%,100%,100%,100%,100%,100%').getSection('WH')!) as any);
    const world: any = { gameOpts: { destroyableBridges: true } };
    const rof = Object.getOwnPropertyDescriptor(Weapon.prototype, 'rof')!.get!;
    expect(wh.computeDamage(120, unit, world)).toBe(100);
    expect(rof.call({ gameObject: unit, rules: { rof: 100 } })).toBe(80);
    unit.owner = { handicap: DifficultyRules.read(ini, false) };
    expect(wh.computeDamage(120, unit, world)).toBe(120);
    expect(rof.call({ gameObject: unit, rules: { rof: 100 } })).toBe(100);
});
