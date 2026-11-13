import { expect, test } from 'bun:test';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { CampaignMapFile } from '../../src/data/campaign/CampaignMapFile';
import { MapFile } from '../../src/data/MapFile';
import { VirtualFile } from '../../src/data/vfs/VirtualFile';
import { campaignHomeTile } from '../../src/game/campaign/CampaignHome';
import { campaignPreflight } from '../../src/game/campaign/CampaignSupport';
import { campaignCapabilities } from '../../src/game/campaign/CampaignRuntime';
import { MapSupport } from '../../src/engine/MapSupport';
import { Engine } from '../../src/engine/Engine';
import { IniFile } from '../../src/data/IniFile';
import { retailMember, requiredBytes, sha256 } from '../test-support/resources';

const missions = ['sov01umd', 'sov02smd', 'sov03umd', 'sov04dmd', 'sov05umd', 'sov06lmd', 'sov07tmd',
    'all01umd', 'all02umd', 'all03umd', 'all04dmd', 'all05umd', 'all06umd', 'all07smd'];

test('fourteen prepared YR maps preserve source identity and original HomeCell without inventing multiplayer starts', () => {
    const ai = new IniFile(retailMember('yr', 'aimd.ini').file.readAsString());
    for (const name of missions) {
        const manifest = JSON.parse(requiredBytes(`campaign/yr/${name}/manifest.json`).toString());
        const bytes = requiredBytes(`campaign/yr/${name}/${name}.map`), hash = sha256(bytes);
        expect(hash).toBe(manifest.files.find((file: any) => file.name === name + '.map').sha256);
        const definition = new CampaignDefinition('yr', name + '.map', bytes.toString(), ai, { semanticsVersion: 28, sourceSha256: hash });
        definition.assertValid(); expect(campaignPreflight(definition, campaignCapabilities)).toEqual([]);
        const home = Number(definition.ini.getSection('Basic')!.getString('HomeCell'));
        expect(definition.waypoints.has(home)).toBe(true);
        const tile = definition.waypoints.get(home);
        expect(campaignHomeTile({ campaign: { definition }, map: { getTileAtWaypoint: (id: number) => definition.waypoints.get(id) } })).toBe(tile);
    }
});

test('source campaigns retain all map checks while multiplayer still requires two real starting locations', () => {
    const name = 'sov01umd', bytes = requiredBytes(`campaign/yr/${name}/${name}.map`);
    const original = Engine.supportsTheater, translator: any = { get: (key: string) => key };
    Engine.supportsTheater = () => false;
    try {
        const campaign = new CampaignMapFile(VirtualFile.fromBytes(bytes, name + '.map'), { semanticsVersion: 28, sourceSha256: sha256(bytes) });
        expect(campaign.startingLocations).toEqual([]);
        expect(MapSupport.check(campaign, translator)).toBe('TS:MapUnsupportedTheater');
        const multiplayer = new MapFile(VirtualFile.fromBytes(bytes, name + '.map'));
        expect(MapSupport.check(multiplayer, translator)).toBe('TXT_SCENARIO_TOO_SMALL');
    } finally { Engine.supportsTheater = original; }
});
