// Prepare only verified original Soviet 02 members. Accepted Soviet 01 files are read only.
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { retailTree, resolveMember, parseMix } from '../../src/offline/retail';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { readCampaignCatalog } from '../../src/data/campaign/CampaignCatalog';
import { IniFile } from '../../src/data/IniFile';
import { ShpFile } from '../../src/data/ShpFile';

const root = path.resolve(import.meta.dir, '../..'), mission = 'sov02t.map';
const installation = path.resolve(root, '../Resource/Command and Conquer Red Alert II');
const output = path.join(root, '.local/campaign/ra2/sov02t');
const evidence = path.resolve(root, '../project-history/m3-2-first-batch-20261025/preparation');
const sha = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const jsonBytes = (value: unknown) => Buffer.from(JSON.stringify(value, null, 2) + '\n');
await mkdir(output, { recursive: true }); await mkdir(evidence, { recursive: true });
let previous: any;
try { previous = JSON.parse(await readFile(path.join(output, 'manifest.json'), 'utf8')); }
catch (error: any) { if (error.code !== 'ENOENT') throw error; }
const sourceNames = await readdir(installation);
async function originalArchive(name: string): Promise<Buffer> {
    const names = sourceNames.filter(value => value.toLowerCase() === name);
    if (names.length !== 1) throw new Error(`Ambiguous original archive: ${name}`);
    const file = path.join(installation, names[0]);
    if (await realpath(file) !== file || !(await stat(file)).isFile()) throw new Error(`Unsafe original archive: ${name}`);
    return readFile(file);
}
const top = new Map<string, Uint8Array>(), archives: any[] = [];
for (const name of ['language.mix', 'ra2.mix', 'multi.mix', 'maps01.mix', 'maps02.mix']) {
    const bytes = await readFile(path.join(root, '.local/assets/ra2', name));
    if (sha(bytes) !== sha(await originalArchive(name))) throw new Error(`Original/import mismatch: ${name}`);
    top.set(name, bytes); archives.push({ name, bytes: bytes.length, sha256: sha(bytes) });
}
const tree = retailTree(top), files: any[] = [], members: any[] = [];
async function retain(name: string, bytes: Uint8Array) {
    const file = path.join(output, name);
    try { if (sha(await readFile(file)) !== sha(bytes)) throw new Error(`Prepared file differs: ${name}`); }
    catch (error: any) { if (error.code !== 'ENOENT') throw error; await writeFile(file, bytes, { flag: 'wx' }); }
    const entry = { name, bytes: bytes.length, sha256: sha(bytes), route: `/local-campaign/ra2/sov02t/${name}` };
    files.push(entry); return entry;
}
function member(name: string) {
    const item = resolveMember(tree, name), bytes = item.file.getBytes();
    members.push({ name, archive: item.source, bytes: bytes.length, sha256: sha(bytes) }); return bytes;
}
const map = member(mission); await retain(mission, map);
const definition = new CampaignDefinition('ra2', mission, new TextDecoder().decode(map)); definition.assertValid();
const catalog = readCampaignCatalog('ra2', new TextDecoder().decode(member('mapsel.ini')));
if (catalog.find(entry => entry.filename === 'sov01t.map')?.next !== mission
    || catalog.find(entry => entry.filename === mission)?.next !== 'sov03u.map') throw new Error('Original campaign order differs');
const missionIni = new IniFile(new TextDecoder().decode(member('mission.ini'))).getSection(mission)!;
const art = new IniFile(new TextDecoder().decode(member('art.ini')));
const movies = [...art.getSection('Movies')!.entries.values()].map(String);
const references = new Map<string, { binding: string; use: string; movieIndex?: number }[]>();
function reference(name: string, binding: string, use: string, movieIndex?: number) {
    if (!name || name === '<none>') return;
    name = name.toLowerCase();
    const refs = references.get(name) ?? []; refs.push({ binding, use, movieIndex }); references.set(name, refs);
}
for (const field of ['Intro', 'Brief', 'Win', 'Lose', 'Action', 'PostScore', 'PreMapSelect']) {
    reference(definition.ini.getSection('Basic')!.getString(field), `Basic.${field}`, field === 'Intro' || field === 'Brief' ? 'before-mission' : 'after-mission');
}
for (const trigger of definition.triggers.values()) for (const action of trigger.actions) if (action.opcode === 100) {
    const index = Number(action.params[1]);
    if (!movies[index]) throw new Error(`Unknown original movie index: ${index}`);
    reference(movies[index], `Actions.${action.key}:${action.index}`, 'transmission', index);
}
const movieBytes = await originalArchive('movies02.mix'), movieArchive = parseMix(movieBytes, 'movies02.mix');
archives.push({ name: 'movies02.mix', bytes: movieBytes.length, sha256: sha(movieBytes) });
const ffmpeg = process.env.RA2_M3_FFMPEG ?? execFileSync(path.join(root, '.artifacts/m3-2/media-tools/bin/python'),
    ['-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'], { encoding: 'utf8' }).trim();
const converterVersion = execFileSync(ffmpeg, ['-version'], { encoding: 'utf8' }).split('\n')[0];
const media: any[] = [];
for (const [name, bindings] of references) {
    const original = name + '.bik', file = name + '.webm', bytes = movieArchive.openFile(original).getBytes();
    await retain(original, bytes);
    const target = path.join(output, file);
    try {
        await stat(target);
        const pinned = previous?.files.find((entry: any) => entry.name === file);
        const binding = previous?.media.find((entry: any) => entry.name === name);
        const converted = await readFile(target);
        if (!pinned || pinned.bytes !== converted.length || pinned.sha256 !== sha(converted)
            || binding?.sha256 !== sha(bytes) || binding.file !== file) throw new Error(`Unverified converted movie cache: ${file}`);
    }
    catch (error: any) {
        if (error.code !== 'ENOENT') throw error;
        const conversion = spawnSync(ffmpeg, ['-nostdin', '-i', path.join(output, original), '-map', '0:v:0', '-map', '0:a?',
            '-c:v', 'libvpx-vp9', '-crf', '20', '-b:v', '0', '-pix_fmt', 'yuv420p', '-c:a', 'libopus', '-b:a', '128k', target],
            { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
        await writeFile(path.join(evidence, name + '-conversion.log'), conversion.stderr);
        if (conversion.status !== 0) throw new Error(`Conversion failed: ${name}`);
    }
    await retain(file, await readFile(target));
    const probe = spawnSync(ffmpeg, ['-hide_banner', '-i', path.join(output, original), '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    if (probe.status !== 0) throw new Error(`Original media probe failed: ${original}`);
    const description = probe.stderr.split('Stream mapping:')[0];
    const duration = /Duration: (\d+):(\d+):([\d.]+)/.exec(description)!, size = /Video:.*?\b(\d+)x(\d+)\b/.exec(description)!;
    const audio = [...description.matchAll(/Stream #0:(\d+).*?Audio: ([^\n]+)/g)].map(match => ({ stream: Number(match[1]), format: match[2] }));
    if (!duration || !size || !audio.length) throw new Error(`Incomplete media source: ${name}`);
    media.push({ name, original, file, source: 'movies02.mix', sha256: sha(bytes), ...bindings[0], bindings,
        width: Number(size[1]), height: Number(size[2]), durationSeconds: Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]),
        audio, language: 'Embedded original audio', fallback: file, hdCandidate: null,
        conversion: { converterVersion, policy: 'VP9 CRF20 + Opus 128k; all original audio, native frame rate/aspect/duration; no crop or scale' } });
}
const presentation = JSON.parse(await readFile(path.join(root, '.local/campaign/ra2/sov01t/presentation.json'), 'utf8'));
const imageName = missionIni.getString('LS800BkgdName').toLowerCase();
const image = resolveMember(tree, imageName), imageBytes = image.file.getBytes(), shp = new ShpFile(image.file);
presentation.mission = mission;
presentation.sources = presentation.sources.filter((entry: any) => entry.name !== presentation.sprites.mission.image);
presentation.sources.push({ name: imageName, archive: image.source, bytes: imageBytes.length, sha256: sha(imageBytes) });
presentation.sprites.mission = { image: imageName, palette: 'ldscrns.pal', width: shp.width, height: shp.height, frames: shp.numImages };
Object.assign(presentation.loading, { loadMessage: missionIni.getString('LSLoadMessage'), briefing: missionIni.getString('LSLoadBriefing'),
    briefX: missionIni.getNumber('LS800BriefLocX'), briefY: missionIni.getNumber('LS800BriefLocY') + 40 });
await retain('presentation.json', jsonBytes(presentation));
const score = JSON.parse(await readFile(path.join(root, '.local/campaign/ra2/sov01t/score-presentation.json'), 'utf8'));
score.mission = mission; await retain('score-presentation.json', jsonBytes(score));
const provenance = { schemaVersion: 1, originalInstallationReadOnly: true, archives, members,
    excluded: ['loose overrides', 'CnCNet archives and patch rules', 'Ares/Phobos extensions'],
    catalog: { filename: 'mapsel.ini', progression: 'Archived Scenario order; legacy Basic.NextScenario is not routing' },
    mediaIndexPolicy: 'Zero-based ordinal of the archived art.ini Movies list, independent of the INI key labels' };
const provenanceBytes = jsonBytes(provenance); await retain('provenance.json', provenanceBytes);
const manifest = { schemaVersion: 1, edition: 'ra2', mission, catalog, files, media, provenanceDigest: sha(provenanceBytes) };
for (const entry of previous?.files ?? []) if (/^(interface-|catalog-)/.test(entry.name) && !files.some(file => file.name === entry.name)) {
    if (!/^(interface-[a-z0-9-]+\.(json|png|svg)|catalog-[a-z0-9]+\.(shp|pal|pcx|ini))$/.test(entry.name)
        || !/^\/local-campaign\/ra2\/sov0[12]t\/[a-z0-9.-]+$/.test(entry.route)) throw new Error('Invalid retained interface route');
    const retained = await readFile(path.join(root, '.local/campaign', entry.route.slice('/local-campaign/'.length)));
    if (retained.length !== entry.bytes || sha(retained) !== entry.sha256) throw new Error('Retained interface identity mismatch');
    files.push(entry);
}
await writeFile(path.join(output, 'manifest.json'), jsonBytes(manifest));
await writeFile(path.join(evidence, 'receipt.json'), jsonBytes({ status: 'PREPARED_NOT_GAMEPLAY_ACCEPTANCE',
    source: files[0], media, sourceArchives: archives, presentation: presentation.sprites.mission }));
console.log(JSON.stringify({ output, files: files.length, media: media.map(item => [item.name, item.movieIndex, item.durationSeconds]) }));
