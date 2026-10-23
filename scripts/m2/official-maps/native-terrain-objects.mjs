// Observe original terrain families through native spawning, animation and removal.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function installTerrainObjectBindings(page) {
    await page.evaluate(() => {
        if (window.__m23Binding) return;
        window.__m23Binding = object => {
            const d = window.__ra2debug, r = d.renderableManager.getRenderableByGameObject(object);
            const builder = r?.mainObj?.builder;
            const batch = d.mapRenderable.terrainLayer?.getObjectHdBinding?.(object);
            return { id: object.id, name: object.name, type: object.type,
                tile: [object.tile.rx, object.tile.ry, object.tile.z],
                spawned: object.isSpawned, destroyed: object.isDestroyed,
                health: object.healthTrait?.health,
                hd: batch?.identity ?? builder?.hdOverride?.identity,
                frame: batch?.frame ?? builder?.getFrame(), batchedHd: !!batch };
        };
    });
}

export async function validateNativeTerrainObjects({ page, report, out }, { originalRenderer = false } = {}) {
    const evidence = report.newNativeTerrainObjects = {
        originalRenderer,
        disclosure: 'Original placements establish actual selected bindings. Legal duplicate native terrain objects use clear stock foundations for actions. Resource creation, animation and damage run through unchanged native rules and traits. No source map, frame, cooldown, rule or sequence is edited; generated ore still uses its existing coverage.',
        trace: []
    };
    const checkBinding = state => originalRenderer ? assert(!state.hd)
        : assert(state.hd?.endsWith(`/tiles/${report.environment.density}`));
    evidence.fixtures = await page.evaluate(names => {
        const d = window.__ra2debug, g = d.game;
        const objects = g.getWorld().getAllObjects();
        const source = objects.find(object => names.includes(object.name) && object.isTerrain()
            && object.rules.spawnsTiberium && object.isSpawned);
        const tree = objects.find(object => names.includes(object.name) && object.isTerrain()
            && !object.rules.spawnsTiberium && !object.rules.immune && object.healthTrait && object.isSpawned);
        if (!source || !tree) throw Error('Need placed native resource spawner and destructible terrain');
        const worker = g.getConstructionWorker(window.__allied.player);
        const create = original => {
            const tile = g.map.tiles.getAll().find(tile => g.map.isWithinBounds(tile)
                && worker.canPlaceAt('NAPOWR', tile, { normalizedTile: true, ignoreAdjacent: true }));
            if (!tile) throw Error('No legal clear native terrain fixture site');
            const object = g.createObject(6, original.name);
            g.spawnObject(object, tile);
            return { object, original: window.__m23Binding(original) };
        };
        window.__m24TerrainFixtures = { spawner: create(source), tree: create(tree) };
        return Object.fromEntries(Object.entries(window.__m24TerrainFixtures).map(([key, value]) =>
            [key, { original: value.original, fixtureId: value.object.id, name: value.object.name,
                tile: [value.object.tile.rx, value.object.tile.ry], immune: value.object.rules.immune,
                animationRate: value.object.rules.animationRate,
                animationProbability: value.object.rules.animationProbability }]));
    }, report.newNativeBindings.map(object => object.name));
    const sample = () => page.evaluate(() => {
        const d = window.__ra2debug, object = window.__m24TerrainFixtures.spawner.object;
        const trait = object.traits.getAll().find(trait => 'cooldownTicks' in trait);
        return { tick: d.game.currentTick, ...window.__m23Binding(object),
            cooldownTicks: trait.cooldownTicks, ticksSinceLastSpawn: trait.ticksSinceLastSpawn,
            spawnStatus: trait.status,
            ore: d.game.getWorld().getAllObjects().filter(other => other.isOverlay() && other.isTiberium()
                && Math.max(Math.abs(other.tile.rx - object.tile.rx), Math.abs(other.tile.ry - object.tile.ry)) <= 2)
                .map(other => ({ id: other.id, name: other.name, value: other.value,
                    tile: [other.tile.rx, other.tile.ry] })) };
    });
    const capture = async (name, fixture) => {
        const png = await page.evaluate(fixture => {
            const d = window.__ra2debug, object = window.__m24TerrainFixtures[fixture].object;
            d.worldInteraction.minimapHandler.panToTile(object.tile); d.renderer.render();
            return d.renderer.renderer.domElement.toDataURL('image/png').split(',')[1];
        }, fixture);
        const file = name + '-framebuffer.png';
        await fs.writeFile(path.join(out, file), Buffer.from(png, 'base64'));
        return { file, rescaled: false };
    };
    await page.waitForTimeout(150);
    evidence.before = await sample();
    checkBinding(evidence.before);
    assert.equal(evidence.before.cooldownTicks, Math.floor(1 / evidence.fixtures.spawner.animationProbability));
    evidence.beforeCapture = await capture('native-resource-spawner-before', 'spawner');
    const initialOre = JSON.stringify(evidence.before.ore);
    const deadline = Date.now() + 45000;
    while (Date.now() < deadline) {
        const state = await sample();
        evidence.trace.push(state);
        checkBinding(state);
        assert(state.frame >= 0 && state.frame < 11);
        if (state.frame > 0 && JSON.stringify(state.ore) !== initialOre) {
            evidence.spawning = state;
            evidence.animationCapture = await capture('native-resource-spawner-animation', 'spawner');
            break;
        }
        await page.waitForTimeout(50);
    }
    assert(evidence.spawning, 'Unchanged native cooldown must produce ore and an animated HD body');
    if (process.argv.includes('--resource-full-cycle')) {
        evidence.fullCycle = { phases: [] };
        const seen = new Set();
        const deadline = Date.now() + 45000;
        while (Date.now() < deadline && seen.size < 11) {
            const state = await sample();
            checkBinding(state);
            if (!seen.has(state.frame)) {
                seen.add(state.frame);
                evidence.fullCycle.phases.push({ ...state,
                    capture: await capture(`native-resource-phase-${state.frame}`, 'spawner') });
            }
            await page.waitForTimeout(10);
        }
        assert.equal(seen.size, 11, 'Observe all original phases without assigning frames or timing');
        evidence.fullCycle.status = 'PASS_ALL_11_NATIVE_PHASES_UNCHANGED_COOLDOWN';
    }
    if (process.argv.includes('--resource-cycles=2')) {
        const repeatBefore = await sample();
        const firstOre = JSON.stringify(repeatBefore.ore);
        const deadline = Date.now() + 45000;
        evidence.repeatCycle = { before: repeatBefore, trace: [] };
        while (Date.now() < deadline) {
            const state = await sample();
            evidence.repeatCycle.trace.push(state);
            checkBinding(state);
            if (state.tick > repeatBefore.tick && state.frame > 0 && JSON.stringify(state.ore) !== firstOre) {
                evidence.repeatCycle.spawning = state;
                break;
            }
            await page.waitForTimeout(50);
        }
        assert(evidence.repeatCycle.spawning, 'Second native cooldown must produce ore');
        for (let index = 0; index < 30; index++) {
            evidence.repeatCycle.trace.push(await sample());
            await page.waitForTimeout(50);
        }
        const animated = evidence.repeatCycle.trace.filter(state =>
            state.tick >= evidence.repeatCycle.spawning.tick).some(state => state.frame > 0);
        evidence.repeatCycle.animated = animated;
        assert(animated, 'Second native resource spawn must restart the original body animation');
        evidence.repeatCycle.capture = await capture('native-resource-spawner-repeat', 'spawner');
    }
    evidence.treeBefore = await page.evaluate(() => window.__m23Binding(window.__m24TerrainFixtures.tree.object));
    checkBinding(evidence.treeBefore);
    evidence.treeBeforeCapture = await capture('native-terrain-before-damage', 'tree');
    evidence.treeDamage = await page.evaluate(() => {
        const d = window.__ra2debug, object = window.__m24TerrainFixtures.tree.object;
        let attacker = d.game.getWorld().getAllObjects().find(candidate => candidate.primaryWeapon
            && candidate.primaryWeapon.warhead.canDamage(object, object.tile, 0)
            && candidate.primaryWeapon.warhead.computeDamage(candidate.primaryWeapon.rules.damage, object, d.game) > 0);
        if (!attacker) {
            attacker = window.__allied.spawn('E1', 3);
            window.__m24TerrainFixtureAttacker = attacker;
        }
        if (!attacker.primaryWeapon?.warhead.canDamage(object, object.tile, 0))
            throw Error('No original native damaging weapon for terrain fixture');
        const weapon = attacker.primaryWeapon;
        const damage = weapon.warhead.computeDamage(weapon.rules.damage, object, d.game);
        let hits = 0;
        while (!object.isDestroyed && hits++ < 1000)
            weapon.warhead.inflictDamage(damage, object,
                { obj: attacker, player: attacker.owner, weapon }, d.game, true);
        return { attacker: attacker.name, warhead: weapon.warhead.rules.name,
            stockBaseDamage: weapon.rules.damage, computedDamage: damage, hits,
            policy: 'Controlled repeated stock warhead hits, including native armor and destruction; no health or destroyed flag is assigned.' };
    });
    await page.waitForTimeout(250);
    evidence.treeAfter = await page.evaluate(() => {
        const d = window.__ra2debug, object = window.__m24TerrainFixtures.tree.object;
        return { ...window.__m23Binding(object),
            batchedEntryPresent: d.mapRenderable.terrainLayer.hasObject(object) };
    });
    assert(evidence.treeAfter.destroyed && !evidence.treeAfter.spawned);
    assert(!evidence.treeAfter.batchedEntryPresent);
    evidence.treeAfterCapture = await capture('native-terrain-after-removal', 'tree');
    await page.evaluate(() => {
        const d = window.__ra2debug, object = window.__m24TerrainFixtures.spawner.object;
        if (object.isSpawned) d.game.unspawnObject(object);
        const attacker = window.__m24TerrainFixtureAttacker;
        if (attacker?.isSpawned) d.game.unspawnObject(attacker);
    });
    evidence.status = 'PASS_NATIVE_RESOURCE_SPAWN_ANIMATION_AND_TERRAIN_REMOVAL';
}
