// Verify the copied application's fresh-profile launch and automatic sibling discovery.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { _electron as electron } from '@playwright/test';

const output = path.resolve('.artifacts/yuri-cameos-main-integration-v1/launch-check');
const receipt = JSON.parse(await fs.readFile('.artifacts/yuri-cameos-main-integration-v1/package.json', 'utf8'));
await fs.mkdir(output);
const profile = path.join(output, 'profile'); await fs.mkdir(profile);
const env = { ...process.env, RA2_DESKTOP_USER_DATA: profile };
for (const key of ['RA2_DESKTOP_NO_DISCOVERY', 'RA2_UI_RESOURCE_ROOT', 'RA2_UI_REVIEW']) delete env[key];
const report = { status: 'RUNNING', app: receipt.app, profile, preseededRegistration: false, errors: [] };
let app;
try {
    app = await electron.launch({ executablePath: path.join(receipt.app, 'Contents/MacOS', receipt.executable),
        cwd: '/private/tmp', env, timeout: 60000 });
    const page = await app.firstWindow(); page.on('pageerror', error => report.errors.push(error.stack));
    await page.locator('[data-edition=yr]').click({ timeout: 90000 });
    await page.waitForFunction(() => window.__ra2debug?.uiArt?.revision === 'yuri-cameos-e-main-v1', undefined, { timeout: 90000 });
    const registered = JSON.parse(await fs.readFile(path.join(profile, 'resource-registration.json'), 'utf8'));
    assert.equal(registered.directory, receipt.resources);
    assert.equal(await app.evaluate(({ app }) => app.isPackaged), true);
    report.uiRevision = await page.evaluate(() => window.__ra2debug.uiArt.revision);
    report.defaultDensity = await page.evaluate(() => window.__ra2debug.generalOptions.graphics.hdDensity.value);
    assert.equal(report.defaultDensity, 4);
    report.registeredRoot = registered.directory; report.uiRoot = receipt.uiRoot;
    assert.deepEqual(report.errors, []);
    await page.screenshot({ path: path.join(output, 'main-menu.png') });
    report.status = 'PASS_COPIED_APP_AUTODISCOVERY_AND_INDEPENDENT_UI_ROOT';
} catch (error) {
    report.status = 'FAIL'; report.failure = error.stack; process.exitCode = 1;
} finally {
    if (app) await app.close();
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(report.status);
}
