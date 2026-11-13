import { expect, test } from 'bun:test';
import fs from 'node:fs';
import { currentCampaignSubtitle } from '../../src/gui/campaign/CampaignSubtitles';
import { campaignMovieSubtitles, campaignSubtitleTimings } from '../../src/gui/campaign/CampaignSubtitleTracks';

test('movie captions follow media time across gaps, pauses and backward/forward seeks', () => {
    const cues = [{ start: 1.5, end: 3.5, text: 'first' }, { start: 3.5, end: 6, text: 'second' }, { start: 8, end: 9, text: 'last' }];
    for (const [time, text] of [[0, ''], [1.5, 'first'], [3.499, 'first'], [3.5, 'second'], [6, ''],
        [8.1, 'last'], [2, 'first'], [2, 'first'], [100, ''], [NaN, '']] as const) expect(currentCampaignSubtitle(cues, time)).toBe(text);
});

test('every source-timed cue has matching English, Simplified and Traditional text', () => {
    const completion = JSON.parse(fs.readFileSync('docs/campaign-art/subtitle-provenance.json', 'utf8')).tracks;
    const additionalLengths = Object.fromEntries(completion.map((track: any) => [track.movie, track.cues]));
    const additionalDurations = Object.fromEntries(completion.map((track: any) => [track.movie, track.duration]));
    for (const language of ['en-US', 'zh-CN', 'zh-TW']) {
        const labels = JSON.parse(fs.readFileSync(`public/res/locale/${language}.json`, 'utf8'));
        const strings = { get: (key: string) => labels[key] };
        for (const [movie, timings] of Object.entries(campaignSubtitleTimings)) {
            const cues = campaignMovieSubtitles(movie.toUpperCase(), strings);
            const lengths: Record<string, number> = { s01_f00e: 33, s01_p01e: 2, s02_f00e: 20, s02_p01e: 2, s02_p02e: 3, s02_p03e: 2, ...additionalLengths };
            const durations: Record<string, number> = { s01_f00e: 102.07, s01_p01e: 10.27, s02_f00e: 59.93, s02_p01e: 9.33, s02_p02e: 13.07, s02_p03e: 8.53, ...additionalDurations };
            expect(cues.length).toBe(lengths[movie]);
            cues.forEach((cue, index) => {
                expect(cue.text?.length).toBeGreaterThan(0); expect(cue.end).toBeGreaterThan(cue.start);
                expect(cue.end).toBeLessThanOrEqual(timings[index + 1]?.start ?? durations[movie]);
            });
        }
        expect(labels['hd:speech:eva_missionaccomplished']).toBeTruthy(); expect(labels['hd:speech:eva_missionfailed']).toBeTruthy();
    }
    expect(campaignSubtitleTimings.s01_f00e[0].start).toBe(1.5);
    expect(campaignMovieSubtitles('unprepared', { get: () => '' })).toEqual([]);
});
