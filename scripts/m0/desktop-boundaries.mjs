import { _electron as electron } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const output = path.resolve(process.env.M03_OUTPUT ?? '.artifacts/m0-3/boundaries');
fs.mkdirSync(output, { recursive: true });
const artifact = JSON.parse(fs.readFileSync('.artifacts/m0-3/app-artifact.json')).artifact;
const userData = path.join(output, 'user-data');
const env = { ...process.env, RA2_DESKTOP_USER_DATA: userData, RA2_DESKTOP_NO_DISCOVERY: '1' };
const executablePath = path.join(artifact, 'Contents/MacOS/Electron');
const result = { artifact, cases: [] };
let app;
const launch = () => electron.launch({ executablePath, args: [], env, timeout: 60000 });
try {
    app = await launch(); let page = await app.firstWindow();
    await page.getByText('Choose existing local resources', { exact: true }).waitFor({ timeout: 30000 });
    result.cases.push({ name: 'packaged missing profile', pass: true, text: await page.locator('body').innerText() });
    await page.screenshot({ path: path.join(output, 'missing.png') });
    // Replace only the native chooser result in this isolated test, exercising the real bridge and validator.
    await app.evaluate(({ dialog }, directory) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] }); }, path.join(output, 'absent-profile'));
    await page.getByRole('button', { name: 'Choose imported profile folder' }).click();
    await page.waitForFunction(() => document.querySelector('#profile-result').textContent.startsWith('Unable to use'));
    assert.equal(fs.existsSync(path.join(userData, 'resource-registration.json')), false);
    result.cases.push({ name: 'invalid selection', pass: true, text: await page.locator('#profile-result').innerText() });
    await app.evaluate(({ dialog }, directory) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] }); }, path.resolve('.local'));
    await page.getByRole('button', { name: 'Choose imported profile folder' }).click();
    await page.getByText('Offline Skirmish', { exact: true }).waitFor({ timeout: 90000 });
    result.cases.push({ name: 'packaged profile registration and menu', pass: true });
    result.runtime = await app.evaluate(({ app, BrowserWindow }) => ({ packaged: app.isPackaged, versions: process.versions,
        preferences: BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences() }));
    result.actualOrigin = await page.evaluate(() => ({ origin: location.origin, secure: isSecureContext, node: typeof process }));
    assert.equal(result.actualOrigin.origin, 'ra2://game'); assert.equal(result.actualOrigin.node, 'undefined');
    for (const url of ['ra2://other/', 'ra2://game/.git/config', 'ra2://game/local-support/ini.mix', 'ra2://game/local-assets/ra2md.mix']) {
        const check = await page.evaluate(async url => { try { const r = await fetch(url); return { url, status: r.status }; } catch (e) { return { url, rejected: e.message }; } }, url);
        assert.ok(check.rejected || check.status >= 400); result.cases.push(check);
    }
    result.safeManifest = await page.evaluate(async () => (await fetch('/local-assets/manifest.json')).json());
    assert.equal(result.safeManifest.files.length, 3);
    assert.ok(!/sourcePath|destination|Users|Resource\//.test(JSON.stringify(result.safeManifest)));
    result.bridgeRefusal = await page.evaluate(() => window.desktopProfile.choose());
    assert.equal(result.bridgeRefusal, 'Resource selection is unavailable here.');
    result.blob = await page.evaluate(async () => {
        const url = URL.createObjectURL(new Blob(['local-test']));
        try { return { url, content: await (await fetch(url)).text() }; } finally { URL.revokeObjectURL(url); }
    });
    assert.equal(result.blob.content, 'local-test');
    result.mainBoundary = await app.evaluate(async ({ BrowserWindow }) => {
        try { await BrowserWindow.getAllWindows()[0].webContents.session.fetch('https://example.invalid/m03-deliberate-denial'); return 'unexpected success'; }
        catch (e) { return e.message; }
    });
    assert.notEqual(result.mainBoundary, 'unexpected success');
    await page.evaluate(() => window.open('https://example.invalid/m03-popup'));
    assert.equal((await app.windows()).length, 1);
    await page.evaluate(() => { location.href = 'https://example.invalid/m03-navigation'; });
    await page.waitForTimeout(300);
    assert.equal(page.url(), 'ra2://game/');
    // Clear Playwright's pending-navigation bookkeeping after the intentionally cancelled navigation.
    await page.goto('ra2://game/');
    await page.getByText('Offline Skirmish', { exact: true }).waitFor({ timeout: 90000 });
    await page.getByText('Offline Skirmish', { exact: true }).click();
    const speed = page.locator('input[name="gameSpeed"]');
    await speed.waitFor(); assert.equal(await speed.isEnabled(), true);
    result.gameSpeedControl = { present: true, enabled: true, value: await speed.inputValue() };
    await page.screenshot({ path: path.join(output, 'lobby-speed.png') });
    await app.close();
    fs.copyFileSync(path.join(userData, 'last-session.json'), path.join(output, 'boundary-session.json'));
    const savedRegistration = fs.readFileSync(path.join(userData, 'resource-registration.json'), 'utf8');
    app = await launch(); page = await app.firstWindow();
    await page.getByText('Offline Skirmish', { exact: true }).waitFor({ timeout: 90000 });
    assert.equal(fs.readFileSync(path.join(userData, 'resource-registration.json'), 'utf8'), savedRegistration);
    result.cases.push({ name: 'packaged quit and relaunch without chooser', pass: true });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
    await app.evaluate(({ app }) => app.emit('activate'));
    page = await app.firstWindow();
    await page.getByText('Offline Skirmish', { exact: true }).waitFor({ timeout: 90000 });
    result.cases.push({ name: 'macOS close window and activate', pass: true });
    result.status = 'PASS';
} catch (e) { result.status = 'FAIL'; result.error = e.stack; }
finally { fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2)); await app?.close(); }
console.log(JSON.stringify({ status: result.status, error: result.error, cases: result.cases.length }));
