import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { _electron as electron } from '@playwright/test';

const [folderArg, outputArg] = process.argv.slice(2);
const folder = path.resolve(folderArg), output = path.resolve(outputArg);
await fs.mkdir(output, { recursive: false });
const env = { ...process.env };
for (const key of ['RA2_DESKTOP_USER_DATA', 'RA2_UI_RESOURCE_ROOT', 'RA2_DESKTOP_NO_DISCOVERY']) delete env[key];
const app = await electron.launch({ executablePath: path.join(folder, 'Red Alert 2 HD v0.2 R2.app/Contents/MacOS/RA2 HD Editions'),
    args: [], cwd: '/private/tmp', env, timeout: 60000 });
const page = await app.firstWindow();
const report = { status: 'RUNNING', errors: [], disclosure: 'Actual final Desktop app, its own copied user preferences and sibling resources. No resource, map, graphics, rule or camera overrides.' };
page.on('pageerror', error => report.errors.push(error.stack));
try {
    report.profile = await app.evaluate(({ app }) => app.getPath('userData'));
    assert.equal(report.profile, path.join(folder, 'M2.4-Review-Profile'));
    await page.locator('[data-edition=yr]').click({ timeout: 60000 });
    await page.waitForFunction(() => window.__ra2debug?.mainMenuController?.screens.has(16), undefined, { timeout: 90000 });
    report.preferences = await page.evaluate(() => ({ graphics: window.__ra2debug.generalOptions.graphics.serialize(),
        language: document.documentElement.lang }));
    const locale = JSON.parse(await fs.readFile(`public/res/locale/${report.preferences.language}.json`));
    await page.getByRole('button', { name: new RegExp(`${locale['hd:menuskirmish']}|Skirmish`, 'i') }).click();
    await page.waitForFunction(() => window.__ra2debug?.skirmishLobby);
    report.map = await page.evaluate(() => window.__ra2debug.skirmishLobby.gameOpts.mapName);
    await page.evaluate(() => window.__ra2debug.skirmishLobby.startGame(1700000000020));
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1, undefined, { timeout: 120000 });
    report.world = await page.evaluate(() => {
        const d = window.__ra2debug;
        const mcv = d.localPlayer.getOwnedObjects().find(o => /MCV$/.test(o.name));
        const r = d.renderableManager.getRenderableByGameObject(mcv);
        return { map: d.game.gameOpts.mapName, tick: d.game.currentTick, mcvHd: !!r?.unitVxlHd?.active,
            mcvFamily: d.sovietUnitsHd.families[mcv.name], terrainDensity: d.terrainHd.density,
            environmentDensity: d.environmentHd.density, glError: d.renderer.renderer.getContext().getError() };
    });
    assert.equal(report.world.glError, 0); assert(report.world.mcvHd);
    assert.equal(report.world.mcvFamily.density, Number(report.preferences.graphics.split(',')[13]));
    await page.waitForFunction(before => window.__ra2debug.game.currentTick >= before + 8, report.world.tick);
    await page.screenshot({ path: path.join(output, 'final-default-profile-native.png') });
    const diagnostic = JSON.parse(await fs.readFile(path.join(report.profile, 'world-hd-latest.json')));
    assert.equal(diagnostic.sourceHead, 'fbaac0f53fc6f0a93b570d8fcf26b2658e68a69b');
    assert.equal(diagnostic.resources, path.join(folder, 'RA2-HD-Editions-Resources'));
    report.diagnostic = diagnostic;
    assert.equal(report.errors.length, 0);
    report.status = 'PASS_FINAL_DESKTOP_OWN_PROFILE_NATIVE_HD_AND_AUTOMATIC_DIAGNOSTIC';
} catch (error) {
    report.status = 'FAIL'; report.failure = error.stack;
    await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
    throw error;
} finally {
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await app.close();
}
