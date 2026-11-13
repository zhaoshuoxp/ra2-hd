import { mkdir, readFile, readdir, realpath, stat, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { IniFile } from '../../src/data/IniFile';
import { MixEntry } from '../../src/data/MixEntry';
import { parseMix } from '../../src/offline/retail';
import { retailMember } from '../test-support/resources';
import { originalMovieBindings } from './movie-bindings';

const root = path.resolve(import.meta.dir, '../..');
const installation = path.resolve(root, '../Resource/Command and Conquer Red Alert II');
const output = path.join(root, '.local/media/movie-library-v51');
const evidence = path.join(root, '.artifacts/campaign-completion/feedback-v51-r1/movie-preparation');
await mkdir(output, { recursive: true }); await mkdir(evidence, { recursive: true });
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const writeJson = (file: string, value: unknown) => writeFile(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const candidates = new Map<number, string>(), reusable = new Map<string, any>();
const { labels, expansionMapArchiveSha256 } = await originalMovieBindings(root);
for (const [edition, filename] of [['ra2', 'art.ini'], ['yr', 'artmd.ini']] as const) {
    const art = new IniFile(retailMember(edition, filename).file.readAsString());
    for (const value of art.getSection('Movies')!.entries.values()) {
        const name = String(value).toLowerCase(); candidates.set(MixEntry.hashFilename(name + '.bik'), name);
    }
}
for (const directory of await readdir(path.join(root, '.local/campaign/ra2'))) {
    const manifest = JSON.parse(await readFile(path.join(root, '.local/campaign/ra2', directory, 'manifest.json'), 'utf8'));
    for (const movie of manifest.media) {
        const file = manifest.files.find((entry: any) => entry.name === movie.file);
        if (!file) throw Error('Prepared original movie has no file');
        const bytes = await readFile(path.join(root, '.local/campaign', ...file.route.split('/').slice(2)));
        if (bytes.length !== file.bytes || sha(bytes) !== file.sha256) throw Error('Existing movie identity mismatch');
        reusable.set(movie.sha256, { file, movie });
    }
}
const converter = process.env.RA2_CAMPAIGN_FFMPEG ?? execFileSync(path.join(root, '.local/tooling/campaign-media/bin/python'),
    ['-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'], { encoding: 'utf8' }).trim();
const converterVersion = execFileSync(converter, ['-version'], { encoding: 'utf8' }).split('\n')[0];
const files = await readdir(installation), entries: any[] = [], archives: any[] = [], unknown: any[] = [];
for (const [archiveName, edition] of [['movies01.mix', 'ra2'], ['movies02.mix', 'ra2'], ['movmd03.mix', 'yr']]) {
    const matches = files.filter(name => name.toLowerCase() === archiveName);
    if (matches.length !== 1) throw Error('Ambiguous original movie archive: ' + archiveName);
    const originalFile = path.join(installation, matches[0]);
    if (await realpath(originalFile) !== originalFile) throw Error('Original movie archive must be a regular local file');
    const bytes = await readFile(originalFile), archive = parseMix(bytes, archiveName);
    const archiveIdentity = { name: archiveName, bytes: bytes.length, sha256: sha(bytes) }; archives.push(archiveIdentity);
    for (const entry of archive.getEntries()) {
        const data = bytes.subarray((archive as any).dataStart + entry.offset, (archive as any).dataStart + entry.offset + entry.length);
        if (data.subarray(0, 3).toString() !== 'BIK') continue;
        const name = candidates.get(entry.hash) ?? `archive-${entry.hash.toString(16).padStart(8, '0')}`;
        if (!candidates.has(entry.hash)) unknown.push({ archive: archiveName, mixHash: entry.hash, sourceSha256: sha(data) });
        const sourceSha256 = sha(data), duplicate = entries.find(item => item.edition === edition && item.id === name);
        if (duplicate) {
            if (duplicate.original.sha256 !== sourceSha256) throw Error('Conflicting original disc movie: ' + name);
            duplicate.original.archives.push(archiveIdentity); continue;
        }
        let prepared = reusable.get(sourceSha256), metadata: any;
        if (prepared) metadata = prepared.movie;
        else {
            const sourceFile = path.join(evidence, `${edition}-${name}.bik`);
            await writeFile(sourceFile, data, { flag: 'wx' });
            const fileName = `${edition}-${name}-${sourceSha256.slice(0, 12)}.webm`, target = path.join(output, fileName);
            const probe = spawnSync(converter, ['-hide_banner', '-i', sourceFile], { encoding: 'utf8' }).stderr;
            const duration = /Duration: (\d+):(\d+):([\d.]+)/.exec(probe), size = /Video:.*?\b(\d+)x(\d+)\b/.exec(probe);
            if (!duration || !size) throw Error('Original Bink metadata unavailable: ' + name);
            let present = false;
            try { present = (await stat(target)).isFile(); } catch (error: any) { if (error.code !== 'ENOENT') throw error; }
            if (!present) {
                const conversion = spawnSync(converter, ['-nostdin', '-n', '-i', sourceFile, '-map', '0:v:0', '-map', '0:a?',
                    '-c:v', 'libvpx-vp9', '-crf', '20', '-b:v', '0', '-threads', '2', '-pix_fmt', 'yuv420p',
                    '-c:a', 'libopus', '-b:a', '128k', target], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
                await writeFile(path.join(evidence, `${edition}-${name}-conversion.log`), conversion.stderr);
                if (conversion.status !== 0) throw Error('Original movie conversion failed: ' + name);
            }
            const converted = await readFile(target);
            const decoded = spawnSync(converter, ['-nostdin', '-v', 'error', '-i', target,
                '-map', '0:v:0', '-map', '0:a?', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1024 * 1024 });
            if (decoded.status !== 0) throw Error('Converted movie decode failed: ' + name + ': ' + decoded.stderr);
            metadata = { width: Number(size[1]), height: Number(size[2]),
                durationSeconds: Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]),
                audio: [...probe.matchAll(/Stream #0:(\d+).*?Audio: ([^\n]+)/g)].map(match => ({ stream: Number(match[1]), format: match[2] })) };
            prepared = { file: { name: fileName, route: '/local-movies/' + fileName, bytes: converted.length, sha256: sha(converted) }, movie: metadata };
            reusable.set(sourceSha256, prepared); await unlink(sourceFile);
        }
        const intro = name === 'a00_f00e';
        entries.push({ id: name, edition, ...labels.get(edition + ':' + name),
            ...(intro ? { role: 'introduction', titleKey: edition === 'ra2' ? 'HD:EditionRa2' : 'HD:EditionYr' } : {}),
            role: intro ? 'introduction' : labels.get(edition + ':' + name)?.role ?? 'story',
            file: prepared.file, width: metadata.width, height: metadata.height, durationSeconds: metadata.durationSeconds,
            original: { member: candidates.has(entry.hash) ? name + '.bik' : null, mixHash: entry.hash,
                sha256: sourceSha256, bytes: data.length, archives: [archiveIdentity], audio: metadata.audio },
            fallback: 'converted-original', hdCandidate: null });
        console.log(JSON.stringify({ edition, movie: name, seconds: metadata.durationSeconds, reusedCampaignFile: prepared.file.route.startsWith('/local-campaign/') }));
    }
}
for (const edition of ['ra2', 'yr']) if (!entries.some(entry => entry.edition === edition && entry.role === 'introduction')) throw Error('Original edition introduction is missing');
const catalog = { schema: 'original-movie-library-v1', revision: 'movie-library-v51-r1', entries,
    provenance: { originalArchives: archives, expansionMapArchiveSha256, converterVersion, policy: 'Original Bink payloads only; exact source hashes, native frame rate/aspect/duration and all original audio streams. VP9 CRF20 + Opus128k. No loose patch media, new campaign availability, crop or scale.',
        unidentifiedOriginalNames: unknown } };
await writeJson(path.join(output, 'catalog.json'), catalog);
await writeJson(path.join(evidence, 'receipt.json'), { status: 'PASS_PREPARED_ORIGINAL_EDITION_MOVIE_LIBRARY', catalogSha256: sha(Buffer.from(JSON.stringify(catalog, null, 2) + '\n')),
    entries: entries.length, editions: Object.fromEntries(['ra2', 'yr'].map(edition => [edition, entries.filter(entry => entry.edition === edition).length])),
    introductions: entries.filter(entry => entry.role === 'introduction'), unidentifiedOriginalNames: unknown });
