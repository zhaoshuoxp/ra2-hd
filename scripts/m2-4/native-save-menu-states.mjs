import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
const [receiptFile, sourceProfile, output] = process.argv.slice(2);
const artifact = JSON.parse(await fs.readFile(receiptFile, 'utf8'));
const out = path.resolve(output), profile = path.join(out, 'profile');
await fs.mkdir(out, { recursive: false });
await fs.cp(sourceProfile, profile, { recursive: true, force: false, errorOnExist: true });
const report = { status: 'RUNNING', errors: [], states: [] };
const app = await electron.launch({ executablePath: artifact.app ? path.join(artifact.app, 'Contents/MacOS/RA2 HD Editions')
    : await fs.realpath('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
    args: artifact.app ? [] : [artifact.build], cwd: '/private/tmp',
    env: { ...process.env, RA2_DESKTOP_USER_DATA: profile, RA2_DESKTOP_NO_DISCOVERY: '1' } });
const page = await app.firstWindow();
page.on('pageerror', error => report.errors.push(error.stack));
const snapshot = async (button, name) => {
    await page.waitForTimeout(100);
    const style = await button.evaluate(element => {
        const css = getComputedStyle(element), rect = element.getBoundingClientRect();
        return { position: css.backgroundPositionX, border: css.borderWidth, width: rect.width, height: rect.height };
    });
    await button.screenshot({ path: path.join(out, name + '.png') });
    report.states.push({ name, ...style }); return style;
};
try {
    await page.locator('[data-edition=ra2]').click({ timeout: 90000 });
    await page.waitForFunction(() => window.__ra2debug?.mainMenuController);
    const label = await page.evaluate(() => window.__ra2debug.mainMenuController.screens.get(0).strings.get('HD:LoadGame'));
    await page.getByRole('button', { name: label, exact: true }).click();
    const load = page.locator('[data-action=LoadGame]'); await load.waitFor({ state: 'visible' });
    await page.mouse.move(0, 0); await snapshot(load, 'sidebar-normal');
    assert.equal(await page.evaluate(() => window.__ra2debug.mainMenu.sidebarSlots[0].getFrame()), 2);
    await load.hover(); await snapshot(load, 'sidebar-hover');
    assert.equal(await page.evaluate(() => window.__ra2debug.mainMenu.sidebarSlots[0].getFrame()), 3);
    await page.mouse.down(); await snapshot(load, 'sidebar-pressed');
    assert.equal(await page.evaluate(() => window.__ra2debug.mainMenu.sidebarSlots[0].getFrame()), 4);
    await page.mouse.move(0, 0); await page.mouse.up();
    await page.locator('[data-action=DeleteSave]').click();
    await page.waitForFunction(() => document.querySelector('.save-native-popup')?.dataset.buttonArt === 'hd'
        && document.querySelector('.save-popup-panel canvas')?.dataset.backdropSource === 'hd'
        && document.querySelector('.save-popup-panel canvas')?.dataset.backdropDensity === '2');
    const confirm = page.locator('[data-action=ConfirmSaveAction]');
    await page.mouse.move(0, 0);
    const normal = await snapshot(confirm, 'popup-normal'); assert.equal(normal.border, '0px');
    await confirm.hover(); const hover = await snapshot(confirm, 'popup-hover');
    await page.mouse.down(); const pressed = await snapshot(confirm, 'popup-pressed');
    assert.notEqual(normal.position, hover.position); assert.notEqual(hover.position, pressed.position);
    await page.mouse.move(0, 0); await page.mouse.up();
    await confirm.evaluate(element => { element.disabled = true; }); await snapshot(confirm, 'popup-disabled');
    await confirm.evaluate(element => { element.disabled = false; });
    report.popup = await page.locator('.save-popup-panel').boundingBox();
    assert(Math.abs(report.popup.width / report.popup.height - 451 / 326) < .01);
    assert.equal(await page.locator('.save-popup-panel canvas').evaluate(element => getComputedStyle(element).objectFit), 'fill');
    await page.evaluate(() => getSelection()?.removeAllRanges());
    await page.screenshot({ path: path.join(out, 'complete-popup-frame.png') });
    await page.locator('[data-action=CancelSaveAction]').click();
    await page.locator('[data-action=CloseSaves]').click();
    await page.getByRole('button', { name: label, exact: true }).waitFor({ state: 'visible' });
    await page.waitForTimeout(200);
    await page.evaluate(() => { const home = window.__ra2debug.mainMenuController.screens.get(0);
        void home.messageBoxApi.alert('Native popup style verification', home.strings.get('GUI:OK')); });
    await page.waitForFunction(() => document.querySelector('.message-box-footer')?.dataset.buttonArt === 'hd');
    await page.screenshot({ path: path.join(out, 'standard-popup.png') });
    await page.locator('.standard-message-box .dialog-button').click();
    assert.deepEqual(report.errors, []);
    report.status = 'PASS_NATIVE_RED_HOVER_PRESSED_DISABLED_PANELS_AND_COMPLETE_POPUP_FRAME';
} catch (error) {
    report.status = 'FAIL'; report.failure = error.stack;
    await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await app.close();
}
console.log(JSON.stringify(report));
if (report.status === 'FAIL') process.exitCode = 1;
