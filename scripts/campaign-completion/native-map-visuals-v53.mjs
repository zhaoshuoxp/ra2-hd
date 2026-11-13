import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld, worldState } from '../m3-2/native-session.mjs';

const out = path.resolve(process.argv[2]), mission = process.argv[3], density = Number(process.argv[4] ?? 4);
assert(/^(all|sov|trn)\d\d[tsu]\.map$/.test(mission)); await fs.mkdir(out, { recursive: false });
const report = { status: 'RUNNING', mission, density, errors: [], failedResources: [], poses: [],
    scope: 'Actual unchanged mission placements, paused at the original initial world. Camera/reveal are renderer inspection assistance; no actors, source tiles, rules, health or objectives are edited. This is visual evidence, not a mission victory.' };
let app, page;
try {
    ({ app, page } = await campaignSession(out, report, { density }));
    await page.evaluate(mission => window.__ra2debug.mainMenuController.screens.get(22).launchPrepared(mission), mission);
    await waitWorld(page, mission);
    const setup = await page.evaluate(mission => {
        const d = window.__ra2debug, g = d.game, theater = d.theater ?? d.gameScreen.theater ?? d.renderableManager.theater;
        g.campaign.inspectionModified = true; g.mapShroudTrait.revealMap(g.localPlayer, g);
        const slopes = g.map.tiles.getAll().filter(t => t.rampType && theater.tileSets.getTile(t.tileNum)?.files?.[0])
            .map(t => ({ tile: [t.rx, t.ry], z: t.z, subTile: t.subTile, ramp: t.rampType,
                member: theater.tileSets.getTile(t.tileNum).files[0].filename }));
        const remaining = new Set(slopes.filter(t => t.subTile === 0 && /^(pr|dr)slpe/.test(t.member))), candidates = [];
        while (remaining.size) {
            const first = remaining.values().next().value, group = [first]; remaining.delete(first);
            for (let i = 0; i < group.length; i++) for (const tile of remaining) {
                if (tile.member === first.member && Math.abs(tile.tile[0] - group[i].tile[0]) + Math.abs(tile.tile[1] - group[i].tile[1]) <= 1) {
                    group.push(tile); remaining.delete(tile);
                }
            }
            candidates.push(group[Math.floor(group.length / 2)]);
        }
        const poses = mission !== 'all06u.map' ? candidates.map(t => ({ label: `${t.member}-${t.tile.join('-')}`, tile: t.tile }))
            : [{ label: 'northern-parallel-crossings', tile: [133, 96] }, { label: 'southern-parallel-crossings', tile: [133, 143] }];
        const sideRoadNeighbors = g.map.tiles.getAll().filter(t => t.rx >= 53 && t.rx <= 60 && t.ry >= 123 && t.ry <= 128)
            .map(t => ({ tile: [t.rx, t.ry], z: t.z, subTile: t.subTile, ramp: t.rampType,
                member: theater.tileSets.getTile(t.tileNum)?.files[0].filename }));
        return { slopes, poses, sideRoadNeighbors, hd: theater.terrainHd?.report,
            bridges: g.world.getAllObjects().filter(u => u.isOverlay() && u.isHighBridge()).map(u => ({ tile: [u.tile.rx, u.tile.ry],
                name: u.name, value: u.value, display: u.bridgeDisplayValue, health: u.healthTrait.health })) };
    }, mission);
    report.setup = setup; assert(setup.poses.length > 0 && setup.poses.length <= 16);
    if (density) {
        assert.equal(setup.hd?.density, density);
        assert(setup.hd.groups.length && setup.hd.groups.every(group => group.status === 'PUBLISHED'), 'Terrain HD group fell back');
    }
    const before = await worldState(page);
    for (const pose of setup.poses) {
        await page.evaluate(tile => {
            const d = window.__ra2debug; d.worldInteraction.minimapHandler.panToTile(d.game.map.tiles.getByMapCoords(...tile));
        }, pose.tile);
        await page.waitForTimeout(350);
        const file = pose.label.replace(/[^a-z0-9-]/gi, '-') + '.png';
        await page.screenshot({ path: path.join(out, file) }); report.poses.push({ ...pose, file });
    }
    const after = await worldState(page);
    assert.equal(after.tick, before.tick); assert.equal(after.hash, before.hash); assert.deepEqual(after.rng, before.rng);
    report.frozen = { tick: after.tick, hash: after.hash, rngExact: true };
    if (mission === 'all06u.map') {
        const repaired = setup.bridges.filter(b => b.name === 'BRIDGE2' && [16, 17].includes(b.value));
        assert(repaired.length > 0); assert(repaired.every(b => b.display === 9), JSON.stringify(repaired));
        const broken = setup.bridges.filter(b => b.name === 'BRIDGE1' && [7, 8].includes(b.value));
        assert(broken.length > 0 && broken.every(b => b.display === b.value));
    }
    assert.deepEqual(report.errors, []); assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_NATIVE_SOURCE_PLACEMENTS_AND_FROZEN_WORLD';
} catch (error) { report.status = 'FAIL'; report.error = error.stack; process.exitCode = 1;
    await page?.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
} finally { await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n'); await app?.close(); }
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
