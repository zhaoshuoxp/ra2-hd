// Verify a relocated delivery's own wrapper and default private resource registration.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { _electron as electron } from '@playwright/test';

const [folderArg, outputArg] = process.argv.slice(2);
const folder = path.resolve(folderArg), output = path.resolve(outputArg);
await fs.mkdir(output, { recursive: false });
const appTitle = process.argv.find(value => value.startsWith('--app-title='))?.slice(12) ?? 'Red Alert 2 HD M2.4';
const appPath = path.join(folder, appTitle + '.app');
const profile = path.join(folder, 'M2.4-Review-Profile');
const resources = path.join(folder, 'RA2-HD-Editions-Resources');
const env = { ...process.env };
for (const key of ['RA2_DESKTOP_USER_DATA', 'RA2_UI_RESOURCE_ROOT', 'RA2_UI_REVIEW']) delete env[key];
const app = await electron.launch({ executablePath: path.join(appPath, 'Contents/MacOS/RA2 HD Editions'),
    args: [], cwd: '/private/tmp', env, timeout: 60000 });
const page = await app.firstWindow(), errors = [];
page.on('pageerror', error => errors.push(error.stack));
const report = { status: 'RUNNING', app: appPath, resources, profile, errors,
    disclosure: 'Actual relocated app launched without a source checkout, development server or supplied resource/user-data override. The packaged wrapper creates its own sibling profile. No QA objects, map edits or rule changes.' };
try {
    report.actualProfile = await app.evaluate(({ app }) => app.getPath('userData'));
    report.display = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio }));
    assert.equal(report.actualProfile, profile);
    const registration = JSON.parse(await fs.readFile(path.join(profile, 'resource-registration.json')));
    assert.equal(registration.directory, resources);
    if (process.argv.includes('--selector-languages')) {
        report.selectorLanguages = [];
        for (const language of ['zh-TW', 'en-US', 'zh-CN']) {
            const strings = JSON.parse(await fs.readFile(`public/res/locale/${language}.json`));
            await page.locator('[data-edition-language]').selectOption(language);
            await page.waitForFunction(({ language, heading }) => document.documentElement.lang === language
                && document.querySelector('#edition-heading')?.textContent === heading,
            { language, heading: strings['hd:chooseedition'] });
            const notice = await page.evaluate(() => {
                const el = document.querySelector('[data-edition-notice]');
                return { disclaimer: el.querySelector('[data-edition-disclaimer]').textContent,
                    copyright: el.querySelector('[data-edition-copyright]').textContent,
                    rect: el.getBoundingClientRect().toJSON(), viewport: [innerWidth, innerHeight] };
            });
            assert.equal(notice.disclaimer, strings['ts:disclaimer']);
            assert.equal(notice.copyright, strings['HD:StartupCopyright'].replace('%s', 'v0.2'));
            assert(notice.rect.width > 0 && notice.rect.height > 0 && notice.rect.x >= 0);
            await page.screenshot({ path: path.join(output, `selector-${language}.png`) });
            await page.locator('[data-edition-notice]').screenshot({ path: path.join(output, `notice-${language}.png`) });
            await page.evaluate(() => { document.querySelector('.edition-select').scrollTop = 0; });
            report.selectorLanguages.push({ language, heading: strings['hd:chooseedition'], notice, status: 'PASS' });
        }
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: 768, height: 600, deviceScaleFactor: 1, mobile: false });
        await page.locator('[data-edition-notice]').scrollIntoViewIfNeeded();
        report.shortSelector = await page.evaluate(() => {
            const root = document.querySelector('.edition-select'), notice = document.querySelector('[data-edition-notice]');
            return { scrollable: root.scrollHeight > root.clientHeight, scrollTop: root.scrollTop,
                notice: notice.getBoundingClientRect().toJSON(), width: root.clientWidth, height: root.clientHeight };
        });
        assert(report.shortSelector.notice.left >= 0 && report.shortSelector.notice.right <= 768);
        assert(report.shortSelector.notice.top >= 0 && report.shortSelector.notice.bottom <= 600);
        await page.screenshot({ path: path.join(output, 'selector-short-window.png') });
        await cdp.send('Emulation.clearDeviceMetricsOverride');
        await page.evaluate(() => { document.querySelector('.edition-select').scrollTop = 0; });
    }
    await page.locator('[data-edition=yr]').click({ timeout: 60000 });
    await page.waitForFunction(() => window.__ra2debug?.mainMenuController && document.querySelector('.hd-menu-scene'),
        undefined, { timeout: 90000 });
    await page.evaluate(() => {
        const d = window.__ra2debug;
        d.generalOptions.graphics.hdEnabled.value = true;
        d.generalOptions.graphics.hdDensity.value = 4;
        d.generalOptions.graphics.renderResolution.value = '1080p';
        const bots = Array(8).fill(null);
        bots[1] = { d: 4, c: 5, co: 2, s: 1, t: 1 };
        Object.entries({ _r_lastMap: 'rushhr.map', _r_lastMode: '1', _r_lastCountry: '0',
            _r_lastColor: '1', _r_lastStartPos: '0', _r_lastTeam: '0',
            _r_hostOpts: '6;10000;0;1;1;0;1;0;;0;1;0;0', _r_lastBots: JSON.stringify(bots) })
            .forEach(([key, value]) => localStorage.setItem(`_edition:yr:${key}`, value));
    });
    const locale = JSON.parse(await fs.readFile('public/res/locale/zh-CN.json'));
    await page.getByRole('button', { name: new RegExp(`${locale['hd:menuskirmish']}|Skirmish`, 'i') }).click();
    await page.waitForFunction(() => window.__ra2debug?.skirmishLobby);
    await page.evaluate(() => window.__ra2debug.skirmishLobby.startGame(1700000000000));
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1, undefined, { timeout: 90000 });
    report.native = await page.evaluate(() => {
        const d = window.__ra2debug;
        return { map: d.game.gameOpts.mapName, mode: d.game.gameModeType, tick: d.game.currentTick,
            renderControls: { resolution: d.generalOptions.graphics.renderResolution.value,
                buffer: [d.renderer.getCanvas().width, d.renderer.getCanvas().height],
                logical: [d.renderer.width, d.renderer.height] },
            environment: { worldChargeBytes: d.environmentHd.worldChargeBytes,
                families: Object.fromEntries(Object.entries(d.environmentHd.families)
                    .map(([name, family]) => [name, { density: family.density, status: family.status }])) },
            terrain: { worldChargeBytes: d.terrainHd.worldChargeBytes,
                groups: d.terrainHd.groups.map(group => ({ density: group.density, status: group.status })) },
            prepared: Object.fromEntries(Object.entries(d.preparedHdCache).filter(([, value]) =>
                value === null || ['string', 'number', 'boolean'].includes(typeof value))) };
    });
    assert.equal(report.native.map.toLowerCase(), 'rushhr.map');
    assert.equal(report.native.mode, 0);
    assert(Object.values(report.native.environment.families).every(f => f.density === 4));
    assert(report.native.terrain.groups.every(g => g.status === 'PUBLISHED' && g.density === 4));
    await page.waitForFunction(before => window.__ra2debug.game.currentTick >= before + 16,
        report.native.tick, { timeout: 15000 });
    report.final = await page.evaluate(() => ({ tick: window.__ra2debug.game.currentTick,
        glError: window.__ra2debug.renderer.renderer.getContext().getError() }));
    assert.equal(report.final.glError, 0);
    assert.equal(errors.length, 0);
    await page.screenshot({ path: path.join(output, 'relocated-default-profile-native-4x.png') });
    if (process.argv.includes('--verify-result-2x')) {
        await page.evaluate(() => {
            const d = window.__ra2debug, game = d.game;
            for (const enemy of game.getCombatants().filter(player => player !== d.localPlayer))
                for (const object of [...enemy.getOwnedObjects()]) game.destroyObject(object, undefined, true);
        });
        await page.waitForFunction(() => document.querySelector('[data-game-result-banner=victory] canvas')?.dataset.resultState === 'ready',
            undefined, { timeout: 12000 });
        report.result2x = await page.evaluate(() => {
            const banner = document.querySelector('[data-game-result-banner=victory]'), canvas = banner.querySelector('canvas');
            return { text: banner.textContent, source: canvas.dataset.resultSource,
                pixels: [canvas.width, canvas.height], ui: window.__ra2debug.uiArt.metrics() };
        });
        assert.equal(report.result2x.source, 'result-victory-hd-v1-2x.png');
        assert.deepEqual(report.result2x.pixels, [872, 224]);
        assert(report.result2x.ui.reservedBytes <= report.result2x.ui.budget);
        await page.screenshot({ path: path.join(output, 'relocated-default-profile-native-result-2x.png') });
    }
    report.status = 'PASS_RELOCATED_APP_DEFAULT_PRIVATE_PROFILE_AND_SIBLING_RESOURCES_NATIVE_4X';
} catch (error) {
    report.status = 'FAIL';
    report.failure = error.stack;
    throw error;
} finally {
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await app.close();
}
console.log(JSON.stringify({ status: report.status, profile }));
