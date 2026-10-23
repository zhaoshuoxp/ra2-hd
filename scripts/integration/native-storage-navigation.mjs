import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const [receiptFile, output, mode = 'verify'] = process.argv.slice(2);
const receipt = JSON.parse(await fs.readFile(receiptFile, 'utf8'));
const out = path.resolve(output), profile = path.join(out, 'profile');
await fs.mkdir(out); await fs.mkdir(profile);
await fs.writeFile(path.join(profile, 'resource-registration.json'), JSON.stringify({ schemaVersion: 1, directory: receipt.resources }));
const app = await electron.launch({
    executablePath: receipt.app ? path.join(receipt.app, 'Contents/MacOS/RA2 HD Editions')
        : await fs.realpath('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
    args: receipt.app ? [] : [receipt.build], cwd: '/private/tmp', timeout: 60000,
    env: { ...process.env, RA2_DESKTOP_USER_DATA: profile, RA2_DESKTOP_NO_DISCOVERY: '1' },
});
const report = { mode, errors: [], returned: false };
try {
    const page = await app.firstWindow();
    page.on('pageerror', error => report.errors.push(error.message));
    await page.locator('[data-edition=yr]').click({ timeout: 60000 });
    await page.waitForFunction(() => window.__ra2debug?.mainMenuController?.screens.has(16) && window.__ra2debug.mainMenuController.screens.has(19) && window.__ra2debug.mainMenuController.getCurrentScreenType() === 0, undefined, { timeout: 90000 });
    await page.evaluate(() => window.__ra2debug.mainMenuController.pushScreen(16));
    await page.waitForTimeout(600);
    await page.evaluate(() => window.__ra2debug.mainMenuController.pushScreen(19, {}));
    await page.waitForTimeout(1000);
    report.text = await page.locator('body').innerText();
    await page.screenshot({ path: path.join(out, 'storage.png') });
    if (mode === 'verify') {
        await page.locator('[data-storage-back]').click();
        await page.waitForTimeout(700);
        report.returned = await page.locator('[data-storage-back]').count() === 0;
        assert(report.returned); assert.deepEqual(report.errors, []);
        await page.evaluate(() => window.__ra2debug.mainMenuController.leaveCurrentScreen());
        await page.waitForTimeout(600);
    }
    report.status = mode === 'baseline' ? 'BASELINE_RECORDED' : 'PASS';
} catch (error) { report.failure = String(error); throw error; }
finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    await app.close();
}
