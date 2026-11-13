// Read allowlisted archive members. Never mount or modify loose installation files.
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { readCampaignCatalog } from '../../src/data/campaign/CampaignCatalog';
import { IniFile } from '../../src/data/IniFile';
import { retailTree, resolveMember, parseMix } from '../../src/offline/retail';
import { editionRetailTree } from '../../src/offline/editionRetail';
import { prepareCampaignPresentation } from './presentation-resources';
import { prepareCampaignScore } from './score-resources';

const root = path.resolve(import.meta.dir, '../..');
const sourceIndex = process.argv.indexOf('--source');
const installation = path.resolve(sourceIndex < 0 ? '../Resource/Command and Conquer Red Alert II' : process.argv[sourceIndex + 1]);
const output = path.join(root, '.local/campaign/ra2/sov01t');
const evidence = path.join(root, '.artifacts/m3-1/preparation');
const sha = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const json = async (file: string, value: unknown) => writeFile(file, JSON.stringify(value, null, 2) + '\n');
let previous: any;
try { previous = JSON.parse(await readFile(path.join(output, 'manifest.json'), 'utf8')); }
catch (error: any) { if (error.code !== 'ENOENT') throw error; }
await mkdir(output, { recursive: true });
await mkdir(evidence, { recursive: true });
const top = new Map<string, Uint8Array>();
const sourceNames = await readdir(installation);
function sourceArchive(name: string): string {
    const matches = sourceNames.filter(file => file.toLowerCase() === name.toLowerCase());
    if (matches.length !== 1) throw new Error(`Ambiguous or missing original archive: ${name}`);
    return path.join(installation, matches[0]);
}
const archives: { name: string; bytes: number; sha256: string; priority: number; origin: string }[] = [];
for (const name of ['language.mix', 'ra2.mix', 'multi.mix', 'maps01.mix', 'maps02.mix']) {
    const imported = await readFile(path.join(root, '.local/assets/ra2', name));
    const source = sourceArchive(name);
    if (!(await stat(source)).isFile() || await realpath(source) !== source) throw new Error(`Unsafe original archive: ${source}`);
    const original = await readFile(source);
    if (sha(original) !== sha(imported)) throw new Error(`Imported/original archive mismatch: ${name}`);
    top.set(name, imported);
    archives.push({ name, bytes: imported.length, sha256: sha(imported), priority: archives.length, origin: 'allowlisted-retail-archive' });
}
const tree = retailTree(top);
const members: unknown[] = [];
const files: { name: string; bytes: number; sha256: string; route: string }[] = [];
async function retain(name: string, bytes: Uint8Array): Promise<void> {
    const file = path.join(output, name);
    try { if (sha(await readFile(file)) !== sha(bytes)) throw new Error(`Existing prepared resource differs: ${name}`); }
    catch (error: any) { if (error.code !== 'ENOENT') throw error; await writeFile(file, bytes, { flag: 'wx' }); }
    files.push({ name, bytes: bytes.length, sha256: sha(bytes), route: `/local-campaign/ra2/sov01t/${name}` });
}
function member(name: string) {
    const resolved = resolveMember(tree, name);
    const bytes = resolved.file.getBytes();
    members.push({ name, selected: resolved.source, memberId: resolved.memberId, bytes: bytes.length, sha256: sha(bytes),
        occurrences: tree.filter(item => item.mix.containsFile(name)).map(item => ({ source: item.path, sha256: sha(item.mix.openFile(name).getBytes()) })) });
    return bytes;
}
const mapBytes = member('sov01t.map');
await retain('sov01t.map', mapBytes);
const definition = new CampaignDefinition('ra2', 'sov01t.map', new TextDecoder().decode(mapBytes));
definition.assertValid();
const selection = member('mapsel.ini');
const catalog = readCampaignCatalog('ra2', new TextDecoder().decode(selection));
if (!catalog.some(entry => entry.filename === 'sov01t.map')) throw new Error('Soviet 01 absent from original selection catalog');
for (const name of ['mapsel.ini', 'battle.ini', 'mission.ini']) {
    const bytes = name === 'mapsel.ini' ? selection : member(name);
    await retain(name, bytes);
}
const eva = new IniFile(new TextDecoder().decode(member('eva.ini')));
const speechNames = new Set([...definition.triggers.values()].flatMap(trigger => trigger.actions)
    .filter(action => action.opcode === 21).map(action => action.params[1]));
const speech = [...speechNames].map(name => {
    const spec = eva.getSection(name);
    if (!spec) throw new Error(`Missing speech spec: ${name}`);
    const original = spec.getString('Russian') + '.wav';
    const bytes = member(original);
    return { name, original, bytes: bytes.length, sha256: sha(bytes), textAvailable: Boolean(spec.getString('Text')), use: 'speech',
        language: 'archive-declared-localization; not inferred from English EVA text' };
});
const moviesPath = sourceArchive('movies02.mix');
if (await realpath(moviesPath) !== moviesPath || !(await stat(moviesPath)).isFile()) throw new Error('Unsafe movies archive');
const movieBytes = await readFile(moviesPath);
const movies = parseMix(movieBytes, 'movies02.mix');
archives.push({ name: 'movies02.mix', bytes: movieBytes.length, sha256: sha(movieBytes), priority: archives.length, origin: 'explicit-media-archive-only' });
const media: unknown[] = [];
const python = path.join(root, '.artifacts/m3-1/media-tools/bin/python');
const ffmpeg = process.env.RA2_M3_FFMPEG || execFileSync(python, ['-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'], { encoding: 'utf8' }).trim();
const converterVersion = execFileSync(ffmpeg, ['-version'], { encoding: 'utf8' }).split('\n')[0];
for (const [name, use, binding] of [
    [definition.ini.getSection('Basic')!.getString('Intro').toLowerCase(), 'fullscreen-intro', 'Basic.Intro'],
    ['s01_p01e', 'transmission-candidate', 'Art.Movies; trigger binding unverified'],
]) {
    const original = name + '.bik';
    const bytes = movies.openFile(original).getBytes();
    const sourceFile = path.join(output, original);
    await retain(original, bytes);
    const converted = name + '.webm';
    const target = path.join(output, converted);
    const args = ['-nostdin', '-y', '-i', sourceFile, '-map', '0:v:0', '-map', '0:a?', '-c:v', 'libvpx-vp9', '-crf', '20',
        '-b:v', '0', '-pix_fmt', 'yuv420p', '-c:a', 'libopus', '-b:a', '128k', target];
    const portableArgs = args.map(value => value === sourceFile ? original : value === target ? converted : value);
    try {
        await stat(target);
        const old = previous?.media.find((entry: any) => entry.original === original);
        const oldFile = previous?.files.find((entry: any) => entry.name === converted);
        if (!old || old.sha256 !== sha(bytes) || old.conversion.converterVersion !== converterVersion
            || JSON.stringify(old.conversion.args) !== JSON.stringify(portableArgs)
            || oldFile?.sha256 !== sha(await readFile(target))) throw new Error(`Unpinned or incompatible media cache: ${converted}`);
    }
    catch (error: any) {
        if (error.code !== 'ENOENT') throw error;
        const conversion = spawnSync(ffmpeg, args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
        await writeFile(path.join(evidence, `${name}-conversion.log`), conversion.stderr);
        if (conversion.status !== 0) throw new Error(`Video conversion failed: ${original}`);
    }
    await retain(converted, await readFile(target));
    const probe = spawnSync(ffmpeg, ['-hide_banner', '-i', sourceFile, '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    await writeFile(path.join(evidence, `${name}-source-probe.log`), probe.stderr);
    const sourceProbe = probe.stderr.split('Stream mapping:')[0];
    const duration = /Duration: (\d+):(\d+):([\d.]+)/.exec(sourceProbe);
    const dimensions = /Video:.*?\b(\d+)x(\d+)\b/.exec(sourceProbe);
    const audio = [...sourceProbe.matchAll(/Stream #0:(\d+).*?Audio: ([^\n]+)/g)].map(match => ({ stream: Number(match[1]), format: match[2] }));
    if (probe.status !== 0 || !duration || !dimensions || !audio.length) throw new Error(`Unverified movie audio/video: ${original}`);
    media.push({ edition: 'ra2', name, original, use, binding, file: converted, source: 'movies02.mix', sha256: sha(bytes),
        width: Number(dimensions[1]), height: Number(dimensions[2]), durationSeconds: Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]),
        audio, language: 'embedded original audio; listening validation pending', hdCandidate: null, fallback: converted,
        conversion: { converterVersion, args: portableArgs,
            policy: 'VP9 + Opus WebM; original frame rate, duration and aspect ratio; no cropping, scaling or audio removal' } });
}
const yrTop = new Map<string, Uint8Array>(top);
for (const name of ['expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix']) yrTop.set(name, await readFile(path.join(root, '.local/assets/yr', name)));
const yrTree = editionRetailTree(yrTop, 'yr');
const yrCatalogs = ['battlemd.ini', 'missionmd.ini', 'mapselmd.ini'].map(name => {
    try { const resolved = resolveMember(yrTree, name); return { name, source: resolved.source, sha256: sha(resolved.file.getBytes()), present: true }; }
    catch { return { name, present: false }; }
});
const editor = path.join(installation, 'Tools/Map Editor/FA2SP/FAData.ini');
const provenance = { schemaVersion: 1, baseline: execFileSync('git', ['merge-base', 'HEAD', 'main'], { cwd: root, encoding: 'utf8' }).trim(),
    archivePriority: archives, members, excluded: ['loose INI overrides', 'CnCNet archives', 'Ares/Phobos overlays', 'Windows executables and DLLs'],
    originalInstallationReadOnly: true, sourceEditor: { path: path.relative(installation, editor), sha256: sha(await readFile(editor)),
        note: 'Vanilla opcode descriptions only; extension entries are not RA2 capabilities' },
    yr: { status: 'CATALOG_INSPECTION_ONLY', catalogs: yrCatalogs, implementation: 'NOT_IMPLEMENTED',
        needs: ['edition-specific catalogs/rules/media', 'YR-only trigger actions', 'YR house and ownership mechanics'] } };
await json(path.join(output, 'provenance.json'), provenance);
const provenanceBytes = await readFile(path.join(output, 'provenance.json'));
await retain('provenance.json', provenanceBytes);
files.push(await prepareCampaignPresentation(root));
files.push(await prepareCampaignScore(root));
await json(path.join(output, 'manifest.json'), { schemaVersion: 1, edition: 'ra2', mission: 'sov01t.map', files,
    catalog, media, provenanceDigest: sha(provenanceBytes) });
await json(path.join(evidence, 'report.json'), { schemaVersion: 1, provenance, catalog,
    counts: { triggers: definition.triggers.size, teams: definition.teams.size, taskForces: definition.taskForces.size,
        scripts: definition.scripts.size, houses: definition.houses.size }, syntaxDiagnostics: definition.diagnostics, speech, media,
    status: 'PREPARED_NOT_PLAYABLE_ACCEPTANCE', copyrights: 'Original payload stays in ignored local resources; no redistribution.' });
console.log(JSON.stringify({ output, files: files.length, speech: speech.length, movies: media.length, status: 'PREPARED_NOT_PLAYABLE_ACCEPTANCE' }));
