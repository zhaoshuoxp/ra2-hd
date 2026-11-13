import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { _electron as electron } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '../..');
const out = path.resolve(process.argv[2]);
const extracted = JSON.parse(await fs.readFile(path.join(root, '.artifacts/m3-1/mac-delivery/extracted.json')));
const executable = path.join(extracted.app, 'Contents/MacOS', extracted.executable);
await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', executable, cases: [], errors: [], failedResources: [] };
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('RA2_')));
let app;
try {
    app = await electron.launch({ executablePath: executable, cwd: '/private/tmp', timeout: 60000,
        env: { ...environment, RA2_DESKTOP_USER_DATA: path.join(out, 'profile') } });
    app.process().stdout?.on('data', bytes => { void fs.appendFile(path.join(out, 'electron.log'), bytes); });
    app.process().stderr?.on('data', bytes => { void fs.appendFile(path.join(out, 'electron.log'), bytes); });
    const page = await app.firstWindow();
    page.on('pageerror', error => report.errors.push(error.stack));
    page.on('response', response => { if (response.status() >= 400) report.failedResources.push({ url: response.url(), status: response.status() }); });
    await page.locator('[data-edition=yr]').click({ timeout: 90000 });
    await page.waitForFunction(() => window.__ra2debug?.mainMenuController && document.querySelector('.hd-menu-scene'), undefined, { timeout: 90000 });
    const browserWindow = await app.browserWindow(page);
    await browserWindow.evaluate(window => { window.setFullScreen(false); window.unmaximize(); window.setContentSize(1774, 1163); });
    const language = await page.evaluate(() => document.documentElement.lang);
    const labels = { ...JSON.parse(await fs.readFile(path.join(root, `public/res/locale/retail-ra2-${language}.json`))).labels,
        ...JSON.parse(await fs.readFile(path.join(root, `public/res/locale/${language}.json`))) };
    await page.getByRole('button', { name: labels['hd:menucampaign'], exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-campaign-selection] p')?.textContent?.length > 0);
    report.cases.push(await page.evaluate(() => ({ name: 'YR campaign entry', url: location.href,
        ready: document.querySelector('[data-campaign-selection]').dataset.campaignReady,
        canvasCount: document.querySelectorAll('[data-campaign-selection] canvas').length,
        factions: document.querySelectorAll('[data-campaign-faction]').length,
        status: document.querySelector('[data-campaign-selection] p').textContent,
        size: [innerWidth, innerHeight], dpr: devicePixelRatio,
        buttons: [...document.querySelectorAll('button')].map(node => ({ text: node.textContent, disabled: node.disabled })) })));
    await page.screenshot({ path: path.join(out, '01-yr-blank-campaign.png') }); await save();
    await page.getByRole('button', { name: labels['gui:back'], exact: true }).click();
    await page.getByRole('button', { name: labels['hd:menuedition'], exact: true }).click();
    await page.locator('[data-edition=ra2]').click({ timeout: 90000 });
    await page.getByRole('button', { name: labels['hd:menucampaign'], exact: true }).click({ timeout: 90000 });
    await page.waitForSelector('[data-campaign-ready=true]', { timeout: 90000 });
    report.cases.push(await page.evaluate(() => ({ name: 'RA2 campaign entry', url: location.href,
        ready: document.querySelector('[data-campaign-selection]').dataset.campaignReady,
        canvasCount: document.querySelectorAll('[data-campaign-selection] canvas').length,
        factions: document.querySelectorAll('[data-campaign-faction]').length,
        status: document.querySelector('[data-campaign-selection] p').textContent,
        size: [innerWidth, innerHeight], dpr: devicePixelRatio })));
    await page.screenshot({ path: path.join(out, '02-ra2-playable-campaign.png') }); await save();
    assert.equal(report.cases[0].factions, 0); assert.equal(report.cases[1].factions, 3);
    await page.locator('[data-campaign-faction=soviet]').click();
    await page.waitForFunction(() => document.querySelector('[data-campaign-media] video')?.currentTime > 0.5);
    await page.screenshot({ path: path.join(out, '03-original-intro.png') });
    await page.locator('[data-campaign-media] button').click();
    await page.waitForFunction(() => window.__ra2debug?.game?.campaign && window.__ra2debug.game.status === 1, undefined, { timeout: 180000 });
    report.game = await page.evaluate(() => { const d = window.__ra2debug; d.gameScreen.gameTurnMgr.setCampaignPaused(true); d.gameScreen.pointer.unlock(true);
        return { campaign: d.game.campaign.definition.id, tick: d.game.currentTick, status: d.game.status, edition: new URL(location.href).searchParams.get('edition') }; });
    await page.screenshot({ path: path.join(out, '04-running-soviet01.png') });
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_REPRODUCED_YR_DEAD_END_AND_RA2_PLAYABLE_ENTRY';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
} finally { await save(); await app?.close(); }
console.log(JSON.stringify({ status: report.status, out, cases: report.cases, game: report.game, error: report.error }));
