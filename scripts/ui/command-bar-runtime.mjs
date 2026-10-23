import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startSession } from '../m1/allied-units/desktop-session.mjs';

const receipt = process.argv[2], output = path.resolve(process.argv[3]);
await fs.mkdir(output, { recursive: false });
const extracted = process.argv.includes('--extracted');
const density = process.argv.includes('--2x') ? 2 : 4;
const cases = extracted ? [['yr', 0], ['ra2', 0]] : [['yr', 0], ['yr', 5], ['yr', 9], ['ra2', 0]];
const results = [];
for (const [edition, country] of cases) {
    process.argv = process.argv.filter(arg => !arg.startsWith('--map='));
    process.argv.push('--map=' + (edition === 'yr' ? 'X' : '') + 'MP03T4.map');
    const key = `${edition}-country-${country}`, out = path.join(output, key);
    const session = await startSession(receipt, out, edition, false,
        async ({ page }) => page.evaluate(density => {
            const graphics = window.__ra2debug.generalOptions.graphics;
            graphics.hdEnabled.value = true; graphics.hdDensity.value = density;
        }, density),
        async ({ page }) => page.evaluate(country => {
            const screen = window.__ra2debug.mainMenuController.getCurrentScreen();
            screen.pregameController.updatePlayerInfo(country, 1, 0, 0, 0);
        }, country));
    const result = { key, edition, country, cases: [], status: 'RUNNING' };
    const snapshot = async label => {
        await session.page.waitForTimeout(900);
        const data = await session.page.evaluate(() => {
            const d = window.__ra2debug, h = d.gameScreen.hud, rows = [];
            d.uiScene.update(0); d.renderer.render();
            const walk = o => {
                const b = o.builder;
                if (b?.source && /^(lendcap|rendcap|bttnbkgd)\.shp$/.test(b.source.filename)) {
                    const mesh = b.original, vertices = mesh.geometry.getAttribute('position');
                    const points = Array.from({ length: vertices.count }, (_, i) =>
                        mesh.localToWorld(mesh.position.clone().set(vertices.getX(i), vertices.getY(i), vertices.getZ(i))));
                    rows.push({ file: b.source.filename, width: b.source.width, height: b.source.height,
                        hd: b.isHdActive, scale: o.get3DObject().scale.x,
                        x0: Math.min(...points.map(p => p.x)), x1: Math.max(...points.map(p => p.x)),
                        y0: Math.min(...points.map(p => p.y)), y1: Math.max(...points.map(p => p.y)),
                        overlayY: b.overlay?.position.y, entry: b.frames[b.getFrame()].id });
                }
                o.getRenderableContainer?.().getChildren().forEach(walk);
            };
            walk(h);
            const canvas = d.renderer.renderer.domElement;
            return { viewport: h.viewport, sidebarWidth: h.sidebarWidth, barHeight: h.actionBarHeight,
                hd: d.generalOptions.graphics.hdEnabled.value, density: d.generalOptions.graphics.hdDensity.value,
                country: d.localPlayer.country.name, side: h.sideType, rows, ui: d.uiArt.metrics(),
                backing: [canvas.width, canvas.height], css: [window.innerWidth, window.innerHeight],
                dpr: window.devicePixelRatio, png: canvas.toDataURL('image/png').split(',')[1] };
        });
        await fs.writeFile(path.join(out, label + '.png'), Buffer.from(data.png, 'base64')); delete data.png;
        const rows = data.rows.sort((a, b) => a.x0 - b.x0);
        assert(rows.length >= 3); assert.equal(rows[0].file, 'lendcap.shp');
        assert.equal(rows.at(-1).file, 'rendcap.shp');
        for (const row of rows) {
            assert(Number.isInteger(row.width) && Number.isInteger(row.height), 'Fractional indexed pixels');
            assert(Math.abs(row.y0 - (data.viewport.height - data.barHeight)) < 0.0001, 'Vertical anchor');
            assert(Math.abs(row.y1 - data.viewport.height) < 0.0001, 'Bottom anchor');
            assert.equal(row.hd, data.hd);
        }
        for (let i = 1; i < rows.length; i++) assert(Math.abs(rows[i].x0 - rows[i - 1].x1) < 0.0001, 'Gap or overlap');
        assert(Math.abs(rows[0].x0) < 0.0001);
        assert(Math.abs(rows.at(-1).x1 - (data.viewport.width - data.sidebarWidth)) < 0.0001);
        assert(data.ui.reservedBytes <= 16 * 1024 * 1024);
        result.cases.push({ label, ...data });
        await fs.writeFile(path.join(out, 'hud-result.json'), JSON.stringify(result, null, 2) + '\n');
    };
    try {
        await snapshot('hd-window');
        await session.page.evaluate(() => { window.__ra2debug.generalOptions.graphics.hdEnabled.value = false; });
        await snapshot('original-window');
        await session.page.evaluate(() => { window.__ra2debug.generalOptions.graphics.hdEnabled.value = true; });
        await snapshot('hd-return');
        if (country === 0 && edition === 'yr') {
            const display = await session.page.evaluate(() => window.desktopDisplay.set('fullscreen'));
            assert(display.fullscreen); result.fullscreen = display;
            await snapshot('hd-native-fullscreen');
            const cdp = await session.page.context().newCDPSession(session.page);
            for (const [width, height, deviceScaleFactor, resolution] of [[1920, 1080, 1, '1080p'], [1920, 1080, 2, '4k'], [1441, 901, 1, '1080p']]) {
                await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor, mobile: false });
                await session.page.evaluate(resolution => {
                    window.__ra2debug.generalOptions.graphics.renderResolution.value = resolution;
                    window.dispatchEvent(new Event('resize'));
                }, resolution);
                await snapshot(`hd-emulated-${width}x${height}-dpr${deviceScaleFactor}-${resolution}`);
            }
            await cdp.send('Emulation.clearDeviceMetricsOverride');
            await session.page.evaluate(() => { window.__ra2debug.generalOptions.graphics.renderResolution.value = '1080p'; });
            await snapshot('hd-fullscreen-return');
        }
        const buttons = await session.page.evaluate(() => {
            const d = window.__ra2debug, h = d.gameScreen.hud;
            window.__commandClicks = [];
            h.onCommandBarButtonClick.subscribe(type => window.__commandClicks.push(type));
            d.uiScene.update(0);
            const canvas = d.renderer.renderer.domElement, rect = canvas.getBoundingClientRect();
            return h.commandBarButtons.filter(b => !b.disabled).map(b => {
                const sprite = b.sprite, o = sprite.get3DObject(), size = sprite.getSize();
                const p = o.getWorldPosition(o.position.clone());
                return { tooltip: sprite.tooltip, x: rect.x + (p.x + size.width / 2) / d.renderer.width * rect.width,
                    y: rect.y + (p.y + size.height / 2) / d.renderer.height * rect.height };
            });
        });
        assert(buttons.length > 0);
        await session.page.mouse.move(buttons[0].x, buttons[0].y);
        await session.page.mouse.down();
        await snapshot('hd-native-button-pressed');
        await session.page.mouse.up();
        await snapshot('hd-native-button-released');
        const clicks = await session.page.evaluate(() => window.__commandClicks);
        assert.equal(clicks.length, 1, 'Native command-bar click dispatch');
        result.pointer = { method: 'Playwright native renderer pointer event; physical device input remains unverified', button: buttons[0], clicks };
        assert.equal(session.report.errors.length, 0);
        result.status = 'PASS_NATIVE_COMMAND_BAR';
        results.push(result);
    } catch (error) {
        result.status = 'FAIL'; result.failure = error.stack; throw error;
    } finally {
        await fs.writeFile(path.join(out, 'hud-result.json'), JSON.stringify(result, null, 2) + '\n');
        await session.close();
    }
}
await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({ status: 'PASS', results,
    disclosure: 'Native Mac packaged renderer. CDP cases emulate CSS dimensions and DPR; fullscreen case uses the real native display. Windows and physical-device input not executed.' }, null, 2) + '\n');
console.log('PASS', results.length, 'native edition/faction sessions');
