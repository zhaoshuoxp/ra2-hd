import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const [receiptFile, oldEvidence, output] = process.argv.slice(2);
const receipt = JSON.parse(await fs.readFile(receiptFile, 'utf8'));
const artifact = receipt.receipt ?? receipt, prior = JSON.parse(await fs.readFile(path.join(oldEvidence, 'report.json'), 'utf8'));
const out = path.resolve(output), profile = path.join(out, 'profile'), edition = prior.edition;
const locale = JSON.parse(await fs.readFile('public/res/locale/zh-CN.json', 'utf8'));
await fs.mkdir(out, { recursive: false });
await fs.cp(path.join(oldEvidence, 'profile'), profile, { recursive: true });
await fs.writeFile(path.join(profile, 'resource-registration.json'), JSON.stringify({ schemaVersion: 1, directory: artifact.resources }));
const report = { status: 'RUNNING', edition, legacyEvidence: path.resolve(oldEvidence), errors: [],
    disclosure: 'Copied prior R2 test profile; no migration or mutation of the original profile. Native hashes and all state values are compared at the saved boundary and after 600 AI ticks. Bundled trait constructor names are unstable between builds; only those debug labels are normalized to a sorted multiset of complete trait values.' };
function normalizeState(value, key) {
    if (Array.isArray(value)) return value.map(item => normalizeState(item));
    if (!value || typeof value !== 'object') return value;
    const fields = Object.fromEntries(Object.entries(value).map(([name, item]) => [name, normalizeState(item, name)]));
    return key === 'traits' ? Object.values(fields).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) : fields;
}
let app, page;
try {
    app = await electron.launch({ executablePath: artifact.app ? path.join(artifact.app, 'Contents/MacOS/RA2 HD Editions')
        : await fs.realpath('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
        args: artifact.app ? [] : [artifact.build], cwd: '/private/tmp', timeout: 60000,
        env: { ...process.env, RA2_DESKTOP_USER_DATA: profile, RA2_DESKTOP_NO_DISCOVERY: '1' } });
    page = await app.firstWindow();
    page.on('pageerror', error => report.errors.push(error.stack));
    await page.locator(`[data-edition=${edition}]`).click({ timeout: 60000 });
    await page.waitForFunction(() => window.__ra2debug?.generalOptions, undefined, { timeout: 90000 });
    await page.evaluate(() => {
        const requestFrame = window.requestAnimationFrame;
        window.__freezeLegacy = true;
        window.requestAnimationFrame = function (callback) {
            const loop = window.__ra2debug?.gameScreen?.gameAnimationLoop;
            if (window.__freezeLegacy && loop) { window.__freezeLegacy = false; loop.stop(); return 0; }
            return requestFrame.call(window, callback);
        };
    });
    await page.getByRole('button', { name: locale['hd:loadgame'], exact: true }).click();
    await page.getByTestId('skirmish-saves').getByRole('option', { name: /Native persistence checkpoint/ }).click();
    await page.locator('[data-action=LoadGame]').click();
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1 && window.__ra2debug?.gameScreen?.gameAnimationLoop,
        undefined, { timeout: 120000 });
    report.restored = await page.evaluate(() => {
        const d = window.__ra2debug; d.gameScreen.gameAnimationLoop.stop();
        return { tick: d.game.currentTick, hash: d.game.getHash(), state: d.game.debugGetState(), trainerPending: d.trainer.session.pending };
    });
    assert.equal(report.restored.tick, prior.saved.tick);
    assert.equal(report.restored.hash, prior.saved.hash);
    assert.deepEqual(normalizeState(report.restored.state), normalizeState(prior.saved.state));
    assert.equal(report.restored.trainerPending, 0);
    await page.evaluate(() => { const d = window.__ra2debug;
        for (let i = 0; i < 600; i++) if (!d.gameScreen.gameTurnMgr.doGameTurn(performance.now())) throw Error('Legacy turn refused');
    });
    report.continued = await page.evaluate(() => ({ tick: window.__ra2debug.game.currentTick,
        hash: window.__ra2debug.game.getHash(), state: window.__ra2debug.game.debugGetState(),
        glError: window.__ra2debug.renderer.renderer.getContext().getError() }));
    assert.equal(report.continued.hash, prior.continuation.hash);
    assert.deepEqual(normalizeState(report.continued.state), normalizeState(prior.continuation.state));
    assert.equal(report.continued.glError, 0);
    assert.deepEqual(report.errors, []);
    await page.screenshot({ path: path.join(out, 'legacy-save-continued.png') });
    report.status = 'PASS_R2_SAVE_BOUNDARY_AND_600_TICK_CONTINUATION_UNCHANGED';
} catch (error) {
    report.status = 'FAIL'; report.failure = error.stack;
    report.failureText = await page?.locator('body').innerText().catch(() => '');
    await page?.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await app?.close().catch(() => {});
}
console.log(JSON.stringify({ status: report.status, edition, failure: report.failure }));
if (report.status === 'FAIL') process.exitCode = 1;
