import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const [indexArg, nativeArg, visualArg, outputArg] = process.argv.slice(2);
assert(indexArg && nativeArg && visualArg && outputArg,
    'Usage: publish-loading-pages.mjs STAGED_INDEX NATIVE_REPORT INTERNAL_VISUAL_REVIEW OUTPUT');
const root = path.resolve(import.meta.dirname, '../..');
const read = async file => JSON.parse(await fs.readFile(file));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const indexBytes = await fs.readFile(indexArg), index = JSON.parse(indexBytes);
const native = await read(nativeArg), visual = await read(visualArg);
assert.equal(index.rows.length, 14);
assert.equal(native.indexSha256, sha(indexBytes));
assert.equal(native.status,
    'PASS_ALL14_STAGED_NATIVE_LOADING_EXPORTS_BUDGETS_RELEASE_AND_BRIEFING_BOUNDS_VISUAL_REVIEW_PENDING');
assert.equal(visual.status, 'PASS_INTERNAL_NATIVE_AND_EXPORT_INSPECTION_USER_ACCEPTANCE_PENDING');
assert.equal(visual.indexSha256, sha(indexBytes));
assert.equal(visual.missions.length, 14);
const cases = new Map(native.cases.map(row => [row.mission, row]));
const preserved = [], directories = new Map();
for (const row of index.rows) {
    assert(cases.has(row.mission) && visual.missions.includes(row.mission));
    assert.equal(sha(await fs.readFile(row.recipe)), row.recipeSha256);
    assert.equal(sha(await fs.readFile(path.join(row.stage, 'receipt.json'))), row.receiptSha256);
    assert.equal(cases.get(row.mission).stageReceiptSha256, row.receiptSha256);
    const directory = path.join(root, '.local/campaign/yr', row.mission.slice(0, -4));
    directories.set(row.mission, directory);
    const manifest = await read(path.join(directory, 'manifest.json'));
    for (const item of manifest.files) {
        const file = path.join(directory, item.name), digest = sha(await fs.readFile(file));
        assert.equal(digest, item.sha256, 'Existing campaign payload drift: ' + file);
        preserved.push({ file, sha256: digest });
    }
    for (const item of row.files) {
        assert.equal(sha(await fs.readFile(path.join(row.stage, 'files', item.name))), item.sha256);
        let old;
        try { old = await fs.readFile(path.join(directory, item.name)); }
        catch (error) { if (error.code !== 'ENOENT') throw error; }
        assert(!old || sha(old) === item.sha256, 'Existing loading payload differs: ' + item.name);
    }
}
const rows = [];
for (const row of index.rows) {
    execFileSync('node', ['scripts/campaign-completion/export-loading.mjs', row.recipe],
        { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    for (const item of row.files)
        assert.equal(sha(await fs.readFile(path.join(directories.get(row.mission), item.name))), item.sha256);
    rows.push({ mission: row.mission, stageReceiptSha256: row.receiptSha256,
        formalReceipt: 'docs/campaign-art/yr-v1/' + row.mission.slice(0, -4) + '-loading.json',
        files: row.files });
}
for (const item of preserved) assert.equal(sha(await fs.readFile(item.file)), item.sha256);
const report = { schema: 'yr-loading-pages-publication-v1', status: 'PASS_ALL14_LOADING_PUBLICATION_IDENTICAL_TO_NATIVE_REVIEW',
    indexSha256: sha(indexBytes), nativeReportSha256: sha(await fs.readFile(nativeArg)),
    internalVisualReviewSha256: sha(await fs.readFile(visualArg)), rows,
    preservedExistingCampaignPayloads: preserved.length, replacedAcceptedArtwork: 0,
    reusedUnitPhotoSlots: 39, newUnitPhotos: 0, userAcceptance: 'PENDING', windows: 'NOT_RUN_ON_THIS_MAC' };
await fs.writeFile(outputArg, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ status: report.status, missions: rows.length, preserved: preserved.length }));
