// Run only relocation-dependent checks; retain the earlier three-faction R3 evidence.
import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const folder = path.resolve(process.argv[2]), output = path.resolve(process.argv[3]);
const appPath = path.join(folder, 'Red Alert 2 HD Yuri Cameos E R3.app');
const resources = path.join(folder, 'RA2-HD-UI-Resources'), uiRoot = path.join(folder, 'RA2-HD-Yuri-Cameos-Resources');
const selection = JSON.parse(await fs.readFile(path.join(uiRoot, 'ui-selection.json'), 'utf8'));
const report = { status: 'RUNNING', app: appPath, resources, uiRoot, cases: [], errors: [], profilesShipped: false };
const locale = JSON.parse(await fs.readFile('public/res/locale/zh-CN.json', 'utf8'));
await fs.mkdir(output, { recursive: false });
let app;
try {
    for (const [edition, country] of [['ra2', 0], ['yr', 9]]) {
        const out = path.join(output, edition), profile = path.join(out, 'profile'); await fs.mkdir(profile, { recursive: true });
        const env = { ...process.env, RA2_DESKTOP_USER_DATA: profile, TMPDIR: out };
        delete env.RA2_DESKTOP_NO_DISCOVERY; delete env.RA2_UI_RESOURCE_ROOT; delete env.RA2_UI_REVIEW;
        app = await electron.launch({ executablePath: path.join(appPath, 'Contents/MacOS/RA2 HD Yuri Cameos'),
            args: [], cwd: '/private/tmp', env, timeout: 60000 });
        const page = await app.firstWindow(), result = { edition, status: 'RUNNING' }; report.cases.push(result);
        page.on('pageerror', error => report.errors.push(error.stack));
        await page.locator(`[data-edition=${edition}]`).click({ timeout: 90000 });
        await page.getByRole('button', { name: locale['hd:menuskirmish'], exact: true }).waitFor({ timeout: 90000 });
        const registered = JSON.parse(await fs.readFile(path.join(profile, 'resource-registration.json'), 'utf8'));
        assert.equal(registered.directory, resources); result.automaticSiblingDiscovery = true;
        assert.equal(await app.evaluate(({ app }) => app.isPackaged), true);
        await page.waitForFunction(revision => window.__ra2debug?.uiArt?.revision === revision, selection.revision);
        result.uiRevision = await page.evaluate(() => window.__ra2debug.uiArt.revision);
        await page.evaluate(({ edition, country }) => {
            const d = window.__ra2debug; d.generalOptions.graphics.hdEnabled.value = true;
            const prefs = { _r_lastMap: (edition === 'yr' ? 'X' : '') + 'MP01T4.map', _r_lastMode: '1',
                _r_lastCountry: String(country), _r_lastColor: '1', _r_lastStartPos: '0', _r_lastTeam: '0',
                _r_hostOpts: '6;10000;0;1;1;0;1;0;;0;1;0;0',
                _r_lastBots: JSON.stringify([null, null, null, { d: 4, c: 5, co: 2, s: 3, t: 1 }, null, null, null, null]) };
            for (const [key, value] of Object.entries(prefs)) localStorage.setItem(`_edition:${edition}:${key}`, value);
        }, { edition, country });
        await page.getByRole('button', { name: locale['hd:menuskirmish'], exact: true }).click();
        await page.waitForFunction(() => window.__ra2debug.skirmishLobby);
        if (edition === 'yr') {
            await page.evaluate(() => {
                const d = window.__ra2debug, root = d.mainMenuController.getCurrentScreen().rootController;
                const screen = [...root.screens.values()].find(s => s.gameLoader), loader = screen.gameLoader;
                const original = loader.load, held = new Promise(resolve => { window.__releaseZipLoading = resolve; });
                loader.load = async function(...args) { const value = await original.apply(this, args); await held; loader.load = original; return value; };
                void d.skirmishLobby.startGame(1700000000000);
            });
            await page.waitForFunction(() => document.querySelector('[data-loading-backdrop]')?.dataset.loadingSource === 'hd', undefined, { timeout: 90000 });
            result.loading = await page.locator('[data-loading-backdrop]').evaluate(canvas => ({
                source: canvas.dataset.loadingSource, id: canvas.dataset.loadingArtId, ui: window.__ra2debug.uiArt.metrics() }));
            assert.equal(result.loading.id, 'loading-background-yuri');
            await page.screenshot({ path: path.join(out, 'yuri-loading-hd.png') });
            await page.evaluate(() => window.__releaseZipLoading());
        } else await page.evaluate(() => window.__ra2debug.skirmishLobby.startGame(1700000000000));
        await page.waitForFunction(() => window.__ra2debug?.game?.status === 1, undefined, { timeout: 90000 });
        result.gameStarted = true;
        result.nativeFiles = await page.evaluate(async edition => (await (await fetch(
            edition === 'yr' ? '/local-assets/yr/manifest.json' : '/local-assets/manifest.json')).json()).files.length, edition);
        assert.equal(result.nativeFiles, edition === 'yr' ? 7 : 3);
        result.availability = await page.evaluate(async () => (await fetch('/local-hd/availability.json')).json());
        const bytes = await page.evaluate(async revision => Array.from(new Uint8Array(await (await fetch(
            `/local-ui/${revision}/forcicon.png`)).arrayBuffer())), selection.revision);
        result.shieldSha256 = createHash('sha256').update(Buffer.from(bytes)).digest('hex');
        assert.equal(result.shieldSha256, '037eeb4431d4b3fa847a388d05f8078f077b07439e7142ad4ce8988c2a70b706');
        result.glError = await page.evaluate(() => window.__ra2debug.renderer.renderer.getContext().getError());
        assert.equal(result.glError, 0); await page.screenshot({ path: path.join(out, 'match.png') });
        result.status = 'PASS_RELOCATED_PACKAGE_AUTODISCOVERY_AND_NATIVE_MATCH';
        await app.close(); app = undefined;
    }
    assert.deepEqual(report.errors, []); report.status = 'PASS_EXTRACTED_DESKTOP_ZIP_BOTH_EDITIONS_AND_YURI_LOADING';
} catch (error) {
    report.status = 'FAIL'; report.failure = error.stack; process.exitCode = 1; console.error(error);
} finally {
    if (app) await app.close();
    await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(report.status);
}
