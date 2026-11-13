import { readFileSync } from 'node:fs';
import { expect, test } from 'bun:test';
import { campaignMissionImplemented, campaignMissionSemantics, isCampaignMissionIdentity } from '../../src/data/campaign/CampaignMission';
import { campaignSaveRecord, validateCampaignSaveRecord } from '../../src/gui/campaign/CampaignSaveLibrary';
import { campaignSaveSlot } from '../../src/gui/campaign/CampaignSaveStore';
import { completeCampaignProgress } from '../../src/gui/campaign/CampaignProgress';

const digest = async (value: unknown) => [...new Uint8Array(await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(JSON.stringify(value))))].map(byte => byte.toString(16).padStart(2, '0')).join('');

test('shared save identities retain legacy slots and schemas for implemented Allied and training missions', async () => {
    const fixture = JSON.parse(readFileSync('scripts/m3-1/fixtures/mid-mission-checkpoint.json', 'utf8'));
    for (const mission of ['sov01t.map', 'all01t.map', 'all02s.map', 'all03u.map', 'all04u.map', 'all07t.map', 'all12s.map', 'trn01t.map', 'trn02t.map']) {
        const checkpoint = structuredClone(fixture);
        checkpoint.identity.mission = checkpoint.options.campaign.mission = checkpoint.options.mapName = mission;
        const { checksum: _, ...payload } = checkpoint; checkpoint.checksum = await digest(payload);
        const record = await campaignSaveRecord(checkpoint, 'Identity fixture', mission, 1);
        await validateCampaignSaveRecord(record); expect(record.version).toBe(1); expect(record.mission).toBe(mission);
        expect(campaignSaveSlot('normal', mission)).toBe(`ra2/${mission}/normal`);
        expect(campaignMissionImplemented('ra2', mission)).toBe(true);
    }
    expect(campaignSaveSlot('normal')).toBe('ra2/sov01t.map/normal');
    for (const [edition, mission] of [['ra2', 'sov01umd.map'], ['yr', 'all01t.map'], ['unknown', 'sov01t.map'], ['ra2', '../sov01t.map']]) {
        expect(isCampaignMissionIdentity(edition, mission)).toBe(false);
    }
    expect(campaignMissionSemantics('sov03u.map')).toBe(5); expect(campaignMissionSemantics('sov04s.map')).toBe(6);
    expect(campaignMissionSemantics('sov05u.map')).toBe(7); expect(campaignMissionSemantics('sov06t.map')).toBe(8);
    expect(campaignMissionSemantics('sov07s.map')).toBe(9); expect(campaignMissionSemantics('sov08u.map')).toBe(10);
    expect(campaignMissionSemantics('sov09u.map')).toBe(11); expect(campaignMissionSemantics('sov10t.map')).toBe(12);
    expect(campaignMissionSemantics('sov11s.map')).toBe(13); expect(campaignMissionSemantics('sov12s.map')).toBe(14);
    expect(campaignMissionSemantics('all01t.map')).toBe(15);
    expect(campaignMissionSemantics('all02s.map')).toBe(16);
    expect(campaignMissionSemantics('all03u.map')).toBe(17);
    expect(campaignMissionSemantics('all04u.map')).toBe(18);
});

test('completion history keeps all three campaign factions separate and migrates training records correctly', () => {
    let history: any = { version: 1, completed: [{ mission: 'trn01t.map', difficulty: 'normal', sourceSha256: 'a', provenanceDigest: 'b', completedAt: 'old' }] };
    for (const mission of ['sov01t.map', 'all01t.map', 'trn02t.map']) {
        history = completeCampaignProgress(JSON.stringify(history), { edition: 'ra2', mission, difficulty: 'normal', sourceSha256: 'a', provenanceDigest: 'b' }, 'new');
    }
    expect(history.completed.map((row: any) => row.faction)).toEqual(['tutorial', 'soviet', 'allied', 'tutorial']);
    expect(history.nextPlayable).toBe(false); expect(history.completed.length).toBe(4);
});
