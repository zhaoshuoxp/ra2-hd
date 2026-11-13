import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld } from '../m3-2/native-session.mjs';

const out = path.resolve(process.argv[2]); await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [],
    scope: 'Move the isolated native test window onto the actual built-in Mac display. Hold the original training loading presentation in fullscreen and measure title/progress placement against its real work-area inset. No display arrangement, real user preference or source mission data is changed.' };
let app, page;
try {
    ({ app, page } = await campaignSession(out, report, { density: 2 }));
    report.display = await app.evaluate(({ screen, BrowserWindow }) => {
        const display = screen.getAllDisplays().find(display => display.internal);
        if (!display) throw Error('An actual built-in display is required');
        const window = BrowserWindow.getAllWindows()[0]; window.setSimpleFullScreen(false);
        window.setBounds({ x: display.bounds.x + 8, y: display.workArea.y + 8,
            width: Math.min(1200, display.workArea.width - 16), height: Math.min(760, display.workArea.height - 16) });
        return { internal: display.internal, label: display.label, bounds: display.bounds,
            workArea: display.workArea, scaleFactor: display.scaleFactor };
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => {
        const factory = window.__ra2debug.mainMenuController.screens.get(22).rootController.screens.get(1).loadingScreenApiFactory;
        const create = factory.create.bind(factory); factory.create = (...args) => {
            const api = create(...args), start = api.start.bind(api);
            api.start = async (...args) => { await start(...args); window.__heldLoading = api;
                await new Promise(resolve => window.__releaseLoading = resolve); };
            return api;
        };
        window.__ra2debug.mainMenuController.screens.get(22).launchPrepared('trn01t.map');
    });
    await page.waitForSelector('[data-campaign-loading]', { timeout: 90000 });
    await page.evaluate(() => window.desktopDisplay.set('fullscreen')); await page.waitForTimeout(500);
    report.frame = await page.evaluate(async () => {
        const root = document.querySelector('[data-campaign-loading]');
        window.__heldLoading.onLoadProgress(65);
        return { state: await window.desktopDisplay.get(), viewport: [innerWidth, innerHeight],
            title: root.querySelector('[data-campaign-load-message]').getBoundingClientRect().toJSON(),
            progress: root.querySelector('[role=progressbar]').getBoundingClientRect().toJSON(),
            protectedTop: Number(root.dataset.protectedTop) };
    });
    assert(report.display.internal && report.frame.state.fullscreen);
    assert(report.frame.state.safeAreaTop >= 32);
    assert(report.frame.title.top >= report.frame.state.safeAreaTop - .5);
    assert(report.frame.progress.bottom <= report.frame.viewport[1] + .5);
    await page.screenshot({ path: path.join(out, 'native-builtin-fullscreen-safe-loading.png') });
    await page.evaluate(() => window.__releaseLoading()); await waitWorld(page, 'trn01t.map');
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_NATIVE_BUILTIN_MAC_FULLSCREEN_LOADING_TITLE_AND_PROGRESS_SAFE_AREA';
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally { await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
