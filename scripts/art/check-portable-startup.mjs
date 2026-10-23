// Run the portable bootstrap in the actual Mac package layout; Windows remains NOT_RUN.
import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const [receiptFile, output] = process.argv.slice(2);
const receipt = JSON.parse(await fs.readFile(receiptFile));
const root = path.resolve(output);
assert(!await fs.stat(root).catch(() => undefined), 'Use a new output directory');
execFileSync('cp', ['-cR', receipt.folder, root]);
const app = path.join(root, path.basename(receipt.app)), payload = path.join(app, 'Contents/Resources/app');
const hashes = {};
for (const file of ['editions-portable.mjs', 'portable-registration.mjs']) {
    const bytes = await fs.readFile(path.join('desktop', file));
    await fs.writeFile(path.join(payload, 'desktop', file), bytes);
    hashes[file] = createHash('sha256').update(bytes).digest('hex');
}
const metadata = JSON.parse(await fs.readFile(path.join(payload, 'package.json')));
metadata.main = 'desktop/editions-portable.mjs';
await fs.writeFile(path.join(payload, 'package.json'), JSON.stringify(metadata) + '\n');
execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
const env = { ...process.env };
for (const key of ['RA2_DESKTOP_USER_DATA', 'RA2_UI_RESOURCE_ROOT', 'RA2_DESKTOP_NO_DISCOVERY']) delete env[key];
const session = await electron.launch({ executablePath: path.join(app, 'Contents/MacOS/RA2 HD Editions'),
    cwd: '/private/tmp', env, timeout: 60000 });
const report = { status: 'RUNNING', disclosure: 'Mac execution of the portable bootstrap; not Windows runtime evidence.',
    hashes, errors: [] };
try {
    const page = await session.firstWindow();
    page.on('pageerror', error => report.errors.push(error.message));
    await page.locator('[data-edition=yr]').waitFor({ timeout: 60000 });
    report.editionChoices = await page.locator('[data-edition]').count();
    assert.equal(report.editionChoices, 2);
    report.registration = JSON.parse(await fs.readFile(path.join(root, 'Review-Profile/resource-registration.json')));
    assert.equal(report.registration.directory, path.join(root, 'RA2-HD-Editions-Resources'));
    await page.locator('[data-edition=yr]').click();
    await page.waitForFunction(() => window.__ra2debug?.generalOptions, undefined, { timeout: 90000 });
    await page.screenshot({ path: path.join(root, 'portable-bootstrap-menu.png') });
    assert.deepEqual(report.errors, []);
    report.status = 'PASS_MAC_EXECUTION_OF_PORTABLE_FIRST_LAUNCH';
} finally {
    await fs.writeFile(path.join(root, 'portable-bootstrap-report.json'), JSON.stringify(report, null, 2) + '\n');
    await session.close();
}
console.log(JSON.stringify(report));
