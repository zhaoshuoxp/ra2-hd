import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { _electron as electron } from '@playwright/test';

const appPath = path.resolve(process.argv[2]), output = path.resolve(process.argv[3]);
await fs.mkdir(output, { recursive: false });
const profile = path.join(output, 'profile');
const env = { ...process.env, RA2_DESKTOP_USER_DATA: profile };
delete env.RA2_UI_RESOURCE_ROOT;
delete env.RA2_UI_REVIEW;
const expected = JSON.parse(await fs.readFile(path.join(appPath, 'Contents/Resources/app/package.json')));
const report = { status: 'RUNNING', appPath, expectedSource: expected.sourceHead, errors: [] };
let app;
try {
    app = await electron.launch({ executablePath: path.join(appPath, 'Contents/MacOS/RA2 HD Editions'),
        cwd: '/private/tmp', env, timeout: 60000 });
    const page = await app.firstWindow();
    page.on('pageerror', error => report.errors.push(error.message));
    await page.locator('[data-edition=ra2]').waitFor({ timeout: 90000 });
    assert.equal(await page.locator('[data-edition]').count(), 2);
    await page.locator('[data-edition=ra2]').click();
    await page.waitForFunction(() => window.__ra2debug?.generalOptions, undefined, { timeout: 90000 });
    report.loadedAppPath = await app.evaluate(({ app }) => app.getAppPath());
    assert.equal(report.loadedAppPath, path.join(appPath, 'Contents/Resources/app'));
    report.registration = JSON.parse(await fs.readFile(path.join(profile, 'resource-registration.json')));
    assert.equal(report.registration.directory, path.join(appPath, 'Contents/Resources/GameResources'));
    assert.deepEqual(report.errors, []);
    await page.screenshot({ path: path.join(output, 'menu.png') });
    report.status = 'PASS_DELIVERED_APP_SOURCE_AND_EMBEDDED_RESOURCE_STARTUP';
} catch (error) {
    report.status = 'FAIL'; report.failure = error.stack; throw error;
} finally {
    if (app) await app.close();
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify(report));
