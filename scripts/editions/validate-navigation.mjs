import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const build = path.resolve(process.argv[2]), out = path.resolve(process.argv[3]);
await fs.mkdir(out, { recursive: false });
const profile = path.join(out, 'profile'); await fs.mkdir(profile);
await fs.writeFile(path.join(profile, 'resource-registration.json'), JSON.stringify({ schemaVersion: 1, directory: path.resolve('.local') }));
const locale = JSON.parse(await fs.readFile('public/res/locale/zh-CN.json', 'utf8'));
const report = { status: 'RUNNING', errors: [], layouts: [], transitions: [] };
let app;
try {
    app = await electron.launch({ executablePath: await fs.realpath('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'), cwd: '/private/tmp', args: [build],
        env: { ...process.env, RA2_DESKTOP_USER_DATA: profile, RA2_DESKTOP_NO_DISCOVERY: '1' } });
    const page = await app.firstWindow(); page.on('pageerror', e => report.errors.push(e.message));
    await page.locator('[data-edition=ra2]').waitFor({ timeout: 60000 });
    for (const [width, height] of [[1920,1080], [1920,1200], [1512,982], [1280,832]]) {
        await page.setViewportSize({ width, height });
        const bounds = await page.locator('[data-edition]').evaluateAll(buttons => buttons.map(b => {
            const r = b.getBoundingClientRect(), img = b.querySelector('img');
            return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, loaded: img.complete && img.naturalWidth > 0, fit: getComputedStyle(img).objectFit };
        }));
        assert.equal(bounds.length, 2);
        assert(bounds.every(b => b.x >= 0 && b.y >= 0 && b.right <= width && b.bottom <= height && b.loaded && b.fit === 'contain'));
        const background = await page.locator('.edition-select').evaluate(el => {
            const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height };
        });
        assert.deepEqual(background, { x: 0, y: 0, width, height }, 'Selector background must fill the viewport');
        report.layouts.push({ width, height, bounds, background });
        await page.screenshot({ path: path.join(out, `selector-${width}x${height}.png`) });
    }
    const session = await page.context().newCDPSession(page);
    await session.send('Emulation.clearDeviceMetricsOverride');
    report.fullscreen = await page.evaluate(async () => {
        await window.desktopDisplay.set('fullscreen');
        await new Promise(resolve => setTimeout(resolve, 500));
        const display = await window.desktopDisplay.get(), r = document.querySelector('.edition-select').getBoundingClientRect();
        return { display, viewport: [innerWidth, innerHeight], background: [r.x, r.y, r.width, r.height] };
    });
    assert.equal(report.fullscreen.display.fullscreen, true);
    assert.deepEqual(report.fullscreen.background, [0, 0, ...report.fullscreen.viewport]);
    await page.screenshot({ path: path.join(out, 'selector-native-fullscreen.png') });
    await page.evaluate(async () => {
        const display = await window.desktopDisplay.get();
        await window.desktopDisplay.set(display.choices.find(c => c.id !== 'fullscreen').id);
    });
    await session.detach();
    for (const edition of ['ra2', 'yr', 'ra2']) {
        await page.locator(`[data-edition=${edition}]`).click();
        await page.getByRole('button', { name: locale['hd:menuskirmish'], exact: true }).waitFor({ timeout: 90000 });
        assert.equal(new URL(page.url()).searchParams.get('edition'), edition);
        await page.evaluate(edition => localStorage.setItem(`_edition:${edition}:_r_lastCountry`, edition === 'yr' ? '9' : '3'), edition);
        report.transitions.push(edition);
        await page.screenshot({ path: path.join(out, `menu-${edition}.png`) });
        await page.getByRole('button', { name: locale['hd:menuedition'], exact: true }).click();
        await page.locator('[data-edition=ra2]').waitFor({ timeout: 30000 });
    }
    report.preferences = await page.evaluate(() => ['ra2', 'yr'].map(e => localStorage.getItem(`_edition:${e}:_r_lastCountry`)));
    assert.deepEqual(report.preferences, ['3', '9']); assert.deepEqual(report.errors, []);
    report.status = 'PASS_NATIVE_EDITION_NAVIGATION';
} catch (e) { report.status = 'FAIL'; report.failure = e.stack; process.exitCode = 1; console.error(e); }
finally { if (app) await app.close(); await fs.writeFile(path.join(out, 'result.json'), JSON.stringify(report, null, 2)); console.log(report.status); }
