import { beforeAll, test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { registerOfficialSkirmish, officialSkirmishManifests, openOfficialSkirmish,
    applyOfficialStartingUnitRules, applyStandardSkirmishDialog, originalSkirmishEntries } from '../../src/offline/officialSkirmish';
import { IniFile } from '../../src/data/IniFile';
import { GameModes } from '../../src/game/ini/GameModes';
import { VirtualFile } from '../../src/data/vfs/VirtualFile';
import catalog from '../../src/offline/officialSkirmishCatalog.json';

const names = ['ra2.mix', 'language.mix', 'multi.mix', 'expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix'];
const top = new Map(names.map(name => [name, readFileSync(`.local/assets/${name.includes('md') ? 'yr' : 'ra2'}/${name}`)]));
const mode = new GameModes(new IniFile('[Battle]\n1=GUI:Battle,STT:ModeBattle,mpbattle.ini,standard,true\n'),
    () => new IniFile()).getById(1);
beforeAll(async () => registerOfficialSkirmish(editionRetailTree(top, 'yr'), 'yr'));

test('all source-pinned official mode variants use the standard entry and actual capacity', () => {
    const maps = officialSkirmishManifests(mode);
    expect(maps.length).toBe(151);
    expect(maps.map(map => map.fileName)).toEqual(originalSkirmishEntries(editionRetailTree(top, 'yr'), 'yr')
        .map(entry => entry.runtimeName));
    for (const map of maps) {
        const entry = map.officialSource as any;
        expect(map.maxSlots).toBeLessThanOrEqual(entry.starts);
        expect(map.gameModes.map(mode => mode.id)).toEqual(entry.starts >= 2 ? [1] : []);
        const bytes = openOfficialSkirmish(map.fileName)!.getBytes();
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry.source.sha256);
    }
    expect(maps.find(map => map.fileName === 'tourofegypt.map')?.originalGameModes).toEqual(['teamgame']);
    expect(maps.find(map => map.fileName === 'groundzemw.map')?.gameModes).toEqual([mode]);
    expect(maps.find(map => map.fileName === 'dunepatr.map')?.maxSlots).toBe(2);
    expect(maps.some(map => map.originalGameModes?.some(mode => /cooperative|campaign/.test(mode)))).toBe(false);
});
test('RA2 keeps its own original catalog order and hides archive-only source anomalies', async () => {
    await registerOfficialSkirmish(editionRetailTree(top, 'ra2'), 'ra2');
    const maps = officialSkirmishManifests(mode);
    expect(maps.length).toBe(62);
    expect(maps.slice(0, 3).map(map => map.fileName)).toEqual(['mp02t2.map', 'mp06t2.map', 'mp11t2.map']);
    expect(maps.some(map => map.fileName.includes('id-') || map.fileName.startsWith('mp04t8'))).toBe(false);
    const hidden = catalog.maps.find(entry => entry.edition === 'ra2' && entry.source.member === 'mp04t8.map')!;
    expect(openOfficialSkirmish(hidden.runtimeName)).toBeDefined();
    await registerOfficialSkirmish(editionRetailTree(top, 'yr'), 'yr');
    expect(officialSkirmishManifests(mode).some(map => map.fileName.startsWith('id-'))).toBe(false);
});
test('standard dialog restoration preserves map object, navy and environmental rules', () => {
    const standard = new IniFile('[MultiplayerDialogSettings]\nMinMoney=10000\nAlliesAllowed=yes\n');
    const mapRules = new IniFile('[MultiplayerDialogSettings]\nMinMoney=0\nAlliesAllowed=no\n'
        + '[GAYARD]\nTechLevel=-1\n[General]\nDefaultMirageDisguises=TREE21\n'
        + '[CAOILD]\nProduceCashAmount=50\n[Triggers]\n0=Preserved\n');
    const before = mapRules.clone();
    applyStandardSkirmishDialog(mapRules, standard);
    expect(mapRules.getSection('MultiplayerDialogSettings')?.getNumber('MinMoney')).toBe(10000);
    expect(mapRules.getSection('MultiplayerDialogSettings')?.getBool('AlliesAllowed')).toBe(true);
    for (const section of ['GAYARD', 'General', 'CAOILD', 'Triggers'])
        expect(mapRules.getSection(section)?.toString()).toBe(before.getSection(section)?.toString());
});
test('registration rejects changed source bytes before replacing the admitted catalog', async () => {
    const tree = editionRetailTree(top, 'yr');
    const entry = catalog.maps.find(entry => entry.edition === 'yr' && entry.selected)!;
    const owner = tree.find(container => container.path === entry.source.archive)!;
    const original = owner.mix.openFile.bind(owner.mix);
    owner.mix.openFile = ((name: string) => {
        const file = original(name);
        if (name === entry.source.member) {
            const bytes = file.getBytes().slice(); bytes[0] ^= 1;
            return VirtualFile.fromBytes(bytes, name);
        }
        return file;
    }) as any;
    await expect(registerOfficialSkirmish(tree, 'yr')).rejects.toThrow('identity mismatch');
    expect(openOfficialSkirmish('dunepatr.map')).toBeDefined();
});
test('approved source restores exact starting-unit values without erasing map mechanisms', () => {
    const names = ['HTNK', 'E2', 'SHK', 'LTNK', 'MTNK', 'HOWI', 'E1'];
    const standard = new IniFile('[HTNK]\nAllowedToStartInMultiplayer=yes\n'
        + '[HOWI]\nAllowedToStartInMultiplayer=no\n');
    const original = new IniFile(names.map(name => `[${name}]\nAllowedToStartInMultiplayer=no\n`
        + 'Strength=432\nTechLevel=7\n').join('') + '[Triggers]\n0=Preserved\n'
        + '[CAOILD]\nProduceCashAmount=50\n[GAYARD]\nTechLevel=-1\n');
    const source = catalog.maps.find(entry => entry.mapId === 'yr:mp13s4mw.map@a4f07f9b9271')!;
    const restored = original.clone();
    applyOfficialStartingUnitRules(restored, standard, source);
    for (const name of names) {
        expect(restored.getSection(name)?.get('AllowedToStartInMultiplayer'))
            .toBe(standard.getSection(name)?.get('AllowedToStartInMultiplayer'));
        expect(restored.getSection(name)?.getNumber('Strength')).toBe(432);
        expect(restored.getSection(name)?.getNumber('TechLevel')).toBe(7);
        expect(original.getSection(name)?.getBool('AllowedToStartInMultiplayer')).toBe(false);
    }
    expect(restored.getSection('HTNK')?.getBool('AllowedToStartInMultiplayer', true)).toBe(true);
    expect(restored.getSection('E2')?.getBool('AllowedToStartInMultiplayer', true)).toBe(true);
    expect(restored.getSection('HOWI')?.getBool('AllowedToStartInMultiplayer', true)).toBe(false);
    for (const section of ['Triggers', 'CAOILD', 'GAYARD'])
        expect(restored.getSection(section)?.toString()).toBe(original.getSection(section)?.toString());
    const unrelated = original.clone();
    const otherSource = catalog.maps.find(entry => entry.mapId === 'yr:tourofegypt.map')!;
    applyOfficialStartingUnitRules(unrelated, standard, otherSource);
    expect(unrelated.toString()).toBe(original.toString());
});
