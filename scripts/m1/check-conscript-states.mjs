// Controlled render-state probes in an actual match, not natural scenario acceptance.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const origin = process.env.M11_STATE_ORIGIN ?? 'http://127.0.0.1:4187';
const original = process.env.M11_STATE_ORIGINAL === '1';
const output = process.env.M11_STATE_OUTPUT ?? `.artifacts/m1-1/state-audit-2026-09-18/check-${Date.now()}`;
await fs.mkdir(output, { recursive: true });
const result = { status: 'FAIL', original, scope: 'Injected render states; no natural bridge, cloak or chrono scenario acceptance',
    errors: [], consoleErrors: [], external: [] };
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true, args: ['--disable-background-networking', '--disable-component-update', '--no-first-run'] });
try {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2, serviceWorkers: 'block' });
    await context.route('**/*', route => {
        const url = route.request().url();
        if (!url.startsWith(origin + '/') && !/^(blob|data):/.test(url)) {
            result.external.push(url); return route.abort();
        }
        return route.continue();
    });
    await context.addInitScript(() => {
        const prefs = { _r_lastMap: 'MP01T4.map', _r_lastMode: '1', _r_lastCountry: '5', _r_lastColor: '0',
            _r_lastStartPos: '0', _r_lastTeam: '0', _r_hostOpts: '3;10000;10;1;1;0;1;0;;0;1;0;0',
            _r_lastBots: JSON.stringify([null, ...[1, 2, 3].map(i => ({ d: 4, c: 5, co: i, s: i, t: 1 })), null, null, null, null]) };
        for (const [key, value] of Object.entries(prefs)) localStorage.setItem(key, value);
    });
    const page = await context.newPage();
    page.on('pageerror', e => result.errors.push(e.stack));
    page.on('console', m => { if (m.type() === 'error') result.consoleErrors.push(m.text()); });
    await page.goto(`${origin}/${original ? '' : '?conscript-hd=4'}`);
    await page.getByText('Offline Skirmish', { exact: true }).click({ timeout: 45000 });
    await page.waitForFunction(() => window.__ra2debug?.skirmishLobby);
    await page.evaluate(() => {
        const d = window.__ra2debug;
        d.generalOptions.graphics.renderResolution.value = '4k';
        d.skirmishLobby.startGame(1700000000000);
    });
    await page.waitForFunction(() => window.__ra2debug?.game?.status === 1, undefined, { timeout: 60000 });
    await page.waitForTimeout(2000);
    result.probe = await page.evaluate(original => {
        const d = window.__ra2debug;
        d.gameScreen.gameAnimationLoop.stop();
        const u = d.localPlayer.getOwnedObjects().find(o => o.name === 'E2');
        const r = d.renderableManager.getRenderableByGameObject(u), shp = r.shpRenderable;
        const b = shp.builder, mesh = shp.getShapeMesh(), hd = b.hdOverride;
        if (!!hd === original) throw Error('Unexpected Conscript resource selection');
        const saved = { bridge: u.onBridge, zone: u.zone, stance: u.stance, elevation: u.position.tileElevation,
            cloak: u.cloakableTrait, frame: b.getFrame(), warped: u.warpedOutTrait.isActive() };
        const rows = [], geometry = Array.from(mesh.geometry.attributes.position.array);
        const shadowMap = shp.getShadowMesh().material.map;
        const draw = name => {
            r.update(1000);
            d.worldScene.meshBatchManager.updateMeshes();
            d.worldScene.meshBatchManager.processRenderQueue();
            d.worldScene.scene.updateMatrixWorld(true); d.renderer.render();
            const frame = b.getFrame(), p = hd?.pages[hd.frames[frame + b.frameOffset].page];
            const row = { name, frame, hd: !!b.hdOverride,
                pageMatches: p ? mesh.material.map === p.base && mesh.material.uniforms.remapMap.value === p.data
                    : mesh.material.type !== 'HdSpriteMaterial',
                opacity: b.opacity, visible: r.get3DObject().visible, renderOrder: mesh.renderOrder,
                position: r.getPosition().toArray(), originalShadow: shp.getShadowMesh().material.map === shadowMap,
                glError: d.renderer.renderer.getContext().getError() };
            rows.push(row); return row;
        };
        try {
            draw('baseline');
            u.onBridge = true; u.position.tileElevation = 4;
            draw('bridge-flag-and-height');
            u.onBridge = false; u.zone = 1;
            draw('air-order-and-height');
            u.zone = saved.zone; u.position.tileElevation = saved.elevation;
            draw('ground-restored');
            u.cloakableTrait = { isCloaked: () => true };
            draw('allied-cloak-injected');
            u.cloakableTrait = saved.cloak;
            draw('uncloaked-restored');
            u.warpedOutTrait.debugSetActive(true);
            draw('warped-out-debug-state');
            u.warpedOutTrait.debugSetActive(false);
            draw('warp-restored');
            u.stance = 4;
            draw('paradrop-stance-injected');
            u.stance = saved.stance;
            draw('stance-restored');
            // Both native death sequences retain the complete authored resource.
            const deathFrames = [];
            for (let frame = 134; frame <= 163; frame++) {
                shp.setFrame(frame);
                d.worldScene.meshBatchManager.updateMeshes();
                d.worldScene.meshBatchManager.processRenderQueue(); d.renderer.render();
                const p = hd?.pages[hd.frames[frame].page];
                if (p && (mesh.material.map !== p.base || mesh.material.uniforms.remapMap.value !== p.data))
                    throw Error('Death frame lost HD page binding');
                if (d.renderer.renderer.getContext().getError()) throw Error('Death frame GL error');
                deathFrames.push(frame);
            }
            shp.setFrame(saved.frame);
            const geometryRestored = JSON.stringify(geometry) === JSON.stringify(Array.from(mesh.geometry.attributes.position.array));
            const enemy = d.game.getCombatants().filter(p => p !== d.localPlayer)
                .flatMap(p => p.getOwnedObjects()).find(o => o.name === 'E2');
            if (!enemy) throw Error('No enemy Conscript for visibility probe');
            const enemyRenderable = d.renderableManager.getRenderableByGameObject(enemy);
            const enemyCloak = enemy.cloakableTrait;
            let enemyHidden, enemyVisibilityContext;
            try {
                enemy.cloakableTrait = { isCloaked: () => true };
                enemyRenderable.update(1000);
                enemyHidden = !enemyRenderable.get3DObject().visible;
                enemyVisibilityContext = { local: d.localPlayer.name, owner: enemy.owner.name,
                    sharedIntel: d.game.alliances.haveSharedIntel(d.localPlayer, enemy.owner),
                    plugins: enemyRenderable.plugins.filter(p => 'lastCanSeeThroughCloak' in p).map(p => ({
                        passedPlayerName: p.localPlayer.name, playerValueMissing: !p.localPlayer.value,
                        sharedIntel: p.lastCanSeeThroughCloak, cloaked: p.lastCloaked })) };
            } finally { enemy.cloakableTrait = enemyCloak; enemyRenderable.update(1000); }
            return { rows, deathFrames, geometryRestored, identity: hd?.identity, enemyHidden, enemyVisibilityContext,
                rules: { organic: u.rules.organic, teleporter: u.rules.teleporter },
                canvas: [d.renderer.renderer.domElement.width, d.renderer.renderer.domElement.height],
                cloakTraitOriginallyPresent: !!saved.cloak,
                sequences: [...u.art.sequences.values()].map(s => ({ type: s.type, startFrame: s.startFrame, frameCount: s.frameCount })) };
        } finally {
            u.onBridge = saved.bridge; u.zone = saved.zone; u.stance = saved.stance;
            u.position.tileElevation = saved.elevation; u.cloakableTrait = saved.cloak;
            u.warpedOutTrait.debugSetActive(saved.warped); shp.setFrame(saved.frame);
            r.update(1000); d.gameScreen.gameAnimationLoop.start();
        }
    }, original);
    assert.deepEqual(result.probe.canvas, [3840, 2160]);
    for (const row of result.probe.rows) {
        assert.equal(row.hd, !original, row.name);
        assert(row.pageMatches && row.originalShadow, row.name);
        assert.equal(row.glError, 0, row.name);
    }
    const byName = Object.fromEntries(result.probe.rows.map(r => [r.name, r]));
    assert.equal(byName['bridge-flag-and-height'].renderOrder, 2);
    assert.equal(byName['air-order-and-height'].renderOrder, 2);
    assert.equal(byName['ground-restored'].renderOrder, 0);
    assert(byName['bridge-flag-and-height'].position[1] > byName.baseline.position[1]);
    assert.deepEqual(byName['ground-restored'].position, byName.baseline.position);
    assert.equal(byName['allied-cloak-injected'].opacity, 0.5);
    assert.equal(byName['allied-cloak-injected'].visible, true);
    assert.equal(byName['warped-out-debug-state'].opacity, 0.5);
    assert.equal(byName['warp-restored'].opacity, 1);
    assert.equal(byName['uncloaked-restored'].opacity, 1);
    assert.equal(result.probe.deathFrames.length, 30);
    assert(result.probe.geometryRestored);
    result.renderStates = 'PASS_CONTROLLED_RENDER_STATES';
    result.enemyCloak = result.probe.enemyHidden ? 'PASS' : 'FAIL_ENEMY_REMAINS_VISIBLE';
    assert(result.probe.enemyHidden, 'Enemy cloak must hide the entire renderable');
    assert.deepEqual(result.errors, []); assert.deepEqual(result.consoleErrors, []); assert.deepEqual(result.external, []);
    result.status = 'PASS_CONTROLLED_RENDER_STATES';
} catch (e) { result.failure = e.stack; process.exitCode = 1; }
finally {
    await fs.writeFile(`${output}/result.json`, JSON.stringify(result, null, 2) + '\n');
    await browser.close();
}
console.log(JSON.stringify({ status: result.status, cases: result.probe?.rows.length, failure: result.failure }));
