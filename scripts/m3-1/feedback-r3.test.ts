import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { retailMember } from '../test-support/resources';
import { ShpFile } from '../../src/data/ShpFile';
import { Palette } from '../../src/data/Palette';
import { scoreForegroundAlpha } from '../../src/gui/campaign/CampaignScoreMatte';
import { campaignSaveRecord, validateCampaignSaveRecord } from '../../src/gui/campaign/CampaignSaveLibrary';
import { campaignWorldRegistration } from '../../src/gui/campaign/CampaignBackdrop';
import { IniFile } from '../../src/data/IniFile';
import { campaignAnimationFrame } from '../../src/gui/campaign/CampaignAnimation';

test('a browser frame timestamp before the React effect starts cannot select a negative retail frame', () => {
    const animation = { activeFrames: [1, 2, 3, 4, 5, 6, 7], framesPerSecond: 15 };
    for (const [time, expected] of [[90, 1], [100, 1], [166, 1], [167, 2], [200, 2], [566, 7], [567, 1]]) {
        expect(campaignAnimationFrame(time, 100, animation)).toBe(expected);
    }
    const opening = { activeFrames: [5, 4, 3, 2, 1, 0], framesPerSecond: 15 };
    expect(campaignAnimationFrame(90, 100, opening, false)).toBe(5);
    expect(campaignAnimationFrame(50000, 100, opening, false)).toBe(0);
});

test('the expanded world always places Washington inside the retail locator at every aspect ratio', () => {
    for (const [width, height] of [[800, 600], [1066.6667, 600], [1400, 600], [800, 1000], [3840, 2160]]) {
        const map = campaignWorldRegistration(width, height);
        expect(map.x + 520 * map.width / map.sourceWidth).toBeCloseTo((width - 800) / 2 + 264, 5);
        expect(map.y + 248 * map.height / 821).toBeCloseTo((height - 520) / 2 + 160, 5);
    }
});

test('all six opening and 44 emblem frames remove the opaque plate while preserving the moving apparatus', () => {
    const panel = new ShpFile(retailMember('ra2', 'sscrtmd.shp').file);
    const emblem = new ShpFile(retailMember('ra2', 'sscramd.shp').file);
    const palette = new Palette(retailMember('ra2', 'sscore.pal').file);
    for (let frame = 0; frame < panel.numImages; frame++) {
        const source = panel.getImage(frame), alpha = scoreForegroundAlpha(source, panel.getImage(5), palette, 'panel', frame);
        expect(alpha[200 * source.width]).toBe(0);
        expect(alpha.filter(value => value === 255).length).toBeGreaterThan(frame === 5 ? 5000 : 15000);
        if (frame > 1) expect(alpha[447 * source.width + 230]).toBe(0);
    }
    for (let frame = 0; frame < emblem.numImages; frame++) {
        const source = emblem.getImage(frame), alpha = scoreForegroundAlpha(source, panel.getImage(5), palette, 'emblem', frame);
        expect(alpha[200 * source.width]).toBe(0);
        expect(alpha[100 * source.width + 212]).toBe(255);
        expect(alpha.filter(value => value === 255).length).toBeGreaterThan(75000);
    }
});

test('campaign save envelopes retain an authentic checkpoint and reject damaged metadata or world data', async () => {
    const checkpoint = JSON.parse(readFileSync('scripts/m3-1/fixtures/mid-mission-checkpoint.json', 'utf8'));
    const record = await campaignSaveRecord(checkpoint, '  Native checkpoint  ', 'campaign-test', 1792700001000);
    expect(record.name).toBe('Native checkpoint');
    expect(record.checkpoint).toEqual(checkpoint);
    await validateCampaignSaveRecord(record);
    for (const mutate of [
        (value: any) => value.name = 'Tampered name',
        (value: any) => value.checkpoint.expected.worldHash++,
        (value: any) => value.tick++,
        (value: any) => value.edition = 'yr',
    ]) {
        const damaged = structuredClone(record); mutate(damaged);
        await expect(validateCampaignSaveRecord(damaged)).rejects.toThrow();
    }
});

test('faction hover uses the original three sound.ini sections and their original audio samples', () => {
    const ini = new IniFile(retailMember('ra2', 'sound.ini').file.readAsString());
    for (const [key, samples] of Object.entries({ AlliedCampaignSelect: '$itanatc', BootCampSelect: '$igisea', SovietCampaignSelect: '$vgrsatc' })) {
        expect(ini.getSection(key)?.getString('Sounds')).toBe(samples);
        expect(ini.getSection(key)?.getNumber('Volume')).toBe(90);
    }
});
