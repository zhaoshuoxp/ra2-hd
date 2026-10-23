// Observe actual native resource depletion and creation without setting resource values or frames.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function validateNativeResources({ page, report, out }) {
    const theater = report.theater ?? 'SNOW';
    assert(['TEMPERATE', 'SNOW', 'URBAN', 'NEWURBAN', 'DESERT'].includes(theater));
    const kinds = process.argv.find(arg => arg.startsWith('--resource-kinds='))?.split('=')[1].split(',') ?? ['ore', 'gems'];
    assert(kinds.length && new Set(kinds).size === kinds.length && kinds.every(kind => ['ore', 'gems'].includes(kind)));
    const hdSuffix = `/${theater}/tiles/${report.environment.density}`;
    const evidence = report.newNativeResources = {
        disclosure: 'Original placed ore/gems are harvested by stock CMIN Gather orders. A legal duplicate original resource spawner creates ore through unchanged native cooldown and rules. No source map, resource value, frame, rule, cooldown or sequence is assigned. Accepted refinery/credit evidence is reused.',
        harvest: []
    };
    const sample = key => page.evaluate(key => {
        const d = window.__ra2debug, state = window.__m24ResourceState[key];
        const object = state.object;
        return { tick: d.game.currentTick, ...window.__m23Binding(object), value: object.value,
            batchedEntryPresent: d.mapRenderable.overlayLayer.hasObject(object),
            miner: state.miner && { id: state.miner.id, empty: state.miner.harvesterTrait.isEmpty(),
                ore: state.miner.harvesterTrait.ore, gems: state.miner.harvesterTrait.gems,
                status: state.miner.harvesterTrait.status } };
    }, key);
    const capture = async (name, tile) => {
        await page.evaluate(tile => {
            const d = window.__ra2debug;
            d.worldInteraction.minimapHandler.panToTile(d.game.map.tiles.getByMapCoords(tile[0], tile[1]));
        }, tile);
        // CameraPan is applied by the next world update, before the framebuffer is captured.
        await page.waitForTimeout(150);
        const captured = await page.evaluate(tile => {
            const d = window.__ra2debug;
            if (!d.worldInteraction.minimapHandler.isTileWithinViewport(
                d.game.map.tiles.getByMapCoords(tile[0], tile[1]), 0)) throw Error('Resource capture target is outside the updated viewport');
            d.renderer.render();
            return { tick: d.game.currentTick, cameraPan: { ...d.worldScene.cameraPan.getPan() },
                png: d.renderer.renderer.domElement.toDataURL('image/png').split(',')[1] };
        }, tile);
        const file = name + '-framebuffer.png';
        await fs.writeFile(path.join(out, file), Buffer.from(captured.png, 'base64'));
        return { file, rescaled: false, tick: captured.tick, tile, cameraPan: captured.cameraPan,
            cameraUpdateAwaited: true, targetWithinViewport: true };
    };
    await page.evaluate(() => { window.__m24ResourceState = {}; });
    for (const kind of kinds) {
        await page.evaluate(kind => {
            const d = window.__ra2debug, f = window.__allied;
            const object = d.game.getWorld().getAllObjects().filter(object => object.isOverlay()
                && object.isTiberium() && object.value > 1
                && (kind === 'gems' ? object.name.startsWith('GEM') : object.name.startsWith('TIB')))
                .sort((a, b) => Math.hypot(a.tile.rx - f.center.rx, a.tile.ry - f.center.ry)
                    - Math.hypot(b.tile.rx - f.center.rx, b.tile.ry - f.center.ry))[0];
            if (!object) throw Error('Missing original placed ' + kind);
            window.__m24ResourceState[kind] = { object };
        }, kind);
        const item = { kind, before: await sample(kind), trace: [] };
        assert(item.before.hd?.endsWith(hdSuffix));
        assert.equal(item.before.frame, item.before.value);
        item.beforeCapture = await capture('native-' + kind + '-before', item.before.tile);
        await page.evaluate(kind => {
            const d = window.__ra2debug, state = window.__m24ResourceState[kind];
            state.miner = window.__allied.spawn('CMIN', 7, state.object.tile);
            d.actionsApi.orderUnits([state.miner.id], 14, state.object.tile.rx, state.object.tile.ry);
        }, kind);
        const deadline = Date.now() + 45000;
        while (Date.now() < deadline) {
            const state = await sample(kind);
            item.trace.push(state);
            if (state.spawned) {
                assert(state.hd?.endsWith(hdSuffix));
                assert(state.frame >= 0 && state.frame < 12);
                if (!item.gathering && state.value < item.before.value && !state.miner.empty
                    && state.frame === state.value) {
                    item.gathering = state;
                    item.gatheringCapture = await capture('native-' + kind + '-harvest', state.tile);
                }
            } else {
                item.depleted = state;
                break;
            }
            await page.waitForTimeout(75);
        }
        assert(item.gathering, 'Stock gather must lower original amount and render its matching HD frame');
        assert(item.depleted && item.depleted.value === -1 && !item.depleted.batchedEntryPresent,
            'Native final collection must unspawn the resource and remove its render entry');
        assert(item.gathering.miner[kind] > 0);
        item.depletedCapture = await capture('native-' + kind + '-depleted', item.depleted.tile);
        await page.evaluate(kind => {
            const d = window.__ra2debug, miner = window.__m24ResourceState[kind].miner;
            d.actionsApi.orderUnits([miner.id], 11);
            if (miner.isSpawned) d.game.unspawnObject(miner);
        }, kind);
        evidence.harvest.push(item);
    }
    evidence.growthBefore = await page.evaluate(() => {
        const d = window.__ra2debug, g = d.game;
        const source = g.getWorld().getAllObjects().find(object => object.isTerrain() && object.rules.spawnsTiberium);
        if (!source) throw Error('No original resource spawner');
        const worker = g.getConstructionWorker(window.__allied.player);
        const tile = g.map.tiles.getAll().find(tile => g.map.isWithinBounds(tile)
            && worker.canPlaceAt('NAPOWR', tile, { normalizedTile: true, ignoreAdjacent: true }));
        if (!tile) throw Error('No legal clear resource fixture site');
        const object = g.createObject(6, source.name); g.spawnObject(object, tile);
        window.__m24ResourceSpawner = object;
        window.__m24NearResources = () => g.getWorld().getAllObjects().filter(other => other.isOverlay()
            && other.isTiberium() && Math.max(Math.abs(other.tile.rx - object.tile.rx),
                Math.abs(other.tile.ry - object.tile.ry)) <= 2)
            .map(other => ({ ...window.__m23Binding(other), value: other.value }));
        return { tick: g.currentTick, source: window.__m23Binding(source), fixture: window.__m23Binding(object),
            cooldown: object.traits.getAll().find(trait => 'cooldownTicks' in trait).cooldownTicks,
            resources: window.__m24NearResources() };
    });
    const before = JSON.stringify(evidence.growthBefore.resources);
    await page.waitForFunction(before => JSON.stringify(window.__m24NearResources()) !== before,
        before, { timeout: 45000 });
    await page.waitForTimeout(100);
    evidence.growthAfter = await page.evaluate(() => ({ tick: window.__ra2debug.game.currentTick,
        resources: window.__m24NearResources() }));
    const created = evidence.growthAfter.resources.filter(object =>
        !evidence.growthBefore.resources.some(before => before.id === object.id));
    assert(created.length && created.every(object => object.hd?.endsWith(hdSuffix)
        && object.frame === object.value && object.value === 3));
    evidence.growthCapture = await capture('native-ore-created', created[0].tile);
    await page.evaluate(() => window.__ra2debug.game.unspawnObject(window.__m24ResourceSpawner));
    evidence.status = kinds.length === 2 ? 'PASS_NATIVE_ORE_GEM_GATHER_DEPLETION_AND_CREATED_ORE_HD'
        : 'PASS_NATIVE_ORE_GATHER_DEPLETION_AND_CREATED_ORE_HD';
}
