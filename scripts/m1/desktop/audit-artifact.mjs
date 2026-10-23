import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const receipt = path.resolve(process.argv[2]), a = JSON.parse(await fs.readFile(receipt, 'utf8'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
for (const row of a.bundle) {
    const full = path.join(a.artifact, row.file);
    if (row.link) assert.equal(await fs.readlink(full), row.link);
    else assert.equal(digest(await fs.readFile(full)), row.sha256, row.file);
}
const root = process.cwd(), payload = path.join(a.artifact, 'Contents/Resources/app');
const allowlist = JSON.parse(await fs.readFile(path.join(payload, 'desktop/app-files.json')));
assert(allowlist.every(file => a.payload.some(row => row.file === file)));
assert(!a.payload.some(row => /(^|\/)(\.local|\.artifacts|fixtures|scripts)(\/|$)|\.(mix|shp|vxl|hva|mask)$/.test(row.file)));
const assets = new Set(a.payload.map(row => row.file));
for (const row of a.payload.filter(row => /\.(js|html|css)$/.test(row.file))) {
    const text = await fs.readFile(path.join(payload, row.file), 'utf8');
    for (const match of text.matchAll(/(?<![\w-])(?:\.\/|\/)?assets\/([\w.-]+\.(?:js|css|png))(?=["\x27\s)])/g))
        assert(assets.has(`dist/assets/${match[1]}`), `Missing referenced asset ${match[1]}`);
    assert(!text.includes('__installConscriptStates'), 'Fixture hook found in payload');
}
const implementation = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const runtimeInputs = a.source.files.filter(row => /^(src\/|public\/|desktop\/|scripts\/m1\/build-unified-desktop\.mjs$)/.test(row.file)
    || /^(package.json|bun.lock|vite.config.ts|tsconfig.*json|index.html)$/.test(row.file));
const changed = [];
// Read all committed blobs in one Git process; sizes delimit arbitrary binary content.
const batch = execFileSync('git', ['cat-file', '--batch'], {
    input: runtimeInputs.map(row => `${implementation}:${row.file}\n`).join(''), maxBuffer: 256 * 1024 * 1024,
});
let offset = 0;
for (const row of runtimeInputs) {
    const newline = batch.indexOf(10, offset);
    const header = batch.subarray(offset, newline).toString().split(' ');
    assert.equal(header[1], 'blob', row.file);
    const size = Number(header[2]), start = newline + 1;
    if (digest(batch.subarray(start, start + size)) !== row.sha256) changed.push(row.file);
    offset = start + size + 1;
}
assert.deepEqual(changed, [], 'Runtime inputs differ from implementation commit');
const report = { status: 'PASS', artifact: a.artifact, buildParent: a.source.head, implementationCommit: implementation,
    buildTiming: 'Built before implementation commit; all recorded runtime/build inputs match that commit byte-for-byte',
    runtimeInputs: runtimeInputs.length, bundleEntriesVerified: a.bundle.length, payloadFiles: a.payload.length,
    allowlistedWebFiles: allowlist.length, exclusionsVerified: true };
await fs.writeFile(path.join(path.dirname(receipt), 'implementation-binding.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
