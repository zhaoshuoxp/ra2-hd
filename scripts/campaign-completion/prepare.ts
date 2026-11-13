import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, readFile, readdir, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { retailTree, resolveMember, parseMix } from '../../src/offline/retail';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { readCampaignCatalog } from '../../src/data/campaign/CampaignCatalog';
import { IniFile } from '../../src/data/IniFile';
import { buildCampaignPresentation } from '../m3-1/presentation-resources';
import { buildCampaignScore } from '../m3-1/score-resources';
import { campaignMediaReferences } from '../../src/data/campaign/CampaignMedia';

const root = path.resolve(import.meta.dir, '../..');
const installation = path.resolve(root, '../Resource/Command and Conquer Red Alert II');
const directory = path.join(root, '.local/campaign/ra2');
const evidence = path.resolve(root, '../project-history/ra2-campaign-completion-20261026/preparation');
const sha = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const jsonBytes = (value: unknown) => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const sourceNames = await readdir(installation);
const originalCache = new Map<string, Buffer>();

async function originalArchive(name: string): Promise<Buffer> {
    if (originalCache.has(name)) return originalCache.get(name)!;
    const names = sourceNames.filter(value => value.toLowerCase() === name);
    if (names.length !== 1) throw new Error(`Ambiguous original archive: ${name}`);
    const file = path.join(installation, names[0]);
    if (await realpath(file) !== file || !(await stat(file)).isFile()) throw new Error(`Unsafe original archive: ${name}`);
    const bytes = await readFile(file); originalCache.set(name, bytes); return bytes;
}

const top = new Map<string, Uint8Array>(), archives: any[] = [];
const receipts = await Promise.all(['core', 'campaign'].map(async name =>
    JSON.parse(await readFile(path.join(root, `.local/ra2-${name}-manifest.json`), 'utf8'))));
for (const name of ['language.mix', 'ra2.mix', 'multi.mix', 'maps01.mix', 'maps02.mix']) {
    const bytes = await readFile(path.join(root, '.local/assets/ra2', name)), digest = sha(bytes);
    const expected = receipts.flatMap(receipt => receipt.files).find(entry => entry.virtualName === name);
    if (!expected || expected.bytes !== bytes.length || expected.sha256 !== digest || sha(await originalArchive(name)) !== digest) {
        throw new Error(`Original/import/receipt mismatch: ${name}`);
    }
    top.set(name, bytes); archives.push({ name, bytes: bytes.length, sha256: digest });
}
const tree = retailTree(top), catalog = readCampaignCatalog('ra2', resolveMember(tree, 'mapsel.ini').file.readAsString());
const selected = process.argv.slice(2);
if (!selected.length) throw new Error('Specify original mission filenames or --all; preparation never changes playable availability');
const missions = selected.includes('--all') ? catalog.map(entry => entry.filename) : selected;
if (missions.some(name => !catalog.some(entry => entry.filename === name))) throw new Error('Mission is not in the original RA2 catalog');
await mkdir(evidence, { recursive: true });
await mkdir(directory, { recursive: true });
const converter = process.env.RA2_CAMPAIGN_FFMPEG ?? execFileSync(path.join(root, '.local/tooling/campaign-media/bin/python'),
    ['-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'], { encoding: 'utf8' }).trim();
const converterVersion = execFileSync(converter, ['-version'], { encoding: 'utf8' }).split('\n')[0];
const movieArchives = new Map<string, ReturnType<typeof parseMix>>();
const reusable = new Map<string, any>();
const converted = new Map<string, { file: any; media: any }>();
for (const entry of await readdir(directory, { withFileTypes: true })) if (entry.isDirectory()) {
    let manifest: any;
    try { manifest = JSON.parse(await readFile(path.join(directory, entry.name, 'manifest.json'), 'utf8')); }
    catch (error: any) { if (error.code === 'ENOENT') continue; throw error; }
    for (const file of manifest.files) if (/\.(bik|webm)$/.test(file.name)) {
        const route = /^\/local-campaign\/ra2\/((?:sov|all|trn)\d\d[tsudl])\/([a-z0-9_.-]+)$/.exec(file.route);
        if (!route || route[2] !== file.name) throw new Error('Unsafe reusable movie route');
        const bytes = await readFile(path.join(directory, route[1], file.name));
        if (bytes.length !== file.bytes || sha(bytes) !== file.sha256) throw new Error(`Reusable movie identity mismatch: ${file.route}`);
        reusable.set(`${file.name}:${file.sha256}`, file);
    }
    for (const media of manifest.media) {
        const file = manifest.files.find((file: any) => file.name === media.file);
        if (file && /^[a-f0-9]{64}$/.test(media.sha256)) converted.set(`${media.name}:${media.sha256}`, { file, media });
    }
}

for (const mission of missions) {
    const name = mission.slice(0, -4), output = path.join(directory, name);
    let previous: any;
    try { previous = JSON.parse(await readFile(path.join(output, 'manifest.json'), 'utf8')); }
    catch (error: any) { if (error.code !== 'ENOENT') throw error; }
    if (previous) {
        if (previous.edition !== 'ra2' || previous.mission !== mission) throw new Error(`Prepared mission mismatch: ${mission}`);
        console.log(JSON.stringify({ mission, status: 'EXISTING_PREPARATION_RETAINED' })); continue;
    }
    await mkdir(output, { recursive: true });
    const files: any[] = [], members: any[] = [], sourceArchives = [...archives];
    async function retain(filename: string, bytes: Uint8Array, share = false) {
        const digest = sha(bytes), existing = share && reusable.get(`${filename}:${digest}`);
        if (existing) { files.push(existing); return existing; }
        const file = path.join(output, filename);
        try { if (sha(await readFile(file)) !== digest) throw new Error(`Prepared file differs: ${file}`); }
        catch (error: any) { if (error.code !== 'ENOENT') throw error; await writeFile(file, bytes, { flag: 'wx' }); }
        const entry = { name: filename, bytes: bytes.length, sha256: digest, route: `/local-campaign/ra2/${name}/${filename}` };
        files.push(entry); if (share) reusable.set(`${filename}:${digest}`, entry); return entry;
    }
    function member(filename: string) {
        const item = resolveMember(tree, filename), bytes = item.file.getBytes();
        members.push({ name: filename, archive: item.source, bytes: bytes.length, sha256: sha(bytes) }); return bytes;
    }
    const map = member(mission); await retain(mission, map);
    const definition = new CampaignDefinition('ra2', mission, new TextDecoder().decode(map));
    member('mapsel.ini'); member('mission.ini');
    const art = new IniFile(new TextDecoder().decode(member('art.ini')));
    const references = new Map<string, ReturnType<typeof campaignMediaReferences>>();
    for (const { name, ...reference } of campaignMediaReferences(definition, art)) {
        const refs = references.get(name) ?? []; refs.push({ name, ...reference }); references.set(name, refs);
    }
    const media: any[] = [];
    for (const [movie, bindings] of references) {
        const original = movie + '.bik', filename = movie + '.webm';
        let archiveName: string | undefined, bytes: Uint8Array | undefined;
        for (const candidate of (mission.startsWith('sov') ? ['movies02.mix', 'movies01.mix'] : ['movies01.mix', 'movies02.mix'])) {
            let archive = movieArchives.get(candidate);
            if (!archive) { archive = parseMix(await originalArchive(candidate), candidate); movieArchives.set(candidate, archive); }
            if (archive.containsFile(original)) { archiveName = candidate; bytes = archive.openFile(original).getBytes(); break; }
        }
        if (!archiveName || !bytes) throw new Error(`Original movie missing: ${movie}`);
        if (!sourceArchives.some(entry => entry.name === archiveName)) {
            const archive = await originalArchive(archiveName);
            sourceArchives.push({ name: archiveName, bytes: archive.length, sha256: sha(archive) });
        }
        const source = await retain(original, bytes, true);
        const cached = converted.get(`${movie}:${sha(bytes)}`);
        if (cached) {
            files.push(cached.file);
            media.push({ ...cached.media, ...bindings[0], bindings });
            continue;
        }
        const sourcePath = path.join(directory, source.route.split('/')[3], original);
        const target = path.join(output, filename);
        const conversion = spawnSync(converter, ['-nostdin', '-n', '-i', sourcePath, '-map', '0:v:0', '-map', '0:a?',
            '-c:v', 'libvpx-vp9', '-crf', '20', '-b:v', '0', '-pix_fmt', 'yuv420p', '-c:a', 'libopus', '-b:a', '128k', target],
            { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
        await writeFile(path.join(evidence, name + '-' + movie + '-conversion.log'), conversion.stderr);
        if (conversion.status !== 0) throw new Error(`Movie conversion failed: ${movie}`);
        const convertedFile = await retain(filename, await readFile(target), true);
        const probe = spawnSync(converter, ['-hide_banner', '-i', sourcePath, '-f', 'null', '-'],
            { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
        if (probe.status !== 0) throw new Error(`Original movie probe failed: ${movie}`);
        const description = probe.stderr.split('Stream mapping:')[0];
        const duration = /Duration: (\d+):(\d+):([\d.]+)/.exec(description), size = /Video:.*?\b(\d+)x(\d+)\b/.exec(description);
        const audio = [...description.matchAll(/Stream #0:(\d+).*?Audio: ([^\n]+)/g)]
            .map(match => ({ stream: Number(match[1]), format: match[2] }));
        if (!duration || !size) throw new Error(`Incomplete movie source metadata: ${movie}`);
        media.push({ name: movie, original, file: filename, source: archiveName, sha256: sha(bytes), ...bindings[0], bindings,
            width: Number(size[1]), height: Number(size[2]),
            durationSeconds: Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]), audio,
            language: 'Embedded original audio', fallback: filename, hdCandidate: null,
            conversion: { converterVersion, policy: 'VP9 CRF20 + Opus 128k; all original audio, native frame rate/aspect/duration; no crop or scale' } });
        converted.set(`${movie}:${sha(bytes)}`, { file: convertedFile, media: media.at(-1) });
    }
    await retain('presentation.json', jsonBytes(buildCampaignPresentation(tree, mission)));
    await retain('score-presentation.json', jsonBytes(buildCampaignScore(tree, mission)));
    const provenance = jsonBytes({ schemaVersion: 1, originalInstallationReadOnly: true, archives: sourceArchives, members,
        excluded: ['loose overrides', 'CnCNet archives and patch rules', 'Ares/Phobos extensions'],
        catalog: { filename: 'mapsel.ini', progression: 'Archived Scenario order; legacy Basic.NextScenario is not routing' },
        mediaIndexPolicy: 'Zero-based ordinal of the archived art.ini Movies list, independent of the INI key labels' });
    await retain('provenance.json', provenance);
    const manifest = { schemaVersion: 1, edition: 'ra2', mission, catalog, files, media, provenanceDigest: sha(provenance) };
    await writeFile(path.join(output, 'manifest.json'), jsonBytes(manifest), { flag: 'wx' });
    await writeFile(path.join(evidence, name + '-receipt.json'), jsonBytes({ status: 'PREPARED_UNAVAILABLE_NOT_GAMEPLAY_ACCEPTANCE',
        source: files[0], media, diagnostics: definition.diagnostics, sourceArchives }));
    console.log(JSON.stringify({ mission, status: 'PREPARED_UNAVAILABLE', source: files[0].sha256, media: media.length }));
}
