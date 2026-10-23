// Bounded startup check of the actual delivered launcher and its own profile.
import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import catalog from '../../../desktop/yuri-building-coverage.json' with { type: 'json' };
import prepared from '../../../desktop/prepared-hd-contract.json' with { type: 'json' };
const mutator = process.argv.includes('--mutator-electricity');
const receipt = JSON.parse(await fs.readFile(process.argv[2], 'utf8'));
const folder = receipt.folder, launcher = path.join(folder, 'Launch-Isolated-Review.command');
const output = path.resolve(process.argv[3]); await fs.mkdir(output);
let expectedMembers;
if (mutator) {
    const selection = catalog['yuri-yagntc-temperate'];
    const bytes = await fs.readFile(path.join(receipt.resources, selection.familyPath));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), selection.familyHash);
    expectedMembers = JSON.parse(bytes).members.map(member => member.sha256);
}
const env = { ...process.env };
if (mutator) for (const key of Object.keys(env)) if (key.startsWith('RA2_')) delete env[key];
const app = await electron.launch({ executablePath: launcher, cwd: '/private/tmp', timeout: 60000, env });
try {
    const page = await app.firstWindow(), errors = [];
    page.on('pageerror', error => errors.push(error.stack));
    await page.locator('[data-edition=yr]').click({ timeout: 60000 });
    await page.waitForFunction(() => window.__ra2debug?.generalOptions, undefined, { timeout: 90000 });
    if (mutator) await page.waitForFunction(() => window.__ra2debug?.uiArt?.revision);
    const profile = await app.evaluate(() => process.env.RA2_DESKTOP_USER_DATA);
    assert.equal(profile, path.join(folder, 'Review-Profile'));
    const registration = JSON.parse(await fs.readFile(path.join(profile, 'resource-registration.json'), 'utf8'));
    assert.equal(registration.directory, receipt.resources);
    const result = await page.evaluate(async mutator => {
        const d = window.__ra2debug, response = await fetch('/local-hd/' +
            (mutator ? 'yuri-yagntc' : 'yuri-yagrnd') + '-temperate-selection.json');
        return { enabled: d.generalOptions.graphics.hdEnabled.value, density: d.generalOptions.graphics.hdDensity.value,
            familySelection: response.ok ? await response.json() : undefined,
            uiRevision: d.uiArt?.revision, uiEntries: d.uiArt?.manifest.assets.length };
    }, mutator);
    assert(result.enabled && result.density === 4 && result.familySelection?.members?.length === (mutator ? 5 : 4));
    if (mutator) {
        assert.equal(result.uiRevision, 'yuri-cameos-e-main-v1'); assert.equal(result.uiEntries, 474);
        assert.deepEqual(result.familySelection.members.map(member => member.sha256), expectedMembers);
        for (const member of result.familySelection.members) for (const density of [2, 4]) {
            assert(member.prepared?.[density]);
            for (const page of Object.values(member.prepared[density]))
                assert(page.route.startsWith('/local-hd/prepared/' + prepared.sha256 + '/'));
        }
        assert.equal(await app.evaluate(() => process.env.RA2_UI_RESOURCE_ROOT), receipt.uiRoot);
    }
    assert.equal(errors.length, 0);
    await page.screenshot({ path: path.join(output, 'launcher-menu.png') });
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify({ status: 'PASS_TASK_C_DELIVERED_LAUNCHER_STARTUP',
        app: receipt.app, resources: receipt.resources, profile, result, errors,
        boundary: 'Delivered shell launcher, default density, isolated registration and startup only; final world HD bindings are in the native batch reports.' }, null, 2) + '\n');
    console.log('PASS_TASK_C_DELIVERED_LAUNCHER_STARTUP');
} finally { await app.close(); }
