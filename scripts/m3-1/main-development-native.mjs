import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { _electron as electron } from '@playwright/test';

const root = path.resolve(import.meta.dirname, '../..'), out = path.resolve(process.argv[2]);
const freshProfile = process.argv.includes('--fresh-profile');
await fs.mkdir(out, { recursive: false });
const profile = path.join(out, 'profile'); await fs.mkdir(profile);
if (!freshProfile) await fs.writeFile(path.join(profile, 'resource-registration.json'), JSON.stringify({ schemaVersion: 1, directory: path.join(root, '.local') }));
const report = { status: 'RUNNING', sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    freshProfile, scope: 'Actual canonical desktop/main.mjs development entry, live main resources and isolated profile. No packaged app or frozen campaign-only entry.', errors: [], failedResources: [] };
let app, page;
try {
    app = await electron.launch({ executablePath: await fs.realpath(path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')),
        args: [path.join(root, 'desktop/main.mjs')], cwd: '/private/tmp',
        env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('RA2_'))),
            RA2_DESKTOP_USER_DATA: profile, ...(!freshProfile ? { RA2_DESKTOP_NO_DISCOVERY: '1' } : {}) } });
    page = await app.firstWindow();
    page.on('pageerror', error => report.errors.push(error.stack));
    page.on('response', response => { if (response.status() >= 400) report.failedResources.push({ url: response.url(), status: response.status() }); });
    report.application = await app.evaluate(({ app }) => ({ name: app.getName(), userData: app.getPath('userData') }));
    assert.equal(report.application.name, 'RA2 HD'); assert.equal(report.application.userData, profile);
    report.registration = JSON.parse(await fs.readFile(path.join(profile, 'resource-registration.json')));
    assert.equal(report.registration.directory, path.join(root, '.local'));
    await page.locator('[data-edition=ra2]').click({ timeout: 90000 });
    await page.waitForFunction(() => window.__ra2debug?.mainMenuController, undefined, { timeout: 90000 });
    const language = await page.evaluate(() => document.documentElement.lang);
    const labels = JSON.parse(await fs.readFile(path.join(root, 'public/res/locale', language + '.json')));
    await page.getByRole('button', { name: labels['hd:menucampaign'], exact: true }).click();
    await page.waitForSelector('[data-campaign-ready=true]', { timeout: 90000 });
    report.resources = await page.evaluate(async () => {
        const read = async route => { const response = await fetch(route); if (!response.ok) throw Error(route + '/' + response.status); return response.json(); };
        const urban = await read('/local-environment/urban/selection.json');
        const flag = urban.families['campaign-sov01-memorial'].members.find(m => m.member === 'cuwa19_a.shp');
        return { urbanRevision: urban.revision, campaignExtension: urban.campaignExtension,
            flagRevision: (await read(flag.manifest)).packRevision,
            newurbanRevision: (await read('/local-terrain/newurban/selection.json')).revision,
            desertRevision: (await read('/local-terrain/desert/selection.json')).revision };
    });
    assert.equal(report.resources.urbanRevision, 'urban-campaign-sov01-hd-r7-clean-r2');
    assert.equal(report.resources.flagRevision, 'm3-1-memorial-soviet-flag-r8');
    assert.equal(report.resources.newurbanRevision, 'newurban-road-markings-v5');
    assert.equal(report.resources.desertRevision, 'desert-road-markings-v5');
    await page.screenshot({ path: path.join(out, 'main-development-campaign.png') });
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_MAIN_DEVELOPMENT_ENTRY_CAMPAIGN_HD_AND_CURRENT_TERRAIN_WITH_UNCHANGED_PROFILE_NAME';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally { await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close(); }
console.log(JSON.stringify({ status: report.status, out, error: report.error }));
