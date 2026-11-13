import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, pauseWorld, stepWorld, worldState } from '../m3-2/native-session.mjs';

export async function closeCampaignMenuPaused(page) {
    await page.evaluate(async () => {
        const screen = window.__ra2debug.gameScreen, manager = screen.gameTurnMgr;
        // Menu close awaits its UI transitions. Keep the independent turn gate
        // closed until the campaign gate is restored, across those awaits.
        manager.setPaused(true);
        try { await screen.menu.close(); }
        finally { manager.setCampaignPaused(true); manager.setPaused(false); }
    });
}

export async function namedSaveRestart(session, out, report, name, advance = stepWorld, onRestored, options = {}) {
    let { app, page, labels } = session;
    try {
        const graphics = await page.evaluate(() => { const g = window.__ra2debug.generalOptions.graphics;
            return { enabled: g.hdEnabled.value, density: g.hdDensity.value }; });
        report.graphicsBeforeSave = graphics;
        const click = async (action, fallback) => {
            const button = page.locator(`[data-action=${action}]`);
            if (await button.count()) await button.click(); else await page.getByRole('button', { name: labels[fallback], exact: true }).click();
        };
        await page.evaluate(() => window.__ra2debug.gameScreen.menu.open());
        await page.getByRole('button', { name: labels['gui:save'], exact: true }).click();
        await page.waitForSelector('[data-save-scope=campaign][data-mode=save]');
        await page.locator('.save-native-name').fill(name); await click('SaveGame', 'gui:save');
        await page.locator('[data-action=AcknowledgeSave]').waitFor(); await click('AcknowledgeSave');
        const record = await page.evaluate(async name => {
            const game = window.__ra2debug.game;
            const db = await new Promise(resolve => { const request = indexedDB.open('ra2-hd-campaign-library', 1); request.onsuccess = () => resolve(request.result); });
            try {
                const records = await new Promise(resolve => {
                    const request = db.transaction('saves').objectStore('saves').getAll();
                    request.onsuccess = () => resolve(request.result);
                });
                const record = records.filter(value => value.name === name.trim().slice(0, 80)
                    && value.tick === game.currentTick
                    && value.checkpoint.identity.mission === game.campaign.launch.mission
                    && value.checkpoint.identity.sourceSha256 === game.campaign.launch.sourceSha256)
                    .sort((a, b) => b.savedAt - a.savedAt)[0];
                if (!record) throw Error('The newly named current-mission save was not persisted');
                return record;
            }
            finally { db.close(); }
        }, name);
        const before = await worldState(page);
        await fs.writeFile(path.join(out, 'mid-mission-checkpoint.json'), JSON.stringify(record.checkpoint));
        await page.screenshot({ path: path.join(out, 'native-named-save.png') });
        await click('CloseSaves', 'gui:back'); await closeCampaignMenuPaused(page);
        await advance(page, 180); const reference = await worldState(page);
        await app.close(); ({ app, page, labels } = await campaignSession(out, report,
            { edition: record.checkpoint.identity.edition, density: graphics.enabled ? graphics.density : 0 }));
        await page.getByRole('button', { name: labels['gui:load'], exact: true }).click();
        await page.locator(`[role=option][data-id="${record.id}"]`).click(); await click('LoadGame', 'gui:load');
        const restoreProgress = setInterval(async () => {
            const progress = await page.evaluate(() => window.__ra2debug?.campaignRestore).catch(() => undefined);
            if (progress) await fs.writeFile(path.join(out, 'named-restore-progress.json'), JSON.stringify(progress) + '\n').catch(() => {});
        }, 5000);
        try {
            await page.waitForFunction(tick => window.__ra2debug.game?.currentTick === tick
                && window.__ra2debug.gameScreen?.menu?.getCurrentScreen(), record.tick,
            { timeout: options.restoreTimeoutMs ?? 180000 });
        } catch (error) {
            report.namedRestoreWaitFailure = await page.evaluate(() => {
                const d = window.__ra2debug;
                return { tick: d.game?.currentTick, restoreProgress: d.campaignRestore,
                    sourceError: d.mainMenuController?.screens.get(22)?.error,
                    text: document.body.innerText.slice(-1800) };
            }).catch(() => undefined);
            throw error;
        } finally { clearInterval(restoreProgress); }
        await pauseWorld(page); assert.deepEqual(await worldState(page), before);
        if (record.checkpoint.presentation?.cameraPan) {
            const camera = await page.evaluate(() => window.__ra2debug.game.campaign.captureMedia().cameraPan);
            assert.deepEqual(camera, record.checkpoint.presentation.cameraPan);
            report.restoredCamera = camera;
        }
        if (record.checkpoint.presentation?.cameraMove) {
            const movement = await page.evaluate(() => window.__ra2debug.game.campaign.captureMedia().cameraMove);
            assert.deepEqual(movement, record.checkpoint.presentation.cameraMove);
            report.restoredCameraMove = movement;
        }
        const weather = await page.evaluate(() => {
            const d = window.__ra2debug, state = d.game.campaign.lightningPresentation?.();
            if (!state) return;
            const expected = [...state.storms.flatMap(storm => storm.clouds), ...state.clouds]
                .map(cloud => ({ name: cloud.animationName, frame: cloud.frame, position: cloud.position.toArray() }));
            if (!expected.length) return;
            const actual = d.renderableManager.getRenderableContainer().getChildren().filter(anim => /^WCCLOUD[123]$/.test(anim.name))
                .map(anim => ({ name: anim.name, frame: anim.getAnimProps()?.start, position: anim.getPosition().toArray() }));
            return { expected, actual, policy: 'Actual renderer cloud names, restored start frames and native positions; no injected simulation events.' };
        });
        if (weather) {
            report.restoredWeather = weather;
            const sorted = rows => rows.map(row => JSON.stringify(row)).sort();
            assert.deepEqual(sorted(weather.actual), sorted(weather.expected));
        }
        const sparkSystems = await page.evaluate(() => window.__ra2debug.game.campaign.particles.snapshot().systems ?? []);
        if (sparkSystems.length) {
            await page.waitForFunction(count => window.__ra2debug.renderableManager.worldScene.getChildren()
                .filter(fx => fx.get3DObject?.()?.name === 'fx_campaign_sparks')
                .reduce((total, fx) => total + fx.get3DObject().userData.sourcePoints, 0) === count,
            sparkSystems.reduce((total, system) => total + system.sparks.length, 0));
            const actual = await page.evaluate(() => {
                const effects = window.__ra2debug.renderableManager.worldScene.getChildren()
                    .filter(fx => fx.get3DObject?.()?.name === 'fx_campaign_sparks');
                window.__restoredCampaignSparkObservers = effects.map(fx => {
                    const materials = fx.get3DObject().children.map(sprite => sprite.material), disposed = new Set();
                    materials.forEach((material, index) => material.addEventListener('dispose', () => disposed.add(index)));
                    return { fx, materials, disposed };
                });
                return effects.map(fx => {
                    const group = fx.get3DObject();
                    return { name: group.userData.source, points: group.children.slice(1).map(sprite => {
                        const color = sprite.material.color.clone().convertLinearToSRGB();
                        return { position: sprite.position.toArray(), color: [color.r, color.g, color.b].map(value => value * 255) };
                    }) };
                });
            });
            report.restoredSparkSystems = { expected: sparkSystems, actual, rgbTolerance: .01,
                qualification: 'Actual source point positions and RGB after full restart. The 0.01/255 RGB tolerance covers Three.js approximate inverse color conversion. This does not certify original world illumination or exact pristine-retail particle physics.' };
            assert.deepEqual(actual.map(system => system.name), sparkSystems.map(system => system.name));
            for (let i = 0; i < actual.length; i++) for (let p = 0; p < actual[i].points.length; p++) {
                assert.deepEqual(actual[i].points[p].position, sparkSystems[i].sparks[p].position);
                actual[i].points[p].color.forEach((value, channel) =>
                    assert(Math.abs(value - sparkSystems[i].sparks[p].color[channel]) < .01));
            }
        }
        assert.equal(await page.locator('[data-campaign-media][style*="position: fixed"]').count(), 0);
        await page.screenshot({ path: path.join(out, 'native-restored-after-restart.png') });
        await closeCampaignMenuPaused(page);
        await onRestored?.({ app, page, labels }, record.checkpoint);
        await advance(page, 180);
        assert.deepEqual(await worldState(page), reference);
        report.graphicsAfterRestart = await page.evaluate(() => { const g = window.__ra2debug.generalOptions.graphics;
            return { enabled: g.hdEnabled.value, density: g.hdDensity.value }; });
        assert.equal(report.graphicsAfterRestart.enabled, graphics.enabled);
        if (graphics.enabled) assert.equal(report.graphicsAfterRestart.density, graphics.density);
        report.restart = { tick: before.tick, hash: before.hash, after180TicksHash: reference.hash, checksum: record.checkpoint.checksum,
            exactWorldRngVariablesTeamsQueuesTimerAndCallbacks: true, source: record.checkpoint.identity, semanticsVersion: record.checkpoint.options.campaign.semanticsVersion };
        return { app, page, labels };
    } catch (error) {
        await page.screenshot({ path: path.join(out, 'native-save-restart-failure.png') }).catch(() => {});
        await app.close().catch(() => {});
        throw error;
    }
}
