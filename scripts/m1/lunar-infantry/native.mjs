import assert from 'node:assert/strict';
import { startSession } from '../allied-units/desktop-session.mjs';

const [receipt, output] = process.argv.slice(2);
const expectHd = process.argv.includes('--expect-hd');
const density = process.argv.includes('--density=2') ? 2 : 4;
const session = await startSession(receipt, output, 'yr', false, async ({ page }) => {
    await page.evaluate(({ density, expectHd }) => {
        const graphics = window.__ra2debug.generalOptions.graphics;
        graphics.hdEnabled.value = expectHd;
        graphics.hdDensity.value = density;
    }, { density, expectHd });
});
const { page, report, stage, startClip, stopClip, close } = session;
report.identity = 'LUNR'; report.expectedHd = expectHd;
report.disclosure = 'Campaign-only LUNR inserted into a controlled YR match fixture. Native orders, rules, animation and camera are retained. This does not establish ordinary skirmish buildability or campaign support.';
let failure;
try {
    await page.evaluate(() => {
        const d = window.__ra2debug, f = window.__allied;
        f.player.color = d.game.rules.colors.get('DarkBlue');
        f.enemy.color = d.game.rules.colors.get('DarkGreen');
        f.actor = f.spawn('LUNR', 3, { rx: f.center.rx + 7, ry: f.center.ry + 5 });
        f.other = f.spawn('LUNR', 3, { rx: f.center.rx + 9, ry: f.center.ry + 6 }, f.enemy);
        f.other.attackTrait.setDisabled(true);
        d.worldInteraction.minimapHandler.panToTile(f.actor.tile);
    });
    await page.waitForFunction(() => window.__allied.sample(window.__allied.actor).frame !== undefined);
    if (expectHd) await page.waitForFunction(() => window.__allied.sample(window.__allied.actor).shpHd, undefined, { timeout: 60000 });
    await stage('LUNR-native-ready');
    report.capture = await startClip();
    await page.evaluate(() => {
        const d = window.__ra2debug, f = window.__allied;
        f.startTile = [f.actor.tile.rx, f.actor.tile.ry];
        d.actionsApi.orderUnits([f.actor.id], 0, f.actor.tile.rx + 5, f.actor.tile.ry + 3);
    });
    await page.waitForFunction(() => {
        const f = window.__allied;
        return f.actor.zone === 1 && Math.hypot(f.actor.tile.rx - f.startTile[0], f.actor.tile.ry - f.startTile[1]) >= 3;
    }, undefined, { timeout: 60000 });
    await page.evaluate(() => window.__ra2debug.worldInteraction.minimapHandler.panToTile(window.__allied.actor.tile));
    await stage('LUNR-native-flight');
    await page.evaluate(() => {
        const d = window.__ra2debug, f = window.__allied;
        f.target = f.spawn('HTNK', 7, { rx: f.actor.tile.rx + 3, ry: f.actor.tile.ry }, f.enemy);
        f.target.attackTrait.setDisabled(true); f.target.moveTrait.setDisabled(true);
        f.targetHealth = f.target.healthTrait.health;
        d.actionsApi.orderUnits([f.actor.id], 2, f.target.id);
    });
    await page.waitForFunction(() => window.__allied.target.healthTrait.health < window.__allied.targetHealth,
        undefined, { timeout: 60000 });
    await stage('LUNR-native-laser');
    report.clip = await stopClip('LUNR-native-flight-and-laser');
    report.actions = { flight: true, laserDamage: true };
    report.finalSample = await page.evaluate(() => window.__allied.sample(window.__allied.actor));
    assert.equal(report.finalSample.shpHd, expectHd);
    report.nativeEligibility = await page.evaluate(() => {
        const d = window.__ra2debug, rule = d.game.rules.getObject('LUNR', 3);
        return { techLevel: rule.techLevel, available: d.localPlayer.production.isAvailableForProduction(rule) };
    });
    assert.equal(report.nativeEligibility.techLevel, 11);
    assert.equal(report.nativeEligibility.available, false);
    report.ownerChanges = [];
    for (const enemy of [false, true, false]) {
        const owner = await page.evaluate(enemy => {
            const d = window.__ra2debug, f = window.__allied;
            f.actor.attackTrait.setDisabled(true);
            d.game.changeObjectOwner(f.actor, enemy ? f.enemy : f.player);
            return f.actor.owner.color;
        }, enemy);
        await page.waitForTimeout(160);
        const binding = await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied;
            const b = d.renderableManager.getRenderableByGameObject(f.actor).shpRenderable.builder;
            return { hd: !!b.hdOverride, density: b.hdOverride?.density, paletteHash: b.palette.hash,
                ownerRamp: Array.from(b.palette.colors.slice(16, 32)) };
        });
        assert.equal(binding.hd, expectHd);
        report.ownerChanges.push({ owner, ...binding });
        await stage('LUNR-owner-' + report.ownerChanges.length);
    }
    assert.notEqual(report.ownerChanges[0].paletteHash, report.ownerChanges[1].paletteHash);
    assert.equal(report.ownerChanges[0].paletteHash, report.ownerChanges[2].paletteHash);
    if (expectHd) {
        report.frameSweep = await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied;
            d.gameScreen.gameAnimationLoop.stop();
            const r = d.renderableManager.getRenderableByGameObject(f.actor).shpRenderable;
            const frames = [];
            for (let i = 0; i < 435; i++) {
                r.setFrame(i); d.worldScene.meshBatchManager.updateMeshes(); d.renderer.render();
                frames.push({ frame: r.builder.getFrame(), hd: !!r.builder.hdOverride,
                    gl: d.renderer.renderer.getContext().getError() });
            }
            d.gameScreen.gameAnimationLoop.start();
            return frames;
        });
        assert(report.frameSweep.every((row, i) => row.frame === i && row.hd && !row.gl));
    }
    await startClip();
    await page.evaluate(() => {
        const d = window.__ra2debug, f = window.__allied;
        f.deathRenderable = d.renderableManager.getRenderableByGameObject(f.actor);
        f.deathFrames = [];
        f.deathTimer = setInterval(() => f.deathFrames.push({
            frame: f.deathRenderable.shpRenderable?.builder?.getFrame(),
            hd: !!f.deathRenderable.shpRenderable?.builder?.hdOverride }), 30);
        d.game.destroyObject(f.actor, { player: f.enemy });
    });
    await page.waitForTimeout(140); await stage('LUNR-native-air-death');
    await page.waitForTimeout(2600); await stopClip('LUNR-native-air-death');
    report.death = await page.evaluate(() => {
        const f = window.__allied; clearInterval(f.deathTimer);
        return { destroyed: f.actor.isDestroyed, frames: f.deathFrames };
    });
    assert(report.death.destroyed);
    assert(new Set(report.death.frames.filter(row => row.hd === expectHd).map(row => row.frame)).size > 1);
    report.cameos = [];
    for (const cameo of ['lunricon', 'lunruico']) {
        await page.evaluate(cameo => {
            const d = window.__ra2debug, model = d.gameScreen.hud.sidebarCard.props.sidebarModel;
            // A disabled display fixture exercises the real widget for a campaign-only unit.
            model.tabs[2].items = [{ target: { type: 0, rules: d.game.rules.getObject('LUNR', 3) },
                cameo, disabled: true, progress: 0, quantity: 0, status: 0 }];
            model.tabs[2].disabled = false; model.tabs[2].needsUpdate = true; model.activeTabId = 2;
        }, cameo);
        await page.waitForFunction(({ cameo, expectHd }) => {
            const card = window.__ra2debug.gameScreen.hud.sidebarCard, b = card.slotObjects[0].builder;
            return card.publishedItems?.[0]?.cameo === cameo && b.isHdActive === expectHd;
        }, { cameo, expectHd });
        const binding = await page.evaluate(() => {
            const d = window.__ra2debug, b = d.gameScreen.hud.sidebarCard.slotObjects[0].builder;
            return { hd: b.isHdActive, entryId: b.frames?.[b.native.getFrame()]?.id,
                texture: b.asset && [b.asset.bitmap.width, b.asset.bitmap.height],
                rank: !!b.asset?.overlayTexture, metrics: d.uiArt.metrics(),
                gl: d.renderer.renderer.getContext().getError() };
        });
        assert.equal(binding.gl, 0);
        if (expectHd) {
            assert.equal(binding.entryId, cameo + '.shp');
            assert.deepEqual(binding.texture, [240, 192]);
            assert.equal(binding.rank, cameo === 'lunruico');
        }
        assert(binding.metrics.reservedBytes <= 16 * 1024 * 1024);
        report.cameos.push({ cameo, ...binding });
        await stage('LUNR-' + cameo);
    }
    if (expectHd) {
        const allocation = await page.evaluate(() => window.__ra2debug.sovietUnitsHd.families.LUNR);
        assert.equal(allocation.density, density);
        report.lunarAllocation = allocation;
    }
    if (process.argv.includes('--toggle')) {
        report.toggle = [];
        for (const enabled of [false, true]) {
            await page.evaluate(enabled => {
                const d = window.__ra2debug;
                clearInterval(window.__allied.timer);
                window.__lunarOldGame = d.game;
                window.__lunarOldDemand = d.sovietUnitsHd;
                d.generalOptions.graphics.hdEnabled.value = enabled;
            }, enabled);
            await page.evaluate(async () => { await window.r.reset; });
            await page.waitForFunction(() => window.__ra2debug?.game?.status === 1
                && window.__ra2debug.game !== window.__lunarOldGame, undefined, { timeout: 90000 });
            assert.equal(await page.evaluate(() => window.__lunarOldDemand.gpuBytes), 0);
            await page.evaluate(() => {
                window.__installAlliedFixtures();
                const d = window.__ra2debug, f = window.__allied;
                f.actor = f.spawn('LUNR', 3);
                f.actor.attackTrait.setDisabled(true);
                d.worldInteraction.minimapHandler.panToTile(f.actor.tile);
            });
            await page.waitForFunction(enabled => {
                const f = window.__allied, s = f.sample(f.actor);
                return s.frame !== undefined && s.shpHd === enabled;
            }, enabled);
            report.toggle.push({ enabled, sample: await page.evaluate(() => window.__allied.sample(window.__allied.actor)) });
            await stage('LUNR-HD-' + (enabled ? 'on' : 'off'));
        }
    }
    assert.deepEqual(report.errors, []);
} catch (error) { failure = error; }
await close(failure);
if (failure) throw failure;
