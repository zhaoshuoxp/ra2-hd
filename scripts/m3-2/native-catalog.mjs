import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, openMissionSelection, switchCampaignEdition } from './native-session.mjs';

const out = path.resolve(process.argv[2]); await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', scope: 'Native catalog controls, three languages, responsive layout, unavailable YR missions and return from campaign selection into a real skirmish.',
    errors: [], failedResources: [], layouts: [] };
let app, page, labels;
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
async function inspect(name) {
    await page.waitForSelector('[data-campaign-difficulty-choice=easy]');
    const metrics = await page.evaluate(() => { const section = document.querySelector('[data-campaign-missions]'), field = section.querySelector('fieldset'), nav = section.querySelector('div > div > nav');
        const bounds = e => e.getBoundingClientRect().toJSON();
        const faction = section.querySelector('[data-campaign-mission-faction]'), style = getComputedStyle(faction);
        return { language: document.documentElement.lang, viewport: [innerWidth, innerHeight], bounds: bounds(section), difficulty: bounds(field),
            controls: [...field.querySelectorAll('button')].map(e => ({ name: e.textContent, ...bounds(e) })),
            faction: { bounds: bounds(faction), fontSize: parseFloat(style.fontSize),
                contentHeight: faction.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) },
            rootScroll: [document.documentElement.scrollTop, document.documentElement.scrollHeight, innerHeight] }; });
    assert(metrics.difficulty.bottom <= metrics.bounds.bottom + 1 && metrics.difficulty.top >= metrics.bounds.top);
    assert(metrics.controls.every(button => button.width > 40 && button.bottom <= metrics.viewport[1] + 1));
    assert(metrics.faction.contentHeight >= metrics.faction.fontSize, 'The faction label must fit inside its actual native select control');
    assert.equal(await page.locator('[data-campaign-edition]').count(), 0);
    report.layouts.push({ name, ...metrics }); await page.screenshot({ path: path.join(out, name + '.png') }); await save();
}
try {
    ({ app, page, labels } = await campaignSession(out, report, { density: 2 }));
    await openMissionSelection(page, labels);
    await page.locator('[data-campaign-mission="sov02t.map"]').click();
    const win = await app.browserWindow(page);
    for (const [width, height] of [[1280, 800], [1600, 900], [1000, 700]]) {
        await win.evaluate((w, size) => w.setSize(...size), [width, height]); await page.waitForTimeout(150);
        await inspect(`catalog-${width}-${height}`);
    }
    for (const language of ['en-US', 'zh-TW']) {
        await page.evaluate(language => { localStorage.setItem('ra2hd.interfaceLanguage', language);
            const url = new URL(location.href); url.searchParams.set('campaign', 'select'); location.replace(url.href); }, language);
        await page.waitForFunction(language => document.documentElement.lang === language && !!document.querySelector('[data-campaign-faction=soviet]'), language, { timeout: 90000 });
        labels = await page.evaluate(() => { const s = window.__ra2debug.mainMenuController.screens.get(22).strings;
            return Object.fromEntries(['GUI:Back', 'HD:MenuEdition', 'HD:MenuCampaign', 'HD:CampaignSelectMission'].map(key => [key.toLowerCase(), s.get(key)])); });
        await openMissionSelection(page, labels); await page.locator('[data-campaign-mission="sov02t.map"]').click();
        await inspect('catalog-' + language);
        assert(!await page.locator('[data-campaign-missions]').innerText().then(text => text.includes('Name:') || text.includes('HD:')));
    }
    await switchCampaignEdition(page, labels, 'yr');
    await openMissionSelection(page, labels);
    await page.waitForSelector('[data-campaign-mission]'); await inspect('catalog-yr-unavailable');
    assert.equal(await page.locator('[data-campaign-mission][data-playable=true]').count(), 0);
    await switchCampaignEdition(page, labels, 'ra2');
    const back = await page.evaluate(() => window.__ra2debug.mainMenuController.screens.get(22).strings.get('GUI:Back'));
    await page.getByRole('button', { name: back, exact: true }).click();
    await page.evaluate(() => { const bots = Array(8).fill(null); bots[1] = { d: 4, c: 5, co: 2, s: 1, t: 1 };
        Object.entries({ _r_lastMap: 'MP01T4.map', _r_lastMode: '1', _r_lastCountry: '0', _r_lastColor: '1', _r_lastStartPos: '0', _r_lastTeam: '0',
            _r_hostOpts: '6;10000;0;1;1;0;1;0;;0;1;0;0', _r_lastBots: JSON.stringify(bots) })
            .forEach(([key, value]) => localStorage.setItem('_edition:ra2:' + key, value)); });
    const skirmish = page.getByRole('button', { name: /遭遇戰|遭遇战|Skirmish/ }); await skirmish.click();
    await page.waitForFunction(() => !!window.__ra2debug.skirmishLobby, undefined, { timeout: 60000 });
    await page.evaluate(() => window.__ra2debug.skirmishLobby.startGame(1700000000000));
    await page.waitForFunction(() => window.__ra2debug.game?.status === 1 && window.__ra2debug.gameScreen?.playerUi, undefined, { timeout: 120000 });
    report.skirmish = await page.evaluate(() => { const d = window.__ra2debug, g = d.game;
        return { campaign: !!g.campaign, map: g.gameOpts.mapName, tick: g.currentTick, movies: document.querySelectorAll('[data-campaign-media]').length,
            glError: d.renderer.renderer.getContext().getError(), trainer: { enabled: d.trainer.preferences.enabled, modified: d.trainer.session.modified } }; });
    assert(!report.skirmish.campaign); assert.equal(report.skirmish.movies, 0); assert.equal(report.skirmish.glError, 0);
    await page.screenshot({ path: path.join(out, 'skirmish-after-catalog.png') });
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = 'PASS_NATIVE_CATALOG_LANGUAGES_LAYOUT_EDITIONS_AND_RETURN_TO_SKIRMISH';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) { report.body = await page.locator('body').innerText().catch(() => ''); await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {}); }
} finally { await save(); await app?.close(); }
console.log(JSON.stringify({ status: report.status, out, error: report.error }));
