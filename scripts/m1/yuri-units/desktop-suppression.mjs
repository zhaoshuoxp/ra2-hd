import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { startSession } from './desktop-session.mjs';

const session = await startSession(process.argv[2], process.argv[3], 'yr');
const { page, report, stage, startClip, stopClip, close } = session;
const inventory = JSON.parse(await fs.readFile('.artifacts/yuri-units/source-v2/inventory.json'));
report.suppression = {};
let failure;
try {
    await page.evaluate(() => {
        const f = window.__allied, sample = f.sample;
        f.sample = u => ({ ...sample(u), suppressed: !!u.suppressionTrait?.isSuppressed() });
    });
    for (const name of ['INIT', 'VIRUS']) {
        const family = inventory.families.find(f => f.id === name);
        const crawl = family.sequences.Crawl.split(',').map(Number), prone = family.sequences.FireProne.split(',').map(Number);
        await page.evaluate(name => {
            const d = window.__ra2debug, f = window.__allied;
            f.actor = f.spawn(name, 3, { rx: f.center.rx - 8, ry: f.center.ry - 8 });
            f.actor.attackTrait.setDisabled(true); d.worldInteraction.minimapHandler.panToTile(f.actor.tile);
        }, name);
        await page.waitForFunction(() => window.__allied.sample(window.__allied.actor).shpHd);
        await startClip();
        await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied;
            f.gunner = f.spawn('E2', 3, { rx: f.actor.tile.rx + 2, ry: f.actor.tile.ry }, f.enemy);
            f.gunner.moveTrait.setDisabled(true); d.actionsApi.orderUnits([f.gunner.id], 2, f.actor.id);
        });
        await page.waitForFunction(() => window.__allied.actor.healthTrait.health < 100 && window.__allied.actor.suppressionTrait.isSuppressed());
        await stage(name + '-native-suppression');
        await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied, u = f.actor, g = d.game;
            const tile = g.map.tiles.getAll().filter(t => g.map.isWithinBounds(t) && !t.rampType
                && g.map.getTileZone(t) === 0 && g.map.terrain.getPassableSpeed(t, u.rules.speedType, true, false) > 0
                && Math.hypot(t.rx - f.gunner.tile.rx, t.ry - f.gunner.tile.ry) < 4
                && !g.map.getGroundObjectsOnTile(t).some(o => o.isTechno() || o.isTerrain()))
                .sort((a, b) => Math.abs(Math.hypot(a.rx - u.tile.rx, a.ry - u.tile.ry) - 2)
                    - Math.abs(Math.hypot(b.rx - u.tile.rx, b.ry - u.tile.ry) - 2))[0];
            d.actionsApi.orderUnits([u.id], 0, tile.rx, tile.ry);
        });
        await page.waitForFunction(() => {
            const f = window.__allied; return f.traces.flat().some(s => s.id === f.actor.id && s.moving && s.suppressed && s.shpHd);
        });
        await stage(name + '-native-crawl');
        await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied;
            f.actor.attackTrait.setDisabled(false); d.actionsApi.orderUnits([f.actor.id], 2, f.gunner.id);
        });
        await page.waitForFunction(() => window.__allied.gunner.isDestroyed || window.__allied.gunner.healthTrait.health < 100);
        await page.waitForTimeout(500); await stage(name + '-native-prone-attack');
        const trace = await page.evaluate(() => window.__allied.traces.flat().filter(s => s.id === window.__allied.actor.id));
        assert(trace.some(s => s.shpHd && s.moving && s.suppressed && s.frame >= crawl[0] && s.frame < crawl[0] + crawl[2] * 8));
        report.suppression[name] = { nativeDamage: true, nativeCrawl: true,
            nativeProneFire: trace.some(s => s.shpHd && s.frame >= prone[0] && s.frame < prone[0] + prone[2] * 8), trace,
            clip: await stopClip(name + '-native-suppression-crawl') };
        await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied;
            for (const u of [f.actor, f.gunner]) if (u.isSpawned) d.game.unspawnObject(u);
        });
    }
} catch (error) { failure = error; }
await close(failure);
if (failure) throw failure;
