import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { _electron as electron } from '@playwright/test';

const base = path.resolve(process.argv[2]), out = path.join(base, process.argv[3] ?? 'poses-native-v1');
const receipt = JSON.parse(await fs.readFile(path.join(base, 'native-stage/stage.json')));
await fs.mkdir(out, { recursive: false }); await fs.copyFile(import.meta.filename, path.join(out, 'harness.mjs'));
const report = { status: 'RUNNING', sourceHead: receipt.sourceHead, density: 4, screenshots: [], buildings: [], units: [], fixtures: [], errors: [], failedResources: [],
    harnessSha256: createHash('sha256').update(await fs.readFile(import.meta.filename)).digest('hex'),
    scope: 'Paused diagnostic 4X native app. Renderer-only SHP state/VXL heading poses do not change world state. Four reinforcement civilians are then explicitly injected as separate factory/material fixtures; these are not claimed as natural mission spawns. Actual cargo-plane arrival and flag behavior are proved in opening-native-v3.' };
const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
let app, page;
async function shot(name) { await page.screenshot({ path: path.join(out, name + '.png') }); report.screenshots.push(name + '.png'); }
async function pan(name) {
    await page.evaluate(name => { const d = window.__ra2debug, o = d.game.world.getAllObjects().find(o => o.name === name);
        if (!o) throw Error('Missing native pose actor ' + name);
        window.__poseObject = o; d.worldInteraction.minimapHandler.panToTile(o.tile);
    }, name);
    await page.waitForTimeout(100);
}
try {
    app = await electron.launch({ executablePath: path.join(receipt.app, 'Contents/MacOS', receipt.executable), cwd: '/private/tmp',
        env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('RA2_'))), RA2_DESKTOP_USER_DATA: path.join(out, 'profile') } });
    app.process().stderr?.on('data', bytes => { void fs.appendFile(path.join(out, 'electron.log'), bytes); });
    page = await app.firstWindow(); page.on('pageerror', error => report.errors.push(error.stack));
    page.on('response', response => { if (response.status() >= 400) report.failedResources.push({ url: response.url(), status: response.status() }); });
    await page.waitForSelector('[data-campaign-ready=true]', { timeout: 90000 });
    const windowHandle = await app.browserWindow(page);
    await windowHandle.evaluate(window => { window.unmaximize(); window.setContentSize(1280, 960); });
    await page.evaluate(() => { const d = window.__ra2debug; d.generalOptions.graphics.hdEnabled.value = true;
        d.generalOptions.graphics.hdDensity.value = 4; d.mainMenuController.screens.get(22).launchDiagnostic(); });
    await page.waitForFunction(() => window.__ra2debug.game?.campaign && window.__ra2debug.gameScreen?.playerUi
        && document.querySelector('[data-campaign-diagnostic]'), undefined, { timeout: 180000 });
    await page.evaluate(() => { const d = window.__ra2debug; d.gameScreen.gameTurnMgr.setCampaignPaused(true); d.gameScreen.pointer.unlock(true); });
    const reveal = await page.evaluate(() => window.__ra2debug.gameScreen.strings.get('HD:CampaignReveal'));
    await page.getByRole('button', { name: reveal, exact: true }).click();
    await page.evaluate(() => { document.querySelector('[data-campaign-diagnostic]').style.display = 'none'; });
    for (let attempt = 0; attempt < 24; attempt++) {
        if (await page.evaluate(() => window.__ra2debug.game.world.getAllObjects().some(o => o.name === 'PDPLANE'))) break;
        await page.evaluate(() => { const d = window.__ra2debug, m = d.gameScreen.gameTurnMgr; m.setCampaignPaused(false);
            try { for (let i = 0; i < 30; i++) m.doGameTurn(performance.now()); } finally { m.setCampaignPaused(true); } });
    }
    report.worldBeforePoses = await page.evaluate(() => window.__ra2debug.game.getHash());
    for (const name of ['CAWA2A', 'CAWA2B']) {
        await pan(name); await page.evaluate(() => window.__ra2debug.gameScreen.gameAnimationLoop.stop());
        const frames = [];
        for (let frame = 0; frame < 4; frame++) {
            const state = await page.evaluate(frame => {
                const d = window.__ra2debug, r = d.renderableManager.getRenderableByGameObject(window.__poseObject);
                r.mainObj.setFrame(frame); d.worldScene.meshBatchManager.updateMeshes(); d.renderer.render();
                const b = r.mainObj.builder, page = b.getHdPage(), mesh = r.mainObj.getShapeMesh();
                return { frame: b.frameNo, gpuHd: !!page && mesh.material.type === 'HdSpriteMaterial' && mesh.material.map === page.base,
                    glError: d.renderer.renderer.getContext().getError() };
            }, frame);
            assert.equal(state.frame, frame); assert(state.gpuHd); assert.equal(state.glError, 0); frames.push(state);
            await shot(name.toLowerCase() + '-frame-' + frame);
        }
        report.buildings.push({ name, frames });
        await page.evaluate(() => { const d = window.__ra2debug, r = d.renderableManager.getRenderableByGameObject(window.__poseObject);
            r.mainObj.setFrame(0); d.gameScreen.gameAnimationLoop.start(); });
    }
    for (const name of ['CRUISE', 'TUG', 'PDPLANE']) {
        await pan(name); await page.evaluate(() => window.__ra2debug.gameScreen.gameAnimationLoop.stop());
        const views = [];
        for (const heading of [0, 45, 90, 135, 180, 225, 270, 315]) {
            const view = await page.evaluate(heading => {
                const d = window.__ra2debug, actor = window.__poseObject, r = d.renderableManager.getRenderableByGameObject(actor);
                if (actor.type === 1) { r.tiltObj.rotation.y = heading * Math.PI / 180; r.tiltObj.updateMatrix(); }
                else r.updateVxlRotation(heading, true);
                r.unitVxlHd.update(); d.worldScene.meshBatchManager.updateMeshes(); d.renderer.render();
                return { heading, active: r.unitVxlHd.active, layers: r.unitVxlHd.layers.map(layer => layer.frames
                    .filter(f => !!f.batch.parent).map(f => ({ heading: f.frame.heading, material: f.batch.material.type,
                        gpuHd: f.batch.material.map === f.part.override.pages[0].base }))),
                    glError: d.renderer.renderer.getContext().getError() };
            }, heading);
            assert(view.active); assert(view.layers.every(layer => layer.some(f => f.heading === heading && f.gpuHd)));
            assert.equal(view.glError, 0); views.push(view); await shot(name.toLowerCase() + '-heading-' + heading);
        }
        report.units.push({ name, views });
        await page.evaluate(() => window.__ra2debug.gameScreen.gameAnimationLoop.start());
    }
    report.worldAfterPoses = await page.evaluate(() => window.__ra2debug.game.getHash());
    assert.equal(report.worldAfterPoses, report.worldBeforePoses);
    report.fixtures = await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game, anchor = g.world.getAllObjects().find(o => o.name === 'CIV1').tile;
        window.__r7Fixtures = ['CIVBBP', 'CIVSF', 'CIVSFM', 'CIVSTM'].map((name, index) => {
            const object = g.createUnitForPlayer(g.rules.getObject(name, 3), g.getCivilianPlayer());
            const tile = g.map.tiles.getByMapCoords(anchor.rx + index + 2, anchor.ry);
            object.zone = g.map.getTileZone(tile, true); g.spawnObject(object, tile); return object;
        });
        return window.__r7Fixtures.map(o => ({ name: o.name, id: o.id, fixtureOnly: true }));
    });
    await page.waitForFunction(() => window.__r7Fixtures.every(o => window.__ra2debug.renderableManager.getRenderableByGameObject(o)), undefined, { timeout: 20000 });
    for (const fixture of report.fixtures) {
        await pan(fixture.name);
        fixture.material = await page.evaluate(id => {
            const d = window.__ra2debug, o = d.game.world.getAllObjects().find(o => o.id === id);
            const r = d.renderableManager.getRenderableByGameObject(o), model = r.shpRenderable, b = model.builder;
            const page = b.getHdPage(), mesh = model.getShapeMesh();
            return { identity: b.hdOverride?.identity, gpuHd: !!page && mesh.material.type === 'HdSpriteMaterial' && mesh.material.map === page.base };
        }, fixture.id);
        assert(fixture.material.gpuHd); await shot('fixture-' + fixture.name.toLowerCase());
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_8_BUILDING_STATE_POSES_24_VXL_HEADINGS_AND_4_EXPLICIT_CIVILIAN_FIXTURES';
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1; if (page) await shot('failure').catch(() => {}); }
finally { await save(); await app?.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
