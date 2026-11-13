import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '../..'), base = path.join(root, '.artifacts/m3-1/feedback-r3b');
const parent = path.resolve(process.argv[2]), output = path.resolve(process.argv[3]);
const read = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const save = (file, value) => fs.writeFile(file, JSON.stringify(value, null, 2) + '\n');
async function sha(file) {
    const hash = createHash('sha256');
    for await (const bytes of createReadStream(file)) hash.update(bytes);
    return hash.digest('hex');
}
const candidate = await read(path.join(parent, 'stage.json'));
assert.equal(candidate.verifiedUnchangedResourceFiles, 14004);
assert.equal(await sha(path.join(parent, 'inventory.json')), candidate.packageInventorySha256);
const priorRows = await read(path.join(parent, 'inventory.json'));
const review = await read(path.join(base, 'review.json'));
assert.equal(review.sourceHead, candidate.identity.runtimeSourceHead);
assert.equal(await sha(review.file), review.sha256);
const identity = { ...candidate.identity, sourceStatus: 'CAMPAIGN_FEEDBACK_R3B_TECHNICAL_PASS_PENDING_USER_REVIEW' };
await fs.mkdir(output, { recursive: false });
const folder = path.join(output, path.basename(candidate.folder));
execFileSync('/bin/cp', ['-cR', candidate.folder, folder]);
const app = path.join(folder, path.basename(candidate.app));
const resources = path.join(app, 'Contents/Resources/GameResources');
const rows = []; let verifiedResources = 0;
for (const row of priorRows.filter(row => row.file !== 'PACKAGE-MANIFEST.json')) {
    const source = path.join(candidate.folder, row.file), target = path.join(folder, row.file);
    const stat = await fs.lstat(target);
    assert.equal(stat.mode & 0o7777, row.mode, row.file);
    if (row.link) assert.equal(await fs.readlink(target), row.link, row.file);
    else {
        assert.equal(stat.size, row.bytes, row.file); assert.equal(await sha(target), row.sha256, row.file);
        assert.notEqual(stat.ino, (await fs.stat(source)).ino, row.file);
        if (target.startsWith(resources + path.sep)) verifiedResources++;
    }
    rows.push(row);
}
assert.equal(verifiedResources, 14004);
// The signed app remains byte-identical to the tested candidate. Only the outer review and manifest change.
execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
const reviewTarget = path.join(folder, path.basename(review.file));
await fs.copyFile(review.file, reviewTarget);
const stat = await fs.stat(reviewTarget);
rows.push({ file: path.basename(reviewTarget), bytes: stat.size, sha256: await sha(reviewTarget), mode: stat.mode & 0o7777 });
rows.sort((a, b) => a.file.localeCompare(b.file));
await save(path.join(folder, 'PACKAGE-MANIFEST.json'), { ...identity, files: rows, manifestExcludedFromSelfInventory: 'PACKAGE-MANIFEST.json' });
const manifest = path.join(folder, 'PACKAGE-MANIFEST.json'), manifestStat = await fs.stat(manifest);
rows.push({ file: 'PACKAGE-MANIFEST.json', bytes: manifestStat.size, sha256: await sha(manifest), mode: manifestStat.mode & 0o7777 });
await save(path.join(output, 'inventory.json'), rows);
const result = { ...candidate, folder, app, resources, identity, entries: rows.length,
    logicalBytes: rows.reduce((total, row) => total + (row.bytes ?? 0), 0),
    verifiedUnchangedResourceFiles: verifiedResources, packageInventorySha256: await sha(path.join(output, 'inventory.json')),
    promotion: { candidateStage: parent, candidateInventorySha256: candidate.packageInventorySha256,
        allAppBytesIdenticalToNativeCandidate: true, nativeSignaturePreservedAndVerified: true, review },
    packagingTools: [{ path: 'scripts/m3-1/finalize-feedback-r3b.mjs', sha256: await sha(import.meta.filename) }] };
await save(path.join(output, 'stage.json'), result);
console.log(JSON.stringify({ status: result.status, app, entries: rows.length, verifiedResources }));
