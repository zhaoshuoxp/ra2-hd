import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, pauseWorld, worldState } from '../m3-2/native-session.mjs';
import { closeCampaignMenuPaused } from './named-save-restart.mjs';

const out = path.resolve(process.argv[2]), checkpoint = JSON.parse(await fs.readFile(path.resolve(process.argv[3])));
const names = process.argv.slice(4).filter(value => !value.startsWith('--'));
const framed = process.argv.includes('--framed');
assert(process.argv.slice(4).filter(value => value.startsWith('--')).every(value => value === '--framed'));
assert(names.length); await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', errors: [], failedResources: [], cases: [],
    scope: 'Exact genuine source checkpoint comparison precedes diagnostic reveal. Required actual actors bind complete accepted HD frames at each independent density. No authored pixel change, budget increase or gameplay acceptance is inferred from registration. Diagnostic reveal is not presented as original story.' };
let app, page;
try {
    for (const density of [2, 4]) {
        const folder = path.join(out, String(density)); await fs.mkdir(folder);
        ({ app, page } = await campaignSession(folder, report, { density }));
        await page.evaluate(async checkpoint => {
            await window.__ra2debug.mainMenuController.screens.get(22).launchDiagnostic(checkpoint, checkpoint.identity.mission);
        }, checkpoint);
        await page.waitForFunction(tick => window.__ra2debug.game?.currentTick === tick
            && window.__ra2debug.gameScreen?.menu?.getCurrentScreen(), checkpoint.tick, { timeout: 180000 });
        await pauseWorld(page); const restored = await worldState(page);
        const { tick, hash, ...state } = restored;
        assert.equal(tick, checkpoint.tick); assert.deepEqual({ worldHash: hash, ...state }, checkpoint.expected);
        await closeCampaignMenuPaused(page);
        await page.evaluate(names => {
            const d = window.__ra2debug; d.game.campaign.inspectionModified = true;
            d.game.mapShroudTrait.revealMap(d.game.localPlayer, d.game);
            window.__bindingWarm = names.map(name => d.worldView.sovietUnitsHd.prewarm(name));
            const subject = d.game.world.getAllObjects().find(object => names.includes(object.name) && !object.isDestroyed);
            if (subject) d.worldInteraction.minimapHandler.panToTile(subject.tile);
        }, names);
        await page.evaluate(() => window.__ra2debug.worldView.sovietUnitsHd.idle()); await page.waitForTimeout(250);
        const actors = await page.evaluate(names => {
            const d = window.__ra2debug, g = d.game;
            return names.map(name => ({ name, objects: g.world.getAllObjects().filter(o => o.name === name && !o.isDestroyed).map(o => {
                const r = d.renderableManager.getRenderableByGameObject(o);
                const models = [...new Set([r?.mainObj, r?.mainRenderable, r?.shpRenderable])].filter(m => m?.builder);
                const parts = models.map(model => { const b = model.builder, page = b.getHdPage?.();
                    const index = b.frameNo + b.frameOffset, original = b.shpFile?.images[index];
                    const sample = b.hdOverride?.frames[index]?.sampleRect, logical = b.getSpriteGeometryOptions(b.frameNo).logicalSize;
                    return { identity: b.hdOverride?.identity, frame: b.frameNo, page: !!page,
                        nativeTrim: original ? [original.width, original.height] : null,
                        renderLogicalSize: logical ? [logical.width, logical.height] : null,
                        sampleSize: sample ? [sample.width, sample.height] : null,
                        effectiveDensity: logical?.width && sample ? sample.width / logical.width : null,
                        verticalDensity: logical?.height && sample ? sample.height / logical.height : null,
                        gpuHd: !!page && model.getShapeMesh()?.material?.map === page.base }; });
                const layer = r?.terrainLayer ?? r?.mapOverlayLayer ?? r?.mapSmudgeLayer;
                const spec = layer?.batchShpSpecsByObject?.get(o)?.main;
                const batch = spec && [...layer.batchShpBuilders.values()].flat().find(b => b.specIndexes.has(spec));
                if (batch) {
                    const frame = batch.hdOverride?.frames[spec.frameNo], page = frame && batch.hdOverride.pages[frame.page];
                    const original = spec.shpFile.images[spec.frameNo], logical = batch.getSpriteGeometryOptions(spec).logicalSize;
                    parts.push({ kind: 'native-map-sprite-batch', identity: batch.hdOverride?.identity, frame: spec.frameNo,
                        page: !!page, nativeTrim: [original.width, original.height],
                        renderLogicalSize: logical ? [logical.width, logical.height] : null,
                        sampleSize: frame ? [frame.sampleRect.width, frame.sampleRect.height] : null,
                        effectiveDensity: logical?.width && frame ? frame.sampleRect.width / logical.width : null,
                        verticalDensity: logical?.height && frame ? frame.sampleRect.height / logical.height : null,
                        gpuHd: !!page && batch.mesh?.material?.map === page.base });
                }
                return { id: o.id, parts };
            }) }));
        }, names);
        report.cases.push({ density, restoredTick: restored.tick, restoredHash: restored.worldHash ?? restored.hash, actors });
        for (const actor of actors) {
            assert(actor.objects.length, 'Required actual actor absent: ' + actor.name);
            assert(actor.objects.every(o => o.parts.some(p => p.page && p.gpuHd && p.effectiveDensity === density && p.verticalDensity === density)),
                'Actual actor falls back or samples the wrong physical density: ' + actor.name);
        }
        if (framed) {
            const frozen = await worldState(page), captures = [];
            for (const name of names) {
                await page.evaluate(name => {
                    const d = window.__ra2debug, w = d.worldScene;
                    const subject = d.game.world.getAllObjects().find(object => object.name === name
                        && object.isSpawned && !object.isDestroyed);
                    if (!subject) throw Error('Required live source actor absent: ' + name);
                    const free = w.cameraPan.freeCamera, previous = free.value;
                    free.value = true;
                    try { d.worldInteraction.minimapHandler.panToTile(subject.tile); }
                    finally { free.value = previous; }
                    w.updateCamera(w.cameraPan.getPan(), w.cameraZoom.getZoom());
                }, name);
                // A resident HD page can resolve before the next camera frame.
                await page.waitForTimeout(250);
                const capture = await page.evaluate(name => {
                    const d = window.__ra2debug, w = d.worldScene, gl = d.renderer.renderer;
                    w.updateCamera(w.cameraPan.getPan(), w.cameraZoom.getZoom());
                    d.renderer.render();
                    const ratio = gl.domElement.width / d.renderer.width, v = w.viewport;
                    const crop = [Math.round((v.x + v.width / 2) * ratio - 320),
                        Math.round((v.y + v.height / 2) * ratio - 240), 640, 480];
                    if (crop[0] < 0 || crop[1] < 0 || crop[0] + 640 > gl.domElement.width
                        || crop[1] + 480 > gl.domElement.height) throw Error('Framed actor crop exceeds viewport');
                    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
                    canvas.getContext('2d').drawImage(gl.domElement, ...crop, 0, 0, 640, 480);
                    return { name, crop, png: canvas.toDataURL('image/png') };
                }, name);
                const file = name.toLowerCase() + '-native-framed-diagnostic.png';
                await fs.writeFile(path.join(folder, file), Buffer.from(capture.png.split(',')[1], 'base64'));
                delete capture.png; captures.push({ ...capture, file });
            }
            assert.deepEqual(await worldState(page), frozen);
            report.cases.at(-1).framed = { captures, worldTickRngAndTeamsUnchanged: true,
                scope: 'Diagnostic free-camera framing and framebuffer crops only. Source actors and simulation are unchanged.' };
        }
        await page.screenshot({ path: path.join(folder, 'native-actual-actor-bindings-diagnostic.png') });
        await app.close(); app = undefined;
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []); assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = 'PASS_NATIVE_ACTUAL_ACTOR_BINDINGS_INDEPENDENT_2X_4X';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally { await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
