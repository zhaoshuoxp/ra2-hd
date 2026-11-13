import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';

const [indexArg, outputArg] = process.argv.slice(2);
assert(indexArg && outputArg, 'Usage: native-loading-pages.mjs STAGED_INDEX OUTPUT');
const indexFile = path.resolve(indexArg), out = path.resolve(outputArg);
await fs.mkdir(out, { recursive: false });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const read = async file => JSON.parse(await fs.readFile(file));
const indexBytes = await fs.readFile(indexFile), index = JSON.parse(indexBytes);
assert.equal(index.rows.length, 14);
const runtimeFiles = ['src/gui/campaign/CampaignInterfaceHd.ts', 'src/gui/campaign/CampaignPresentation.ts',
    'src/gui/screen/game/loadingScreen/CampaignLoadingScreenApi.tsx', 'desktop/main.mjs', '.local/ui-selection.json'];
const fingerprint = async () => Object.fromEntries(await Promise.all(runtimeFiles.map(async file => [file, sha(await fs.readFile(file))])));
const before = await fingerprint();
const report = { schema: 'yr-native-staged-loading-pages-v1', status: 'RUNNING', indexFile,
    indexSha256: sha(indexBytes), runtimeSources: before, maximumConcurrentApps: 2, cases: [],
    scope: 'Actual isolated Mac loading pages at two viewport sizes, independent 2X/4X exports, bounded UI allocations and release. The diagnostic hold affects loading only. Mission goal, ordinary media and public-entry qualification are separate. User visual acceptance remains pending.' };
let writes = Promise.resolve();
const save = () => writes = writes.then(() => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2)+'\n'));
async function collect(row, directory, reused) {
    const file = path.join(directory, 'report.json'), bytes = await fs.readFile(file), proof = JSON.parse(bytes);
    const receiptFile = path.join(row.stage, 'receipt.json');
    assert.equal(sha(await fs.readFile(receiptFile)), row.receiptSha256);
    assert.equal(proof.status, 'PASS_NATIVE_STAGED_LOADING_PREVIEW_NOT_REGISTERED_VISUAL_REVIEW_PENDING');
    assert.equal(proof.edition, 'yr'); assert.equal(proof.mission, row.mission);
    assert.equal(proof.stage, row.stage);
    assert.deepEqual(proof.errors, []); assert.deepEqual(proof.failedResources, []);
    assert.deepEqual(proof.consoleErrors ?? [], []);
    assert.equal(proof.frames.length, 2); assert.equal(proof.exports.length, 2);
    assert(proof.afterLoading.worldImageReleased && !proof.afterLoading.worldCanvasCount);
    const spec = await read(path.join(row.stage, 'files/interface-hd.json'));
    for (const frame of proof.frames) {
        assert.equal(frame.artRevision, spec.revision);
        assert(frame.ui.reservedBytes <= frame.ui.budget);
        assert(frame.briefing.logicalRight <= frame.briefing.availableRight + .5);
        assert(frame.briefing.logicalBottom <= frame.briefing.availableBottom + .5);
        assert.equal(frame.languageLayouts.length, 3);
    }
    const exports = await Promise.all(proof.exports.map(async entry => ({ density: entry.density,
        file: path.join(directory, entry.composition), sha256: sha(await fs.readFile(path.join(directory, entry.composition))) })));
    report.cases.push({ mission: row.mission, directory, reportSha256: sha(bytes), stageReceiptSha256: row.receiptSha256,
        reused, exports, maximumUiBytes: Math.max(...proof.frames.map(frame => frame.ui.reservedBytes)),
        formalManifestUnchanged: proof.formalManifestUnchanged });
    await save();
    console.log(JSON.stringify({ mission: row.mission, status: 'PASS_NATIVE_STAGED_LOADING', reused }));
}
const pending = [...index.rows];
async function worker() {
    while (pending.length) {
        const row = pending.shift(), directory = path.join(out, row.mission.slice(0, -4));
        const log = await fs.open(path.join(out, row.mission.slice(0, -4)+'.log'), 'wx');
        let code;
        try {
            code = await new Promise((resolve, reject) => {
                const process = spawn('node', ['scripts/campaign-completion/native-loading-review.mjs', directory, row.mission,
                    '--edition=yr', '--stage='+row.stage], { cwd: path.resolve(import.meta.dirname, '../..'),
                    stdio: ['ignore', log.fd, log.fd] });
                process.on('error', reject); process.on('exit', resolve);
            });
        } finally { await log.close(); }
        assert.equal(code, 0, 'Native loading failed: ' + row.mission);
        await collect(row, directory, false);
    }
}
try {
    const results = await Promise.allSettled([worker(), worker()]);
    const failures = results.filter(result => result.status === 'rejected').map(result => result.reason);
    if (failures.length) throw new AggregateError(failures, 'Native loading matrix failed');
    assert.equal(report.cases.length, 14);
    assert.deepEqual(await fingerprint(), before, 'Runtime or accepted UI selection changed during native inspection');
    report.status = 'PASS_ALL14_STAGED_NATIVE_LOADING_EXPORTS_BUDGETS_RELEASE_AND_BRIEFING_BOUNDS_VISUAL_REVIEW_PENDING';
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1; }
finally { await save(); await writes; }
console.log(JSON.stringify({ status: report.status, cases: report.cases.length, out }));
