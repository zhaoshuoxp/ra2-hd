import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const appPath = path.resolve(process.argv[2]), output = path.resolve(process.argv[3]);
const resources = path.join(path.dirname(appPath), 'RA2-HD-UI-Resources');
const profile = path.join(output, 'profile'); await fs.mkdir(profile, { recursive: true });
const locale = JSON.parse(await fs.readFile('public/res/locale/zh-CN.json', 'utf8'));
const report = { status: 'RUNNING', app: appPath, resources, errors: [], consoleErrors: [] };
let app, page;
async function launch() {
    app = await electron.launch({ executablePath: path.join(appPath, 'Contents/MacOS/RA2 HD UI'), args: [],
        cwd: '/private/tmp', env: { ...process.env, RA2_UI_REVIEW: '0', RA2_DESKTOP_USER_DATA: profile,
            RA2_DESKTOP_NO_DISCOVERY: '0' }, timeout: 60000 });
    page = await app.firstWindow();
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()); });
    await page.getByRole('button', { name: locale['hd:menuskirmish'], exact: true }).waitFor({ timeout: 90000 });
    await page.waitForFunction(() => window.__ra2debug.uiArt.revision === 'remaining-ui-v4');
    const registration = JSON.parse(await fs.readFile(path.join(profile, 'resource-registration.json'), 'utf8'));
    assert.equal(registration.directory, resources);
    const native = await app.evaluate(({ app }) => ({ packaged: app.isPackaged, name: app.getName() }));
    assert(native.packaged); assert.equal(native.name, 'RA2 HD UI M1.8');
    return native;
}
try {
    report.native = await launch();
    report.availability = await page.evaluate(async () => (await fetch('/local-hd/availability.json')).json());
    assert.equal(Object.keys(report.availability).length, 21);
    assert(Object.values(report.availability).every(value => value.startsWith('HD available')));
    await page.waitForFunction(() => document.querySelector('video')?.videoWidth === 1896);
    report.menu = await page.evaluate(() => ({ hd: window.__ra2debug.generalOptions.graphics.hdEnabled.value,
        revision: window.__ra2debug.uiArt.revision, video: document.querySelector('video').currentSrc,
        disabled: [...document.querySelectorAll('button.menu-button')].map(button => button.disabled) }));
    assert(report.menu.hd); assert.deepEqual(report.menu.disabled, [true, false, true, true, false, false]);
    await page.screenshot({ path: path.join(output, 'packaged-menu.png') });
    await page.evaluate(() => {
        const prefs = { _r_lastMap: 'MP01T4.map', _r_lastMode: '1', _r_lastCountry: '5', _r_lastColor: '1',
            _r_lastStartPos: '0', _r_lastTeam: '0', _r_hostOpts: '6;10000;10;1;1;0;1;0;;0;1;0;0',
            _r_lastBots: JSON.stringify([null, null, null, { d: 4, c: 5, co: 2, s: 3, t: 1 }, null, null, null, null]) };
        Object.entries(prefs).forEach(([key, value]) => localStorage.setItem(key, value));
    });
    await page.getByRole('button', { name: locale['hd:menuskirmish'], exact: true }).click();
    await page.waitForFunction(() => window.__ra2debug.skirmishLobby);
    await page.evaluate(() => { void window.__ra2debug.skirmishLobby.startGame(); });
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1, undefined, { timeout: 180000 });
    await page.evaluate(() => {
        const d = window.__ra2debug;
        d.actionsApi.orderUnits([d.localPlayer.getOwnedObjects().find(unit => /MCV$/.test(unit.name)).id], 10);
        d.generalOptions.graphics.renderResolution.value = '4k';
    });
    await page.waitForFunction(() => window.__ra2debug.localPlayer.getOwnedObjects().some(unit => /[NG]ACNST/.test(unit.name)));
    await page.waitForTimeout(1200);
    report.game = await page.evaluate(() => {
        const d = window.__ra2debug, sprites = [];
        const walk = object => { if (object.builder?.frames) sprites.push(object); object.getRenderableContainer?.().getChildren().forEach(walk); };
        walk(d.gameScreen.hud);
        return { status: d.game.status, ui: d.uiArt.metrics(), controls: sprites.length,
            hdControls: sprites.filter(sprite => sprite.isHdArtwork).length,
            gl: d.renderer.renderer.getContext().getError() };
    });
    assert(report.game.hdControls > 10); assert.equal(report.game.gl, 0);
    assert(report.game.ui.reservedBytes <= report.game.ui.budget);
    await page.screenshot({ path: path.join(output, 'packaged-game-4k.png') });
    await page.evaluate(() => { window.__ra2debug.generalOptions.graphics.hdEnabled.value = false; });
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => window.__ra2debug.uiArt.metrics().reservedBytes), 0);
    await page.evaluate(() => { window.__ra2debug.generalOptions.graphics.hdEnabled.value = true; });
    await page.waitForTimeout(800);
    await app.close(); app = undefined;
    report.restart = await launch();
    assert(await page.evaluate(() => window.__ra2debug.generalOptions.graphics.hdEnabled.value));
    assert.deepEqual(report.errors, []); assert.deepEqual(report.consoleErrors, []);
    report.status = 'PASS_PACKAGED_MAC_START_GAME_HD_SWITCH_RESTART';
} catch (error) {
    report.status = 'FAIL'; report.failure = error.stack; process.exitCode = 1; console.error(error);
} finally {
    if (app) await app.close();
    await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(report.status);
}
