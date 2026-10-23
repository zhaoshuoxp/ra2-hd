import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { startSession } from '../m1/allied-units/desktop-session.mjs';

const session = await startSession(process.argv[2], process.argv[3], 'yr', false,
    async ({ page }) => page.evaluate(() => window.__ra2debug.generalOptions.graphics.hdDensity.value = 4),
    async ({ page }) => page.evaluate(() => {
        const screen = window.__ra2debug.mainMenuController.getCurrentScreen(), form = screen.buildFormProps();
        form.onCountrySelect(form.availablePlayerCountries.find(name => /Russian/i.test(name)), 0);
    }));
const { page, report, out, app } = session;
let failure;
try {
    await page.evaluate(() => {
        const d = window.__ra2debug, f = window.__allied;
        for (const name of ['NACNST', 'NAPOWR', 'NAPOWR', 'NAREFN', 'NAHAND']) f.building(name);
        window.__cancelDemand = d.sovietUnitsHd;
        const rule = d.game.rules.getObject('NAYARD', 2), queue = d.localPlayer.production.getQueueForObject(rule);
        window.__cancelQueue = queue.type;
        d.actionsApi.queueForProduction(queue.type, 2, 'NAYARD', 1);
    });
    await page.waitForFunction(() => window.__ra2debug.sovietUnitsHd.families.NAYARD.status === 'READY');
    report.ready = await page.evaluate(() => ({ ...window.__cancelDemand.families.NAYARD }));
    await page.evaluate(() => {
        const d = window.__ra2debug;
        d.actionsApi.unqueueFromProduction(window.__cancelQueue, 2, 'NAYARD', 1);
    });
    await page.waitForFunction(() => window.__ra2debug.localPlayer.production.getQueue(window.__cancelQueue)
        .getAll().every(item => item.rules.name !== 'NAYARD'));
    report.cancelled = await page.evaluate(() => ({ queueLength: window.__ra2debug.localPlayer.production
        .getQueue(window.__cancelQueue).getAll().length, cache: { ...window.__ra2debug.preparedHdCache } }));
    await page.evaluate(async () => {
        clearInterval(window.__allied.timer);
        const screen = window.__ra2debug.gameScreen;
        await screen.controller.goToScreenBlocking(0, { route: screen.returnTo });
    });
    await page.waitForFunction(() => !window.__ra2debug.game && window.__cancelDemand.gpuBytes === 0);
    report.teardown = await page.evaluate(() => ({ demandGpuBytes: window.__cancelDemand.gpuBytes,
        ui: window.__ra2debug.uiArt.metrics(), cache: { ...window.__ra2debug.preparedHdCache } }));
    assert.equal(report.cancelled.queueLength, 0);
    assert.equal(report.teardown.demandGpuBytes, 0);
    // Lobby artwork can retain a lease after the world has been released.
    assert(report.teardown.ui.reservedBytes <= 16 * 1024 * 1024);
    await page.evaluate(() => window.__ra2debug.generalOptions.graphics.hdEnabled.value = false);
    await page.waitForFunction(() => window.__ra2debug.uiArt.metrics().reservedBytes === 0);
    report.hdOff = await page.evaluate(() => window.__ra2debug.uiArt.metrics());
    assert.equal(report.hdOff.reservedBytes, 0);
    assert.equal(report.hdOff.decodedCpuBytes, 0);
    assert.equal(report.hdOff.gpuTextureBytesUpperBound, 0);
    assert(report.teardown.cache.bytes + report.teardown.cache.pendingBytes <= 128 * 1024 * 1024);
    assert.equal(report.errors.length, 0);
    report.status = 'PASS_NATIVE_CANCELLATION_AND_MATCH_TEARDOWN';
} catch (error) { failure = error; report.status = 'FAIL'; report.failure = error.stack; }
finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await app.close();
}
if (failure) throw failure;
console.log(report.status);
