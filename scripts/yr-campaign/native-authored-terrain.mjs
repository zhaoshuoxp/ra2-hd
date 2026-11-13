import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld, worldState, returnCampaignHome } from '../m3-2/native-session.mjs';

const [output, receiptFile, requestedDensity, requestedMission] = process.argv.slice(2);
const out = path.resolve(output), density = Number(requestedDensity);
assert([2, 4].includes(density)); await fs.mkdir(out, { recursive: false });
const receipt = JSON.parse(await fs.readFile(receiptFile));
assert(receipt.registered && receipt.originalGeometryDepthRulesUnchanged);
assert(receipt.acceptedPayloadsReplaced === 0 || receipt.reopenedRoadSlopeRepair === true
    && receipt.unrelatedTerrainPixelsExact === true && receipt.nativeMapsUnchanged === true);
const mission = requestedMission ?? receipt.missions[0];
assert(receipt.missions.includes(mission));
const closure = receipt.mapClosures?.[mission];
const inspectionGroups = closure?.groups ?? receipt.inspectionGroups ?? receipt.addedGroups;
const completeSourceSubtiles = closure?.subtiles ?? receipt.completeSourceSubtiles;
assert(Array.isArray(inspectionGroups) && inspectionGroups.length);
const edition = receipt.edition ?? 'yr', skirmish = receipt.mapKinds?.[mission] === 'skirmish';
assert(['ra2', 'yr'].includes(edition));
const referenceFile = process.argv.find(value => value.startsWith('--original-reference-from='))?.slice(26);
const reference = referenceFile && JSON.parse(await fs.readFile(referenceFile));
const originalGraphics = process.argv.includes('--original-graphics');
assert(!originalGraphics || reference, 'Original graphics require a retained source-placement reference');
if (reference) {
    assert.equal(reference.mission, mission); assert.equal(reference.density, density);
    assert.equal(reference.status, 'PASS_NATIVE_ORIGINAL_TMP_PLACEMENTS_HD_MESH_DENSITY_FROZEN_WORLD_AND_SCENE_RELEASE');
}
const report = { status: 'RUNNING', mission, edition, skirmish, density, receipt: receiptFile, errors: [], failedResources: [],
    scope: 'Fresh original map source, frozen for explicit art inspection. Diagnostic reveal and camera framing only; original terrain, actors, simulation tick, RNG, tasks and objectives remain unchanged. This is terrain and scene-release evidence, separate from public campaign acceptance.' };
let app, page;
const reusedSession = globalThis.__nativeTerrainMatrixSession;
let listeners;
const snapshot = () => skirmish ? page.evaluate(() => { const g = window.__ra2debug.game;
    return JSON.parse(JSON.stringify({ tick: g.currentTick, hash: g.getHash(), rng: g.prng.snapshot(),
        world: g.debugGetState(), pendingCallbacks: g.afterTickCallbacks.length })); }) : worldState(page);
try {
    const session = reusedSession ?? await campaignSession(out, report, { edition, density: originalGraphics ? 0 : density });
    ({ app, page } = session);
    if (reusedSession) {
        listeners = { pageerror: error => report.errors.push(error.stack),
            console: message => { if (message.type() === 'error') (report.consoleErrors ??= []).push(message.text()); },
            response: response => { if (response.status() >= 400) report.failedResources.push([response.url(), response.status()]); } };
        for (const [event, listener] of Object.entries(listeners)) page.on(event, listener);
        if (!await page.locator('[data-campaign-ready=true]').isVisible())
            await page.getByRole('button', { name: session.labels['hd:menucampaign'], exact: true }).click();
        await page.waitForSelector('[data-campaign-ready=true]', { timeout: 90000 });
        await page.evaluate(density => { const graphics = window.__ra2debug.generalOptions.graphics;
            graphics.hdEnabled.value = density > 0; if (density) graphics.hdDensity.value = density;
        }, originalGraphics ? 0 : density);
    }
    report.originalGraphics = originalGraphics;
    if (skirmish) {
        await returnCampaignHome(page, session.labels);
        await page.evaluate(({ edition, mission }) => {
            const bots = Array(8).fill(null); bots[1] = { d: 4, c: 5, co: 2, s: 1, t: 1 };
            Object.entries({ _r_lastMap: mission, _r_lastMode: '1', _r_lastCountry: '0', _r_lastColor: '1',
                _r_lastStartPos: '0', _r_lastTeam: '0', _r_hostOpts: '6;10000;0;1;1;0;1;0;;0;1;0;0',
                _r_lastBots: JSON.stringify(bots) }).forEach(([key, value]) => localStorage.setItem(`_edition:${edition}:${key}`, value));
        }, { edition, mission });
        await page.getByRole('button', { name: session.labels['hd:menuskirmish'], exact: true }).click();
        await page.waitForFunction(() => window.__ra2debug?.skirmishLobby, undefined, { timeout: 90000 });
        report.mapSelection = await page.evaluate(({ mission, maxSlots }) => {
            const d = window.__ra2debug, screen = d.mainMenuController.screens.get(1);
            const options = screen.pregameController.getGameOpts(), initial = options.mapName;
            if (initial.toLowerCase() !== mission.toLowerCase()) {
                options.mapName = mission; options.maxSlots = maxSlots;
            }
            d.skirmishLobby.startGame(1700000000000);
            return { requested: mission, initial, archiveOnlyInspection: initial.toLowerCase() !== mission.toLowerCase() };
        }, { mission, maxSlots: closure.maxSlots });
        await page.waitForFunction(mission => {
            const d = window.__ra2debug, ready = d.game?.status === 1 && d.game.gameOpts.mapName.toLowerCase() === mission.toLowerCase()
                && d.gameScreen?.playerUi;
            if (ready) d.gameScreen.gameTurnMgr.setPaused(true);
            return ready && !d.renderer.preparingScenes?.has(d.worldScene)
                || !!document.querySelector('[data-game-error]') || /(?:^|\n)Error:/.test(document.body.innerText);
        }, mission, { timeout: 180000 });
        assert(await page.evaluate(mission => window.__ra2debug.game?.status === 1
            && window.__ra2debug.game.gameOpts.mapName.toLowerCase() === mission.toLowerCase(), mission),
        await page.locator('body').innerText());
    } else {
        await page.evaluate(mission => window.__ra2debug.mainMenuController.screens.get(22).launchDiagnostic(undefined, mission), mission);
        await waitWorld(page, mission);
    }
    if (!skirmish && closure?.sourceSha256) report.originalSourceIdentity = await page.evaluate(expected => {
        const source = window.__ra2debug.game.campaign.launch;
        if (source.sourceSha256 !== expected) throw Error('Original authored-terrain source map changed');
        return { mission: source.mission, sha256: source.sourceSha256, verified: true };
    }, closure.sourceSha256);
    if (closure?.sourceCells) report.sourceCells = await page.evaluate(({ expected, sourceSha256 }) => {
        const d = window.__ra2debug, g = d.game, tiles = g.map.tiles.getAll();
        if (g.campaign && g.campaign.launch.sourceSha256 !== sourceSha256) throw Error('Original source map hash changed');
        for (const row of expected) {
            const tile = tiles.find(tile => tile.rx === row.tile[0] && tile.ry === row.tile[1]);
            const file = tile && d.theater.tileSets.getTile(tile.tileNum)?.files[0];
            if (!file || file.filename !== row.member || tile.z !== row.z || tile.subTile !== row.subTile)
                throw Error('Original road-slope placement changed: ' + JSON.stringify(row));
        }
        return { checked: expected.length, allOriginalCoordinatesHeightsMembersAndSubtilesExact: true };
    }, { expected: closure.sourceCells, sourceSha256: closure.sourceSha256 });
    report.terrain = await page.evaluate(({ members, groups, density }) => {
        const d = window.__ra2debug, g = d.game, w = d.worldScene, terrain = d.theater.terrainHd;
        if (g.campaign) g.campaign.inspectionModified = true;
        g.mapShroudTrait.revealMap(g.localPlayer, g);
        d.gameScreen.pointer.unlock(true); document.querySelector('[data-campaign-diagnostic]')?.remove();
        const textures = new Set();
        w.scene.traverse(object => { if (object.isMesh && object.name === 'map_tiles_hd') textures.add(object.material.map); });
        return { groups: terrain.report.groups.filter(group => groups.includes(group.id)),
            allGroups: terrain.report.groups,
            placed: terrain.report.placedBindings.filter(binding => members.includes(binding.member)),
            neighboringBindings: [...terrain.bindings.values()].filter(binding => !members.includes(binding.source.member))
                .map(binding => ({ source: binding.source, group: binding.group,
                    sample: [binding.rect.width, binding.rect.height], logical: [binding.logical.width, binding.logical.height],
                    actualHdTerrainMesh: textures.has(binding.texture) })),
            allocation: terrain.report.worldChargeBytes, budget: terrain.report.budget,
            bindings: [...terrain.bindings.values()].filter(binding => members.includes(binding.source.member)
                && groups.includes(binding.group))
                .map(binding => ({ source: binding.source, group: binding.group,
                    sample: [binding.rect.width, binding.rect.height], logical: [binding.logical.width, binding.logical.height],
                    density, actualHdTerrainMesh: textures.has(binding.texture), texture: binding.texture.uuid })) };
    }, { members: receipt.members, groups: inspectionGroups, density });
    if (reference) {
        assert.deepEqual(report.terrain.groups, []); assert.deepEqual(report.terrain.bindings, []);
        report.originalReference = { file: referenceFile, candidateArtCredit: false,
            scope: 'Original fallback for these members with the canonical accepted neighboring artwork. Source placement and TMP hashes are verified before capture.' };
    } else {
        assert.equal(report.terrain.groups.length, inspectionGroups.length);
        assert(report.terrain.groups.every(group => group.status === 'PUBLISHED' && group.density === density));
        if (receipt.variants) for (const group of report.terrain.groups)
            assert.equal(group.sha256, receipt.variants[group.id][density], 'Native road atlas must match its pinned review plan');
        assert.equal(report.terrain.bindings.length, completeSourceSubtiles);
    }
    assert(report.terrain.allocation <= report.terrain.budget);
    for (const binding of report.terrain.bindings) {
        assert(binding.actualHdTerrainMesh);
        assert.deepEqual(binding.sample, binding.logical.map(size => size * density));
    }
    const placements = reference ? reference.terrain.placed : report.terrain.placed;
    const present = receipt.members.filter(member => placements.some(row => row.member === member));
    assert(present.length, 'The original mission must place this authored terrain');
    await page.evaluate(() => {
        const d = window.__ra2debug; d.gameScreen.gameAnimationLoop.stop(); d.renderer.update(0);
    });
    report.before = await snapshot();
    report.captures = [];
    const requestedCaptures = receipt.capturePlacements?.[mission];
    if (requestedCaptures) {
        assert(Array.isArray(requestedCaptures) && requestedCaptures.length);
        assert.deepEqual([...new Set(requestedCaptures.map(item => item.member))].sort(), [...present].sort());
        for (const item of requestedCaptures) {
            assert.deepEqual(Object.keys(item).sort(), ['member', 'tile']);
            assert(Array.isArray(item.tile) && item.tile.length === 2 && item.tile.every(Number.isSafeInteger));
        }
    }
    for (const target of requestedCaptures ?? present.map(member => ({ member }))) {
        const { member } = target;
        const candidates = placements.filter(row => row.member === member);
        const center = [0, 1].map(axis => candidates.reduce((sum, row) => sum + row.tile[axis], 0) / candidates.length);
        candidates.sort((a, b) => Number(b.subTile === 3) - Number(a.subTile === 3)
            || Math.hypot(a.tile[0] - center[0], a.tile[1] - center[1])
            - Math.hypot(b.tile[0] - center[0], b.tile[1] - center[1]));
        const placement = target.tile
            ? candidates.find(row => row.tile[0] === target.tile[0] && row.tile[1] === target.tile[1])
            : candidates[0];
        assert(placement, 'Requested capture must identify an unchanged original source placement');
        const frame = await page.evaluate(async ({ placement, zoom, originalReference }) => {
            const d = window.__ra2debug, g = d.game, w = d.worldScene;
            const tile = g.map.tiles.getAll().find(tile => tile.rx === placement.tile[0] && tile.ry === placement.tile[1]);
            if (!tile) throw Error('Original source tile absent');
            if (originalReference) {
                if (JSON.stringify([tile.rx, tile.ry, tile.z, tile.tileNum, tile.subTile]) !== JSON.stringify(placement.tile))
                    throw Error('Original reference placement changed');
                const file = d.theater.tileSets.getTile(tile.tileNum)?.files.find(file => file.filename === placement.member);
                if (!file?.sourceBytes) throw Error('Original reference TMP source absent');
                const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', file.sourceBytes)))
                    .map(value => value.toString(16).padStart(2, '0')).join('');
                if (hash !== placement.sha256) throw Error('Original reference TMP identity changed');
            }
            const free = w.cameraPan.freeCamera, previous = free.value; free.value = true;
            let pan;
            try {
                d.worldInteraction.minimapHandler.panToTile(tile); pan = w.cameraPan.getPan();
                w.cameraPan.setPan({ x: pan.x * zoom, y: pan.y * zoom });
            } finally { free.value = previous; }
            w.cameraZoom.zoom = w.lastCameraZoom = zoom; w.camera.zoom = zoom; w.camera.updateProjectionMatrix();
            w.updateCamera(w.cameraPan.getPan(), zoom); d.renderableManager.getRenderableContainer().cullRenderables(w.viewport.width);
            const automatic = w.scene.matrixWorldAutoUpdate; w.scene.matrixWorldAutoUpdate = true;
            try { w.scene.updateMatrixWorld(true); } finally { w.scene.matrixWorldAutoUpdate = automatic; }
            w.meshBatchManager.updateMeshes(); d.renderer.render();
            const gl = d.renderer.renderer, viewport = w.viewport, ratio = gl.domElement.width / d.renderer.width;
            const width = Math.min(900, Math.floor(viewport.width * ratio));
            const height = Math.min(600, Math.floor(viewport.height * ratio));
            const x = Math.floor((viewport.x + viewport.width / 2) * ratio - width / 2);
            const y = Math.floor((viewport.y + viewport.height / 2) * ratio - height / 2);
            const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
            const context = canvas.getContext('2d'); context.drawImage(gl.domElement, x, y, width, height, 0, 0, width, height);
            const pixels = context.getImageData(0, 0, width, height).data;
            let samples = 0, visible = 0;
            for (let index = 0; index < pixels.length; index += 128) {
                samples++; if (Math.max(pixels[index], pixels[index + 1], pixels[index + 2]) > 5) visible++;
            }
            return { tile: placement.tile, zoom, nativePan: pan, drawPan: w.cameraPan.getPan(),
                tick: g.currentTick, hash: g.getHash(), glError: gl.getContext().getError(),
                scenePreparing: d.renderer.preparingScenes.has(w), visibleWorldFraction: visible / samples,
                crop: [x, y, width, height], png: canvas.toDataURL('image/png') };
        }, { placement, zoom: density / 2, originalReference: !!reference });
        assert.equal(frame.glError, 0); assert.equal(frame.scenePreparing, false);
        assert.equal(frame.tick, report.before.tick); assert.equal(frame.hash, report.before.hash);
        assert(frame.visibleWorldFraction > .1, 'Capture must contain visible original world terrain');
        const name = member.replace('.', '-') + (target.tile ? '-' + target.tile.join('-') : '');
        const file = name + '-native.png';
        await fs.writeFile(path.join(out, file), Buffer.from(frame.png.split(',')[1], 'base64'));
        delete frame.png; report.captures.push({ member, file, sourceSha256: placement.sha256, ...frame });
        await page.screenshot({ path: path.join(out, name + '-context.png') });
    }
    report.after = await snapshot(); assert.deepEqual(report.after, report.before);
    await page.evaluate(() => {
        const d = window.__ra2debug; window.__terrainArtOldWorld = { terrain: d.terrainHd, environment: d.environmentHd };
        d.gameScreen.controller.goToScreen(0);
    });
    await page.waitForFunction(() => window.__terrainArtOldWorld.terrain.disposed
        && window.__terrainArtOldWorld.environment.disposed, undefined, { timeout: 30000 });
    report.release = await page.evaluate(() => Object.fromEntries(Object.entries(window.__terrainArtOldWorld)
        .map(([key, value]) => [key, { disposed: value.disposed, gpuBytes: value.gpuBytes,
            retainedCpuBytes: value.retainedCpuBytes, worldChargeBytes: value.worldChargeBytes }])));
    for (const kind of ['terrain', 'environment']) for (const key of ['gpuBytes', 'retainedCpuBytes', 'worldChargeBytes'])
        assert.equal(report.release[kind][key], 0);
    if (reusedSession) {
        await page.getByRole('button', { name: session.labels['hd:menucampaign'], exact: true }).waitFor({ timeout: 90000 });
        await page.waitForFunction(() => {
            const controller = window.__ra2debug.mainMenuController, menu = controller.mainMenu;
            return controller.getCurrentScreenType() === 0 && menu && !menu.sidebarCollapsed && !menu.sidebarNeedsRefresh;
        }, undefined, { timeout: 90000 });
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    assert.deepEqual(report.consoleErrors ?? [], []);
    report.status = reference ? 'PASS_NATIVE_ORIGINAL_TERRAIN_REFERENCE_FROZEN_WORLD_AND_SCENE_RELEASE'
        : 'PASS_NATIVE_ORIGINAL_TMP_PLACEMENTS_HD_MESH_DENSITY_FROZEN_WORLD_AND_SCENE_RELEASE';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    await page?.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    if (listeners) for (const [event, listener] of Object.entries(listeners)) page.off(event, listener);
    if (!reusedSession) await app?.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
