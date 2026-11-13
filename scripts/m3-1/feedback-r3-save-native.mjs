import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { _electron as electron } from '@playwright/test';
const root = path.resolve(import.meta.dirname, '../..');
const receipt = JSON.parse(await fs.readFile(path.resolve(process.argv[2]))), out = path.resolve(process.argv[3]);
await fs.mkdir(out, { recursive: false });
const checkpoint = JSON.parse(await fs.readFile(path.join(root, 'scripts/m3-1/fixtures/mid-mission-checkpoint.json')));
const sourceHead = receipt.identity?.runtimeSourceHead ?? JSON.parse(await fs.readFile(path.join(receipt.app, 'Contents/Resources/app/package.json'))).sourceHead;
const report = { status: 'RUNNING', app: receipt.app, sourceHead, cases: [], screenshots: [], errors: [], failedResources: [],
    fixture: 'The authentic accepted tick-4062 checkpoint seeds only this independent profile legacy database. All subsequent save/load/replace/delete operations use actual UI clicks.',
    harnessSha256: createHash('sha256').update(await fs.readFile(import.meta.filename)).digest('hex') };
const saveReport = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
let app, page, labels;
async function shot(name) { await page.waitForTimeout(200); await page.screenshot({ path: path.join(out, name + '.png') }); report.screenshots.push(name + '.png'); await saveReport(); }
async function start() {
    const profile = path.join(out, 'profile');
    if (receipt.runtime) {
        await fs.mkdir(profile, { recursive: true });
        await fs.writeFile(path.join(profile, 'resource-registration.json'), JSON.stringify({ schemaVersion: 1, directory: receipt.resources }));
    }
    app = await electron.launch({ executablePath: receipt.runtime
        ? await fs.realpath(path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'))
        : path.join(receipt.app, 'Contents/MacOS', receipt.executable), args: receipt.runtime ? [receipt.runtime] : [], cwd: '/private/tmp',
        env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('RA2_'))),
            RA2_DESKTOP_USER_DATA: profile, ...(receipt.runtime ? { RA2_DESKTOP_NO_DISCOVERY: '1',
                RA2_CAMPAIGN_RESOURCE_ROOT: receipt.campaign, RA2_CAMPAIGN_FROZEN_TERRAIN: receipt.liveMainResources ? '0' : '1' } : {}) } });
    page = await app.firstWindow();
    page.on('pageerror', error => report.errors.push(error.stack));
    page.on('response', response => { if (response.status() >= 400) report.failedResources.push({ url: response.url(), status: response.status() }); });
    app.process().stderr?.on('data', bytes => { void fs.appendFile(path.join(out, 'electron.log'), bytes); });
    if (receipt.runtime) {
        await page.locator('[data-edition=ra2]').click({ timeout: 60000 });
        await page.waitForFunction(() => window.__ra2debug?.mainMenuController, undefined, { timeout: 90000 });
        const current = await page.evaluate(() => document.documentElement.lang);
        const locale = JSON.parse(await fs.readFile(path.join(root, 'public/res/locale/' + current + '.json')));
        await page.getByRole('button', { name: locale['hd:menucampaign'], exact: true }).click();
    }
    await page.waitForSelector('[data-campaign-ready=true]', { timeout: 90000 });
    const language = await page.evaluate(() => document.documentElement.lang);
    labels = { ...JSON.parse(await fs.readFile(path.join(root, `public/res/locale/retail-ra2-${language}.json`))).labels,
        ...JSON.parse(await fs.readFile(path.join(root, `public/res/locale/${language}.json`))) };
}
async function state() {
    return page.evaluate(() => { const d = window.__ra2debug, g = d.game;
        return { tick: g.currentTick, hash: g.getHash(), rng: g.prng.snapshot(), mission: g.campaign.checkpointState(),
            world: g.debugGetState(), modified: !!g.campaign.inspectionModified, paused: !!d.gameScreen.menu.getCurrentScreen() }; });
}
async function rows() {
    return page.evaluate(async () => {
        const db = await new Promise((resolve, reject) => { const q = indexedDB.open('ra2-hd-campaign-library', 1);
            q.onupgradeneeded = () => q.result.createObjectStore('saves', { keyPath: 'id' }); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); });
        try { return await new Promise((resolve, reject) => { const q = db.transaction('saves').objectStore('saves').getAll(); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); }); }
        finally { db.close(); }
    });
}
async function open(mode) {
    await page.getByRole('button', { name: labels[mode === 'save' ? 'gui:save' : 'gui:load'], exact: true }).click();
    await page.waitForSelector('[data-save-scope=campaign][data-mode=' + mode + ']');
    await page.waitForFunction(() => document.querySelector('.save-native-list').getAttribute('aria-disabled') === 'false');
}
async function clickAction(name) {
    const labelled = page.locator('[data-action=' + name + ']');
    if (await labelled.count()) await labelled.click();
    else { const keys = { LoadGame: 'gui:load', SaveGame: 'gui:save', DeleteSave: 'hd:deletesave', CloseSaves: 'gui:back' };
        assert(keys[name], name); await page.getByRole('button', { name: labels[keys[name]], exact: true }).click(); }
}
async function restored() {
    if (process.argv.includes('--failure-state-probe')) await page.waitForFunction(() =>
        window.__ra2debug?.game?.campaign && window.__ra2debug.gameScreen?.menu?.getCurrentScreen(),
        undefined, { timeout: 180000 });
    await page.waitForFunction(tick => window.__ra2debug?.game?.currentTick === tick && window.__ra2debug.gameScreen?.menu?.getCurrentScreen(), checkpoint.tick,
        { timeout: process.argv.includes('--failure-state-probe') ? 5000 : 180000 });
    await page.evaluate(() => window.__ra2debug.gameScreen.pointer.unlock(true));
    const current = await state(); assert.equal(current.hash, checkpoint.expected.worldHash);
    assert.deepEqual(current.rng, checkpoint.expected.rng); assert(!current.modified && current.paused);
    return current;
}
try {
    await start();
    await page.evaluate(async checkpoint => {
        const db = await new Promise((resolve, reject) => { const q = indexedDB.open('ra2-hd-campaign-saves', 1);
            q.onupgradeneeded = () => q.result.createObjectStore('checkpoints'); q.onsuccess = () => resolve(q.result); q.onerror = () => reject(q.error); });
        try { await new Promise((resolve, reject) => { const tx = db.transaction('checkpoints', 'readwrite');
            tx.objectStore('checkpoints').put(checkpoint, 'ra2/sov01t.map/normal'); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); }
        finally { db.close(); }
    }, checkpoint);
    await open('load');
    await page.getByRole('option').filter({ hasText: labels['hd:legacycampaignsave'] }).waitFor();
    await page.getByRole('button', { name: labels['gui:load'], exact: true }).waitFor({ state: 'visible' });
    await shot('01-legacy-campaign-load-list');
    await clickAction('LoadGame');
    const first = await restored();
    report.cases.push({ name: 'Legacy manual slot restored through the campaign load list', tick: first.tick, hash: first.hash });
    await open('save');
    await page.locator('.save-native-name').fill('R3 native checkpoint'); await clickAction('SaveGame');
    await page.locator('[data-action=AcknowledgeSave]').waitFor(); await clickAction('AcknowledgeSave');
    const stored = await rows(); assert.equal(stored.length, 1); const record = stored[0];
    assert.equal(record.tick, checkpoint.tick); assert.equal(record.checkpoint.expected.worldHash, first.hash);
    report.saved = { id: record.id, name: record.name, tick: record.tick, worldHash: record.checkpoint.expected.worldHash,
        checksum: record.checksum, checkpointChecksum: record.checkpoint.checksum };
    report.cases.push({ name: 'Actual Save creates a named verified record', ...report.saved });
    await shot('02-named-campaign-save-list');
    await clickAction('CloseSaves'); await open('load');
    await page.locator('[role=option][data-id="' + record.id + '"]').click(); await clickAction('LoadGame');
    await page.locator('[data-action=CancelSaveAction]').waitFor(); await shot('03-confirm-current-mission-load');
    await clickAction('CancelSaveAction'); assert.deepEqual(await state(), first);
    report.cases.push({ name: 'Cancel Load preserves the paused live world and all saves' });
    await app.close(); app = undefined;
    await start(); await open('load');
    await page.locator('[role=option][data-id="' + record.id + '"]').click(); await clickAction('LoadGame');
    const restarted = await restored(); assert.deepEqual(restarted, first);
    report.cases.push({ name: 'Fresh application restart restores exact world, RNG and campaign state', tick: restarted.tick, hash: restarted.hash });
    await shot('04-named-save-restored-after-app-restart');
    await open('save'); await page.locator('.save-native-name').fill(record.name); await clickAction('SaveGame');
    await page.locator('[data-action=CancelSaveAction]').waitFor(); await clickAction('CancelSaveAction');
    assert.equal((await rows())[0].checksum, record.checksum);
    await clickAction('SaveGame'); await clickAction('ConfirmSaveAction');
    await page.locator('[data-action=AcknowledgeSave]').waitFor(); await clickAction('AcknowledgeSave');
    const replaced = await rows(); assert.equal(replaced.length, 1); assert.equal(replaced[0].id, record.id);
    assert.equal(replaced[0].checkpoint.expected.worldHash, record.checkpoint.expected.worldHash);
    report.cases.push({ name: 'Overwrite cancel preserves bytes; confirmed overwrite preserves the slot identity' });
    await clickAction('DeleteSave'); await clickAction('CancelSaveAction'); assert.equal((await rows()).length, 1);
    await clickAction('DeleteSave'); await clickAction('ConfirmSaveAction');
    await page.waitForFunction(() => document.querySelectorAll('[role=option]').length === 1);
    assert.equal((await rows()).length, 0);
    report.cases.push({ name: 'Delete cancel preserves the record; confirmed delete removes only the selected named save' });
    await shot('05-named-delete-preserves-legacy-row');
    await clickAction('CloseSaves');
    const damaged = structuredClone(record); damaged.id = 'damaged-fixture'; damaged.name = 'Damaged checksum fixture';
    await page.evaluate(async damaged => { const db = await new Promise(resolve => { const q = indexedDB.open('ra2-hd-campaign-library', 1); q.onsuccess = () => resolve(q.result); });
        await new Promise(resolve => { const tx = db.transaction('saves','readwrite'); tx.objectStore('saves').put(damaged); tx.oncomplete = resolve; }); db.close(); }, damaged);
    await open('load'); await page.locator('[role=option][data-id=damaged-fixture]').click();
    await clickAction('LoadGame'); await clickAction('ConfirmSaveAction');
    await page.locator('[data-action=AcknowledgeSave]').waitFor();
    assert.equal(await page.locator('#save-popup-message').textContent(), labels['hd:saveinvalid']);
    assert.deepEqual(await state(), first); await shot('06-damaged-save-rejected-with-live-world-preserved');
    report.cases.push({ name: 'Damaged checksum reports the localized error before replacing the live world' });
    await clickAction('AcknowledgeSave'); await clickAction('DeleteSave'); await clickAction('ConfirmSaveAction');
    await page.waitForFunction(() => document.querySelectorAll('[role=option]').length === 1);
    report.legacyPreserved = await page.evaluate(async () => {
        const db = await new Promise(resolve => { const q = indexedDB.open('ra2-hd-campaign-saves',1); q.onsuccess = () => resolve(q.result); });
        const value = await new Promise(resolve => { const q = db.transaction('checkpoints').objectStore('checkpoints').get('ra2/sov01t.map/normal'); q.onsuccess = () => resolve(q.result); }); db.close(); return value;
    });
    assert.deepEqual(report.legacyPreserved, checkpoint); delete report.legacyPreserved;
    report.legacyPreserved = { checksum: checkpoint.checksum, identical: true };
    report.resourceNamespaces = { campaign: 'ra2-hd-campaign-library', legacy: 'ra2-hd-campaign-saves', skirmish: 'ra2-hd-skirmish-saves', collision: false };
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_NATIVE_CAMPAIGN_NAMED_SAVE_LOAD_RESTART_REPLACE_DELETE_AND_LEGACY_COMPATIBILITY';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) {
        report.failureState = await page.evaluate(() => {
            const d = window.__ra2debug, g = d?.game;
            return { tick: g?.currentTick, status: g?.status, campaign: !!g?.campaign,
                pausedAtSpeed: d?.gameScreen?.pausedAtSpeed, campaignPaused: d?.gameScreen?.gameTurnMgr?.campaignPaused };
        }).catch(() => null);
        await shot('failure').catch(() => {});
    }
}
finally { await saveReport(); await fs.copyFile(import.meta.filename, path.join(out,'harness.mjs')); await app?.close(); }
console.log(JSON.stringify({ status: report.status, out, error: report.error }));
