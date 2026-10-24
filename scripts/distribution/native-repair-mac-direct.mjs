import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron } from '@playwright/test';

const [receiptFile, output] = process.argv.slice(2);
const receipt = JSON.parse(await fs.readFile(receiptFile, 'utf8'));
const out = path.resolve(output);
await fs.mkdir(out, { recursive: false });
assert(receipt.identity?.userData?.startsWith('~/Library/Application Support/'));
const profile = path.join(os.homedir(), receipt.identity.userData.slice(2));
const existed = await fs.access(profile).then(() => true, error => {
    if (error.code !== 'ENOENT') throw error;
    return false;
});
const env = { ...process.env };
for (const name of ['RA2_DESKTOP_USER_DATA', 'RA2_UI_RESOURCE_ROOT', 'RA2_DESKTOP_NO_DISCOVERY', 'ELECTRON_RUN_AS_NODE'])
    delete env[name];
const app = await electron.launch({ executablePath: path.join(receipt.app, 'Contents/MacOS', receipt.executable),
    cwd: '/private/tmp', env, timeout: 60000 });
const report = { status: 'RUNNING', app: receipt.app, profilePreexisting: existed, errors: [] };
try {
    const page = await app.firstWindow();
    page.on('pageerror', error => report.errors.push(error.stack));
    await page.locator('[data-edition=yr]').waitFor({ timeout: 90000 });
    report.runtime = await app.evaluate(({ app }) => ({ packaged: app.isPackaged,
        resources: process.resourcesPath, userData: app.getPath('userData') }));
    assert.equal(report.runtime.packaged, true);
    assert.equal(report.runtime.userData, profile);
    const nativeResources = await fs.realpath(path.join(receipt.app, 'Contents/Resources'));
    assert.equal(report.runtime.resources, nativeResources);
    await page.locator('[data-edition=yr]').click();
    await page.waitForFunction(() => window.__ra2debug?.generalOptions, undefined, { timeout: 90000 });
    report.graphics = await page.evaluate(firstLaunch => {
        const graphics = window.__ra2debug.generalOptions.graphics;
        if (firstLaunch) {
            graphics.hdEnabled.value = true;
            graphics.hdDensity.value = 4;
        }
        return { hd: graphics.hdEnabled.value, density: graphics.hdDensity.value };
    }, !existed);
    await page.waitForTimeout(500);
    report.registration = JSON.parse(await fs.readFile(path.join(profile, 'resource-registration.json'), 'utf8'));
    assert.equal(report.registration.directory, receipt.resources);
    await page.screenshot({ path: path.join(out, 'direct-launch.png') });
    assert.deepEqual(report.errors, []);
    report.status = 'PASS_DESKTOP_DIRECT_APP_INTERNAL_RESOURCES_PRIVATE_DEFAULT_PROFILE';
} catch (error) {
    report.status = 'FAIL'; report.failure = error.stack; throw error;
} finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await app.close();
}
console.log(JSON.stringify(report));
