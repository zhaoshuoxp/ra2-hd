import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { _electron as electron } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '../..'), receipt = JSON.parse(await fs.readFile(path.resolve(process.argv[2])));
const out = path.resolve(process.argv[3]), previous = path.resolve(process.argv[4]);
await fs.mkdir(out, { recursive: false }); await fs.copyFile(import.meta.filename, path.join(out, 'harness.mjs'));
execFileSync('/bin/cp', ['-cR', path.join(previous, 'profile'), path.join(out, 'profile')]);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const original = JSON.parse(await fs.readFile(path.join(previous, 'report.json')));
assert.deepEqual(original.cases.filter(row => row.victory).map(row => row.difficulty), ['easy', 'normal', 'hard']);
const metadata = JSON.parse(await fs.readFile(path.join(receipt.app, 'Contents/Resources/app/package.json')));
const report = { status: 'RUNNING', app: receipt.app, sourceHead: metadata.sourceHead, cases: [], errors: [], failedResources: [], screenshots: [],
    harnessSha256: hash(await fs.readFile(import.meta.filename)),
    previous: { directory: previous, reportSha256: hash(await fs.readFile(path.join(previous, 'report.json'))),
        scope: 'Matching-gameplay-source original victories and genuine named saves. The last abort-selection check exposed a route-only bug repaired in this runtime.' },
    scope: 'Clone only the independent test profile. Use actual load/abort UI to restore all three old-build checkpoints exactly, verify original completion coexistence and return to each loaded difficulty. No game-state mutation or checkpoint edits.' };
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
let app, page;
async function shot(name) { await page.screenshot({ path: path.join(out, name + '.png') }); report.screenshots.push(name + '.png'); await save(); }
try {
    app = await electron.launch({ executablePath: path.join(receipt.app, 'Contents/MacOS', receipt.executable), cwd: '/private/tmp',
        env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('RA2_'))), RA2_DESKTOP_USER_DATA: path.join(out, 'profile') } });
    page = await app.firstWindow(); page.on('pageerror', error => report.errors.push(error.stack));
    page.on('response', response => { if (response.status() >= 400) report.failedResources.push({ url: response.url(), status: response.status() }); });
    app.process().stderr?.on('data', bytes => { void fs.appendFile(path.join(out, 'electron.log'), bytes); });
    await page.waitForSelector('[data-campaign-ready=true]', { timeout: 90000 });
    assert.equal(await page.locator('[data-campaign-difficulty]').inputValue(), '1');
    const language = await page.evaluate(() => document.documentElement.lang);
    const labels = { ...JSON.parse(await fs.readFile(path.join(root, `public/res/locale/retail-ra2-${language}.json`))).labels,
        ...JSON.parse(await fs.readFile(path.join(root, `public/res/locale/${language}.json`))) };
    const records = await page.evaluate(async () => {
        const db = await new Promise(resolve => { const q = indexedDB.open('ra2-hd-campaign-library', 1); q.onsuccess = () => resolve(q.result); });
        const rows = await new Promise(resolve => { const q = db.transaction('saves').objectStore('saves').getAll(); q.onsuccess = () => resolve(q.result); }); db.close(); return rows;
    });
    for (const [difficulty, name] of [['easy', 'R5 easy'], ['hard', 'R5 hard'], ['normal', 'R5 normal'], ['hard', 'R5 Hard airport']]) {
        const record = records.find(row => row.name === name); assert(record, name);
        await page.getByRole('button', { name: labels['gui:load'], exact: true }).click();
        await page.waitForSelector('[data-save-scope=campaign][data-mode=load]');
        await page.waitForFunction(() => document.querySelector('.save-native-list').getAttribute('aria-disabled') === 'false');
        await page.locator('[role=option][data-id="' + record.id + '"]').click(); await page.locator('[data-action=LoadGame]').click();
        await page.waitForFunction(({ tick, difficulty }) => window.__ra2debug.game?.currentTick === tick
            && window.__ra2debug.game.campaign.launch.difficulty === difficulty && window.__ra2debug.gameScreen?.menu.getCurrentScreen(),
        { tick: record.tick, difficulty }, { timeout: 180000 });
        const current = await page.evaluate(() => {
            const d = window.__ra2debug, g = d.game;
            return JSON.parse(JSON.stringify({ tick: g.currentTick, hash: g.getHash(), rng: g.prng.snapshot(), mission: g.campaign.checkpointState(),
                difficulty: g.campaign.launch.difficulty, trusted: g.campaign.journal.trusted, modified: !!g.campaign.inspectionModified }));
        });
        assert.equal(current.hash, record.checkpoint.expected.worldHash);
        assert.deepEqual(current.rng, record.checkpoint.expected.rng);
        assert.deepEqual(current.mission, JSON.parse(JSON.stringify(record.checkpoint.expected.mission)));
        assert(current.trusted && !current.modified); await shot('restored-' + name.replaceAll(' ', '-'));
        await page.getByRole('button', { name: labels['gui:abortmission'], exact: true }).click();
        await page.getByRole('button', { name: labels['gui:quit'], exact: true }).click();
        await page.waitForSelector('[data-campaign-ready=true]', { timeout: 90000 });
        const selected = await page.locator('[data-campaign-difficulty]').inputValue();
        assert.equal(selected, String(['easy', 'normal', 'hard'].indexOf(difficulty)));
        report.cases.push({ name, difficulty, tick: current.tick, hash: current.hash, selected, exactWorldRngMission: 'PASS' });
        await shot('returned-' + name.replaceAll(' ', '-')); console.log(name, 'exact restore and return passed');
    }
    report.progress = await page.evaluate(() => JSON.parse(Object.entries(localStorage).find(([key]) => key.includes('_r_campaignProgress_v1'))[1]));
    assert.deepEqual(report.progress.completed.map(row => row.difficulty).sort(), ['easy', 'hard', 'normal']);
    const legacy = await page.evaluate(async () => {
        const db = await new Promise(resolve => { const q = indexedDB.open('ra2-hd-campaign-saves', 1); q.onsuccess = () => resolve(q.result); });
        const record = await new Promise(resolve => { const q = db.transaction('checkpoints').objectStore('checkpoints').get('ra2/sov01t.map/normal'); q.onsuccess = () => resolve(q.result); }); db.close(); return record;
    });
    assert.deepEqual(legacy, JSON.parse(await fs.readFile(path.join(root, 'scripts/m3-1/fixtures/mid-mission-checkpoint.json'))));
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_FINAL_RUNTIME_ALL_THREE_CROSS_BUILD_SAVES_EXACT_RESTORE_RETURN_SELECTION_AND_PROGRESS';
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1; await shot('failure').catch(() => {}); }
finally { await save(); await app?.close(); }
console.log(JSON.stringify({ status: report.status, out, error: report.error }));
