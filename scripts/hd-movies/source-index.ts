// Resolve encrypted retail MIX offsets once; production reads only one verified member at a time.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { parseMix } from '../../src/offline/retail';

const root = path.resolve(import.meta.dir, '../..'), output = path.resolve(process.argv[2]);
const inventoryFile = path.join(root, 'docs/hd-movies-inventory-20261109.json');
const inventoryBytes = await fs.readFile(inventoryFile), inventory = JSON.parse(inventoryBytes.toString());
const installation = path.resolve(root, '../Resource/Command and Conquer Red Alert II');
const filenames = await fs.readdir(installation), sources: any[] = [], archives: any[] = [];
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
for (const original of inventory.archives) {
    const matches = filenames.filter(name => name.toLowerCase() === original.name);
    if (matches.length !== 1) throw Error('Ambiguous original archive: ' + original.name);
    const file = path.join(installation, matches[0]), bytes = await fs.readFile(file), stat = await fs.stat(file);
    if (bytes.length !== original.bytes || sha(bytes) !== original.sha256) throw Error('Original archive differs');
    const mix = parseMix(bytes, original.name), archive = path.relative(root, file);
    archives.push({ file: archive, bytes: stat.size, mtimeMs: stat.mtimeMs, sha256: original.sha256 });
    for (const movie of inventory.movies.filter((movie: any) => movie.original.archiveNames[0] === original.name)) {
        const opened = mix.openFile(movie.original.member), offset = opened.stream.byteOffset;
        const member = opened.getBytes();
        if (sha(member) !== movie.original.sha256 || member.length !== movie.original.bytes
            || offset < 0 || offset + member.length > bytes.length
            || sha(bytes.subarray(offset, offset + member.length)) !== movie.original.sha256) throw Error('Original member or archive range differs');
        sources.push({ identity: movie.identity, archive, offset, bytes: member.length, sha256: movie.original.sha256 });
    }
}
if (sources.length !== inventory.movies.length || new Set(sources.map(source => source.identity)).size !== sources.length)
    throw Error('Incomplete source index');
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, JSON.stringify({ schema: 'hd-movie-source-index-v1', inventorySha256: sha(inventoryBytes), archives, sources }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ status: 'VERIFIED_ORIGINAL_OFFSETS', sources: sources.length, archives: archives.length, output }));
