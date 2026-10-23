import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { _electron as electron } from '@playwright/test';

const stage = path.resolve(process.argv[2]), output = path.resolve(process.argv[3]);
await fs.mkdir(output, { recursive: false });
const report = { status: 'RUNNING', cases: [], errors: [], windows: 'NOT_RUN_ON_THIS_MAC' };
const originalApp = path.join(stage, 'Red Alert 2 HD.app');
const profile = path.join(output, 'full-profile');
const locale = JSON.parse(await fs.readFile('public/res/locale/zh-CN.json', 'utf8'));
const save = () => fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');

async function launch(appPath, userData) {
    const env = { ...process.env, RA2_DESKTOP_USER_DATA: userData };
    delete env.RA2_UI_RESOURCE_ROOT;
    delete env.RA2_UI_REVIEW;
    const app = await electron.launch({ executablePath: path.join(appPath, 'Contents/MacOS/RA2 HD Editions'),
        cwd: '/private/tmp', env, timeout: 60000 });
    const page = await app.firstWindow();
    page.on('pageerror', error => report.errors.push(error.message));
    await page.locator('[data-edition=yr]').waitFor({ timeout: 90000 });
    assert.equal(await page.locator('[data-edition]').count(), 2);
    return { app, page };
}

async function match(appPath, edition, density) {
    const { app, page } = await launch(appPath, profile);
    try {
        await page.locator(`[data-edition=${edition}]`).click();
        await page.waitForFunction(() => window.__ra2debug?.generalOptions, undefined, { timeout: 90000 });
        await page.evaluate(({ edition, density }) => {
            const d = window.__ra2debug, g = d.generalOptions.graphics;
            g.hdEnabled.value = true; g.hdDensity.value = density; g.renderResolution.value = '1080p';
            localStorage.setItem('distribution-persistence-probe', 'retained-across-relocation');
            const bots = Array(8).fill(null);
            bots[1] = { d: 4, c: 5, co: 2, s: 1, t: 1 };
            Object.entries({ _r_lastMap: edition === 'yr' ? 'xmp03t4.map' : 'mp01t4.map', _r_lastMode: '1',
                _r_lastCountry: '0', _r_lastColor: '1', _r_lastStartPos: '0', _r_lastTeam: '0',
                _r_hostOpts: '6;10000;0;1;1;0;1;0;;0;1;0;0', _r_lastBots: JSON.stringify(bots) })
                .forEach(([key, value]) => localStorage.setItem(`_edition:${edition}:${key}`, value));
        }, { edition, density });
        await page.getByRole('button', { name: new RegExp(`${locale['hd:menuskirmish']}|Skirmish`, 'i') }).click();
        await page.waitForFunction(() => window.__ra2debug?.skirmishLobby);
        await page.evaluate(() => window.__ra2debug.skirmishLobby.startGame(1700000000000));
        await page.waitForFunction(() => window.__ra2debug?.game?.status === 1, undefined, { timeout: 90000 });
        const tick = await page.evaluate(() => window.__ra2debug.game.currentTick);
        await page.waitForFunction(tick => window.__ra2debug.game.currentTick >= tick + 32, tick, { timeout: 30000 });
        const row = await page.evaluate(() => {
            const d = window.__ra2debug;
            return { map: d.game.gameOpts.mapName, tick: d.game.currentTick, glError: d.renderer.renderer.getContext().getError(),
                terrain: d.terrainHd.groups.map(g => ({ density: g.density, status: g.status })),
                environmentFamilies: Object.keys(d.environmentHd.families).length,
                preparedMembers: d.preparedHdCache?.members,
                density: d.generalOptions.graphics.hdDensity.value };
        });
        assert.equal(row.glError, 0); assert.equal(row.density, density);
        assert(row.terrain.length && row.terrain.every(g => g.density === density && g.status === 'PUBLISHED'));
        assert(row.environmentFamilies > 0);
        const registration = JSON.parse(await fs.readFile(path.join(profile, 'resource-registration.json')));
        assert.equal(registration.directory, path.join(appPath, 'Contents/Resources/GameResources'));
        report.cases.push({ edition, ...row, registration });
        await page.screenshot({ path: path.join(output, `${edition}-${density}x.png`) });
    } finally { await app.close(); await save(); }
}

let moved;
try {
    await match(originalApp, 'ra2', 2);
    const movedDir = path.join(stage, 'Relocated Applications');
    await fs.mkdir(movedDir);
    moved = path.join(movedDir, path.basename(originalApp));
    await fs.rename(originalApp, moved);
    await match(moved, 'yr', 4);
    const { app, page } = await launch(moved, profile);
    try {
        assert.equal(await page.evaluate(() => localStorage.getItem('distribution-persistence-probe')),
            'retained-across-relocation');
        report.settingsPersistence = 'PASS_RESTART_AND_RELOCATION';
    } finally { await app.close(); }
    await fs.rename(moved, originalApp); moved = undefined;
    await fs.rmdir(movedDir);
    const sharedProfile = path.join(output, 'shared-profile');
    await fs.mkdir(sharedProfile);
    execFileSync('cp', ['-cR', path.join(originalApp, 'Contents/Resources/GameResources'), path.join(sharedProfile, 'GameResources')]);
    const lite = path.join(stage, 'RA2-HD-v0.2-macOS-arm64-program/Red Alert 2 HD.app');
    const small = await launch(lite, sharedProfile);
    try {
        await small.page.locator('[data-edition=yr]').click();
        await small.page.waitForFunction(() => window.__ra2debug?.generalOptions, undefined, { timeout: 90000 });
        const registration = JSON.parse(await fs.readFile(path.join(sharedProfile, 'resource-registration.json')));
        assert.equal(registration.directory, path.join(sharedProfile, 'GameResources'));
        report.programOnly = 'PASS_SHARED_RESOURCE_MENU';
    } finally { await small.app.close(); }
    assert.deepEqual(report.errors, []);
    report.status = 'PASS_MAC_FULL_APP_RELOCATION_PERSISTENCE_BOTH_EDITIONS_AND_SMALL_PROGRAM';
} catch (error) {
    report.status = 'FAIL'; report.failure = error.stack; throw error;
} finally {
    if (moved) await fs.rename(moved, originalApp);
    await save();
}
console.log(JSON.stringify(report));
