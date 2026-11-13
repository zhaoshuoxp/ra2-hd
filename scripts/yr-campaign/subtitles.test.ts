import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { campaignCompletionSubtitleTimings } from '../../src/gui/campaign/CampaignCompletionSubtitles';
import { requiredBytes } from '../test-support/resources';

test('all forty-nine bound YR movie cuts have complete three-language captions within the original durations', () => {
    const english = JSON.parse(readFileSync('scripts/yr-campaign/subtitles/missions-en.json', 'utf8'));
    const library = JSON.parse(requiredBytes('media/movie-library-v51/catalog.json').toString());
    const locales = ['en-US', 'zh-CN', 'zh-TW'].map(language => JSON.parse(readFileSync(`public/res/locale/${language}.json`, 'utf8')));
    expect(Object.keys(english)).toHaveLength(49);
    expect(Object.values(english).reduce((sum: number, rows: any) => sum + rows.length, 0)).toBe(411);
    for (const [name, translated] of Object.entries(english) as [string, string[]][]) {
        const cues = campaignCompletionSubtitleTimings['yr_' + name];
        expect(cues).toHaveLength(translated.length);
        const movie = library.entries.find((entry: any) => entry.edition === 'yr' && entry.id === name);
        expect(movie).toBeDefined();
        for (const [index, cue] of cues.entries()) {
            expect(cue.start).toBeGreaterThanOrEqual(0); expect(cue.end).toBeGreaterThan(cue.start);
            expect(cue.end).toBeLessThanOrEqual(movie.durationSeconds);
            expect(cue.key.startsWith('hd:movie:yr_')).toBe(true);
            expect(locales[0][cue.key]).toBe(translated[index]);
            for (const locale of locales) expect(locale[cue.key]?.trim().length).toBeGreaterThan(0);
        }
    }
    expect(campaignCompletionSubtitleTimings.a01_f00e).toHaveLength(35);
    expect(campaignCompletionSubtitleTimings.yr_a01_f00e).toHaveLength(32);
    expect(campaignCompletionSubtitleTimings.a08_f00e).toHaveLength(22);
    expect(campaignCompletionSubtitleTimings.yr_a08_f00e).toHaveLength(31);
});
