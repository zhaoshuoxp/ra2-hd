import { IniFile } from '../IniFile';
import type { CampaignEdition } from './CampaignDefinition';

export interface CampaignCatalogEntry {
    id: string;
    edition: CampaignEdition;
    faction: 'allied' | 'soviet' | 'training';
    filename: string;
    next?: string;
}

// Only Scenario records in the archived selection catalog establish progression.
// Legacy Basic.NextScenario values in individual maps are not campaign routing.
export function readCampaignCatalog(edition: CampaignEdition, source: string): CampaignCatalogEntry[] {
    const ini = new IniFile(source);
    const entries: CampaignCatalogEntry[] = [];
    for (const section of ini.sections.values()) {
        const scenario = section.getString('Scenario').toLowerCase();
        if (!scenario) continue;
        const match = /^(all|sov|trn)(\d\d)[tsudl](md)?\.map$/.exec(scenario);
        if (!match) throw new Error(`Unsupported ${edition} campaign scenario at [${section.name}]: ${scenario}`);
        if ((edition === 'yr') !== Boolean(match[3])) continue;
        entries.push({ id: section.name, edition, faction: match[1] === 'all' ? 'allied' : match[1] === 'sov' ? 'soviet' : 'training', filename: scenario });
    }
    for (const faction of ['allied', 'soviet', 'training'] as const) {
        const missions = entries.filter(entry => entry.faction === faction);
        missions.forEach((mission, index) => { mission.next = missions[index + 1]?.filename; });
    }
    if (new Set(entries.map(entry => entry.filename)).size !== entries.length) throw new Error('Duplicate campaign catalog scenario');
    return entries;
}
