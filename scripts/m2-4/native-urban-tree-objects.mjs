// Verify original Urban tree bindings and stock damage/removal on disclosed duplicates.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function validateUrbanTrees({ page, report, out }, expectedBindings, actionNames, reportKey = 'urbanNativeTrees') {
    const evidence = report[reportKey] = {
        disclosure: 'Bindings are original map placements. Damage actions use one legal duplicate per representative geometry and repeated unchanged native warhead hits. A legal stock GI is spawned only if the starting scene has no suitable weapon. No source map, rule, health value, frame or animation timing is assigned.',
        originals: [], actions: [],
    };
    for (const [name, expected] of Object.entries(expectedBindings)) {
        const original = await page.evaluate(name => {
            const object = window.__ra2debug.game.getWorld().getAllObjects()
                .find(object => object.isTerrain() && object.name === name && object.isSpawned);
            if (!object) throw Error('Missing original tree placement: ' + name);
            return window.__m23Binding(object);
        }, name);
        assert.equal(original.hd, expected);
        assert.equal(original.frame, 0);
        evidence.originals.push(original);
    }
    assert(actionNames.length && actionNames.every(name => name in expectedBindings));
    for (const name of actionNames) {
        const action = { name };
        action.fixture = await page.evaluate(name => {
            const d = window.__ra2debug, g = d.game, f = window.__allied;
            const original = g.getWorld().getAllObjects().find(object => object.name === name && object.isTerrain());
            if (original.rules.immune || !original.healthTrait) throw Error('Representative must have native destructible rules');
            const worker = g.getConstructionWorker(f.player);
            const silhouettes = g.getWorld().getAllObjects().filter(object => object.tile && (object.isTechno() || object.isTerrain()));
            const tile = g.map.tiles.getAll().find(tile => g.map.isWithinBounds(tile)
                && worker.canPlaceAt('NAPOWR', tile, { normalizedTile: true, ignoreAdjacent: true })
                && silhouettes.every(object => Math.max(Math.abs(tile.rx - object.tile.rx), Math.abs(tile.ry - object.tile.ry)) > 4));
            if (!tile) throw Error('No legal clear native tree fixture site');
            const object = g.createObject(6, name); g.spawnObject(object, tile);
            window.__m24UrbanTree = object;
            return { original: window.__m23Binding(original), fixtureId: object.id, tile: [tile.rx, tile.ry],
                maxHitPoints: object.healthTrait.maxHitPoints, armor: object.rules.armor };
        }, name);
        const capture = async (phase, anchor) => {
            await page.evaluate(() => {
                const d = window.__ra2debug;
                d.worldInteraction.minimapHandler.panToTile(window.__m24UrbanTree.tile);
            });
            await page.waitForTimeout(100);
            const sample = await page.evaluate(anchor => {
                const d = window.__ra2debug; d.renderer.render();
                const source = d.renderer.renderer.domElement, width = 640, height = 480;
                if (!anchor) {
                    const r = d.renderableManager.getRenderableByGameObject(window.__m24UrbanTree);
                    const p = r.getPosition().clone().project(d.worldScene.camera), v = d.worldScene.viewport;
                    const ratio = source.width / d.renderer.width;
                    anchor = [(v.x + (p.x + 1) * v.width / 2) * ratio, (v.y + (1 - p.y) * v.height / 2) * ratio];
                }
                const rect = [Math.max(0, Math.min(source.width - width, Math.floor(anchor[0] - width / 2))),
                    Math.max(0, Math.min(source.height - height, Math.floor(anchor[1] - height / 2))), width, height];
                const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
                canvas.getContext('2d').drawImage(source, ...rect, 0, 0, width, height);
                return { rect, anchor, output: [source.width, source.height], png: canvas.toDataURL().split(',')[1] };
            }, anchor);
            const file = `${name}-${phase}-native-detail.png`;
            await fs.writeFile(path.join(out, file), Buffer.from(sample.png, 'base64'));
            delete sample.png;
            return { file, rescaled: false, ...sample };
        };
        await page.waitForTimeout(150);
        action.normal = await page.evaluate(() => window.__m23Binding(window.__m24UrbanTree));
        assert.equal(action.normal.hd, expectedBindings[name]);
        action.normalCapture = await capture('normal');
        action.damage = await page.evaluate(() => {
            const d = window.__ra2debug, g = d.game, object = window.__m24UrbanTree;
            let attacker = g.getWorld().getAllObjects().find(candidate => candidate.primaryWeapon
                && candidate.primaryWeapon.warhead.canDamage(object, object.tile, 0)
                && candidate.primaryWeapon.warhead.computeDamage(candidate.primaryWeapon.rules.damage, object, g) > 0
                && candidate.primaryWeapon.warhead.computeDamage(candidate.primaryWeapon.rules.damage, object, g) < object.healthTrait.getHitPoints());
            let controlledAttacker = false;
            if (!attacker) {
                attacker = window.__allied.spawn('E1', 3);
                window.__m24UrbanTreeAttacker = attacker;
                controlledAttacker = true;
            }
            if (!attacker.primaryWeapon?.warhead.canDamage(object, object.tile, 0))
                throw Error('Native GI weapon cannot damage the tree fixture');
            const weapon = attacker.primaryWeapon;
            const damage = weapon.warhead.computeDamage(weapon.rules.damage, object, g);
            window.__m24UrbanTreeAttack = { attacker, weapon, damage };
            weapon.warhead.inflictDamage(damage, object, { obj: attacker, player: attacker.owner, weapon }, g, true);
            return { attacker: attacker.name, controlledAttacker, warhead: weapon.warhead.rules.name, stockBaseDamage: weapon.rules.damage,
                computedDamage: damage, tick: g.currentTick };
        });
        await page.waitForTimeout(150);
        action.damaged = await page.evaluate(() => window.__m23Binding(window.__m24UrbanTree));
        assert(action.damaged.health > 0 && action.damaged.health < action.normal.health);
        assert.equal(action.damaged.hd, expectedBindings[name]);
        assert.equal(action.damaged.frame, 0, 'Original tree has one body state while damaged');
        action.damagedCapture = await capture('damaged', action.normalCapture.anchor);
        action.removal = await page.evaluate(() => {
            const d = window.__ra2debug, g = d.game, object = window.__m24UrbanTree;
            const { attacker, weapon, damage } = window.__m24UrbanTreeAttack;
            let hits = 0;
            while (!object.isDestroyed && hits++ < 1000)
                weapon.warhead.inflictDamage(damage, object, { obj: attacker, player: attacker.owner, weapon }, g, true);
            return { hits, tick: g.currentTick };
        });
        await page.waitForTimeout(250);
        action.removed = await page.evaluate(() => ({ ...window.__m23Binding(window.__m24UrbanTree),
            batchedEntryPresent: window.__ra2debug.mapRenderable.terrainLayer.hasObject(window.__m24UrbanTree) }));
        assert(action.removed.destroyed && !action.removed.spawned && !action.removed.batchedEntryPresent);
        action.removedCapture = await capture('removed', action.normalCapture.anchor);
        evidence.actions.push(action);
    }
    await page.evaluate(() => {
        const object = window.__m24UrbanTreeAttacker;
        if (object?.isSpawned) window.__ra2debug.game.unspawnObject(object);
    });
    evidence.status = reportKey === 'urbanNativeTrees'
        ? 'PASS_ORIGINAL_TREE_BINDINGS_AND_REPRESENTATIVE_NATIVE_WARHEAD_DAMAGE_REMOVAL'
        : 'PASS_ORIGINAL_PROP_BINDINGS_AND_REPRESENTATIVE_NATIVE_WARHEAD_DAMAGE_REMOVAL';
}
