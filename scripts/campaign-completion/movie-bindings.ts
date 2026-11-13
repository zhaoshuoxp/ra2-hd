import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { readCampaignCatalog } from '../../src/data/campaign/CampaignCatalog';
import { describeCampaignMission } from '../../src/data/campaign/CampaignMission';
import { campaignMediaReferences } from '../../src/data/campaign/CampaignMedia';
import { IniFile } from '../../src/data/IniFile';
import { parseMix } from '../../src/offline/retail';
import { retailMember } from '../test-support/resources';

// Bind names only through archived maps and movie indices. Equal filenames in
// the expansion have different cuts and must never inherit base-game labels.
export async function originalMovieBindings(root: string) {
    const labels = new Map<string, any>();
    const add = (edition: string, name: string, entry: any, binding: string, use: string) => {
        const key = edition + ':' + name.toLowerCase(), role = use === 'before-mission' ? 'briefing'
            : use === 'after-mission' || use === 'post-score' ? 'ending' : use.startsWith('transmission') ? 'transmission' : 'story';
        const previous = labels.get(key), source = { mission: entry.filename, binding, use };
        const value = { titleKey: describeCampaignMission(entry).title, faction: entry.faction,
            mission: entry.filename, role, bindings: [...(previous?.bindings ?? []), source] };
        labels.set(key, !previous || role === 'briefing' ? value : { ...previous, bindings: value.bindings });
    };
    for (const directory of await readdir(path.join(root, '.local/campaign/ra2'))) {
        const manifest = JSON.parse(await readFile(path.join(root, '.local/campaign/ra2', directory, 'manifest.json'), 'utf8'));
        const entry = manifest.catalog.find((entry: any) => entry.filename === manifest.mission);
        for (const movie of manifest.media) add('ra2', movie.name, entry, movie.binding ?? movie.use, movie.use);
    }
    const archiveBytes = await readFile(path.resolve(root, '../Resource/Command and Conquer Red Alert II/mapsmd03.mix'));
    const archive = parseMix(archiveBytes), art = new IniFile(retailMember('yr', 'artmd.ini').file.readAsString());
    for (const entry of readCampaignCatalog('yr', retailMember('yr', 'mapselmd.ini').file.readAsString())) {
        const definition = new CampaignDefinition('yr', entry.filename, archive.openFile(entry.filename).readAsString());
        for (const reference of campaignMediaReferences(definition, art)) add('yr', reference.name, entry, reference.binding, reference.use);
    }
    return { labels, expansionMapArchiveSha256: createHash('sha256').update(archiveBytes).digest('hex') };
}
