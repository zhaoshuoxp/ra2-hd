import { mkdir, readFile, writeFile, link, stat } from 'node:fs/promises';
import path from 'node:path';
import { CampaignDefinition } from '../../src/data/campaign/CampaignDefinition';
import { campaignMediaReferences } from '../../src/data/campaign/CampaignMedia';
import { readCampaignCatalog } from '../../src/data/campaign/CampaignCatalog';
import { parseMix } from '../../src/offline/retail';
import { retailTreeFor, retailMember, retailIni, sha256 } from '../test-support/resources';
import { buildCampaignPresentation } from '../m3-1/presentation-resources';
import { buildCampaignScore } from '../m3-1/score-resources';

const root = path.resolve(import.meta.dir, '../..');
const history = path.resolve(root, '../project-history/yr-campaign-implementation-20261104');
const inventory = JSON.parse(await readFile(path.join(history, 'source-inventory.json'), 'utf8'));
const mapBytes = await readFile(inventory.archive.file);
if (mapBytes.length !== inventory.archive.bytes || sha256(mapBytes) !== inventory.archive.sha256) throw Error('Original YR maps changed');
const maps = parseMix(mapBytes, 'mapsmd03.mix');
const selection = retailMember('yr', 'mapselmd.ini', inventory.catalog.sha256);
const catalog = readCampaignCatalog('yr', selection.file.readAsString());
const tree = retailTreeFor('yr'), art = retailIni('yr', 'art');
const libraryDirectory = path.join(root, '.local/media/movie-library-v51');
const libraryBytes = await readFile(path.join(libraryDirectory, 'catalog.json'));
const library = JSON.parse(libraryBytes.toString());
if (library.schema !== 'original-movie-library-v1') throw Error('Unrecognized original movie library');
const movieIdentity = library.provenance.originalArchives.find((archive: any) => archive.name === 'movmd03.mix');
const movieBytes = await readFile(path.resolve(root, '../Resource/Command and Conquer Red Alert II/movmd03.mix'));
if (!movieIdentity || sha256(movieBytes) !== movieIdentity.sha256 || movieBytes.length !== movieIdentity.bytes) throw Error('Original YR movies changed');
const originalMovies = parseMix(movieBytes, 'movmd03.mix');
const selected = process.argv.slice(2);
if (!selected.length) throw Error('Specify original mission filenames or --all; preparation never changes playability');
const missions = selected.includes('--all') ? catalog.map(entry => entry.filename) : selected;
if (missions.some(mission => !catalog.some(entry => entry.filename === mission))) throw Error('Mission absent from original YR catalog');
const receipts: any[] = [];
for (const mission of missions) {
    const output = path.join(root, '.local/campaign/yr', mission.slice(0, -4));
    try {
        await stat(path.join(output, 'manifest.json'));
        console.log(JSON.stringify({ mission, status: 'EXISTING_PREPARATION_RETAINED' })); continue;
    } catch (error: any) { if (error.code !== 'ENOENT') throw error; }
    await mkdir(output, { recursive: true });
    const files: any[] = [], members: any[] = [];
    const retain = async (name: string, bytes: Uint8Array, originalFile?: string) => {
        const target = path.join(output, name), hash = sha256(bytes);
        let exists = false;
        try {
            const previous = await readFile(target);
            if (sha256(previous) !== hash || previous.length !== bytes.length) throw Error('Existing preparation differs: ' + target);
            exists = true;
        } catch (error: any) { if (error.code !== 'ENOENT') throw error; }
        if (!exists) {
            if (originalFile) await link(originalFile, target);
            else await writeFile(target, bytes, { flag: 'wx' });
        }
        const file = { name, bytes: bytes.length, sha256: hash, route: `/local-campaign/yr/${mission.slice(0, -4)}/${name}` };
        files.push(file); return file;
    };
    const map = maps.openFile(mission), expected = inventory.rows.find((row: any) => row.filename === mission);
    if (sha256(map.getBytes()) !== expected?.source.sha256) throw Error('Original YR mission changed: ' + mission);
    await retain(mission, map.getBytes());
    const definition = new CampaignDefinition('yr', mission, map.readAsString());
    const references = new Map<string, ReturnType<typeof campaignMediaReferences>>();
    for (const reference of campaignMediaReferences(definition, art)) {
        const bindings = references.get(reference.name) ?? []; bindings.push(reference); references.set(reference.name, bindings);
    }
    const media: any[] = [];
    for (const [name, bindings] of references) {
        const movie = library.entries.find((entry: any) => entry.edition === 'yr' && entry.id === name);
        if (!movie || !originalMovies.containsFile(name + '.bik')) throw Error('Original YR movie missing: ' + name);
        const source = originalMovies.openFile(name + '.bik').getBytes();
        if (sha256(source) !== movie.original.sha256 || source.length !== movie.original.bytes
            || !movie.file.route.startsWith('/local-movies/') || path.basename(movie.file.route) !== movie.file.name) {
            throw Error('Movie library original/source mismatch: ' + name);
        }
        const originalFile = path.join(libraryDirectory, movie.file.name), converted = await readFile(originalFile);
        if (sha256(converted) !== movie.file.sha256 || converted.length !== movie.file.bytes) throw Error('Converted movie changed: ' + name);
        await retain(movie.file.name, converted, originalFile);
        members.push({ name: name + '.bik', archive: 'movmd03.mix', bytes: source.length, sha256: movie.original.sha256 });
        media.push({ name, edition: 'yr', libraryId: name, original: name + '.bik', file: movie.file.name,
            source: 'movmd03.mix', sha256: movie.original.sha256, ...bindings[0], bindings,
            ...(bindings.find(binding => binding.movieIndex !== undefined)?.movieIndex === undefined ? {}
                : { movieIndex: bindings.find(binding => binding.movieIndex !== undefined)!.movieIndex }),
            width: movie.width, height: movie.height, durationSeconds: movie.durationSeconds, audio: movie.original.audio,
            language: 'Embedded original audio', fallback: movie.file.name, hdCandidate: null,
            conversion: { policy: 'Exact existing movie-library conversion; same edition, cut, audio and bytes. Hard-linked payload, no duplicate conversion.' } });
    }
    const json = (value: unknown) => Buffer.from(JSON.stringify(value, null, 2) + '\n');
    await retain('presentation.json', json(buildCampaignPresentation(tree, mission)));
    await retain('score-presentation.json', json(buildCampaignScore(tree, mission)));
    for (const name of ['mapselmd.ini', 'missionmd.ini', 'rulesmd.ini', 'artmd.ini', 'aimd.ini']) {
        const member = retailMember('yr', name);
        members.push({ name, archive: member.source, bytes: member.file.getSize(), sha256: member.sha256 });
    }
    const provenance = await retain('provenance.json', json({ schemaVersion: 1, originalInstallationReadOnly: true,
        archive: inventory.archive, movieArchive: movieIdentity, members, movieLibrarySha256: sha256(libraryBytes),
        sourcePolicy: 'Hash-verified imported YR core and original mapsmd03.mix/movmd03.mix; loose patches and extensions excluded.',
        catalog: { filename: 'mapselmd.ini', sha256: selection.sha256, progression: 'Archived Scenario order' },
        mediaIndexPolicy: 'Zero-based ordinal in original artmd.ini Movies; edition-qualified library source and conversion.' }));
    const manifest = { schemaVersion: 1, edition: 'yr', mission, catalog, files, media, provenanceDigest: provenance.sha256 };
    await writeFile(path.join(output, 'manifest.json'), json(manifest), { flag: 'wx' });
    receipts.push({ mission, status: 'PREPARED_UNAVAILABLE_NOT_GAMEPLAY_ACCEPTANCE', source: files[0], media: media.length,
        convertedMediaPolicy: 'Canonical YR library payloads retained by hard link' });
    console.log(JSON.stringify(receipts.at(-1)));
}
if (receipts.length) await writeFile(path.join(history, 'preparation.json'), JSON.stringify(receipts, null, 2) + '\n', { flag: 'wx' });
