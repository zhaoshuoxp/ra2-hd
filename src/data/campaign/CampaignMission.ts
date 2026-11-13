import type { CampaignCatalogEntry } from './CampaignCatalog';
import type { CampaignEdition } from './CampaignDefinition';
import type { CampaignDefinition } from './CampaignDefinition';
import type { IniFile } from '../IniFile';

export interface CampaignMission extends CampaignCatalogEntry {
    number: number;
    title: string;
    briefing: string;
    implementation: 'implemented' | 'unavailable';
    playable: boolean;
}

export function isCampaignMissionIdentity(edition: unknown, filename: unknown): boolean {
    if (edition !== 'ra2' && edition !== 'yr' || typeof filename !== 'string') return false;
    const match = /^(all|sov|trn)(\d{2})[tsudl](md)?\.map$/.exec(filename);
    return !!match && (edition === 'yr') === !!match[3];
}

export function campaignMissionName(edition: CampaignEdition, filename: string): string {
    if (!isCampaignMissionIdentity(edition, filename)) throw new Error('Invalid campaign mission identity');
    return filename.slice(0, -4);
}

export function campaignRouteFaction(edition: string, filename: string): 'allied' | 'soviet' | 'tutorial' {
    if (edition !== 'ra2' && edition !== 'yr') throw new Error('Invalid campaign edition');
    campaignMissionName(edition, filename);
    return filename.startsWith('all') ? 'allied' : filename.startsWith('sov') ? 'soviet' : 'tutorial';
}

export function campaignPlayerCountryIndex(definition: CampaignDefinition, originalRules: IniFile): number {
    const country = definition.houses.get(definition.ini.getSection('Basic')!.getString('Player'))?.country;
    const names = [...new Set([...originalRules.getSection('Countries')!.entries.values(),
        ...(definition.ini.getSection('Countries')?.entries.values() ?? [])])];
    const index = names.indexOf(country!);
    if (index < 0) throw new Error(`Missing original player country: ${country}`);
    return index;
}

// Availability is explicit. An archived map or a successful opcode scan alone
// must never turn the remaining campaign into selectable gameplay.
export function campaignMissionImplemented(edition: string, filename: string): boolean {
    if (edition === 'yr') return ['sov01umd.map', 'sov02smd.map', 'sov03umd.map', 'sov04dmd.map',
        'sov05umd.map', 'sov06lmd.map', 'sov07tmd.map', 'all01umd.map', 'all02umd.map', 'all03umd.map',
        'all04dmd.map', 'all05umd.map', 'all06umd.map', 'all07smd.map'].includes(filename);
    return edition === 'ra2' && ['sov01t.map', 'sov02t.map', 'sov03u.map', 'sov04s.map', 'sov05u.map',
        'sov06t.map', 'sov07s.map', 'sov08u.map', 'sov09u.map', 'sov10t.map', 'sov11s.map', 'sov12s.map',
        'all01t.map', 'all02s.map', 'all03u.map', 'all04u.map', 'all05s.map', 'all06u.map', 'all07t.map', 'all08u.map',
        'all09t.map', 'all10s.map', 'all11t.map', 'all12s.map', 'trn01t.map', 'trn02t.map'].includes(filename);
}

export function campaignMissionSemantics(filename: string): 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28 | 29 | 30 | 31 | 32 | 33 | 34 | 35 | 36 | 37 | 38 | 39 | 40 | 41 | 42 | 43 | 44 | 45 | 46 | 47 | 48 {
    // Released missions retain their validated default interpreter. New
    // missions opt into the expanded library; saves always pin their version.
    if (isCampaignMissionIdentity('yr', filename)) return 48;
    if (['sov01t.map', 'sov02t.map', 'sov03u.map'].includes(filename)) return 5;
    if (filename === 'sov04s.map') return 6;
    if (filename === 'sov05u.map') return 7;
    if (filename === 'sov06t.map') return 8;
    if (filename === 'sov07s.map') return 9;
    if (filename === 'sov08u.map') return 10;
    if (filename === 'sov09u.map') return 11;
    if (filename === 'sov10t.map') return 12;
    if (filename === 'sov11s.map') return 13;
    if (filename === 'sov12s.map') return 14;
    if (filename === 'all01t.map') return 15;
    if (filename === 'all02s.map') return 16;
    if (filename === 'all03u.map') return 17;
    if (filename === 'all04u.map') return 18;
    if (filename === 'all05s.map') return 27;
    if (filename === 'all06u.map') return 20;
    if (filename === 'all07t.map') return 21;
    if (filename === 'all08u.map') return 22;
    if (filename === 'all09t.map') return 23;
    if (['trn01t.map', 'trn02t.map'].includes(filename)) return 27;
    if (filename === 'all12s.map') return 26;
    return filename === 'all10s.map' ? 24 : 25;
}

export function describeCampaignMission(entry: CampaignCatalogEntry): CampaignMission {
    campaignMissionName(entry.edition, entry.filename);
    const number = Number(entry.filename.slice(3, 5));
    const key = entry.faction === 'allied' ? 'All' : entry.faction === 'soviet' ? 'Sov' : 'Trn';
    const playable = campaignMissionImplemented(entry.edition, entry.filename);
    const suffix = entry.edition === 'yr' ? 'md' : '';
    return { ...entry, number, title: `Name:${key}${String(number).padStart(2, '0')}${suffix}`,
        briefing: `Brief:${key}${String(number).padStart(2, '0')}${suffix}`,
        implementation: playable ? 'implemented' : 'unavailable', playable };
}
