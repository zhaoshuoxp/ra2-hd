import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const build = path.resolve(process.argv[2]), out = path.resolve(process.argv[3]);
await fs.mkdir(out, { recursive: false });
const profile = path.join(out, 'profile'); await fs.mkdir(profile);
await fs.writeFile(path.join(profile, 'resource-registration.json'), JSON.stringify({ schemaVersion: 1, directory: path.resolve('.local') }));
const locale = JSON.parse(await fs.readFile('public/res/locale/zh-CN.json', 'utf8'));
const report = { status: 'RUNNING', errors: [], cases: [] };
const app = await electron.launch({ executablePath: await fs.realpath('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
    cwd: '/private/tmp', args: [build], env: { ...process.env, RA2_DESKTOP_USER_DATA: profile, RA2_DESKTOP_NO_DISCOVERY: '1' } });
try {
    const page = await app.firstWindow(); page.on('pageerror', e => report.errors.push(e.stack));
    let edition;
    for (const [nextEdition, map, hd] of [['ra2', 'MP01T4.map', false], ['ra2', 'MP01T4.map', true],
        ['yr', 'XMP12S4.map', true], ['yr', 'Manhatta.map', true]]) {
        if (edition !== nextEdition) {
            if (edition) await page.getByRole('button', { name: locale['hd:menuedition'], exact: true }).click();
            await page.locator(`[data-edition=${nextEdition}]`).click({ timeout: 60000 });
            edition = nextEdition;
        }
        await page.getByRole('button', { name: locale['hd:menuskirmish'], exact: true }).waitFor({ timeout: 90000 });
        const previous = await page.evaluate(({ edition, map, hd }) => {
            const d = window.__ra2debug, previous = d.generalOptions.graphics.hdEnabled.value;
            d.generalOptions.graphics.hdEnabled.value = hd;
            const values = { _r_lastMap: map, _r_lastMode: '1', _r_lastCountry: '5', _r_lastColor: '2',
                _r_lastStartPos: '0', _r_hostOpts: '6;10000;10;1;1;0;1;0;;0;1;0;0',
                _r_lastBots: JSON.stringify([null, null, null, { d: 2, c: 5, co: 1, s: 3, t: 1 }, null, null, null, null]) };
            for (const [k, v] of Object.entries(values)) localStorage.setItem(`_edition:${edition}:${k}`, v);
            return previous;
        }, { edition, map, hd });
        if (!report.cases.length) assert.equal(previous, true, 'Global HD defaults on in a fresh profile');
        await page.getByRole('button', { name: locale['hd:menuskirmish'], exact: true }).click();
        await page.waitForFunction(() => window.__ra2debug.skirmishLobby);
        await page.evaluate(() => { void window.__ra2debug.skirmishLobby.startGame(); });
        await page.waitForFunction(() => window.__ra2debug.game?.status === 1, undefined, { timeout: 90000 });
        const state = await page.evaluate(() => {
            const d = window.__ra2debug, w = d.worldView;
            const families = [w.napowrHd, ...Object.values(w.sovietBuildingsHd)].filter(Boolean);
            const textures = new Set(families.flatMap(f => [...f.overrides.values()].flatMap(o => o.pages.flatMap(p => [p.base, p.data, p.tiles?.map].filter(Boolean)))));
            window.coverageDisposal = { allocated: textures.size, disposed: 0 };
            textures.forEach(t => t.addEventListener('dispose', () => window.coverageDisposal.disposed++));
            return { theater: d.theater.type, densities: families.map(f => f.report.density),
                gpuBytes: families.reduce((n, f) => n + f.report.gpuBytes, 0), allocated: textures.size,
                gl: d.renderer.renderer.getContext().getError() };
        });
        assert.equal(state.gl, 0);
        assert.equal(state.densities.length, hd ? 18 : 0);
        if (hd) assert(state.densities.every(d => d >= 2));
        await page.screenshot({ path: path.join(out, `${report.cases.length}-${edition}-${hd ? 'hd' : 'original'}.png`) });
        await page.evaluate(() => {
            const menu = window.__ra2debug.gameScreen.menu;
            menu.open(); menu._onQuit.dispatch(menu);
        });
        await page.locator('.score-table').waitFor({ timeout: 20000 });
        const disposal = await page.evaluate(() => ({ ...window.coverageDisposal, worldReleased: !window.__ra2debug.worldView }));
        assert.equal(disposal.disposed, disposal.allocated);
        assert(disposal.worldReleased);
        await page.getByRole('button', { name: /^(Continue|继续)$/, exact: true }).click();
        await page.waitForFunction(() => window.__ra2debug.skirmishLobby);
        const back = await page.evaluate(() => window.__ra2debug.mainMenuController.getCurrentScreen().strings.get('GUI:Back'));
        await page.getByRole('button', { name: back, exact: true }).click();
        report.cases.push({ edition, map, hd, state, disposal });
        await fs.writeFile(path.join(out, 'result.json'), JSON.stringify(report, null, 2));
    }
    assert.deepEqual(report.errors, []);
    report.status = 'PASS_GLOBAL_HD_DEFAULT_TOGGLE_EDITION_THEATER_AND_TEXTURE_TEARDOWN';
} catch (e) { report.status = 'FAIL'; report.failure = e.stack; process.exitCode = 1; }
finally { await app.close(); await fs.writeFile(path.join(out, 'result.json'), JSON.stringify(report, null, 2)); }
console.log(report.status, report.failure ?? '');
