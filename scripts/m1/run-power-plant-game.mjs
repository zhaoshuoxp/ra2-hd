import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { checkRenderResolutionMenu, checkRenderResolutionMatch } from './check-render-resolution.mjs';

const output = process.env.M12_OUTPUT ?? '.artifacts/m1-2/game-combined-v1';
const origin = process.env.M12_ORIGIN ?? 'http://127.0.0.1:4012';
const density = process.env.M12_DENSITY ?? '4';
const conscript = process.env.M12_CONSCRIPT ?? density;
const expected = Number(process.env.M12_EXPECT_DENSITY ?? density);
const short = process.env.M12_SHORT === '1';
const color = Number(process.env.M12_COLOR ?? 1);
await fs.mkdir(output, { recursive: true });
const result = { status: 'FAIL', errors: [], external: [], consoleErrors: [], commands: [], fixture: [], expected };
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: process.env.M14_PLAY !== '1', handleSIGINT: process.env.M14_PLAY !== '1',
    handleSIGTERM: process.env.M14_PLAY !== '1', args: ['--disable-background-networking', '--disable-component-update', '--no-first-run'] });
let page;
try {
    const context = await browser.newContext({ serviceWorkers: 'block', ...(process.env.M14_PLAY === '1'
        ? { viewport: null } : { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 }) });
    const rejectedHashes = new Set();
    await context.route('**/*', async route => {
        const url = route.request().url();
        if (!url.startsWith(origin + '/') && !/^(blob|data):/.test(url)) { result.external.push(url); return route.abort(); }
        if (url.endsWith('/local-hd/power-plant-selection.json') && process.env.M12_REJECT) {
            const response = await route.fetch(); const data = await response.json();
            data.members.forEach(m => rejectedHashes.add(m.sha256));
            return route.fulfill({ response, json: data });
        }
        const pageMatch = url.match(/\/local-hd\/([a-f0-9]+)\/([24])\//);
        if (pageMatch && rejectedHashes.has(pageMatch[1]) && (process.env.M12_REJECT === 'all' || pageMatch[2] === '4'))
            return route.fulfill({ status: 404, body: 'Intentional GAPOWR-only fallback fixture' });
        return route.continue();
    });
    await context.addInitScript(({ color }) => {
        const prefs = { _r_lastMap: 'MP01T4.map', _r_lastMode: '1', _r_lastCountry: '0', _r_lastColor: String(color),
            _r_lastStartPos: '0', _r_lastTeam: '0', _r_hostOpts: '3;10000;0;1;1;0;1;0;;0;1;0;0',
            _r_lastBots: JSON.stringify([null, null, null, { d: 4, c: 5, co: color === 2 ? 1 : 2, s: 3, t: 1 }, null, null, null, null]) };
        Object.entries(prefs).forEach(([key, value]) => localStorage.setItem(key, value));
    }, { color });
    page = await context.newPage();
    page.on('pageerror', error => result.errors.push(error.stack));
    page.on('console', message => { if (message.type() === 'error') result.consoleErrors.push(message.text()); });
    const params = new URLSearchParams();
    if (density !== '1') params.set('power-plant-hd', density);
    if (conscript !== '1') params.set('conscript-hd', conscript);
    await page.goto(`${origin}/?${params}`);
    if (!short || process.env.M14_MENU === '1') result.settings = await checkRenderResolutionMenu(page, output);
    await page.getByText('Offline Skirmish', { exact: true }).click({ timeout: 45000 });
    await page.waitForFunction(() => window.__ra2debug?.skirmishLobby);
    await page.evaluate(() => { window.__ra2debug.generalOptions.graphics.renderResolution.value = '1080p';
        window.__ra2debug.skirmishLobby.startGame(1700000000000); });
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1, undefined, { timeout: 60000 });
    result.initial = await page.evaluate(() => ({ building: window.__ra2debug.powerPlantHd,
        conscript: window.__ra2debug.conscriptHd, country: window.__ra2debug.localPlayer.country,
        tick: window.__ra2debug.game.currentTick }));
    assert.equal(result.initial.building.density, expected);
    assert.equal(result.initial.conscript.density, Number(conscript));
    await page.evaluate(() => {
        const d = window.__ra2debug, mcv = d.localPlayer.getOwnedObjects().find(o => /MCV$/.test(o.name));
        if (!mcv) throw Error('Missing MCV');
        window.__m12Mcv = mcv;
        d.actionsApi.orderUnits([mcv.id], 10);
    });
    await page.waitForFunction(() => window.__ra2debug.localPlayer.getOwnedObjects().some(o => o.name === 'GACNST'), undefined, { timeout: 20000 });
    await page.waitForTimeout(1800);
    await page.evaluate(() => {
        window.__m12Trace = []; window.__m12TraceActive = true; window.__m12Phase = 'construction';
        window.__m12Plants = []; let lastTick = -1;
        const sample = () => {
            if (!window.__m12TraceActive) return;
            const d = window.__ra2debug;
            if (lastTick !== d.game.currentTick) {
                lastTick = d.game.currentTick;
                const plants = d.localPlayer.getOwnedObjects().filter(o => o.name === 'GAPOWR');
                for (const plant of plants) if (!window.__m12Plants.includes(plant)) window.__m12Plants.push(plant);
                const rows = window.__m12Plants.map(plant => {
                    const r = d.renderableManager.getRenderableByGameObject(plant);
                    const models = r ? [['body', r.mainObj], ...[...r.animObjects].flatMap(([type, models]) => models.map(m => [String(type), m]))] : [];
                    return { id: plant.id, health: plant.healthTrait.health, destroyed: plant.isDestroyed, spawned: plant.isSpawned,
                        models: models.filter(([, model]) => model?.get3DObject()).map(([type, model]) => {
                            const b = model.builder, mesh = model.getShapeMesh(), frame = b.getFrame(), f = b.hdOverride?.frames[frame + b.frameOffset];
                            const page = f && b.hdOverride.pages[f.page];
                            return { type, frame, aggregateFrame: frame + b.frameOffset, visible: model.get3DObject().visible,
                                material: mesh.material.type, hd: !!page, page: f?.page, shadow: !!model.getShadowMesh(),
                                pageMatches: !page || (mesh.material.map === page.base && mesh.material.uniforms.remapMap.value === page.data) };
                        }) };
                });
                window.__m12Trace.push({ tick: lastTick, phase: window.__m12Phase, plants: rows,
                    glError: d.renderer.renderer.getContext().getError(), drawCalls: d.renderer.renderer.info.render.calls,
                    memory: { ...d.renderer.renderer.info.memory } });
            }
            requestAnimationFrame(sample);
        }; sample();
    });
    async function buildPlant() {
        const before = await page.evaluate(() => window.__ra2debug.localPlayer.getOwnedObjects().filter(o => o.name === 'GAPOWR').map(o => o.id));
        await page.evaluate(() => {
            window.__m12Phase = 'construction';
            window.__ra2debug.actionsApi.queueForProduction(0, 2, 'GAPOWR', 1);
        });
        await page.waitForFunction(() => window.__ra2debug.localPlayer.production.getQueue(0).status === 3, undefined, { timeout: 60000 });
        const placement = await page.evaluate(() => {
            const d = window.__ra2debug, yard = d.localPlayer.getOwnedObjects().find(o => o.name === 'GACNST');
            const candidates = [];
            for (let dx = -6; dx <= 6; dx++) for (let dy = -6; dy <= 6; dy++) candidates.push({ rx: yard.tile.rx + dx, ry: yard.tile.ry + dy });
            const distance = t => (t.rx - yard.tile.rx - 3) ** 2 + (t.ry - yard.tile.ry + 2) ** 2;
            candidates.sort((a, b) => distance(a) - distance(b));
            const tile = candidates.find(t => d.game.getConstructionWorker(d.localPlayer).canPlaceAt('GAPOWR', t, { normalizedTile: true }));
            if (!tile) throw Error('No legal GAPOWR foundation');
            d.actionsApi.placeBuilding('GAPOWR', tile.rx, tile.ry);
            return { tick: d.game.currentTick, tile };
        });
        result.commands.push({ action: 'normal-production-and-placement', ...placement });
        await page.waitForFunction(before => window.__ra2debug.localPlayer.getOwnedObjects().some(o => o.name === 'GAPOWR' && !before.includes(o.id)), before);
        await page.waitForTimeout(350);
        await page.screenshot({ path: `${output}/construction-${result.commands.length}.png` });
        await page.waitForTimeout(2200);
        return page.evaluate(before => {
            const plant = window.__ra2debug.localPlayer.getOwnedObjects().find(o => o.name === 'GAPOWR' && !before.includes(o.id));
            window.__m12Plant = plant; window.__m12Phase = 'normal'; return plant.id;
        }, before);
    }
    const firstId = await buildPlant();
    result.fixture = await page.evaluate(() => {
        const d = window.__ra2debug, plant = window.__m12Plant;
        const rule = d.game.rules.getObject('E2', 3), created = [];
        for (let dx = -3; dx <= 4 && created.length < 8; dx++) for (let dy = -3; dy <= 4 && created.length < 8; dy++) {
            const tile = d.game.map.tiles.getByMapCoords(plant.tile.rx + dx, plant.tile.ry + dy);
            if (!tile || d.game.map.tileOccupation.getObjectsOnTile(tile).length
                || d.game.map.terrain.getPassableSpeed(tile, rule.speedType, true, false) <= 0) continue;
            const unit = d.game.createUnitForPlayer(rule, d.localPlayer);
            d.game.spawnObject(unit, tile); created.push(unit);
        }
        if (created.length < 4) throw Error('Insufficient valid Conscript fixture tiles');
        window.__m11Units = created;
        return created.map(u => ({ id: u.id, name: u.name, tile: [u.tile.rx, u.tile.ry],
            setup: 'Explicit local cross-faction unit fixture; native rules, health, production and combat unchanged' }));
    });
    await page.waitForTimeout(1200);
    result.normal = await page.evaluate(() => {
        const d = window.__ra2debug, plant = window.__m12Plant, r = d.renderableManager.getRenderableByGameObject(plant);
        d.unitSelection.deselectAll(); d.unitSelection.addToSelection(plant);
        return { id: plant.id, strength: plant.rules.strength, power: plant.rules.power, foundation: plant.getFoundation(),
            bodyMaterial: r.mainObj.getShapeMesh().material.type, bodyIdentity: r.mainObj.builder.hdOverride?.identity,
            conscripts: window.__m11Units.map(u => ({ id: u.id,
                material: d.renderableManager.getRenderableByGameObject(u).shpRenderable.getShapeMesh().material.type })) };
    });
    await page.screenshot({ path: `${output}/normal-selected.png` });
    if (process.env.M14_EDGE_PLAY === '1') {
        const { enableEdgeReviewUI } = await import('./run-display-edge-review.mjs');
        await enableEdgeReviewUI(page);
    }
    if (process.env.M13C_OUTPUT) {
        const { runRhinoSprite } = await import('./run-rhino-sprite.mjs');
        result.rhino = await runRhinoSprite(page, process.env.M13C_OUTPUT);
    }
    if (process.env.M13E_OUTPUT) {
        const { runRhinoEight } = await import('./run-rhino-eight.mjs');
        result.rhinoEight = await runRhinoEight(page, process.env.M13E_OUTPUT);
    }
    if (process.env.M13D_OUTPUT) {
        const { runRhinoParts } = await import('./run-rhino-parts.mjs');
        result.rhinoParts = await runRhinoParts(page, process.env.M13D_OUTPUT);
    }
    if (process.env.M14_PLAY === '1' && !process.env.M13C_OUTPUT && !process.env.M13D_OUTPUT && !process.env.M13E_OUTPUT) {
        await page.evaluate(() => { window.__ra2debug.generalOptions.graphics.renderResolution.value = 'native'; });
        console.log('M1.4 playable fixture ready: existing 4x Conscript and GAPOWR. Cross-faction infantry is diagnostic only.');
        console.log('Use the game Options menu to compare output presets. Review at 100% browser zoom. Ctrl+C in this terminal closes this isolated browser and preview.');
        if (process.env.M14_C_SMOKE === '1') {
            result.productionSmoke = await page.evaluate(() => {
                const d = window.__ra2debug, batches = [];
                d.worldScene.meshBatchManager.get3DObject().traverseVisible(o => {
                    if (o.verticesPerItem && o.material?.type === 'HdSpriteMaterial') batches.push(o);
                });
                if (!batches.length || batches.some(b => !b.material.uniforms.hdFiltering?.value))
                    throw Error('Production C is not active by default');
                const canvas = d.renderer.renderer.domElement;
                const text = d.gameScreen.hud?.sidebarCredits?.text;
                const textDensity = canvas.height / Number(canvas.dataset.logicalHeight);
                if (text && (text.ctx.canvas.width !== Math.ceil(text.props.width * textDensity)
                    || text.ctx.canvas.height !== Math.ceil(text.props.height * textDensity)))
                    throw Error('Visible HUD text density does not match the output');
                return { status: 'PASS_DEFAULT_C_VISIBLE_BROWSER', batches: batches.length,
                    display: [canvas.getBoundingClientRect().width, canvas.getBoundingClientRect().height],
                    buffer: [canvas.width, canvas.height], dpr: devicePixelRatio,
                    textPixels: text ? [text.ctx.canvas.width, text.ctx.canvas.height] : undefined,
                    logical: [canvas.dataset.logicalWidth, canvas.dataset.logicalHeight] };
            });
            await page.screenshot({ path: `${output}/production-c-visible.png` });
        } else if (process.env.M14_EDGE_SMOKE === '1') {
            const { smokeEdgeReviewUI } = await import('./run-display-edge-review.mjs');
            result.edgeUI = await smokeEdgeReviewUI(page, output);
        } else {
            await new Promise(resolve => {
                process.once('SIGINT', resolve); process.once('SIGTERM', resolve);
                page.once('close', resolve);
            });
        }
        if (process.env.M14_EDGE_PLAY === '1' && !page.isClosed())
            await page.evaluate(() => window.__m14EdgeUICleanup?.());
    }
    if (process.env.M14_OUTPUT) {
        const { runDisplayReview } = await import('./run-display-review.mjs');
        result.display = await runDisplayReview(page, process.env.M14_OUTPUT);
    }
    if (process.env.M14_FIDELITY_OUTPUT) {
        const { runDisplayFidelity } = await import('./run-display-fidelity.mjs');
        result.fidelity = await runDisplayFidelity(page, process.env.M14_FIDELITY_OUTPUT);
    }
    if (process.env.M14_CORRECTION_OUTPUT) {
        const { checkVisualCorrections } = await import('./check-visual-corrections.mjs');
        result.visualCorrections = await checkVisualCorrections(page, process.env.M14_CORRECTION_OUTPUT);
    }
    if (process.env.M14_PAUSE_OUTPUT) {
        const { checkPauseAndShroud } = await import('./check-pause-and-shroud.mjs');
        result.pauseAndShroud = await checkPauseAndShroud(page, process.env.M14_PAUSE_OUTPUT);
    }
    if (process.env.M14_FOLLOWUP_OUTPUT) {
        const { runShroudAnimationReview } = await import('./run-shroud-animation-review.mjs');
        result.shroudAnimation = await runShroudAnimationReview(page, process.env.M14_FOLLOWUP_OUTPUT);
    }
    if (process.env.M14_C_CHECKS_OUTPUT) {
        const { runProductionCChecks } = await import('./run-production-c-review.mjs');
        result.productionCChecks = await runProductionCChecks(page, process.env.M14_C_CHECKS_OUTPUT);
    }
    if (process.env.M14_PRODUCTION_OUTPUT) {
        const { runProductionCReview } = await import('./run-production-c-review.mjs');
        result.productionC = await runProductionCReview(page, process.env.M14_PRODUCTION_OUTPUT);
    }
    if (process.env.M14_EDGE_OUTPUT) {
        const { runDisplayEdgeReview } = await import('./run-display-edge-review.mjs');
        result.edgeReview = await runDisplayEdgeReview(page, process.env.M14_EDGE_OUTPUT);
    }
    if (process.env.M12_ZOOM_OUTPUT) {
        const { runPowerPlantZoom } = await import('./run-power-plant-zoom.mjs');
        result.zoom = await runPowerPlantZoom(page, process.env.M12_ZOOM_OUTPUT);
    }
    if (process.env.M12A_OUTPUT) {
        const { runPowerPlantClarity } = await import('./run-power-plant-clarity.mjs');
        result.clarity = await runPowerPlantClarity(page, process.env.M12A_OUTPUT);
    }
    if (process.env.M12_OCCLUSION === '1') {
        await page.evaluate(() => {
            const d = window.__ra2debug, u = window.__m11Units[0];
            const r = d.renderableManager.getRenderableByGameObject(u);
            d.unitSelection.deselectAll(); d.unitSelection.addToSelection(u);
            window.__m12ConscriptTrace = []; window.__m12ConscriptTraceActive = true;
            const sample = () => {
                if (!window.__m12ConscriptTraceActive) return;
                const builder = r.shpRenderable.builder, frame = builder.getFrame(), override = builder.hdOverride;
                const page = override?.frames[frame]?.page, expectedPage = override?.pages[page];
                const material = r.shpRenderable.getShapeMesh().material;
                window.__m12ConscriptTrace.push({ tick: d.game.currentTick, frame, page, moving: u.isMoving,
                    shadow: !!r.shpRenderable.getShadowMesh(), selectionVisible: r.pipOverlay?.selectionBox?.visible,
                    pageMatches: !expectedPage || (material.map === expectedPage.base && material.uniforms.remapMap.value === expectedPage.data),
                    glError: d.renderer.renderer.getContext().getError() });
                requestAnimationFrame(sample);
            }; sample();
        });
        result.occlusion = [];
        for (const offset of [[1, -1], [-1, 1], [-1, -1]]) {
            await page.evaluate(offset => {
                const d = window.__ra2debug, u = window.__m11Units[0];
                const plant = window.__m12Plant;
                d.actionsApi.orderUnits([u.id], 0, plant.tile.rx + offset[0], plant.tile.ry + offset[1]);
            }, offset);
            await page.waitForTimeout(5000);
            const probe = await page.evaluate(() => {
                const d = window.__ra2debug, u = window.__m11Units[0];
                const plant = window.__m12Plant;
                const unitR = d.renderableManager.getRenderableByGameObject(u), plantR = d.renderableManager.getRenderableByGameObject(plant);
                const body = unitR.shpRenderable.getShapeMesh(), building = plantR.get3DObject();
                const saved = [body.visible, building.visible], gl = d.renderer.renderer.getContext();
                const point = unitR.getPosition().clone().project(d.worldScene.camera), v = d.worldScene.viewport;
                const cx = v.x + (point.x + 1) * v.width / 2, cy = v.y + (1 - point.y) * v.height / 2;
                const scale = gl.drawingBufferHeight / Number(d.renderer.renderer.domElement.dataset.logicalHeight);
                const width = Math.ceil(80 * scale), height = Math.ceil(96 * scale);
                const left = Math.max(0, Math.min(gl.drawingBufferWidth - width, Math.round((cx - 40) * scale)));
                const bottom = Math.max(0, Math.min(gl.drawingBufferHeight - height, gl.drawingBufferHeight - Math.round((cy + 30) * scale)));
                const read = (showBody, showBuilding) => {
                    body.visible = showBody; building.visible = showBuilding;
                    d.worldScene.meshBatchManager.updateMeshes(); d.renderer.render();
                    const bytes = new Uint8Array(width * height * 4);
                    gl.readPixels(left, bottom, width, height, gl.RGBA, gl.UNSIGNED_BYTE, bytes); return bytes;
                };
                const different = (a, b) => {
                    let count = 0;
                    for (let i = 0; i < a.length; i += 4)
                        if (Math.max(...[0, 1, 2].map(k => Math.abs(a[i + k] - b[i + k]))) > 1) count++;
                    return count;
                };
                try {
                    const normal = read(true, true), noUnit = read(false, true);
                    const noBuilding = read(true, false), neither = read(false, false);
                    return { tick:d.game.currentTick, unitTile:[u.tile.rx,u.tile.ry], buildingTile:[plant.tile.rx,plant.tile.ry],
                        visibleBodyPixels:different(normal,noUnit), unobstructedBodyPixels:different(noBuilding,neither),
                        screen:[cx,cy], glError:gl.getError(), method:'Synchronous actual-scene body contribution with occluder visible/hidden; all visibility restored; no simulation mutation' };
                } finally {
                    [body.visible, building.visible] = saved;
                    d.worldScene.meshBatchManager.updateMeshes(); d.renderer.render();
                }
            });
            result.occlusion.push(probe);
            await page.screenshot({ path: `${output}/occlusion-${result.occlusion.length}.png` });
            if (probe.unobstructedBodyPixels > probe.visibleBodyPixels && probe.unobstructedBodyPixels > 0) break;
        }
        assert(result.occlusion.some(p => p.unobstructedBodyPixels > p.visibleBodyPixels && p.unobstructedBodyPixels > 0), 'GAPOWR occlusion not reproduced');
        await page.evaluate(() => {
            const d = window.__ra2debug, u = window.__m11Units[0];
            d.actionsApi.orderUnits([u.id], 11); d.actionsApi.orderUnits([u.id], 12);
        });
        await page.waitForTimeout(1800);
        await page.screenshot({ path: `${output}/conscript-cheer.png` });
        result.conscriptTrace = await page.evaluate(() => {
            window.__m12ConscriptTraceActive = false; return window.__m12ConscriptTrace;
        });
        assert(result.conscriptTrace.some(t => t.moving) && result.conscriptTrace.some(t => t.frame >= 293));
        assert(result.conscriptTrace.some(t => t.selectionVisible));
        assert(result.conscriptTrace.every(t => t.glError === 0 && t.shadow && t.pageMatches));
        if (conscript !== '1') assert.deepEqual([...new Set(result.conscriptTrace.map(t => t.page))].sort(), [0, 1]);
    }
    if (!short) {
        result.resolution = await checkRenderResolutionMatch(page, output);
        result.buildingScale = await page.evaluate(() => {
            const d = window.__ra2debug, r = d.renderableManager.getRenderableByGameObject(window.__m12Plant);
            return ['1080p', '4k'].map(mode => {
                d.generalOptions.graphics.renderResolution.value = mode; d.renderer.render();
                const canvas = d.renderer.renderer.domElement, camera = d.worldScene.camera;
                return { mode, tick: d.game.currentTick, frame: r.mainObj.builder.getFrame(),
                    buffer: [canvas.width, canvas.height], camera: [camera.left, camera.right, camera.top, camera.bottom],
                    body: Array.from(r.mainObj.getShapeMesh().geometry.attributes.position.array),
                    hit: d.helpers.getOwnedBuildingClickTargetsById(window.__m12Plant.id), png: canvas.toDataURL('image/png') };
            });
        });
        for (const entry of result.buildingScale) {
            await fs.writeFile(`${output}/building-same-frame-${entry.mode}.png`, Buffer.from(entry.png.split(',')[1], 'base64')); delete entry.png;
        }
        for (const key of ['tick', 'frame', 'camera', 'body', 'hit']) assert.deepEqual(result.buildingScale[0][key], result.buildingScale[1][key]);
        const point = result.buildingScale[1].hit.centerScreenPoint;
        await page.evaluate(() => window.__ra2debug.unitSelection.deselectAll());
        await page.mouse.click(point.x, point.y);
        result.buildingClick = await page.evaluate(() => ({ selected: window.__ra2debug.helpers.getSelectedUnitIds(), expected: window.__m12Plant.id }));
        assert(result.buildingClick.selected.includes(firstId), '4K building selection missed');
        await page.evaluate(() => {
            const d = window.__ra2debug; window.__m12Phase = 'damage';
            d.actionsApi.orderUnits(window.__m11Units.map(u => u.id), 3, window.__m12Plant.id);
        });
        await page.waitForFunction(() => window.__m12Plant.healthTrait.health < 48, undefined, { timeout: 60000 });
        await page.evaluate(() => { window.__ra2debug.actionsApi.orderUnits(window.__m11Units.map(u => u.id), 11); });
        await page.waitForTimeout(700);
        await page.screenshot({ path: `${output}/damaged.png` });
        result.damaged = await page.evaluate(() => ({ health: window.__m12Plant.healthTrait.health, tick: window.__ra2debug.game.currentTick }));
        assert(result.damaged.health > 0);
        await page.evaluate(() => { window.__m12Phase = 'repair'; window.__ra2debug.actionsApi.toggleRepairWrench(window.__m12Plant.id); });
        await page.waitForFunction(() => window.__m12Plant.healthTrait.health === 100, undefined, { timeout: 60000 });
        await page.screenshot({ path: `${output}/repaired.png` });
        result.repaired = await page.evaluate(() => ({ health: window.__m12Plant.healthTrait.health, tick: window.__ra2debug.game.currentTick }));
        await page.evaluate(() => { window.__m12Phase = 'selling'; window.__ra2debug.actionsApi.sellBuilding(window.__m12Plant.id); });
        await page.waitForTimeout(350); await page.screenshot({ path: `${output}/selling.png` });
        await page.waitForFunction(() => !window.__m12Plant.isSpawned, undefined, { timeout: 15000 });
        await buildPlant();
        await page.evaluate(() => {
            window.__m12Phase = 'destruction'; window.__ra2debug.actionsApi.orderUnits(window.__m11Units.map(u => u.id), 3, window.__m12Plant.id);
        });
        await page.waitForFunction(() => window.__m12Plant.isDestroyed, undefined, { timeout: 60000 });
        await page.screenshot({ path: `${output}/destroyed.png` });
        result.destroyed = await page.evaluate(() => ({ destroyed: window.__m12Plant.isDestroyed, tick: window.__ra2debug.game.currentTick }));
    }
    if (!page.isClosed()) {
        result.trace = await page.evaluate(() => { window.__m12TraceActive = false; return window.__m12Trace; });
        if (process.env.M14_OUTPUT) {
            assert(result.trace.some(t => t.plants.some(p => p.models.some(m => m.visible && m.aggregateFrame >= 35))), 'Buildup was not observed');
        }
        assert(result.trace.every(t => t.glError === 0 && t.plants.every(p => p.models.every(m => m.pageMatches))));
        result.disposal = await page.evaluate(async () => {
            const d = window.__ra2debug, renderer = d.renderer.renderer;
            const textures = [...(d.worldView.powerPlantHd?.overrides.values() ?? [])].flatMap(o => o.pages.flatMap(p => [p.base, p.data]));
            textures.push(...(d.worldView.conscriptHd?.override?.pages.flatMap(p => [p.base, p.data]) ?? []));
            const before = textures.filter(t => !!renderer.properties.get(t).__webglTexture).length;
            const diagnosticProgramsBefore = renderer.info.programs.filter(p => p.cacheKey.includes('m12a-diagnostic')).length;
            const creditsText = d.gameScreen.hud?.sidebarCredits?.text;
            await d.gameScreen.onLeave();
            const textVersion = creditsText?.texture.version;
            const resolution = d.generalOptions.graphics.renderResolution;
            const savedResolution = resolution.value;
            if (creditsText) resolution.value = savedResolution === '720p' ? '4k' : '720p';
            const uiTextReleased = !creditsText || (!renderer.properties.get(creditsText.texture).__webglTexture
                && creditsText.texture.version === textVersion);
            resolution.value = savedResolution;
            const diagnosticProgramsAfter = renderer.info.programs.filter(p => p.cacheKey.includes('m12a-diagnostic')).length;
            const edgeProgramsAfter = renderer.info.programs.filter(p => /m14-edge|m14-hd-coverage/.test(p.cacheKey)).length;
            return { allocatedBefore: before, released: textures.every(t => !renderer.properties.get(t).__webglTexture), uiTextReleased,
                remainingGame: !!d.game, diagnosticProgramsBefore, diagnosticProgramsAfter, edgeProgramsAfter };
        });
        assert(result.disposal.released && !result.disposal.remainingGame && result.disposal.diagnosticProgramsAfter === 0);
        assert.equal(result.disposal.edgeProgramsAfter, 0);
        assert(result.disposal.uiTextReleased);
        assert.deepEqual(result.errors, []); assert.deepEqual(result.external, []);
        assert.deepEqual(result.consoleErrors.filter(m => !(process.env.M12_REJECT && m.includes('404'))), []);
    }
    result.status = process.env.M14_PLAY === '1' ? 'PLAYABLE_SESSION_CLOSED'
        : short ? 'PASS_BOUNDED_STARTUP' : 'PASS_BOUNDED_GAMEPLAY';
} catch (error) {
    result.failure = error.stack; process.exitCode = 1;
    if (page) {
        result.partialTrace = await page.evaluate(() => window.__m12Trace).catch(() => undefined);
        await page.screenshot({ path: `${output}/failure.png` }).catch(() => {});
    }
} finally {
    await fs.writeFile(`${output}/result.json`, JSON.stringify(result, null, 2) + '\n');
    await browser.close();
}
console.log(JSON.stringify({ status: result.status, initial: result.initial, normal: result.normal,
    damaged: result.damaged, repaired: result.repaired, destroyed: result.destroyed, failure: result.failure,
    errors: result.errors, consoleErrors: result.consoleErrors }));
