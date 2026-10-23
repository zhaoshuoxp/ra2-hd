import { GAME_EDITIONS, type GameEdition } from '../editions/GameEdition';
import { MixFile } from '../data/MixFile';
import { parseMix, retailTree, resolveMember, validateCore, type Container } from './retail';
import { IniFile } from '../data/IniFile';
import { CsfFile } from '../data/CsfFile';

const expansionContainers = [
    'ntrlmd.mix', 'genermd.mix', 'isogenmd.mix', 'localmd.mix', 'cachemd.mix', 'conqmd.mix', 'sidec01md.mix', 'sidec02md.mix', 'sidec03.mix',
    'loadmd.mix', 'cameomd.mix', 'audiomd.mix', 'isotemmd.mix', 'isosnomd.mix', 'snowmd.mix',
    'isourbmd.mix', 'isoubnmd.mix', 'isodesmd.mix', 'isolunmd.mix',
    'isoubn.mix', 'isodes.mix', 'isolun.mix', 'urbann.mix', 'desert.mix', 'lunar.mix',
    'ubn.mix', 'des.mix', 'lun.mix',
];
export function editionRetailTree(top: Map<string, Uint8Array>, edition: GameEdition): Container[] {
    const base = retailTree(new Map(GAME_EDITIONS.ra2.archives.flatMap(name => top.has(name) ? [[name, top.get(name)!]] : [])));
    if (edition === 'ra2') return base;
    const expansion: Container[] = [];
    function visit(path: string, mix: MixFile, depth: number) {
        if (depth > 4 || expansion.length >= 128) throw new Error('Expansion MIX traversal limit exceeded');
        expansion.push({ path, mix });
        for (const child of expansionContainers) {
            if (mix.containsFile(child)) visit(`${path}/${child}`, new MixFile(mix.openFile(child).stream), depth + 1);
        }
    }
    for (const name of GAME_EDITIONS.yr.archives.filter(name => !GAME_EDITIONS.ra2.archives.includes(name as any))) {
        const bytes = top.get(name);
        if (!bytes) throw new Error(`Missing expansion archive: ${name}`);
        visit(name, parseMix(bytes, name), 0);
    }
    return [...expansion, ...base];
}
export function validateEdition(tree: Container[], edition: GameEdition) {
    if (edition === 'ra2') return validateCore(tree);
    const descriptor = GAME_EDITIONS[edition];
    const resources = Object.fromEntries([descriptor.rules, descriptor.art, descriptor.ai, descriptor.strings, descriptor.maps, 'soundmd.ini', 'evamd.ini'].map(name => {
        const member = resolveMember(tree, name);
        if (!member.file.getSize()) throw new Error(`Empty expansion resource: ${name}`);
        return [name, { source: member.source, bytes: member.file.getSize(), memberId: member.memberId }];
    }));
    const strings = new CsfFile(resolveMember(tree, descriptor.strings).file);
    const pkt = new IniFile(resolveMember(tree, descriptor.maps).file.readAsString());
    const maps = pkt.getSection('MultiMaps');
    if (!maps) throw new Error('Missing expansion map catalog');
    const availableMaps = [...maps.entries.values()].flatMap(value => {
        const name = Array.isArray(value) ? value[0] : value;
        try { const member = resolveMember(tree, `${name}.map`); return [{ filename: `${name}.map`, source: member.source }]; }
        catch { return []; }
    });
    if (!availableMaps.length) throw new Error('No expansion skirmish maps resolved');
    return { resources, language: { locale: strings.getIsoLocale(), labels: strings.parsedLabels }, availableMaps };
}
