import catalog from './officialSkirmishCatalog.json';
import { resolveMember, type Container } from './retail';
import { VirtualFile } from '../data/vfs/VirtualFile';
import { MapManifest } from '../engine/MapManifest';
import type { GameModeEntry } from '../game/ini/GameModes';
import type { GameEdition } from '../editions/GameEdition';
import { IniFile } from '../data/IniFile';

export type OfficialSkirmishEntry = (typeof catalog.maps)[number];
const admitted = new Map<string, { entry: OfficialSkirmishEntry; bytes: Uint8Array }>();
let visibleNames: string[] = [];

// Publication in the edition's original PKT is distinct from archive self-flags.
// Keep archive-only identities available to historical evidence and replay loaders.
export function originalSkirmishEntries(tree: Container[], edition: GameEdition): OfficialSkirmishEntry[] {
    const name = edition === 'yr' ? 'missionsmd.pkt' : 'missions.pkt';
    const pkt = new IniFile(resolveMember(tree, name).file);
    const declared = pkt.getSection('MultiMaps');
    if (!declared) throw Error(`Original map catalog missing MultiMaps: ${name}`);
    const result: OfficialSkirmishEntry[] = [];
    const seen = new Set<string>();
    for (const raw of declared.entries.values()) {
        const sectionName = String(Array.isArray(raw) ? raw[0] : raw);
        const section = pkt.getSection(sectionName);
        if (!section) throw Error(`Original map catalog section missing: ${sectionName}`);
        if (section.getArray('GameMode').some(mode => /cooperative|campaign/i.test(mode))) continue;
        const fileName = (section.getString('File') || `${sectionName}.map`).toLowerCase();
        const entry = catalog.maps.find(entry => entry.edition === edition && entry.selected
            && entry.source.member.toLowerCase() === fileName);
        if (!entry) throw Error(`Original catalog map has no verified source: ${edition}/${fileName}`);
        if (seen.has(fileName)) continue;
        seen.add(fileName);
        result.push(entry);
    }
    return result;
}

export async function registerOfficialSkirmish(tree: Container[], edition: GameEdition): Promise<void> {
    const published = originalSkirmishEntries(tree, edition);
    const pending = new Map<string, { entry: OfficialSkirmishEntry; bytes: Uint8Array }>();
    for (const entry of catalog.maps.filter(entry => entry.edition === edition)) {
        const owner = tree.find(container => container.path === entry.source.archive);
        if (!owner) throw Error(`Official map archive missing: ${entry.mapId}`);
        let file: VirtualFile;
        if ('memberId' in entry.source) {
            const member = owner.mix.getEntries().find(member => member.hash === entry.source.memberId);
            if (!member) throw Error(`Official map member missing: ${entry.mapId}`);
            const mix = owner.mix as any;
            file = VirtualFile.factory(mix.stream, entry.source.member, mix.dataStart + member.offset, member.length);
        } else file = owner.mix.openFile(entry.source.member);
        const bytes = file.getBytes();
        const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as any))]
            .map(byte => byte.toString(16).padStart(2, '0')).join('');
        if (digest !== entry.source.sha256 || bytes.length !== entry.source.bytes)
            throw Error(`Official map identity mismatch: ${entry.mapId}`);
        pending.set(entry.runtimeName.toLowerCase(), { entry, bytes });
    }
    admitted.clear();
    for (const [name, value] of pending) admitted.set(name, value);
    visibleNames = published.map(entry => entry.runtimeName.toLowerCase());
}

export function getOfficialSkirmishEntry(name: string): OfficialSkirmishEntry | undefined {
    return admitted.get(name.toLowerCase())?.entry;
}

export function openOfficialSkirmish(name: string): VirtualFile | undefined {
    const value = admitted.get(name.toLowerCase());
    return value && VirtualFile.fromBytes(value.bytes, value.entry.runtimeName);
}

export function officialSkirmishManifests(mode: GameModeEntry): MapManifest[] {
    return visibleNames.map(name => {
        const { entry } = admitted.get(name)!;
        const manifest = new MapManifest();
        Object.assign(manifest, { fileName: entry.runtimeName, uiName: entry.uiName, official: true,
            maxSlots: entry.maxSlots, originalGameModes: entry.originalModes, officialSource: entry,
            gameModes: entry.starts >= 2 ? [mode] : [] });
        return manifest;
    });
}

// Restore only the dialog rules owned by the single standard skirmish entry.
// Map terrain, object, naval restrictions, triggers, lighting and placements remain intact.
export function applyStandardSkirmishDialog(mergedRules: IniFile, standardRules: IniFile): void {
    const settings = standardRules.getSection('MultiplayerDialogSettings');
    if (settings) mergedRules.sections.set(settings.name, settings.clone());
}

const approvedStartingUnitSource = 'a4f07f9b927148f871136237e48253cadff9ff631602cb79de46e86e1100c574';
const approvedStartingUnits = ['HTNK', 'E2', 'SHK', 'LTNK', 'MTNK', 'HOWI', 'E1'];

// Source-specific legacy starting-unit restriction approved for standard restoration.
// Restore each original standard value, including an absent key's engine default.
export function applyOfficialStartingUnitRules(mergedRules: IniFile, standardRules: IniFile,
                                              entry: OfficialSkirmishEntry): void {
    if (entry.source.sha256 !== approvedStartingUnitSource) return;
    for (const name of approvedStartingUnits) {
        const target = mergedRules.getSection(name);
        if (!target) continue;
        const value = standardRules.getSection(name)?.get('AllowedToStartInMultiplayer');
        if (value === undefined) target.entries.delete('AllowedToStartInMultiplayer');
        else target.set('AllowedToStartInMultiplayer', Array.isArray(value) ? [...value] : value);
    }
}
