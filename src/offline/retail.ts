import { MixFile } from '../data/MixFile';
import { MixEntry } from '../data/MixEntry';
import { VirtualFile } from '../data/vfs/VirtualFile';
import { CsfFile } from '../data/CsfFile';
import { IniFile } from '../data/IniFile';
import { VplFile } from '../data/VplFile';

export const profiles = {
    'ra2-core': ['ra2.mix', 'language.mix', 'multi.mix'],
    'ra2-campaign': ['maps01.mix', 'maps02.mix'],
    'ra2-media': ['theme.mix', 'movies01.mix', 'movies02.mix'],
} as const;
// Explicit engine container names, not extension-based discovery. No loose files.
export const nestedMixes = [
    'cache.mix', 'load.mix', 'local.mix', 'neutral.mix', 'audio.mix', 'conquer.mix',
    'generic.mix', 'isogen.mix', 'cameo.mix', 'sidec01.mix', 'sidec02.mix',
    'temperat.mix', 'snow.mix', 'urban.mix', 'isotemp.mix', 'isosnow.mix', 'isourb.mix',
    'tem.mix', 'sno.mix', 'urb.mix',
];
export type Container = { path: string; mix: MixFile };
export function parseMix(bytes: Uint8Array, name: string): MixFile {
    return new MixFile(VirtualFile.fromBytes(bytes, name).stream);
}
export function retailTree(top: Map<string, Uint8Array>): Container[] {
    const result: Container[] = [];
    function visit(path: string, mix: MixFile, depth: number) {
        if (depth > 4 || result.length > 128) throw new Error('Nested MIX traversal limit exceeded');
        result.push({ path, mix });
        for (const name of nestedMixes) {
            if (mix.containsFile(name)) visit(`${path}/${name}`, new MixFile(mix.openFile(name).stream), depth + 1);
        }
    }
    // Language precedes base data, matching the RA2 VFS order.
    for (const name of ['language.mix', 'ra2.mix', 'multi.mix', 'maps01.mix', 'maps02.mix', ...profiles['ra2-media']]) {
        const bytes = top.get(name);
        if (bytes) visit(name, parseMix(bytes, name), 0);
    }
    return result;
}
export function resolveMember(tree: Container[], name: string) {
    const owner = tree.find(({ mix }) => mix.containsFile(name));
    if (!owner) throw new Error(`Required archive member missing: ${name} (ID 0x${MixEntry.hashFilename(name).toString(16)})`);
    return { file: owner.mix.openFile(name), source: owner.path, memberId: MixEntry.hashFilename(name) };
}
export function validateCore(tree: Container[]) {
    const resources = Object.fromEntries(['rules.ini', 'art.ini', 'ai.ini', 'ra2.csf', 'missions.pkt', 'voxels.vpl'].map(name => {
        const { file, source, memberId } = resolveMember(tree, name);
        if (!file.getSize()) throw new Error(`Required member is empty: ${name}`);
        return [name, { source, memberId, bytes: file.getSize() }];
    }));
    new VplFile(resolveMember(tree, 'voxels.vpl').file);
    const csf = new CsfFile(resolveMember(tree, 'ra2.csf').file);
    const declared = new DataView(resolveMember(tree, 'ra2.csf').file.getBytes().buffer,
        resolveMember(tree, 'ra2.csf').file.getBytes().byteOffset).getUint32(8, true);
    if (csf.parsedLabels !== declared) throw new Error('Incomplete archived CSF labels');
    const pkt = new IniFile(resolveMember(tree, 'missions.pkt').file.readAsString());
    const maps = pkt.getSection('MultiMaps');
    if (!maps) throw new Error('Missing MultiMaps catalog');
    const availableMaps = Array.from(maps.entries.values()).flatMap(raw => {
        const name = Array.isArray(raw) ? raw[0] : raw;
        const section = pkt.getSection(name);
        const filename = `${name}.map`;
        try {
            const member = resolveMember(tree, filename);
            return [{ filename, source: member.source, memberId: member.memberId,
                minPlayers: section?.getNumber('MinPlayers'), maxPlayers: section?.getNumber('MaxPlayers') }];
        } catch { return []; }
    });
    if (!availableMaps.some(m => (m.maxPlayers ?? 0) >= 4)) throw new Error('No archived four-player skirmish map resolved');
    return { resources, language: { locale: csf.getIsoLocale(), id: csf.language, labels: declared, uniqueLabels: Object.keys(csf.data).length, duplicateLabels: csf.duplicateLabels }, availableMaps };
}
