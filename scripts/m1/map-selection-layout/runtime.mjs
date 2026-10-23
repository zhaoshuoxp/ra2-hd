// Trace the real desktop UI; only the isolated profile and task evidence are written.
import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const receipt = JSON.parse(await fs.readFile(process.argv[2], 'utf8'));
const locale = JSON.parse(await fs.readFile('public/res/locale/zh-CN.json', 'utf8'));
const out = path.resolve(process.argv[3]);
const edition = process.argv.includes('--ra2') ? 'ra2' : 'yr';
const verify = process.argv.includes('--verify');
await fs.mkdir(out, { recursive: false });
const profile = path.join(out, 'profile');
await fs.mkdir(profile);
await fs.writeFile(path.join(profile, 'resource-registration.json'), JSON.stringify({ schemaVersion: 1, directory: receipt.resources }));
const app = await electron.launch({
    executablePath: receipt.app ? path.join(receipt.app, 'Contents/MacOS/RA2 HD Editions')
        : await fs.realpath('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
    args: receipt.app ? [] : [receipt.build], cwd: '/private/tmp', timeout: 60000,
    env: { ...process.env, RA2_DESKTOP_USER_DATA: profile, RA2_DESKTOP_NO_DISCOVERY: '1' },
});
const report = { status: 'RUNNING', edition, verify, cases: [], errors: [],
    interaction: 'Automated real Electron UI clicks, scrollbar drag and keyboard; no physical-input certification.' };
let failure;
try {
    const page = await app.firstWindow();
    page.on('pageerror', error => report.errors.push(error.stack));
    await page.locator(`[data-edition=${edition}]`).click({ timeout: 60000 });
    await page.waitForFunction(() => window.__ra2debug?.generalOptions, undefined, { timeout: 90000 });
    await page.evaluate(() => {
        window.__mapTrace = [];
        window.__mapSnapshot = () => {
            const box = e => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; };
            const selected = document.querySelector('.map-list .selected');
            const ancestors = [];
            for (let e = selected; e; e = e.parentElement) {
                const c = getComputedStyle(e);
                ancestors.push({ tag: e.tagName, id: e.id, className: e.className,
                    scroll: [e.scrollLeft, e.scrollTop], bounds: box(e), transform: c.transform,
                    overflow: [c.overflowX, c.overflowY], client: [e.clientWidth, e.clientHeight],
                    extent: [e.scrollWidth, e.scrollHeight] });
            }
            return { ancestors, root: box(document.querySelector('#ra2web-root')),
                canvases: [...document.querySelectorAll('canvas')].map(box),
                anchors: [...document.querySelectorAll('.map-sel-title, .map-sel-search')].map(box),
                buttons: [...document.querySelectorAll('.menu-button')].map(box),
                viewport: [innerWidth, innerHeight, visualViewport?.offsetTop, visualViewport?.scale],
                active: document.activeElement?.outerHTML.slice(0, 180), fullscreen: !!document.fullscreenElement };
        };
        const reveal = Element.prototype.scrollIntoView;
        Element.prototype.scrollIntoView = function (...args) {
            const before = window.__mapSnapshot();
            reveal.apply(this, args);
            window.__mapTrace.push({ kind: 'scrollIntoView', before, after: window.__mapSnapshot() });
        };
    });
    await page.getByRole('button', { name: locale['hd:menuskirmish'], exact: true }).click();
    await page.waitForFunction(() => window.__ra2debug?.skirmishLobby);
    for (const fullscreen of [true, false]) {
        await page.evaluate(async full => {
            const display = await window.desktopDisplay.get();
            const windowed = display.choices.find(choice => choice.id !== 'fullscreen');
            await window.desktopDisplay.set(full ? 'fullscreen' : windowed.id);
        }, fullscreen);
        await page.waitForTimeout(800);
        for (let cycle = 0; cycle < (process.argv.includes('--quick') ? 1 : 3); cycle++) {
            // SkirmishScreen's second configured sidebar action opens map selection.
            await page.locator('.menu-button:visible').nth(1).click();
            await page.locator('.map-list .selected').waitFor();
            await page.locator('.menu-button:visible').first().waitFor();
            await page.waitForTimeout(200);
            const initial = await page.evaluate(() => window.__mapSnapshot());
            const os = await app.evaluate(({ BrowserWindow }) => ({
                bounds: BrowserWindow.getAllWindows()[0].getBounds(),
                contentBounds: BrowserWindow.getAllWindows()[0].getContentBounds(),
                fullscreen: BrowserWindow.getAllWindows()[0].isFullScreen()
                    || BrowserWindow.getAllWindows()[0].isSimpleFullScreen(),
            }));
            assert.equal(os.fullscreen, fullscreen, 'Requested display mode must actually be active');
            if (cycle === 0) {
                const last = page.locator('.map-list .list-item').last();
                // Controlled selection setup without an ancestor-reveal helper.
                await page.locator('.map-list').evaluate(e => e.scrollTop = e.scrollHeight);
                await last.click();
                await page.waitForTimeout(100);
            }
            const list = await page.locator('.map-list').boundingBox();
            const beforeDragScroll = await page.locator('.map-list').evaluate(e => e.scrollTop);
            await page.mouse.move(list.x + list.width - 7, list.y + list.height - 12);
            await page.mouse.down();
            await page.mouse.move(list.x + list.width - 7, list.y + 25, { steps: 15 });
            await page.mouse.up();
            const afterDragScroll = await page.locator('.map-list').evaluate(e => e.scrollTop);
            if (verify && cycle === 0) assert.notEqual(afterDragScroll, beforeDragScroll, 'Scrollbar drag must still scroll the list');
            await page.locator('.map-sel-search input').fill(cycle === 2 ? 'a' : '');
            if (cycle === 2) {
                await page.locator('.map-list-sort-select .select-value').click();
                await page.locator('.map-list-sort-select .option').nth(2).click();
                await page.locator('.map-sel-search input').focus();
                await page.keyboard.press('Tab');
                await page.waitForTimeout(120);
            }
            // Map-preview loading temporarily hides buttons; allow its native
            // completion before clicking Use/Cancel or taking a settled trace.
            await page.locator('.menu-button:visible').first().waitFor();
            const afterDrag = await page.evaluate(() => window.__mapSnapshot());
            await page.screenshot({ path: path.join(out, `${fullscreen ? 'full' : 'window'}-${cycle}.png`) });
            const traces = await page.evaluate(() => window.__mapTrace.splice(0));
            report.cases.push({ fullscreen, cycle, os, initial, afterDrag, traces,
                listScroll: { beforeDragScroll, afterDragScroll },
                sortAndKeyboardFocus: cycle === 2 });
            if (verify) {
                const [row, listAncestor] = initial.ancestors;
                assert(row.bounds[1] >= listAncestor.bounds[1] - 1, 'Selection must be revealed inside the list');
                assert(row.bounds[1] + row.bounds[3] <= listAncestor.bounds[1] + listAncestor.bounds[3] + 1);
                assert.deepEqual(initial.root, afterDrag.root);
                assert.deepEqual(initial.canvases, afterDrag.canvases);
                assert.deepEqual(initial.anchors, afterDrag.anchors);
                assert(initial.ancestors.every(a => a.className === 'list map-list' || a.scroll[1] === 0), 'Outer ancestors must not scroll');
                assert(afterDrag.ancestors.every(a => a.className === 'list map-list' || a.scroll[1] === 0));
                assert.equal(traces.length, 0, 'Map selection must not invoke ancestor-scrolling reveal');
            }
            const sidebar = page.locator('.menu-button:visible');
            await (cycle === 1 ? sidebar.last() : sidebar.first()).click();
            await page.locator('.map-sel-form').waitFor({ state: 'detached' });
            report.cases.at(-1).afterClose = await page.evaluate(() => window.__mapSnapshot());
            if (verify) assert.deepEqual(initial.root, report.cases.at(-1).afterClose.root);
        }
    }
    assert.equal(report.errors.length, 0);
    report.status = verify ? 'PASS_AUTOMATED_DESKTOP_LAYOUT' : 'DIAGNOSIS_RECORDED';
} catch (error) {
    failure = error;
    report.status = 'FAILED';
    report.failure = error.stack;
    try { report.visibleText = await (await app.firstWindow()).locator('body').innerText(); } catch {}
} finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await app.close();
}
if (failure) throw failure;
console.log(JSON.stringify({ status: report.status, cases: report.cases.length, edition }));
