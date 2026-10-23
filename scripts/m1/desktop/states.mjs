// Supplementary controlled state/bridge probe in the delivered Electron runtime.
import { _electron as electron } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const artifact = JSON.parse(await fs.readFile(process.argv[2], 'utf8'));
const output = path.resolve(`.artifacts/m1-5/states-${Date.now()}`); await fs.mkdir(output, { recursive: true });
const result = { status: 'FAIL', scope: 'Controlled render states and native teleport to retail bridge tiles, using normally initialized units; not natural special-state gameplay', errors: [], states: [] };
const app = await electron.launch({ executablePath: artifact.executable, cwd: '/private/tmp',
    env: { ...process.env, RA2_DESKTOP_USER_DATA: path.join(output, 'profile') }, timeout: 60000 });
try {
    const page = await app.firstWindow(); page.on('pageerror', e => result.errors.push(e.stack));
    await page.getByText('Offline Skirmish', { exact: true }).waitFor({ timeout: 90000 });
    await page.evaluate(() => {
        const d = window.__ra2debug; for (const k of ['conscriptHd', 'powerPlantHd', 'rhinoHd']) d.generalOptions.graphics[k].value = true;
        d.generalOptions.graphics.renderResolution.value = '1080p';
        const prefs = { _r_lastMap: 'MP23T4.map', _r_lastMode: '1', _r_lastCountry: '5', _r_lastColor: '1', _r_lastStartPos: '0', _r_lastTeam: '0',
            _r_hostOpts: '3;10000;10;1;1;0;1;0;;0;1;0;0', _r_lastBots: JSON.stringify([null, null, null, { d: 2, c: 5, co: 2, s: 3, t: 1 }, null, null, null, null]) };
        Object.entries(prefs).forEach(([k, v]) => localStorage.setItem(k, v));
    });
    await page.getByText('Offline Skirmish', { exact: true }).click();
    await page.waitForFunction(() => window.__ra2debug?.skirmishLobby);
    await page.evaluate(() => window.__ra2debug.skirmishLobby.startGame(1700000000000));
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1, undefined, { timeout: 90000 });
    await page.waitForTimeout(800);
    result.setup = await page.evaluate(() => {
        const d = window.__ra2debug; d.gameScreen.pointer.unlock(); d.gameScreen.gameAnimationLoop.stop();
        d.game.mapShroudTrait.revealMap(d.localPlayer, d.game);
        const units = ['E2', 'HTNK'].map(name => d.localPlayer.getOwnedObjects().find(u => u.name === name));
        const high = d.game.map.tiles.getAll().find(t => d.game.map.tileOccupation.getBridgeOnTile(t)?.isHighBridge());
        if (!high) throw Error('Retail bridge not found');
        window.__m15States = { units, high, time: performance.now(), home: units.map(u => u.tile),
            render: () => { d.worldScene.update(window.__m15States.time, 0); d.worldScene.scene.updateMatrixWorld(true);
                d.worldScene.meshBatchManager.updateMeshes(); d.worldScene.meshBatchManager.processRenderQueue(); d.renderer.render(); } };
        return { bridge: high, identities: [d.conscriptHd, d.powerPlantHd, d.rhinoHd],
            units: units.map(u => ({ name: u.name, id: u.id })) };
    });
    for (const index of [0, 1]) for (const state of ['bridge-on', 'bridge-under', 'friendly-cloak', 'warp', 'restored']) {
        const row = await page.evaluate(({ index, state }) => {
            const d = window.__ra2debug, s = window.__m15States, u = s.units[index], r = d.renderableManager.getRenderableByGameObject(u);
            const oldCloak = u.cloakableTrait;
            if (state.startsWith('bridge')) {
                u.moveTrait.teleportUnitToTile(s.high, state === 'bridge-on' ? d.game.map.tileOccupation.getBridgeOnTile(s.high) : undefined, false, false, d.game);
                d.worldInteraction.minimapHandler.panToTile(s.high);
            } else {
                u.moveTrait.teleportUnitToTile(s.home[index], undefined, false, false, d.game);
                d.worldInteraction.minimapHandler.panToTile(s.home[index]);
            }
            if (state === 'friendly-cloak') u.cloakableTrait = { isCloaked: () => true };
            if (state === 'warp') u.warpedOutTrait.debugSetActive(true);
            s.time += 100; r.setPosition(u.position.worldPosition); s.render();
            const b = r.shpRenderable?.builder, mesh = r.shpRenderable?.getShapeMesh(), hd = r.rhinoHd;
            const draws = [], originals = [];
            d.worldScene.scene.traverse(m => { if (!m.isMesh) return; const before = m.onBeforeRender; originals.push([m, before]);
                m.onBeforeRender = function(rr, sc, c, g, mat) { if (m.name.includes('hd') || m.renderOrder) draws.push({ name: m.name, order: m.renderOrder, transparent: mat.transparent, depth: mat.depthTest, pass: mat.uniforms?.hdPass?.value }); before?.call(this, rr, sc, c, g, mat); };
            });
            d.renderer.render(); originals.forEach(([m, fn]) => m.onBeforeRender = fn);
            const row = { name: u.name, state, onBridge: u.onBridge, visible: r.get3DObject().visible,
                hd: u.name === 'E2' ? !!b.hdOverride : hd.active, opacity: b?.opacity ?? (hd.originalMeshes[0].getOpacity?.() ?? hd.originals[0].opacity),
                order: mesh?.renderOrder ?? hd.originalMeshes[0].renderOrder,
                batched: hd?.originalMeshes.some(m => m.isBatchedMesh), shadowRestored: hd?.originalMeshes.every((m, i) => m.customDepthMaterial === hd.shadow.originals[i]),
                sectionsOriginal: hd?.originalMeshes.every((m, i) => m.material === hd.originals[i]),
                shadowOpacity: hd?.shadow.opacity.value, draws, gl: d.renderer.renderer.getContext().getError(), png: d.renderer.renderer.domElement.toDataURL() };
            u.cloakableTrait = oldCloak; u.warpedOutTrait.debugSetActive(false); s.render();
            return row;
        }, { index, state });
        const filename = `${row.name}-${state}.png`; await fs.writeFile(path.join(output, filename), Buffer.from(row.png.split(',')[1], 'base64')); delete row.png;
        row.file = filename; result.states.push(row);
        assert.equal(row.gl, 0); assert(row.visible);
        if (state === 'friendly-cloak' || state === 'warp') {
            assert.equal(row.opacity, .5);
            if (row.batched) { assert.equal(row.hd, false); assert(row.sectionsOriginal && row.shadowRestored); }
            else { assert(row.hd); if (index === 1) assert.equal(row.shadowOpacity, .5); }
        } else assert(row.hd);
        if (state === 'bridge-on') assert.equal(row.order, 2);
        if (state === 'bridge-under') assert.equal(row.order, 0);
    }
    result.enemy = await page.evaluate(() => {
        const d = window.__ra2debug, s = window.__m15States;
        return ['E2', 'HTNK'].map(name => {
            const enemy = d.game.getCombatants().filter(p => p !== d.localPlayer).flatMap(p => p.getOwnedObjects()).find(u => u.name === name);
            const r = d.renderableManager.getRenderableByGameObject(enemy), saved = enemy.cloakableTrait;
            try { enemy.cloakableTrait = { isCloaked: () => true }; r.update(s.time, 0); return { name, hidden: !r.get3DObject().visible }; }
            finally { enemy.cloakableTrait = saved; r.update(s.time, 0); }
        });
    });
    assert(result.enemy.every(r => r.hidden));
    result.removal = await page.evaluate(async () => {
        const d = window.__ra2debug, s = window.__m15States, rhino = d.renderableManager.getRenderableByGameObject(s.units[1]).rhinoHd;
        const meshes = rhino.originalMeshes, shadow = rhino.shadow;
        // Explicit disposal fixture; natural match removal is checked separately.
        for (const u of s.units) { d.game.unspawnObject(u); u.dispose(); }
        await Promise.resolve(); s.render();
        return { disposed: rhino.disposed, shadowRestored: meshes.every((m, i) => m.customDepthMaterial === shadow.originals[i]),
            gl: d.renderer.renderer.getContext().getError() };
    });
    assert(result.removal.disposed && result.removal.shadowRestored); assert.equal(result.removal.gl, 0);
    assert.deepEqual(result.errors, []); result.status = 'PASS';
} catch (error) { process.exitCode = 1; result.error = error.stack; console.error(error); }
finally { await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2)); await app.close(); console.log('OUTPUT', output); }
