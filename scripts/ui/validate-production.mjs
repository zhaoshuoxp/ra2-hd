import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const build = path.resolve(process.argv[2]), output = path.resolve(process.argv[3]);
const baseline = process.argv.includes('--baseline');
const allied = process.argv.includes('--allied');
await fs.mkdir(output, { recursive: false });
const profile = path.join(output, 'profile'); await fs.mkdir(profile);
await fs.writeFile(path.join(profile, 'resource-registration.json'), JSON.stringify({ schemaVersion: 1, directory: path.resolve('.local') }));
const locale = JSON.parse(await fs.readFile('public/res/locale/zh-CN.json', 'utf8'));
const report = { status: 'RUNNING', baseline, build, errors: [], cases: [] };
let app, page;
try {
    app = await electron.launch({ executablePath: await fs.realpath('node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
        cwd: '/private/tmp', args: [build], env: { ...process.env, RA2_UI_REVIEW: '0', RA2_DESKTOP_USER_DATA: profile, RA2_DESKTOP_NO_DISCOVERY: '1' } });
    page = await app.firstWindow(); page.on('pageerror', e => report.errors.push(e.message));
    await page.getByRole('button', { name: locale['hd:menuskirmish'], exact: true }).waitFor({ timeout: 90000 });
    await page.evaluate(allied => {
        const prefs = { _r_lastMap: 'MP01T4.map', _r_lastMode: '1', _r_lastCountry: allied ? '0' : '5', _r_lastColor: '1', _r_lastStartPos: '0', _r_lastTeam: '0',
            _r_hostOpts: '6;10000;10;1;1;0;1;0;;0;1;0;0', _r_lastBots: JSON.stringify([null, null, null, { d: 4, c: 5, co: 2, s: 3, t: 1 }, null, null, null, null]) };
        Object.entries(prefs).forEach(([k, v]) => localStorage.setItem(k, v));
    }, allied);
    await page.getByRole('button', { name: locale['hd:menuskirmish'], exact: true }).click();
    await page.waitForFunction(() => window.__ra2debug.skirmishLobby);
    await page.evaluate(() => { void window.__ra2debug.skirmishLobby.startGame(); });
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1, undefined, { timeout: 180000 });
    await page.evaluate(() => {
        const d = window.__ra2debug;
        d.actionsApi.orderUnits([d.localPlayer.getOwnedObjects().find(u => /MCV$/.test(u.name)).id], 10);
        d.generalOptions.graphics.renderResolution.value = '4k';
    });
    await page.waitForFunction(() => window.__ra2debug.localPlayer.getOwnedObjects().some(u => /[NG]ACNST/.test(u.name)));
    await page.waitForTimeout(1000);
    report.names = await page.evaluate(() => {
        const d = window.__ra2debug, s = d.gameScreen.strings;
        return [...d.game.rules.buildingRules.values(), ...d.game.rules.infantryRules.values(), ...d.game.rules.vehicleRules.values(), ...d.game.rules.aircraftRules.values()]
            .filter(r => r.uiName).map(r => ({ id: r.name, key: r.uiName, text: s.get(r.uiName) }));
    });
    if (!baseline) {
        assert(!report.names.some(n => /^(\u82cf\u8054|\u76df\u519b|\u82cf\u519b)/.test(n.text)));
        assert.equal(report.names.find(n => n.id === 'YURI').text, '\u5c24\u91cc');
    }
    for (const [id, tab] of [[allied ? 'GAPOWR' : 'NAPOWR', 0], [allied ? 'E1' : 'E2', 2]]) {
        if (tab === 2) await page.evaluate(allied => {
            const d = window.__ra2debug, base = d.localPlayer.getOwnedObjects().find(u => /[NG]ACNST/.test(u.name));
            for (const [id, dx, dy] of [[allied ? 'GAPOWR' : 'NAPOWR', -4, -2], [allied ? 'GAPILE' : 'NAHAND', -5, 2]]) {
                const u = d.game.createObject(2, id); d.game.changeObjectOwner(u, d.localPlayer);
                d.game.spawnObject(u, d.game.map.tiles.getByMapCoords(base.tile.rx + dx, base.tile.ry + dy));
            }
        }, allied);
        await page.waitForFunction(({ id, tab }) => window.__ra2debug.gameScreen.hud.sidebarCard.props.sidebarModel.tabs[tab].items.some(i => i.target.rules.name === id), { id, tab });
        await page.evaluate(tab => window.__ra2debug.gameScreen.hud.sidebarCard.props.sidebarModel.selectTab(tab), tab);
        await page.waitForTimeout(500);
        const result = await page.evaluate(async id => {
            const d = window.__ra2debug, c = d.gameScreen.hud.sidebarCard, m = c.props.sidebarModel;
            const i = m.activeTab.items.findIndex(item => item.target.rules.name === id), item = m.activeTab.items[i], p = c.progressOverlays[i], b = p.builder;
            const samples = [], swaps = []; const original = b.setFrame;
            b.setFrame = function(frame) {
                const changed = frame !== this.getFrame(); original.call(this, frame);
                if (changed) swaps.push({ frame, hd: this.isHdActive, original: this.original.visible });
            };
            c.slotOutline.setPosition(c.slotContainers[i].getPosition().x, c.slotContainers[i].getPosition().y);
            c.slotOutline.setVisible(true);
            c.props.onSlotClick(c.createSlotClickEvent(item, { button: 0, isTouch: false }));
            const start = performance.now();
            while (performance.now() - start < 5000) {
                await new Promise(requestAnimationFrame);
                samples.push({ frame: b.getFrame(), visible: p.get3DObject().visible, hd: b.isHdActive });
            }
            b.setFrame = original;
            const outlineZ = c.slotOutline.get3DObject().matrixWorld.elements[14], clockZ = p.get3DObject().matrixWorld.elements[14];
            return { id, swaps, samples, outlineZ, clockZ, ui: d.uiArt.metrics(), gl: d.renderer.renderer.getContext().getError() };
        }, id);
        report.cases.push(result);
        await page.screenshot({ path: path.join(output, id + '.png') });
        assert(result.swaps.filter(s => s.frame > 0).length > 2, 'Native production must advance');
        if (!baseline) {
            assert(result.swaps.filter(s => s.frame > 0).every(s => s.hd && !s.original), 'No Original flash during frame handoff');
            assert(result.samples.filter(s => s.visible).every(s => s.hd), 'No visible low-resolution fallback');
            assert.notEqual(result.outlineZ, result.clockZ, 'Hover border must not share the progress plane');
        }
        assert.equal(result.gl, 0); assert(result.ui.reservedBytes <= result.ui.budget);
    }
    await page.evaluate(() => { window.__ra2debug.generalOptions.graphics.hdEnabled.value = false; });
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(() => window.__ra2debug.uiArt.metrics().reservedBytes), 0);
    assert.deepEqual(report.errors, []);
    report.status = baseline ? 'BASELINE_RECORDED' : 'PASS_NATIVE_PRODUCTION';
} catch (e) { report.status = 'FAIL'; report.failure = e.stack; process.exitCode = 1; console.error(e); }
finally { if (app) await app.close(); await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(report, null, 2)); console.log(report.status); }
