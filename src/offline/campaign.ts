import { CampaignDefinition } from '../data/campaign/CampaignDefinition';
import { activeEdition } from '../editions/activeEdition';
import { VirtualFile } from '../data/vfs/VirtualFile';
import { campaignMissionName, campaignMissionSemantics } from '../data/campaign/CampaignMission';
import type { CampaignCatalogEntry } from '../data/campaign/CampaignCatalog';
import type { CampaignEdition } from '../data/campaign/CampaignDefinition';
import type { CampaignMovieBinding } from '../gui/campaign/CampaignMovieOverride';

export interface CampaignFileIdentity { name: string; bytes: number; sha256: string; route: string }
export interface PreparedCampaign {
    schemaVersion: 1;
    edition: CampaignEdition;
    mission: string;
    files: CampaignFileIdentity[];
    catalog: CampaignCatalogEntry[];
    media: (CampaignMovieBinding & { use: string; binding: string; movieIndex?: number })[];
    provenanceDigest: string;
    interfaceSource?: { mission: string; presentationSha256: string };
}

export async function verifiedCampaignFile(entry: CampaignFileIdentity): Promise<Uint8Array> {
    if (!/^\/local-campaign\/(ra2|yr)\/(all|sov|trn)\d{2}[tsudl](md)?\/[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(entry.route)
        || entry.route.split('/').at(-1) !== entry.name || !Number.isSafeInteger(entry.bytes) || entry.bytes <= 0
        || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw new Error('Invalid campaign route');
    const response = await fetch(entry.route);
    if (!response.ok) throw new Error(`Prepared campaign resource missing: ${entry.name}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
    if (bytes.length !== entry.bytes || hash !== entry.sha256) throw new Error(`Campaign resource identity mismatch: ${entry.name}`);
    return bytes;
}

export async function loadPreparedCampaign(mission = 'sov01t.map', edition: CampaignEdition = activeEdition): Promise<{
    manifest: PreparedCampaign; definition: CampaignDefinition; map: VirtualFile;
}> {
    const name = campaignMissionName(edition, mission);
    const response = await fetch(`/local-campaign/${edition}/${name}/manifest.json`);
    if (!response.ok) throw new Error('The selected mission resources are unavailable.');
    const manifest: PreparedCampaign = await response.json();
    if (manifest.schemaVersion !== 1 || manifest.edition !== edition || manifest.mission !== mission
        || !Array.isArray(manifest.files) || manifest.files.length > 256
        || !/^[a-f0-9]{64}$/.test(manifest.provenanceDigest)) throw new Error('Invalid campaign preparation manifest');
    const entry = manifest.files.find(file => file.name === manifest.mission);
    if (!entry) throw new Error('Campaign manifest has no mission map');
    const bytes = await verifiedCampaignFile(entry);
    const definition = new CampaignDefinition(edition, manifest.mission, new TextDecoder().decode(bytes), undefined,
        { semanticsVersion: campaignMissionSemantics(manifest.mission), sourceSha256: entry.sha256 });
    definition.assertValid();
    return { manifest, definition, map: VirtualFile.fromBytes(bytes, manifest.mission) };
}
