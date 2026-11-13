import { readFile, writeFile, mkdir, realpath, lstat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parseMix } from '../../src/offline/retail';
import { IniFile } from '../../src/data/IniFile';
import { retailMember } from '../test-support/resources';

const root = path.resolve(import.meta.dir, '../..');
const edition = process.argv.includes('--edition=yr') ? 'yr' : 'ra2';
const archiveName = edition === 'yr' ? 'thememd.mix' : 'THEME.MIX';
const themeName = edition === 'yr' ? 'thememd.ini' : 'theme.ini';
const contractName = edition === 'yr' ? 'music-yr-contract.json' : 'music-contract.json';
const source = path.resolve(root, '../Resource/Command and Conquer Red Alert II', archiveName);
const directory = path.join(root, '.local/music', edition), manifestFile = path.join(directory, 'manifest.json');
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
async function contractFor(bytes: Uint8Array): Promise<void> {
    const manifest = JSON.parse(Buffer.from(bytes).toString());
    const value = { schema: 'original-local-music-v1', edition, manifestSha256: sha(bytes), archive: manifest.archive,
        themeIni: manifest.themeIni, files: manifest.files, tracks: manifest.tracks };
    const file = path.join(root, 'desktop', contractName), expected = JSON.stringify(value, null, 2) + '\n';
    try { if (await readFile(file, 'utf8') !== expected) throw new Error('Existing music contract differs; a new revision is required'); }
    catch (error: any) { if (error.code !== 'ENOENT') throw error; await writeFile(file, expected, { flag: 'wx' }); }
}
if (await realpath(source) !== source || !(await lstat(source)).isFile()) throw new Error('Unsafe original music archive');
const archiveBytes = await readFile(source), archiveSha256 = sha(archiveBytes), archive = parseMix(archiveBytes, archiveName);
const originalIni = retailMember(edition, themeName), ini = new IniFile(originalIni.file.readAsString());
await mkdir(directory, { recursive: true });
if (await realpath(directory) !== directory) throw new Error('Music destination must not be a symlink');
try {
    const existing = JSON.parse(await readFile(manifestFile, 'utf8'));
    if (existing.archive.sha256 !== archiveSha256 || existing.themeIni.sha256 !== originalIni.sha256) throw new Error('Prepared music source changed');
    for (const file of existing.files) if (sha(await readFile(path.join(directory, file.name))) !== file.sha256) throw new Error('Prepared music identity changed');
    await contractFor(await readFile(manifestFile));
    console.log(JSON.stringify({ status: 'REUSED_HASH_VERIFIED_MUSIC', tracks: existing.files.length }));
    process.exit(0);
} catch (error: any) { if (error.code !== 'ENOENT') throw error; }
if (edition === 'ra2') {
    const archiveCopy = path.join(root, '.local/assets/ra2/theme.mix');
    try { if (sha(await readFile(archiveCopy)) !== archiveSha256) throw new Error('Existing formal theme archive differs'); }
    catch (error: any) { if (error.code !== 'ENOENT') throw error; await writeFile(archiveCopy, archiveBytes, { flag: 'wx' }); }
}
const converter = execFileSync(path.join(root, '.local/tooling/campaign-media/bin/python'),
    ['-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'], { encoding: 'utf8' }).trim();
const version = execFileSync(converter, ['-version'], { encoding: 'utf8' }).split('\n')[0];
const files: any[] = [], tracks: any[] = [], undefinedThemes: string[] = [];
for (const key of new Set(ini.getSection('Themes')!.entries.values())) {
    if (!key) continue;
    const section = ini.getSection(String(key));
    if (!section) { undefinedThemes.push(String(key)); continue; }
    const sound = section.getString('Sound');
    if (!/^[a-z0-9-]+$/i.test(sound)) throw new Error(`Unsafe or missing original music Sound: ${key}`);
    const filename = sound.toLowerCase() + '.mp3';
    let prepared = files.find(file => file.name === filename);
    if (!prepared) {
        const member = sound.toLowerCase() + '.wav', bytes = archive.openFile(member).getBytes();
        if (Buffer.from(bytes.subarray(0, 4)).toString() !== 'RIFF') throw new Error(`Unexpected original music encoding: ${member}`);
        const output = path.join(directory, filename);
        try { await lstat(output); throw new Error(`Refusing to replace a prior conversion: ${filename}`); }
        catch (error: any) { if (error.code !== 'ENOENT') throw error; }
        execFileSync(converter, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-i', 'pipe:0', '-map', '0:a:0',
            '-c:a', 'libmp3lame', '-q:a', '2', '-map_metadata', '-1', output], { input: bytes, maxBuffer: 4 * 1024 * 1024 });
        const converted = await readFile(output);
        prepared = { name: filename, bytes: converted.length, sha256: sha(converted), route: '/local-music/' + edition + '/' + filename,
            source: { member, bytes: bytes.length, sha256: sha(bytes) } };
        files.push(prepared);
    }
    tracks.push({ theme: key, sound, normal: section.getBool('Normal', true), repeat: section.getBool('Repeat'), file: filename });
}
const manifest = { schemaVersion: 1, edition, archive: { name: archiveName, bytes: archiveBytes.length, sha256: archiveSha256 },
    themeIni: { member: themeName, sha256: originalIni.sha256, archive: originalIni.source }, files, tracks, undefinedThemes,
    conversion: { version, codec: 'libmp3lame', quality: 2, channelsAndSampleRate: 'Preserved from the original archived WAV' },
    provenance: `Local installed ${archiveName}, bound by archive/member hashes and original archived ${themeName} references. No loose sound overrides or patch rules. Archive identity is recorded, not asserted as a universal retail fingerprint.` };
await writeFile(manifestFile, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
await contractFor(await readFile(manifestFile));
const receipt = path.resolve(root, edition === 'yr' ? '../project-history/yr-campaign-implementation-20261104/Music/import-r1.json'
    : '../project-history/ra2-campaign-completion-20261026/music-import-r1.json');
await mkdir(path.dirname(receipt), { recursive: true });
await writeFile(receipt,
    JSON.stringify({ ...manifest, source }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ status: 'PREPARED_SOURCE_PINNED_ORIGINAL_MUSIC', files: files.length, tracks: tracks.length, undefinedThemes }));
