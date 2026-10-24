import { _electron as electron } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const [receiptFile, output] = process.argv.slice(2);
const receipt = JSON.parse(await fs.readFile(receiptFile, 'utf8'));
const out = path.resolve(output), profile = path.join(out, 'profile');
await fs.mkdir(out, { recursive: false });
await fs.mkdir(profile);
await fs.writeFile(path.join(profile, 'resource-registration.json'), JSON.stringify({
    schemaVersion: 1, directory: receipt.resources,
}));
const app = await electron.launch({
    executablePath: await fs.realpath('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
    args: [receipt.build], cwd: '/private/tmp', timeout: 60000,
    env: { ...process.env, RA2_DESKTOP_USER_DATA: profile, RA2_DESKTOP_NO_DISCOVERY: '1' },
});
const page = await app.firstWindow(), report = { status: 'RUNNING', errors: [], cases: [] };
page.on('pageerror', error => report.errors.push(error.stack));
page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
try {
    await page.locator('[data-edition=ra2]').waitFor({ timeout: 90000 });
    const cdp = await page.context().newCDPSession(page);
    for (const edition of ['ra2', 'yr']) for (const language of ['zh-CN', 'zh-TW', 'en-US']) {
        const locale = JSON.parse(await fs.readFile(`public/res/locale/${language}.json`, 'utf8'));
        const label = locale[edition === 'yr' ? 'hd:editionyr' : 'hd:editionra2'];
        await page.evaluate(({ edition, language }) => {
            localStorage.setItem('ra2hd.interfaceLanguage', language);
            const url = new URL(location.href); url.searchParams.set('edition', edition);
            location.assign(url.href);
        }, { edition, language });
        await page.waitForFunction(({ language, label }) => document.documentElement.lang === language
            && document.querySelector('[data-testid=menu-edition]')?.textContent === label,
        { language, label }, { timeout: 90000 });
        await page.evaluate(() => document.fonts.ready);
        const record = { edition, language, label, layouts: [] };
        for (const [width, height] of [[640, 480], [800, 600], [1280, 720], [1440, 900], [3440, 1440]]) {
            await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
            await page.waitForTimeout(150);
            const layout = await page.getByTestId('menu-version').evaluate(element => {
                const rect = element.getBoundingClientRect();
                return { text: element.textContent, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
                    client: element.clientWidth, content: element.scrollWidth };
            });
            assert.equal(layout.text, `v0.2 · ${label}`);
            assert(layout.content <= layout.client, JSON.stringify(layout));
            assert(layout.left >= 0 && layout.right <= width + 1 && layout.top >= 0 && layout.bottom <= height + 1,
                JSON.stringify(layout));
            assert(height - layout.bottom < 30, 'The edition label must remain in the bottom footer after resizing');
            record.layouts.push({ width, height, ...layout });
            if (width === 640) await page.screenshot({ path: path.join(out, `${edition}-${language}.png`) });
        }
        report.cases.push(record);
        console.log(JSON.stringify({ edition, language, layouts: record.layouts.length }));
    }
    assert.deepEqual(report.errors, []);
    report.status = 'PASS_NATIVE_SIX_EDITION_LANGUAGE_ROUTES_AND_THIRTY_FOOTER_LAYOUTS';
} catch (error) {
    report.status = 'FAIL'; report.failure = error.stack;
    await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await app.close();
}
console.log(JSON.stringify({ status: report.status, failure: report.failure }));
if (report.status === 'FAIL') process.exitCode = 1;
