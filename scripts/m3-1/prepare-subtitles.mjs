import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '../..'), out = path.join(root, '.artifacts/m3-1/feedback-r2/subtitles');
await fs.mkdir(out, { recursive: false });
const source = path.resolve(root, '../Resource/Command and Conquer Red Alert II/subtitle.txt');
const bytes = await fs.readFile(source), decoded = new TextDecoder(bytes[0] === 255 ? 'utf-16le' : 'utf-8').decode(bytes);
const movies = ['s01_f00e', 's01_p01e'];
const translations = {
    s01_f00e: [
        'Comrade General!', 'I am Lieutenant Zofia.', 'My duty is to ensure that your command runs smoothly.',
        'Since the Great War, I have helped conduct more than fifty', 'simulated campaigns successfully.',
        'I am confident that my performance will exceed your expectations.', 'One moment, Comrade.', 'It is Premier Romanov himself!',
        'Is the charming Lieutenant Zofia still working hard for a promotion?', 'Let me speak to the General in private.',
        'Yes, Premier.', 'Comrade General, join me in welcoming the future of the Soviet Union.',
        'I would like you to meet a little friend.', 'This is Sam.', 'Like Uncle Sam!', 'Say hello, little Uncle Sam.',
        'The Americans', 'teach their children to fear the Soviet Union with turtles in their films.',
        'When this little turtle saw the great Soviet missiles coming,', 'he hid inside his shell,',
        'like a cowardly American.', 'Today we make history, Comrade!', 'Together, we will destroy America.',
        'Their cities, their homes, their dreams, and perhaps more.', 'This is my adviser, Yuri. He will help us make it happen.',
        'I serve the Soviet Union, just as you do.', 'But for now, we must act quickly.', 'Time is of the essence.',
        'Of course.', 'Comrade, your first target is', 'Washington, D.C.', 'Prove that our faith in you is justified, Comrade General.',
        'Crush the Allied forces in the American capital and destroy the Pentagon.',
    ],
    s01_p01e: ['Comrade General, you may prefer to use psychic commandos against the enemy.',
        'You will find their formidable powers most effective.'],
};
const seconds = value => value.split(':').reduce((sum, component, index) => sum + Number(component) * [3600, 60, 1, 1 / 60][index], 0);
const catalogs = { 'zh-CN': {}, 'zh-TW': {}, 'en-US': {} }, timings = {}, retained = [];
for (const movie of movies) {
    const block = [...decoded.matchAll(/(?:^|\n)BeginMovie\s+(\S+)([\s\S]*?)EndMovie/gi)]
        .find(match => match[1].toLowerCase() === movie);
    assert(block, movie);
    const entries = [...block[2].matchAll(/<Time=([\d:]+),\s*Duration=([\d:]+),[^\r\n]*?Text="([^"]*)">/g)]
        .map(match => ({ start: seconds(match[1]), duration: seconds(match[2]), text: match[3] }));
    assert.equal(entries.length, translations[movie].length, movie);
    const duration = movie === 's01_f00e' ? 102.07 : 10.27;
    timings[movie] = entries.map((entry, index) => {
        const key = `hd:movie:${movie}:${String(index).padStart(2, '0')}`;
        catalogs['zh-CN'][key] = entry.text;
        catalogs['en-US'][key] = translations[movie][index];
        const end = Math.min(entries[index + 1]?.start ?? duration, entry.duration ? entry.start + entry.duration : duration);
        assert(end > entry.start && end <= duration);
        return { start: entry.start, end, key };
    });
    retained.push({ movie, sourceBlockSha256: createHash('sha256').update(block[0]).digest('hex'), cues: entries.length });
}
const simplified = path.join(out, 'subtitle-cues-zh-CN.json'), traditional = path.join(out, 'subtitle-cues-zh-TW.json');
await fs.writeFile(simplified, JSON.stringify(catalogs['zh-CN'], null, 2) + '\n');
const converter = path.join(out, 'traditional.swift');
await fs.writeFile(converter, `import Foundation
let input = try String(contentsOfFile: CommandLine.arguments[1], encoding: .utf8)
let output = input.applyingTransform(StringTransform(rawValue: "Simplified-Traditional"), reverse: false)!
try output.write(toFile: CommandLine.arguments[2], atomically: true, encoding: .utf8)
`);
execFileSync('/usr/bin/swift', ['-module-cache-path', path.join(out, 'swift-cache'), converter, simplified, traditional], { stdio: 'inherit' });
catalogs['zh-TW'] = JSON.parse(await fs.readFile(traditional, 'utf8'));
const extra = {
    'en-US': { 'hd:speech:eva_missionaccomplished': 'Mission accomplished.', 'hd:speech:eva_missionfailed': 'Mission failed.',
        'trainer:campaignhelp': 'Using the trainer in a campaign marks that mission as modified. Modified missions cannot create campaign saves or record campaign completion.',
        'trainer:campaignmodified': 'Modified campaign: progress and saves disabled' },
};
// Read the localized additions from a localization-only file, alongside the source-derived cues.
const localizedExtra = JSON.parse(await fs.readFile(path.join(root, 'scripts/m3-1/subtitle-localization.json'), 'utf8'));
for (const language of Object.keys(catalogs)) {
    const file = path.join(root, `public/res/locale/${language}.json`), original = await fs.readFile(file, 'utf8');
    const locale = JSON.parse(original), indent = original.match(/\n( +)"/)[1].length;
    Object.assign(locale, catalogs[language], extra[language] ?? localizedExtra[language]);
    await fs.writeFile(file, JSON.stringify(locale, null, indent) + '\n');
}
const module = `// Timecodes are derived from the locally supplied subtitle.txt. The final time field is 1/60 second.
import { localizeCampaignSubtitles, type CampaignSubtitleTiming } from './CampaignSubtitles';
export const campaignSubtitleTimings: Record<string, CampaignSubtitleTiming[]> = ${JSON.stringify(timings, null, 4)};
export function campaignMovieSubtitles(movie: string, strings: any) {
    return localizeCampaignSubtitles(campaignSubtitleTimings[movie.toLowerCase()] ?? [], strings);
}
`;
await fs.writeFile(path.join(root, 'src/gui/campaign/CampaignSubtitleTracks.ts'), module);
await fs.writeFile(path.join(out, 'provenance.json'), JSON.stringify({ source, sourceSha256: createHash('sha256').update(bytes).digest('hex'),
    tracks: retained, timing: 'hours:minutes:seconds:sixtieths; explicit durations are clipped at the next cue',
    localization: { 'zh-CN': 'Locally supplied original subtitle text and timecodes.',
        'zh-TW': 'ICU Simplified-Traditional conversion of the supplied Chinese track.',
        'en-US': 'English translation of the supplied Chinese track; not a verbatim English-audio transcription.' },
    scope: 'Only the two prepared Soviet Mission 01 movies. Original movie, map and manifest bytes remain unchanged.' }, null, 2) + '\n');
console.log(JSON.stringify({ tracks: retained, output: out }));
