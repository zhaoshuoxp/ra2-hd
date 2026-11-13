import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { campaignAiSourceSha256, verifyOriginalCampaignAi } from '../../src/data/campaign/CampaignAiLibrary';
import { IniFile } from '../../src/data/IniFile';
import { campaignMissionSemantics, isCampaignMissionIdentity } from '../../src/data/campaign/CampaignMission';
import { campaignSaveRecord, validateCampaignSaveRecord } from '../../src/gui/campaign/CampaignSaveLibrary';
import { campaignSaveSlot } from '../../src/gui/campaign/CampaignSaveStore';
import { completeCampaignProgress } from '../../src/gui/campaign/CampaignProgress';
import { retailMember, requiredBytes, sha256 } from '../test-support/resources';

const digest = async (value: unknown) => sha256(new TextEncoder().encode(JSON.stringify(value)));

test('YR saves keep the existing envelope and database identities while distinguishing all fourteen mission slots', async () => {
    const fixture = JSON.parse(readFileSync('scripts/m3-1/fixtures/mid-mission-checkpoint.json', 'utf8'));
    const missions = ['sov01umd', 'sov02smd', 'sov03umd', 'sov04dmd', 'sov05umd', 'sov06lmd', 'sov07tmd',
        'all01umd', 'all02umd', 'all03umd', 'all04dmd', 'all05umd', 'all06umd', 'all07smd'];
    // Identity-envelope fixture only. Actual YR world reconstruction is checked
    // separately in native restart evidence, using commands from the source map.
    for (const name of missions) {
        const checkpoint = structuredClone(fixture), mission = name + '.map';
        checkpoint.identity.edition = checkpoint.options.campaign.edition = 'yr';
        checkpoint.identity.mission = checkpoint.options.campaign.mission = checkpoint.options.mapName = mission;
        checkpoint.options.campaign.semanticsVersion = 28;
        const { checksum: _, ...payload } = checkpoint; checkpoint.checksum = await digest(payload);
        const record = await campaignSaveRecord(checkpoint, 'YR envelope fixture', mission, 1);
        await validateCampaignSaveRecord(record);
        expect(record.edition).toBe('yr'); expect(record.version).toBe(1);
        expect(campaignSaveSlot('hard', mission, 'yr')).toBe(`yr/${mission}/hard`);
        expect(campaignMissionSemantics(mission)).toBe(48);
        expect(isCampaignMissionIdentity('ra2', mission)).toBe(false);
        const wrong = structuredClone(record); wrong.edition = 'ra2';
        await expect(validateCampaignSaveRecord(wrong)).rejects.toThrow();
    }
    expect(campaignSaveSlot('normal')).toBe('ra2/sov01t.map/normal');
    expect(campaignMissionSemantics('all10s.map')).toBe(24);
    expect(fixture.options.campaign.semanticsVersion).not.toBe(28);
});

test('original AI libraries are checked against their own edition even when INI names and numeric indices overlap', async () => {
    for (const edition of ['ra2', 'yr'] as const) {
        const file = retailMember(edition, edition === 'yr' ? 'aimd.ini' : 'ai.ini');
        const ini = new IniFile(file.file.readAsString());
        expect(file.sha256).toBe(campaignAiSourceSha256(edition));
        await verifyOriginalCampaignAi(ini, file.sha256, edition);
        await expect(verifyOriginalCampaignAi(ini, file.sha256, edition === 'yr' ? 'ra2' : 'yr')).rejects.toThrow('identity');
    }
});

test('prepared mission media uses the exact YR movie-library cut and conversion across repeated RA2 names', () => {
    const library = JSON.parse(requiredBytes('media/movie-library-v51/catalog.json').toString());
    for (const name of ['sov01umd', 'sov07tmd', 'all01umd', 'all07smd']) {
        const manifest = JSON.parse(requiredBytes(`campaign/yr/${name}/manifest.json`).toString());
        expect(manifest.edition).toBe('yr');
        for (const movie of manifest.media) {
            const entry = library.entries.find((row: any) => row.edition === 'yr' && row.id === movie.libraryId);
            expect(entry.original.sha256).toBe(movie.sha256);
            const file = manifest.files.find((row: any) => row.name === movie.file);
            expect(file.sha256).toBe(entry.file.sha256); expect(file.bytes).toBe(entry.file.bytes);
            expect(sha256(requiredBytes(`campaign/yr/${name}/${file.name}`))).toBe(file.sha256);
        }
    }
    const ra2 = library.entries.find((row: any) => row.edition === 'ra2' && row.id === 's01_f00e');
    const yr = library.entries.find((row: any) => row.edition === 'yr' && row.id === 's01_f00e');
    expect(ra2.original.sha256).not.toBe(yr.original.sha256);
});

test('completion updates preserve RA2 progress and separate YR difficulties and factions', () => {
    const progress = completeCampaignProgress(null, { edition: 'ra2', mission: 'sov01t.map', difficulty: 'normal',
        sourceSha256: 'ra2', provenanceDigest: 'ra2' }, 'old');
    let result = progress;
    for (const difficulty of ['easy', 'normal', 'hard'] as const) result = completeCampaignProgress(JSON.stringify(result), {
        edition: 'yr', mission: 'sov01umd.map', difficulty, sourceSha256: 'yr', provenanceDigest: 'yr' }, 'new');
    expect(result.completed).toHaveLength(4);
    expect(result.completed[0]).toEqual(progress.completed[0]);
    expect(result.completed.slice(1).map(row => [row.edition, row.faction, row.difficulty]))
        .toEqual([['yr', 'soviet', 'easy'], ['yr', 'soviet', 'normal'], ['yr', 'soviet', 'hard']]);
});
