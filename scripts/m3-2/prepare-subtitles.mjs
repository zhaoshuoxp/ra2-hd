import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '../..'), output = path.join(root, '.artifacts/m3-2/subtitles');
await fs.mkdir(output, { recursive: true });
const source = await fs.readFile(path.resolve(root, '../Resource/Command and Conquer Red Alert II/subtitle.txt'));
const decoded = new TextDecoder(source[0] === 255 ? 'utf-16le' : 'utf-8').decode(source);
const translations = {
    s02_f00e: [
        'Congratulations!', 'Comrade General.', 'Look at American President Dugan', 'running for his life.',
        'This is the coastal state of Florida.', 'The Americans have a major naval base here.',
        'From New York to Havana, they can strike anywhere.', 'Comrade, you must establish a naval base of your own.',
        'Use your submarines to keep the vulnerable Allied navy from reaching the open sea.',
        'This is General Vladimir.', 'I believe he needs no introduction. He will oversee the operation',
        'and support you from his command ship.', 'Farewell, and good luck.', 'Ha ha! Of course, of course, Comrade.',
        'Show us what you can do.', 'But do not imagine that you can give me orders!', 'I do not care what Romanov says.',
        'Here, you answer to me.', 'I will be watching', 'your every move.',
    ],
    s02_p01e: ['Comrade General, General Vladimir needs you to clear the coastal defenses.',
        'Now would be a good time to establish your own naval base.'],
    s02_p02e: ['The time has come to attack! All glory to the Motherland!',
        'But sir, we are not ready. We have not built enough submarines...',
        'Nonsense! I could destroy this American fleet with a rubber duck!'],
    s02_p03e: ['General, it appears we may have underestimated the Allies.', 'General, what are you waiting for? Take action!'],
};
const manifest = JSON.parse(await fs.readFile(path.join(root, '.local/campaign/ra2/sov02t/manifest.json')));
const catalogs = { 'en-US': {}, 'zh-CN': {}, 'zh-TW': {} }, timings = {}, records = [];
const seconds = value => value.split(':').reduce((sum, component, index) => sum + Number(component) * [3600, 60, 1, 1 / 60][index], 0);
for (const [movie, english] of Object.entries(translations)) {
    const block = [...decoded.matchAll(/(?:^|\n)BeginMovie\s+(\S+)([\s\S]*?)EndMovie/gi)].find(match => match[1].toLowerCase() === movie);
    assert(block, movie);
    const entries = [...block[2].matchAll(/<Time=([\d:]+),\s*Duration=([\d:]+),[^\r\n]*?Text="([^"]*)">/g)]
        .map(match => ({ start: seconds(match[1]), duration: seconds(match[2]), text: match[3] }));
    assert.equal(entries.length, english.length);
    const duration = manifest.media.find(entry => entry.name === movie).durationSeconds;
    timings[movie] = entries.map((entry, index) => {
        const key = `hd:movie:${movie}:${String(index).padStart(2, '0')}`;
        catalogs['zh-CN'][key] = entry.text; catalogs['en-US'][key] = english[index];
        const end = Math.min(entries[index + 1]?.start ?? duration, entry.duration ? entry.start + entry.duration : duration);
        assert(end > entry.start && end <= duration); return { start: entry.start, end, key };
    });
    records.push({ movie, sourceBlockSha256: createHash('sha256').update(block[0]).digest('hex'), cues: entries.length, duration });
}
const simplified = path.join(output, 'source-localization-zh-CN.json'), traditional = path.join(output, 'source-localization-zh-TW.json');
await fs.writeFile(simplified, JSON.stringify(catalogs['zh-CN'], null, 2));
const converter = path.join(output, 'traditional.swift');
await fs.writeFile(converter, `import Foundation
let input = try String(contentsOfFile: CommandLine.arguments[1], encoding: .utf8)
let output = input.applyingTransform(StringTransform(rawValue: "Simplified-Traditional"), reverse: false)!
try output.write(toFile: CommandLine.arguments[2], atomically: true, encoding: .utf8)
`);
execFileSync('/usr/bin/swift', ['-module-cache-path', path.join(output, 'swift-cache'), converter, simplified, traditional]);
catalogs['zh-TW'] = JSON.parse(await fs.readFile(traditional));
for (const [language, strings] of Object.entries(catalogs)) {
    const file = path.join(root, 'public/res/locale', language + '.json'), previous = await fs.readFile(file, 'utf8');
    const catalog = JSON.parse(previous); Object.assign(catalog, strings);
    await fs.writeFile(file, JSON.stringify(catalog, null, previous.match(/\n( +)"/)[1].length) + '\n');
}
await fs.writeFile(path.join(root, 'src/gui/campaign/CampaignSoviet02Subtitles.ts'),
    `// Original local subtitle.txt timecodes; English is translated from the supplied Chinese track.\nimport type { CampaignSubtitleTiming } from './CampaignSubtitles';\nexport const soviet02SubtitleTimings: Record<string, CampaignSubtitleTiming[]> = ${JSON.stringify(timings, null, 4)};\n`);
await fs.writeFile(path.resolve(root, '../project-history/m3-2-first-batch-20261025/subtitle-provenance.json'), JSON.stringify({
    sourceSha256: createHash('sha256').update(source).digest('hex'), tracks: records,
    timing: 'Hours:minutes:seconds:sixtieths; explicit ends clipped to next cue.',
    localization: { 'zh-CN': 'Original supplied track', 'zh-TW': 'ICU Simplified-Traditional conversion',
        'en-US': 'English translation of the supplied Chinese track, not a verbatim audio transcription' },
}, null, 2) + '\n');
console.log(JSON.stringify(records));
