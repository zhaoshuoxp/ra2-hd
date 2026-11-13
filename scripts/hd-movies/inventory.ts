// Inventory native identities and actual source-map references without extracting retail movies.
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { campaignMediaReferences } from '../../src/data/campaign/CampaignMedia';
import { readCampaignCatalog } from '../../src/data/campaign/CampaignCatalog';
import { campaignSubtitleTimings } from '../../src/gui/campaign/CampaignSubtitleTracks';
import { retailIni, retailMember, requiredBytes } from '../test-support/resources';
import { parseMix } from '../../src/offline/retail';

const root = path.resolve(import.meta.dir, '../..');
const output = path.resolve(process.argv.find(arg => arg.startsWith('--output='))?.slice(9) ?? '.artifacts/hd-movies/inventory.json');
const decode = process.argv.includes('--decode');
const installation = path.resolve(root, '../Resource/Command and Conquer Red Alert II');
const resourceRoot = path.resolve(process.env.RA2_TEST_RESOURCE_ROOT ?? path.join(root, '.local'));
const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
async function fileHash(file: string) {
    const digest = createHash('sha256');
    for await (const bytes of createReadStream(file)) digest.update(bytes);
    return digest.digest('hex');
}
const libraryFile = path.join(resourceRoot, 'media/movie-library-v51/catalog.json');
const libraryBytes = await fs.readFile(libraryFile), library = JSON.parse(libraryBytes.toString());
if (library.schema !== 'original-movie-library-v1') throw Error('Unrecognized original movie catalog');
const archiveNames = await fs.readdir(installation);
const resolveArchive = (name: string) => {
    const matches = archiveNames.filter(file => file.toLowerCase() === name);
    if (matches.length !== 1) throw Error('Ambiguous original archive: ' + name);
    return path.join(installation, matches[0]);
};
const references = new Map<string, any[]>(), prepared = new Map<string, any[]>(), missions: any[] = [];
const captionSources = new Map<string, any>(), originals = new Map<string, any>(), archives: any[] = [];
for (const edition of ['ra2', 'yr'] as const) {
    const art = retailIni(edition, 'art');
    const catalog = readCampaignCatalog(edition, retailMember(edition, edition === 'yr' ? 'mapselmd.ini' : 'mapsel.ini').file.readAsString());
    const maps = edition === 'yr' ? [parseMix(await fs.readFile(resolveArchive('mapsmd03.mix')), 'mapsmd03.mix')]
        : ['maps01.mix', 'maps02.mix'].map(name => parseMix(requiredBytes('assets/ra2/' + name), name));
    for (const entry of catalog) {
        const source = maps.find(archive => archive.containsFile(entry.filename));
        if (!source) throw Error('Original map missing: ' + entry.filename);
        const bytes = source.openFile(entry.filename).getBytes();
        const definition = new CampaignDefinition(edition, entry.filename, new TextDecoder().decode(bytes));
        const refs = campaignMediaReferences(definition, art);
        const directory = entry.filename.replace(/\.map$/, '');
        const manifestBytes = await fs.readFile(path.join(resourceRoot, 'campaign', edition, directory, 'manifest.json'));
        const manifest = JSON.parse(manifestBytes.toString());
        if (manifest.files.find((file: any) => file.name === entry.filename)?.sha256 !== hash(bytes)) throw Error('Prepared map differs from original');
        for (const ref of refs) {
            const key = edition + ':' + ref.name;
            references.set(key, [...references.get(key) ?? [], { mission: entry.filename, ...ref }]);
        }
        for (const media of manifest.media) {
            const key = edition + ':' + media.name;
            const file = manifest.files.find((entry: any) => entry.name === media.file);
            if (!file) throw Error('Prepared movie fallback missing');
            prepared.set(key, [...prepared.get(key) ?? [], { mission: entry.filename, binding: media.binding,
                use: media.use, movieIndex: media.movieIndex, file, originalSha256: media.sha256 }]);
        }
        missions.push({ edition, mission: entry.filename, sourceSha256: hash(bytes),
            preparedManifestSha256: hash(manifestBytes), references: refs });
    }
    const subtitleName = edition === 'yr' ? 'subtitlemd.txt' : 'subtitle.txt';
    const subtitleBytes = await fs.readFile(path.join(installation, subtitleName));
    const subtitleText = new TextDecoder(subtitleBytes[0] === 255 ? 'utf-16le' : 'utf-8').decode(subtitleBytes);
    const seconds = (value: string) => value.split(':').reduce((sum, part, index) => sum + Number(part) * [3600, 60, 1, 1 / 60][index], 0);
    for (const block of subtitleText.matchAll(/(?:^|\n)BeginMovie\s+(\S+)([\s\S]*?)EndMovie/gi)) {
        const cues = [...block[2].matchAll(/<Time=([\d:]+),\s*Duration=([\d:]+),[^\r\n]*?Text="([^"]*)">/g)]
            .map(match => ({ start: seconds(match[1]), duration: seconds(match[2]), textSha256: hash(match[3]) }));
        captionSources.set(edition + ':' + block[1].toLowerCase().replace(/\.bik$/, ''), {
            file: subtitleName, fileSha256: hash(subtitleBytes), clock: 'seconds-with-sixtieths', cues,
        });
    }
}
const aliases: Record<string, { member: string; executable: string }> = {
    'ra2:archive-87500336': { member: 'emprtrlr.bik', executable: 'game.exe' },
    'ra2:archive-1e7d27f9': { member: 'westlogo.bik', executable: 'game.exe' },
    'yr:archive-2e440187': { member: 'renegade.bik', executable: 'gamemd.exe' },
};
for (const [edition, name] of [['ra2', 'movies01.mix'], ['ra2', 'movies02.mix'], ['yr', 'movmd03.mix']]) {
    const filename = resolveArchive(name), bytes = await fs.readFile(filename), mix = parseMix(bytes, name);
    const expected = library.provenance.originalArchives.find((archive: any) => archive.name === name);
    if (!expected || hash(bytes) !== expected.sha256 || bytes.length !== expected.bytes) throw Error('Original movie archive differs');
    archives.push({ name, bytes: bytes.length, sha256: expected.sha256 });
    for (const movie of library.entries.filter((entry: any) => entry.edition === edition
        && entry.original.archives.some((archive: any) => archive.name === name))) {
        const key = edition + ':' + movie.id, member = movie.original.member ?? aliases[key]?.member;
        if (!member) throw Error('Unidentified original movie member');
        const source = mix.openFile(member).getBytes();
        if (hash(source) !== movie.original.sha256 || source.length !== movie.original.bytes) throw Error('Original movie member differs');
        const view = new DataView(source.buffer, source.byteOffset, source.byteLength);
        const frames = view.getUint32(8, true), width = view.getUint32(20, true), height = view.getUint32(24, true);
        const numerator = view.getUint32(28, true), denominator = view.getUint32(32, true), audioTracks = view.getUint32(40, true);
        if (!frames || !numerator || !denominator || width !== movie.width || height !== movie.height) throw Error('Original movie header differs');
        originals.set(key, { member, bytes: source.length, sha256: movie.original.sha256,
            archiveNames: movie.original.archives.map((archive: any) => archive.name),
            ...(aliases[key] ? { aliasProof: { executable: aliases[key].executable, method: 'Executable literal, exact MIX filename hash and successful member read' } } : {}),
            video: { codec: 'binkvideo', width, height, displayAspectRatio: `${width}:${height}`,
                activePictureBounds: 'UNKNOWN_PENDING_VISUAL_INSPECTION',
                frames, fpsNumerator: numerator, fpsDenominator: denominator, durationSeconds: frames * denominator / numerator },
            audio: { tracks: audioTracks, language: 'en', languageVerification: 'LOCAL_ENGLISH_INSTALLATION_REPRESENTATIVE_AUDITION_PENDING',
                streams: movie.original.audio ?? [], timestampBasis: 'original-video-seconds' } });
    }
}
const ffmpeg = process.env.RA2_CAMPAIGN_FFMPEG ?? execFileSync(path.join(resourceRoot, 'tooling/campaign-media/bin/python'),
    ['-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'], { encoding: 'utf8' }).trim();
const decoderVersion = execFileSync(ffmpeg, ['-version'], { encoding: 'utf8' }).split('\n')[0];
function inspect(file: string, fullDecode = false): Promise<any> {
    return new Promise((resolve, reject) => {
        const args = ['-nostdin', '-hide_banner', '-threads', '2', '-i', file];
        if (fullDecode) args.push('-v', 'error', '-xerror', '-map', '0:v:0', '-map', '0:a?', '-f', 'null', '-', '-progress', 'pipe:1', '-nostats');
        const child = spawn(ffmpeg, args), stdout: Buffer[] = [], stderr: Buffer[] = [];
        child.stdout.on('data', chunk => stdout.push(chunk)); child.stderr.on('data', chunk => stderr.push(chunk));
        child.on('error', reject);
        child.on('close', code => {
            const diagnostic = Buffer.concat(stderr).toString(), progress = Buffer.concat(stdout).toString();
            const duration = /Duration: (\d+):(\d+):([\d.]+)/.exec(diagnostic);
            const dimensions = /Video: ([^,]+),.*?\b(\d+)x(\d+)\b[^\n]*?([\d.]+) fps/.exec(diagnostic);
            if (fullDecode && code !== 0) { reject(Error('Movie decode failed: ' + path.basename(file) + ': ' + diagnostic.slice(-2000))); return; }
            resolve({ metadata: { durationSeconds: duration ? Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]) : null,
                video: dimensions ? { codec: dimensions[1], width: Number(dimensions[2]), height: Number(dimensions[3]), fps: Number(dimensions[4]) } : null,
                audio: [...diagnostic.matchAll(/Stream #0:(\d+).*?Audio: ([^\n]+)/g)].map(match => ({ stream: Number(match[1]), format: match[2] })) },
                decode: fullDecode ? { status: 'PASS', frames: Number([...progress.matchAll(/^frame=(\d+)/gm)].at(-1)?.[1] ?? 0),
                    lastTimeSeconds: Number([...progress.matchAll(/^out_time_us=(\d+)/gm)].at(-1)?.[1] ?? 0) / 1e6,
                    diagnostic: diagnostic.trim().slice(-1000) } : { status: 'NOT_RUN_METADATA_ONLY' } });
        });
    });
}
const inspections = new Map<string, any>(), rows: any[] = [];
for (const movie of library.entries) {
    const key = movie.edition + ':' + movie.id, original = originals.get(key);
    if (!original) throw Error('Original identity is unavailable: ' + key);
    for (const binding of prepared.get(key) ?? []) if (binding.originalSha256 !== original.sha256) throw Error('Cross-edition prepared movie mismatch');
    const relative = movie.file.route.startsWith('/local-movies/') ? 'media/movie-library-v51/' + movie.file.name
        : 'campaign/' + movie.file.route.slice('/local-campaign/'.length);
    const filename = path.join(resourceRoot, relative);
    if (!inspections.has(relative)) {
        if ((await fs.stat(filename)).size !== movie.file.bytes || await fileHash(filename) !== movie.file.sha256) throw Error('Converted original identity differs');
        // Header metadata and full decoding are separate evidence. Do both when requested.
        const result = await inspect(filename);
        if (decode) result.decode = (await inspect(filename, true)).decode;
        inspections.set(relative, result);
    }
    const timings = campaignSubtitleTimings[(movie.edition === 'yr' ? 'yr_' : '') + movie.id] ?? [];
    const sourceCaptions = captionSources.get(key);
    rows.push({ identity: key, edition: movie.edition, id: movie.id, role: movie.role, original,
        sourceReferences: references.get(key) ?? [], runtimeBindings: prepared.get(key) ?? [],
        libraryRoute: movie.file.route, fallback: { ...movie.file, localPath: relative, ...inspections.get(relative) },
        subtitles: { renderer: timings.length ? 'game-localized-captions' : 'none', runtimeCueCount: timings.length,
            runtimeTimelineSha256: hash(JSON.stringify(timings)), sourceCueCount: sourceCaptions?.cues.length ?? 0,
            source: sourceCaptions ?? null, languages: timings.length ? ['en-US', 'zh-CN', 'zh-TW'] : [],
            englishPolicy: 'Existing translation of supplied source captions; not a verbatim audio transcription',
            burnedIn: 'UNKNOWN_PENDING_VISUAL_INSPECTION' },
        sharedContentWith: library.entries.filter((other: any) => other !== movie && other.original.sha256 === original.sha256)
            .map((other: any) => other.edition + ':' + other.id),
        sharedContentBasis: 'byte-identical-raw-source-only', visualContentSharing: 'UNASSESSED',
        hd: { source: null, match: 'UNASSESSED', production: 'NOT_PRODUCED', runtime: 'ORIGINAL', visualAcceptance: 'PENDING' } });
    console.log(JSON.stringify({ identity: key, originalFrames: original.video.frames, decode: inspections.get(relative).decode.status }));
}
const collisions = rows.filter(row => row.edition === 'ra2').flatMap(row => {
    const other = rows.find(other => other.edition === 'yr' && other.id === row.id);
    return other ? [{ id: row.id, identical: row.original.sha256 === other.original.sha256,
        ra2Sha256: row.original.sha256, yrSha256: other.original.sha256 }] : [];
});
const inventory = { schema: 'hd-movie-inventory-v1', stage: 'ORIGINAL_SOURCE_BASELINE_NO_HD_PAYLOAD_ACQUIRED',
    baselineHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    originalCatalogSha256: hash(libraryBytes), decoderVersion, archives, missions, movies: rows, sameNameAcrossEditions: collisions,
    counts: { originalIdentities: rows.length, originalByEdition: Object.fromEntries(['ra2', 'yr'].map(edition => [edition, rows.filter(row => row.edition === edition).length])),
        sourceMapReferences: missions.reduce((sum, mission) => sum + mission.references.length, 0),
        sourceReferencedIdentities: rows.filter(row => row.sourceReferences.length).length,
        runtimeBoundIdentities: rows.filter(row => row.runtimeBindings.length).length,
        hdProduced: 0, hdSelected: 0, userVisualAccepted: 0, originalFallbacks: rows.length },
    qualifications: ['Source-map references do not prove action reachability or native playback',
        'Soviet01 retains one historical unverified radar binding; source-map counts exclude it',
        'Full decoding verifies codec integrity, not visual quality, language audition or A/V synchronization',
        'Active-picture bounds and burned-in captions still require visual inspection',
        'Source language is recorded from the local English installation; full-library audio audition is pending',
        'Windows: NOT_RUN_ON_THIS_MAC'] };
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, JSON.stringify(inventory, null, 2) + '\n');
console.log(JSON.stringify({ output, counts: inventory.counts }));
