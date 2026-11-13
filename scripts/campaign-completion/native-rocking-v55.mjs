import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld, stepWorld } from '../m3-2/native-session.mjs';
import { startSession } from '../m1/allied-units/desktop-session.mjs';

const out = path.resolve(process.argv[2]), mode = process.argv[3] ?? 'original', density = Number(process.argv[4] ?? 2);
await fs.mkdir(path.dirname(out), { recursive: true });
const report = { status: 'RUNNING', mode, density, errors: [], failedResources: [], samples: [],
    scope: mode === 'original' ? 'Unchanged original Allied11 opening, natural source SQD/CRUISE encounter and real-time rendering. Camera only; no rules, actors, health, timing, RNG or objectives are edited.'
        : 'Explicit isolated skirmish compatibility scene on original terrain/rules. Legal water placements provide SQD and unmodified CRUISE/DEST/AEGIS hulls; background bots are disabled by the existing fixture helper. Ordinary attack orders trigger actual parasite damage and renderer rocking. Not a natural-match or original mission claim.' };
let app, page;
try {
    if (mode === 'original') {
        await fs.mkdir(out, { recursive: false });
        ({ app, page } = await campaignSession(out, report, { density }));
        await page.evaluate(() => window.__ra2debug.mainMenuController.screens.get(22).launchPrepared('all11t.map'));
        await waitWorld(page, 'all11t.map'); await stepWorld(page, 900);
        await page.evaluate(() => {
            const d = window.__ra2debug, g = d.game;
            window.__rockingTargets = g.world.getAllObjects().filter(u => u.name === 'CRUISE');
            const target = window.__rockingTargets[0];
            d.worldInteraction.minimapHandler.panToTile(target.tile);
        });
    } else {
        const receipt = out + '-runtime.json';
        await fs.writeFile(receipt, JSON.stringify({ build: path.resolve('desktop/main.mjs'), resources: path.resolve('.local') }));
        ({ app, page } = await startSession(receipt, out, 'ra2', false,
            async ({ page }) => page.evaluate(density => {
                const g = window.__ra2debug.generalOptions.graphics;
                g.hdEnabled.value = density > 0; if (density) g.hdDensity.value = density;
            }, density)));
        page.on('pageerror', error => report.errors.push(error.stack));
        page.on('response', response => { if (response.status() >= 400) report.failedResources.push([response.url(), response.status()]); });
        report.fixture = await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied, g = d.game;
            d.gameScreen.gameTurnMgr.setPaused(true);
            const pairs = ['CRUISE', 'DEST', 'AEGIS'].map((name, i) => {
                const ship = f.spawn(name, 7, { rx: f.center.rx + i * 12, ry: f.center.ry + i * 12 }, f.enemy);
                const squid = f.spawn('SQD', 7, ship.tile, f.player);
                return { ship, squid };
            });
            const banner = document.createElement('div'); banner.textContent = 'SPECIALIZED NAVAL COMPATIBILITY SCENE — NOT AN ORIGINAL MISSION';
            Object.assign(banner.style, { position: 'fixed', top: '0', left: '0', zIndex: '100000', background: '#092a3b',
                color: '#fff', padding: '8px', font: 'bold 18px sans-serif' }); document.body.append(banner);
            window.__rockingTargets = pairs.map(p => p.ship);
            for (const pair of pairs) d.actionsApi.orderUnits([pair.squid.id], 2, pair.ship.id);
            d.worldInteraction.minimapHandler.panToTile(pairs[0].ship.tile);
            return pairs.map(p => ({ ship: { id: p.ship.id, name: p.ship.name, tile: [p.ship.tile.rx, p.ship.tile.ry] }, squid: p.squid.id }));
        });
    }
    await page.evaluate(() => {
        const d = window.__ra2debug; d.game.desiredSpeed.value = 2;
        d.gameScreen.gameTurnMgr.setPaused(false);
        if (d.game.campaign) d.gameScreen.gameTurnMgr.setCampaignPaused(false);
        d.gameScreen.gameAnimationLoop.start();
    });
    const captured = new Set();
    for (let i = 0; i < 180; i++) {
        await page.waitForTimeout(100);
        const sample = await page.evaluate(() => {
            const d = window.__ra2debug, g = d.game;
            return { tick: g.currentTick, paused: d.gameScreen.gameTurnMgr.isSimulationPaused(),
                ships: window.__rockingTargets.filter(u => u.isSpawned && !u.isDestroyed).map(u => {
                    const r = d.renderableManager.getRenderableByGameObject(u), b = r?.bodyVxlBuilder?.getLocalBoundingBox();
                    return { id: u.id, name: u.name, hp: u.healthTrait.getHitPoints(), tile: [u.tile.rx, u.tile.ry],
                        parasite: u.parasiteableTrait?.getParasite()?.name, grab: !!r?.squidGrabAnim,
                        frame: r?.squidGrabAnim?.animation?.getCurrentFrame(), rocking: !!u.rocking,
                        nativeFootprint: b && [b.min.x, b.min.y, b.max.x, b.max.y],
                        pivot: r?.rockingPoint?.toArray(), axis: r?.rockingAxis?.toArray(),
                        offset: r?.rockingTiltObj?.position.toArray(), angle: r?.rockingTiltObj?.quaternion.angleTo(r.mainObj.quaternion),
                        hd: !!r?.unitVxlHd?.active };
                }) };
        });
        report.samples.push(sample);
        for (const ship of sample.ships.filter(s => s.parasite && s.nativeFootprint && s.pivot && s.angle > .3)) {
            const [minX, minZ, maxX, maxZ] = ship.nativeFootprint;
            assert(ship.pivot[0] >= minX - 1e-6 && ship.pivot[0] <= maxX + 1e-6);
            assert(ship.pivot[2] >= minZ - 1e-6 && ship.pivot[2] <= maxZ + 1e-6);
            assert(Math.hypot(...ship.offset) < Math.hypot(maxX - minX, maxZ - minZ));
            if (!captured.has(ship.name)) {
                await page.evaluate(tile => { const d = window.__ra2debug;
                    d.worldInteraction.minimapHandler.panToTile(d.game.map.tiles.getByMapCoords(...tile)); }, ship.tile);
                await page.screenshot({ path: path.join(out, `actual-${ship.name}-bounded-rocking.png`) });
                captured.add(ship.name);
            }
        }
        if (mode !== 'original' && captured.size === 3) break;
    }
    assert(captured.has('CRUISE'), 'Actual source cruiser rocking was not observed');
    if (mode !== 'original') {
        for (const name of ['DEST', 'AEGIS']) assert(captured.has(name), `${name} parasite rocking not observed`);
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = mode === 'original' ? 'PASS_ORIGINAL_SQUID_SHIP_ROCKING_STAYS_AT_HULL_EDGE'
        : 'PASS_SHARED_SKIRMISH_CIVILIAN_DESTROYER_AEGIS_ACTUAL_PARASITE_ROCKING';
} catch (error) {
    report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    await page?.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await app?.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
