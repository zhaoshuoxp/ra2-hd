import fs from 'node:fs/promises';
import path from 'node:path';
import { startSession } from '../m1/allied-units/desktop-session.mjs';

const [target, output] = process.argv.slice(2);
const session = await startSession(target, output, 'yr', false, async ({ page }) => {
    await page.evaluate(() => {
        const graphics = window.__ra2debug.generalOptions.graphics;
        graphics.hdEnabled.value = true; graphics.hdDensity.value = 4;
    });
});
const { page, out } = session;
const record = {};
try {
    await page.evaluate(() => {
        const f = window.__allied, d = window.__ra2debug;
        for (const name of ['GACNST', 'GAPOWR', 'GACSPH', 'GAWEAT', 'CAAIRP']) f.building(name);
        d.gameScreen.hud.sidebarModel.activeTabId = 1;
        const power = d.localPlayer.powerTrait;
        window.__clockPowerKeys = power && Object.keys(power);
    });
    await page.waitForFunction(() => window.__ra2debug.gameScreen.hud.sidebarCard.publishedItems.length > 0, undefined, { timeout: 15000 });
    await page.waitForTimeout(1500);
    record.initial = await page.evaluate(() => {
        const d = window.__ra2debug, h = d.gameScreen.hud, w = d.worldInteraction;
        const f = window.__allied;
        f.tank = f.spawn('MTNK', 7); f.actor = f.tank;
        w.unitSelectionHandler.selectSingleUnit(f.tank);
        return { keys: [...w.keyboardHandler.keyBinds.hotKeys], commands: [...w.keyboardHandler.commands.keys()],
            selection: w.unitSelectionHandler.getSelectedUnits().map(u => u.name), ui: d.uiArt.metrics(),
            card: Object.keys(h.sidebarCard) };
    });
    await page.keyboard.press('a');
    record.afterA = await page.evaluate(() => {
        const w = window.__ra2debug.worldInteraction;
        return { mode: w.currentMode?.constructor.name, modifiers: w.lastKeyMods?.ctrlKey,
            selection: w.unitSelectionHandler.getSelectedUnits().map(u => u.name) };
    });
    record.clocks = await page.evaluate(() => {
        const d = window.__ra2debug, c = d.gameScreen.hud.sidebarCard;
        c.progressOverlays[0].setFrame(24); c.progressOverlays[0].setVisible(true);
        return c.progressOverlays.slice(0, 1).map(o => {
            const b = o.builder;
            return { frame: b.getFrame(), opacity: b.opacity, nativeOpacity: b.native?.opacity,
                materialOpacity: b.overlay?.material.opacity, transparent: b.overlay?.material.transparent,
                depthWrite: b.overlay?.material.depthWrite, renderOrder: b.overlay?.renderOrder,
                parentOrder: o.get3DObject().renderOrder, ui: d.uiArt.metrics() };
        });
    });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(out, 'baseline-clock.png') });
    record.clockAfter = await page.evaluate(() => {
        const b = window.__ra2debug.gameScreen.hud.sidebarCard.progressOverlays[0].builder;
        return { opacity: b.opacity, materialOpacity: b.overlay?.material.opacity, depthWrite: b.overlay?.material.depthWrite };
    });
    for (const opacity of [0, 0.5, 1]) {
        await page.evaluate(opacity => {
            const d = window.__ra2debug, c = d.gameScreen.hud.sidebarCard;
            c.progressOverlays[0].setOpacity(opacity);
            c.progressOverlays[0].setFrame(24); c.progressOverlays[0].setVisible(true);
        }, opacity);
        await page.waitForTimeout(100);
        await page.screenshot({ path: path.join(out, `clock-opacity-${opacity}.png`) });
    }
    await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game;
        for (const p of g.getCombatants().filter(p => p !== d.localPlayer))
            for (const o of [...p.getOwnedObjects()]) g.destroyObject(o, undefined, true);
    });
    await page.waitForSelector('[data-game-result-banner]', { timeout: 15000 });
    await page.waitForTimeout(700);
    record.result = await page.evaluate(() => {
        const b = document.querySelector('[data-game-result-banner]'), c = b.querySelector('canvas');
        return { data: { ...c.dataset }, hidden: c.hidden, size: [c.width, c.height],
            background: getComputedStyle(b.children[0]).background, ui: window.__ra2debug.uiArt.metrics(),
            pixel: [...c.getContext('2d').getImageData(Math.floor(c.width / 2), 10, 1, 1).data] };
    });
    await page.screenshot({ path: path.join(out, 'baseline-result.png') });
    await page.evaluate(() => { window.__ra2debug.generalOptions.graphics.hdEnabled.value = false; });
    await page.waitForTimeout(100);
    record.originalResult = await page.evaluate(() => ({ ...document.querySelector('[data-game-result-banner] canvas').dataset }));
    await page.screenshot({ path: path.join(out, 'original-result.png') });
} catch (error) {
    record.failure = error.stack;
    await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
    throw error;
} finally {
    await fs.writeFile(path.join(out, 'diagnosis.json'), JSON.stringify(record, null, 2) + '\n');
    await session.app.close();
}
