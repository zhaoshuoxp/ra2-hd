import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '../..'), input = path.resolve(process.argv[2]);
const edition = process.argv.includes('--edition=yr') ? 'yr' : 'ra2';
const subtitleFile = edition === 'yr' ? 'subtitlemd.txt' : 'subtitle.txt';
const output = path.join(root, '.artifacts/campaign-completion/subtitles');
await fs.mkdir(output, { recursive: true });
const source = await fs.readFile(path.resolve(root, '../Resource/Command and Conquer Red Alert II', subtitleFile));
const decoded = new TextDecoder(source[0] === 255 ? 'utf-16le' : 'utf-8').decode(source);
const sha = value => createHash('sha256').update(value).digest('hex');
const translations = JSON.parse(await fs.readFile(input)), durations = new Map();
for (const mission of await fs.readdir(path.join(root, '.local/campaign/ra2'))) {
    const manifest = JSON.parse(await fs.readFile(path.join(root, '.local/campaign/ra2', mission, 'manifest.json')));
    for (const movie of manifest.media) {
        if (durations.has(movie.name)) assert.equal(durations.get(movie.name), movie.durationSeconds);
        durations.set(movie.name, movie.durationSeconds);
    }
}
const library = JSON.parse(await fs.readFile(path.join(root, '.local/media/movie-library-v51/catalog.json')));
for (const movie of library.entries.filter(movie => movie.edition === edition)) {
    if (edition === 'yr' || !durations.has(movie.id)) durations.set(movie.id, movie.durationSeconds);
}
const timingFile = path.join(root, 'src/gui/campaign/CampaignCompletionSubtitles.ts');
let timings = {}, records = [], sourceFiles = {}, originalSourceSha256;
try { timings = JSON.parse((await fs.readFile(timingFile, 'utf8')).match(/ = ([\s\S]+);\s*$/)[1]); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const provenanceFile = path.join(root, 'docs/campaign-art/subtitle-provenance.json');
try {
    const previous = JSON.parse(await fs.readFile(provenanceFile));
    if (edition === 'ra2') assert.equal(previous.sourceSha256, sha(source));
    originalSourceSha256 = previous.sourceSha256; sourceFiles = previous.sourceFiles ?? {}; records = previous.tracks;
}
catch (error) { if (error.code !== 'ENOENT') throw error; }
const catalogs = { 'en-US': {}, 'zh-CN': {}, 'zh-TW': {} };
const seconds = value => value.split(':').reduce((sum, component, index) => sum + Number(component) * [3600, 60, 1, 1 / 60][index], 0);
for (const [movie, english] of Object.entries(translations)) {
    const track = edition === 'yr' ? 'yr_' + movie : movie;
    const block = [...decoded.matchAll(/(?:^|\n)BeginMovie\s+(\S+)([\s\S]*?)EndMovie/gi)].find(match => match[1].toLowerCase() === movie);
    assert(block, movie);
    const entries = [...block[2].matchAll(/<Time=([\d:]+),\s*Duration=([\d:]+),[^\r\n]*?Text="([^"]*)">/g)]
        .map(match => ({ start: seconds(match[1]), duration: seconds(match[2]), text: match[3] }));
    assert.equal(entries.length, english.length, movie);
    const duration = durations.get(movie); assert(duration > 0, movie);
    timings[track] = entries.map((entry, index) => {
        const key = `hd:movie:${track}:${String(index).padStart(2, '0')}`;
        catalogs['zh-CN'][key] = entry.text; catalogs['en-US'][key] = english[index];
        const end = Math.min(entries[index + 1]?.start ?? duration, entry.duration ? entry.start + entry.duration : duration);
        assert(end > entry.start && end <= duration, `${movie}:${index}`);
        return { start: entry.start, end, key };
    });
    records = records.filter(record => record.movie !== track);
    records.push({ movie: track, sourceFile: subtitleFile, sourceSha256: sha(source), sourceBlockSha256: sha(block[0]),
        cues: entries.length, duration, englishSourceSha256: sha(await fs.readFile(input)) });
}
const simplified = path.join(output, 'source-localization-zh-CN.json'), traditional = path.join(output, 'source-localization-zh-TW.json');
await fs.writeFile(simplified, JSON.stringify(catalogs['zh-CN'], null, 2));
const converter = path.join(output, 'traditional.swift');
await fs.writeFile(converter, `import Foundation\nlet input = try String(contentsOfFile: CommandLine.arguments[1], encoding: .utf8)\nlet output = input.applyingTransform(StringTransform(rawValue: "Simplified-Traditional"), reverse: false)!\ntry output.write(toFile: CommandLine.arguments[2], atomically: true, encoding: .utf8)\n`);
execFileSync('/usr/bin/swift', ['-module-cache-path', path.join(output, 'swift-cache'), converter, simplified, traditional]);
catalogs['zh-TW'] = JSON.parse(await fs.readFile(traditional));
for (const [language, strings] of Object.entries(catalogs)) {
    const file = path.join(root, 'public/res/locale', language + '.json'), previous = await fs.readFile(file, 'utf8');
    const catalog = JSON.parse(previous); Object.assign(catalog, strings);
    await fs.writeFile(file, JSON.stringify(catalog, null, previous.match(/\n( +)"/)[1].length) + '\n');
}
await fs.writeFile(timingFile, '// Original supplied subtitle.txt timing. Generated by prepare-subtitles.mjs.\n'
    + "import type { CampaignSubtitleTiming } from './CampaignSubtitles';\n"
    + `export const campaignCompletionSubtitleTimings: Record<string, CampaignSubtitleTiming[]> = ${JSON.stringify(timings, null, 4)};\n`);
await fs.mkdir(path.dirname(provenanceFile), { recursive: true });
sourceFiles[edition] = { file: subtitleFile, sha256: sha(source) };
await fs.writeFile(provenanceFile, JSON.stringify({ sourceSha256: edition === 'ra2' ? sha(source) : originalSourceSha256,
    sourceFiles, tracks: records,
    timing: 'Hours:minutes:seconds:sixtieths; explicit ends clipped to the next source cue and original movie duration.',
    localization: { 'zh-CN': 'Original supplied track', 'zh-TW': 'ICU Simplified-Traditional conversion',
        'en-US': 'English translation of the supplied Chinese track, not a verbatim audio transcription' } }, null, 2) + '\n');
console.log(JSON.stringify({ edition, tracks: records.filter(record => translations[
    edition === 'yr' ? record.movie.replace(/^yr_/, '') : record.movie] && record.movie.startsWith('yr_') === (edition === 'yr')) }));
