// Exercise new map-selected families through native orders and damage transitions.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { validateLinkedBuildingCycle } from './native-linked-building-cycle.mjs';

export async function validateNativeStates(session, names, frameCounts, singleFixture = false, options = {}) {
    const { page, report, out, startClip, stopClip } = session;
    const checkActor = sample => assert(options.originalRenderer ? !sample.hd && !sample.pending : sample.hd,
        'Native actor must use the requested complete rendering family');
    const checkBinding = (binding, message) => {
        if (options.originalRenderer) {
            assert(!binding.hd, message);
            if (options.originalPalette !== 'native') {
                assert.equal(binding.paletteType, 5);
                assert.equal(binding.customPaletteName, 'lib');
                assert.equal(binding.fixedPaletteMatches, 240);
            }
        } else assert(binding.hd, message);
    };
    if (!singleFixture) {
        const buildingNames = await page.evaluate(names => [...new Set(window.__ra2debug.game.getWorld().getAllObjects()
            .filter(object => object.type === 2 && object.isSpawned && !object.isDestroyed && names.includes(object.name))
            .map(object => object.name))], names);
        const aggregate = { disclosure: 'Each new native building family is tested separately on a legal foundation. Completed fixtures and their infantry are unspawned before the next case. Original map placements and rules are unchanged.',
            buildings: [], actors: [], animationCases: [], evacuation: [], criticalDamageEvacuation: [] };
        await page.evaluate(() => { window.__m23FixtureSites = []; });
        const actorNames = await page.evaluate(names => names.filter(name => window.__ra2debug.game.rules.hasObject(name, 3)), names);
        for (const subset of [...buildingNames.map(name => [name]), ...(actorNames.length ? [actorNames] : [])]) {
            try {
                await validateNativeStates(session, subset, frameCounts, true, options);
                const state = report.newNativeStates;
                for (const key of ['buildings', 'actors', 'evacuation', 'criticalDamageEvacuation'])
                    aggregate[key].push(...(state[key] ?? []));
                aggregate.animationCases.push({ names: subset, before: state.animationBefore, after: state.animationAfter });
                await page.evaluate(() => {
                    const d = window.__ra2debug;
                    for (const state of window.__m23StateObjects.values()) {
                        for (const object of [state.object, state.unit, state.criticalUnit, state.powerPlant])
                            if (object?.isSpawned) d.game.unspawnObject(object);
                    }
                });
            } catch (error) {
                aggregate.failedCase = { names: subset, partial: report.newNativeStates, failure: error.stack };
                report.newNativeStates = aggregate; throw error;
            }
            report.newNativeStates = aggregate;
        }
        aggregate.status = 'PASS_SEQUENTIAL_NATIVE_BUILDING_ACTOR_AND_ANIMATION_CASES';
        aggregate.fixtureSites = await page.evaluate(() => window.__m23FixtureSites);
        report.newNativeStates = aggregate;
        return;
    }
    const result = report.newNativeStates = { disclosure: 'Existing native placements identify selected families. Duplicate native buildings use legal open foundations near the starting area for state fixtures; neutral ownership and ordinary buildup are retained. Native orders, damage and destruction; no frame, rules or sequence overrides.', buildings: [], actors: [] };
    if (Object.keys(options.poweredLinkedCycles ?? {}).length)
        result.disclosure = 'Original neutral map placements remain unchanged and unpowered. Separate legal native fixtures use local-player ownership and an ordinary GAPOWR power plant to exercise original powered normal/damaged animation loops. Buildup, power, damage and destruction use unchanged rules and clocks; no forced frames or sequences.';
    const capture = async (label, id) => {
        await page.evaluate(id => {
            const d = window.__ra2debug;
            const object = d.game.getWorld().getAllObjects().find(object => object.id === id)
                ?? window.__m23StateObjects?.get(id)?.object;
            if (!object?.tile) throw Error('Missing native capture object');
            d.worldInteraction.minimapHandler.panToTile(object.tile);
        }, id);
        await page.waitForTimeout(120);
        const png = await page.evaluate(id => {
            const d = window.__ra2debug;
            const object = d.game.getWorld().getAllObjects().find(object => object.id === id)
                ?? window.__m23StateObjects?.get(id)?.object;
            const r = d.renderableManager.getRenderableByGameObject(object)
                ?? window.__m23StateObjects?.get(id)?.renderable;
            d.renderer.render();
            const c = d.renderer.renderer.domElement, v = d.worldScene.viewport;
            const p = r.getPosition().clone().project(d.worldScene.camera), ratio = c.width / d.renderer.width;
            const x = (v.x + (p.x + 1) * v.width / 2) * ratio;
            const y = (v.y + (1 - p.y) * v.height / 2) * ratio;
            const width = 960, height = 720, left = Math.max(0, Math.min(c.width - width, Math.round(x - width / 2)));
            const top = Math.max(0, Math.min(c.height - height, Math.round(y - height * .65)));
            const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
            canvas.getContext('2d').drawImage(c, left, top, width, height, 0, 0, width, height);
            return { png: canvas.toDataURL().split(',')[1], source: [left, top, width, height], buffer: [c.width, c.height] };
        }, id);
        const file = `${label}-native-detail.png`;
        await fs.writeFile(path.join(out, file), Buffer.from(png.png, 'base64'));
        return { file, source: png.source, buffer: png.buffer, rescaled: false };
    };
    const bindings = await page.evaluate(({ names, poweredNames }) => {
        const d = window.__ra2debug, seen = new Set();
        window.__m23StateObjects = new Map();
        return d.game.getWorld().getAllObjects().filter(object => object.type === 2 && object.isSpawned
            && !object.isDestroyed && names.includes(object.name) && !seen.has(object.name) && seen.add(object.name))
            .map(placed => {
                const initial = window.__m23Binding(placed);
                const f = window.__allied, worker = d.game.getConstructionWorker(f.player);
                const tile = d.game.map.tiles.getAll().filter(tile => d.game.map.isWithinBounds(tile)
                    && worker.canPlaceAt(placed.name, tile, { normalizedTile: true, ignoreAdjacent: true })
                    && window.__m23FixtureSites.every(site => Math.hypot(tile.rx - site[0], tile.ry - site[1]) >= 12))
                    .sort((a, b) => Math.hypot(a.rx - f.center.rx, a.ry - f.center.ry)
                        - Math.hypot(b.rx - f.center.rx, b.ry - f.center.ry))[0];
                if (!tile) throw Error('No separate legal native state foundation for ' + placed.name);
                window.__m23FixtureSites.push([tile.rx, tile.ry]);
                const object = d.game.createObject(2, placed.name);
                d.game.changeObjectOwner(object, f.player); d.game.spawnObject(object, tile);
                let powerPlant;
                if (poweredNames.includes(placed.name)) {
                    const site = d.game.map.tiles.getAll().find(site => d.game.map.isWithinBounds(site)
                        && worker.canPlaceAt('GAPOWR', site, { normalizedTile: true, ignoreAdjacent: true })
                        && window.__m23FixtureSites.every(point => Math.hypot(site.rx - point[0], site.ry - point[1]) >= 12));
                    if (!site) throw Error('No legal native power-plant fixture foundation');
                    window.__m23FixtureSites.push([site.rx, site.ry]);
                    powerPlant = d.game.createObject(2, 'GAPOWR');
                    d.game.changeObjectOwner(powerPlant, f.player); d.game.spawnObject(powerPlant, site);
                } else d.game.changeObjectOwner(object, d.game.getCivilianPlayer());
                const renderable = d.renderableManager.getRenderableByGameObject(object);
                window.__m23StateObjects.set(object.id, { object, renderable, powerPlant });
                return { ...window.__m23Binding(object), canOccupy: !!object.garrisonTrait?.canBeOccupied(),
                    initial, maxOccupants: object.rules.maxNumberOccupants,
                    maxHitPoints: object.healthTrait.maxHitPoints,
                    leaveRubble: object.rules.leaveRubble, wall: !!object.wallTrait };
            });
    }, { names, poweredNames: Object.keys(options.poweredLinkedCycles ?? {}) });
    await page.waitForFunction(() => [...window.__m23StateObjects.values()].every(state => state.object.buildStatus === 1
        && (!state.powerPlant || state.powerPlant.buildStatus === 1 && state.object.poweredTrait.isPoweredOn())),
        undefined, { timeout: 30000 });
    await page.waitForTimeout(150);
    for (const normal of bindings) {
        Object.assign(normal, await page.evaluate(id => window.__m23Binding(window.__m23StateObjects.get(id).object), normal.id));
        checkBinding(normal, `${normal.name} normal native binding`);
        if (!normal.wall) assert.equal(normal.frame, 0);
        result.buildings.push({ normal, normalCapture: await capture(`${normal.name}-normal`, normal.id) });
        for (const cycle of options.poweredLinkedCycles?.[normal.name] ?? []) {
            await validateLinkedBuildingCycle(session, cycle.member, cycle.frameCount, {
                loopStart: cycle.loopStart, loopEnd: cycle.loopEnd, objectId: normal.id,
                originalRenderer: !!options.originalRenderer });
            result.buildings.at(-1).poweredFixture = await page.evaluate(id => {
                const state = window.__m23StateObjects.get(id), d = window.__ra2debug;
                return { ownerIsLocalPlayer: state.object.owner === d.localPlayer,
                    poweredOn: state.object.poweredTrait.isPoweredOn(), powerPlant: window.__m23Binding(state.powerPlant) };
            }, normal.id);
            assert(result.buildings.at(-1).poweredFixture.ownerIsLocalPlayer
                && result.buildings.at(-1).poweredFixture.poweredOn);
        }
    }
    // Animation members are observed at native ticks without setting their frame.
    const animationSample = () => page.evaluate(names => {
        window.__m24NativeAnimationSample = () => {
            const d = window.__ra2debug;
            const objects = d.game.getWorld().getAllObjects();
            const samples = d.mapRenderable.tileLayer.anims.filter(anim => /^W[ABD]/.test(anim.name) && names.includes(anim.name))
                .map(anim => ({ name: anim.name, member: anim.mainObj.builder.shpFile?.filename,
                    frame: anim.mainObj.builder.getFrame(), hd: anim.mainObj.builder.hdOverride?.identity }));
            for (const object of objects.filter(object => object.type === 2 && object.isSpawned && !object.isDestroyed
                && names.includes(object.name))) {
                const r = d.renderableManager.getRenderableByGameObject(object);
                for (const list of r?.animObjects?.values() ?? []) for (const anim of list)
                    if (anim.builder.hdOverride) samples.push({ name: object.name, member: anim.builder.shpFile?.filename,
                        frame: anim.builder.getFrame(), hd: anim.builder.hdOverride.identity });
            }
            return { tick: d.game.currentTick, samples };
        };
        return window.__m24NativeAnimationSample();
    }, names);
    result.animationBefore = await animationSample();
    if (result.animationBefore.samples.length) {
        await page.waitForFunction(before => {
            const current = window.__m24NativeAnimationSample();
            if (current.tick <= before.tick || !current.samples.some((sample, index) =>
                sample.frame !== before.samples[index]?.frame)) return false;
            window.__m24NativeAnimationWitness = current;
            return true;
        }, result.animationBefore, { timeout: 5000 });
        result.animationAfter = await page.evaluate(() => window.__m24NativeAnimationWitness);
        assert(result.animationAfter.tick > result.animationBefore.tick);
        assert(result.animationAfter.samples.some((sample, i) => sample.frame !== result.animationBefore.samples[i]?.frame));
    } else {
        await page.waitForTimeout(550);
        result.animationAfter = await animationSample();
    }
    const occupied = bindings.filter(object => object.canOccupy && object.maxOccupants > 0);
    if (occupied.length) {
        await page.evaluate(ids => {
            const d = window.__ra2debug, f = window.__allied;
            for (const id of ids) {
                const state = window.__m23StateObjects.get(id);
                state.unit = f.spawn('E1', 3, state.object.tile);
                d.actionsApi.orderUnits([state.unit.id], 8, id);
            }
        }, occupied.map(object => object.id));
        await page.waitForFunction(ids => ids.every(id => window.__m23StateObjects.get(id).object.garrisonTrait.units.length === 1),
            occupied.map(object => object.id), { timeout: 60000 });
        for (const object of occupied) {
            const record = result.buildings.find(value => value.normal.id === object.id);
            record.occupied = await page.evaluate(id => window.__m23Binding(window.__m23StateObjects.get(id).object), object.id);
            checkBinding(record.occupied, `${object.name} occupied native binding`);
            assert.equal(record.occupied.occupants, 1);
            if (frameCounts[object.name] >= 3) assert.equal(record.occupied.frame, 2);
            record.occupiedCapture = await capture(`${object.name}-occupied`, object.id);
        }
        await page.evaluate(ids => ids.forEach(id => window.__ra2debug.actionsApi.orderUnits([id], 10)), occupied.map(object => object.id));
        await page.waitForFunction(ids => ids.every(id => !window.__m23StateObjects.get(id).object.garrisonTrait.units.length), occupied.map(object => object.id));
        result.evacuation = await page.evaluate(ids => ids.map(id => {
            const state = window.__m23StateObjects.get(id), d = window.__ra2debug;
            return { house: window.__m23Binding(state.object), neutral: state.object.owner === d.game.getCivilianPlayer(),
                unitSpawned: state.unit.isSpawned, unitInLimbo: !!state.unit.limboData,
                unitRenderable: !!d.renderableManager.getRenderableByGameObject(state.unit) };
        }), occupied.map(object => object.id));
        assert(result.evacuation.every(value => value.neutral && value.unitSpawned && !value.unitInLimbo && value.unitRenderable));
        await page.evaluate(ids => {
            const d = window.__ra2debug;
            for (const id of ids) {
                const state = window.__m23StateObjects.get(id);
                // Reenter with the evacuated soldier on its legal native tile.
                // A second spawn can compete with the still-live first soldier.
                state.criticalUnit = state.unit;
                if (!state.criticalUnit.isSpawned || state.criticalUnit.limboData)
                    throw Error('Regarrison requires the evacuated native soldier');
                d.actionsApi.orderUnits([state.criticalUnit.id], 8, id);
            }
        }, occupied.map(object => object.id));
        await page.waitForFunction(ids => ids.every(id => window.__m23StateObjects.get(id).object.garrisonTrait.units.length === 1),
            occupied.map(object => object.id), { timeout: 60000 });
        result.regarrison = await page.evaluate(ids => ids.map(id => {
            const state = window.__m23StateObjects.get(id);
            return { buildingId: id, unitId: state.criticalUnit.id,
                reusedEvacuatedUnit: state.criticalUnit === state.unit,
                occupants: state.object.garrisonTrait.units.length };
        }), occupied.map(object => object.id));
        assert(result.regarrison.every(value => value.reusedEvacuatedUnit && value.occupants === 1));
    }
    await page.evaluate(ids => {
        const d = window.__ra2debug;
        for (const id of ids) {
            const object = window.__m23StateObjects.get(id).object;
            const damage = object.healthTrait.getHitPoints() - Math.max(1, Math.floor(object.healthTrait.maxHitPoints * .2));
            object.healthTrait.inflictDamage(damage, object, d.game);
        }
    }, bindings.filter(object => object.health > 0).map(object => object.id));
    await page.waitForTimeout(500);
    result.criticalDamageEvacuation = await page.evaluate(ids => ids.map(id => {
        const d = window.__ra2debug, state = window.__m23StateObjects.get(id);
        return { house: window.__m23Binding(state.object), neutral: state.object.owner === d.game.getCivilianPlayer(),
            unitSpawned: state.criticalUnit.isSpawned, unitInLimbo: !!state.criticalUnit.limboData };
    }), occupied.map(object => object.id));
    assert(result.criticalDamageEvacuation.every(value => value.house.occupants === 0
        && value.neutral && value.unitSpawned && !value.unitInLimbo));
    for (const record of result.buildings) {
        record.damaged = await page.evaluate(id => window.__m23Binding(window.__m23StateObjects.get(id).object), record.normal.id);
        checkBinding(record.damaged, `${record.normal.name} damaged native binding`);
        if (record.normal.maxHitPoints > 1) {
            assert(record.damaged.health < record.normal.health);
            if (frameCounts[record.normal.name] >= 2 && !record.normal.wall) assert.equal(record.damaged.frame, 1);
        } else record.damageException = 'INTENTIONAL_NATIVE_SINGLE_HITPOINT_NO_NONFATAL_DAMAGE_STATE';
        record.damagedCapture = await capture(`${record.normal.name}-damaged`, record.normal.id);
        for (const cycle of options.damagedLinkedCycles?.[record.normal.name] ?? []) {
            await validateLinkedBuildingCycle(session, cycle.member, cycle.frameCount, {
                loopStart: cycle.loopStart, loopEnd: cycle.loopEnd, objectId: record.normal.id,
                state: 'damaged', originalRenderer: !!options.originalRenderer });
        }
    }
    await page.evaluate(ids => {
        const d = window.__ra2debug;
        for (const id of ids) {
            const object = window.__m23StateObjects.get(id).object;
            object.healthTrait.inflictDamage(object.healthTrait.maxHitPoints, object, d.game);
            d.game.destroyObject(object, { player: d.localPlayer });
        }
    }, bindings.map(object => object.id));
    await page.waitForTimeout(400);
    for (const record of result.buildings) {
        record.destroyed = await page.evaluate(id => {
            const state = window.__m23StateObjects.get(id), r = state.renderable;
            return { destroyed: state.object.isDestroyed, rubble: r.rubbleObj && {
                hd: r.rubbleObj.builder.hdOverride?.identity, frame: r.rubbleObj.builder.getFrame(),
                visible: r.rubbleObj.get3DObject()?.visible } };
        }, record.normal.id);
        assert(record.destroyed.destroyed);
        if (record.normal.leaveRubble && frameCounts[record.normal.name] >= 4) {
            assert(record.destroyed.rubble?.visible);
            assert(options.originalRenderer ? !record.destroyed.rubble.hd : record.destroyed.rubble.hd);
            assert.equal(record.destroyed.rubble.frame, 3);
            record.rubbleCapture = await capture(`${record.normal.name}-rubble`, record.normal.id);
        }
    }
    const actorNames = await page.evaluate(names => names.filter(name => {
        try { return window.__ra2debug.game.rules.getObject(name, 3).type === 3; }
        catch { return false; }
    }), names);
    for (const [index, name] of actorNames.entries()) {
        const record = { name, samples: {} };
        result.actors.push(record);
        record.rules = await page.evaluate(name => {
            const d = window.__ra2debug, f = window.__allied;
            const object = f.spawn(name, 3), renderable = d.renderableManager.getRenderableByGameObject(object);
            window.__m23StateObjects.set(object.id, { object, renderable }); f.actor = object;
            window.__m23ActorSample = () => {
                const actor = f.actor, r = d.renderableManager.getRenderableByGameObject(actor)
                    ?? window.__m23StateObjects.get(actor.id).renderable;
                if (!r?.shpRenderable) return { ...f.sample(actor), pending: true };
                window.__m23StateObjects.get(actor.id).renderable = r;
                return { ...f.sample(actor), hd: r.shpRenderable.builder.hdOverride?.identity,
                    frame: r.shpRenderable.builder.getFrame(), bodyFrameCount: r.shpRenderable.frameCount,
                    sequence: [...r.objectArt.sequences].find(([, params]) => params === r.currentSequenceParams)?.[0],
                    sequenceParams: r.currentSequenceParams, stance: actor.stance, panicked: actor.isPanicked };
            };
            window.__m23ActorTrace = [];
            window.__m23ActorTimer = setInterval(() => window.__m23ActorTrace.push({
                tick: d.game.currentTick, ...window.__m23ActorSample() }), 40);
            return { id: object.id, primary: object.rules.primary, fraidycat: object.rules.fraidycat,
                sequences: [...object.art.sequences].map(([type, value]) => ({ type, ...value })) };
        }, name);
        await page.waitForFunction(original => {
            const sample = window.__m23ActorSample();
            return original ? !sample.pending && !sample.hd : !!sample.hd;
        }, !!options.originalRenderer);
        if (index === 0 || options.recordEachActor) record.clipRecording = await startClip();
        await page.waitForTimeout(250);
        record.samples.ready = await page.evaluate(() => window.__m23ActorSample());
        record.readyCapture = await capture(`${name}-ready`, record.rules.id);
        record.destination = await page.evaluate(() => {
            const d = window.__ra2debug, u = window.__allied.actor, g = d.game;
            const tile = g.map.tiles.getAll().filter(tile => g.map.isWithinBounds(tile) && !tile.rampType
                && g.map.terrain.getPassableSpeed(tile, u.rules.speedType, true, false) > 0
                && g.map.getTileZone(tile) === 0
                && !g.map.getGroundObjectsOnTile(tile).some(object => object.isTechno() || object.isTerrain()))
                .sort((a, b) => Math.abs(Math.hypot(a.rx - u.tile.rx, a.ry - u.tile.ry) - 5)
                    - Math.abs(Math.hypot(b.rx - u.tile.rx, b.ry - u.tile.ry) - 5))[0];
            window.__allied.destination = tile; d.actionsApi.orderUnits([u.id], 0, tile.rx, tile.ry);
            return [tile.rx, tile.ry];
        });
        await page.waitForFunction(() => window.__allied.actor.isMoving, undefined, { timeout: 15000 });
        await page.waitForTimeout(120);
        record.samples.walk = await page.evaluate(() => window.__m23ActorSample());
        checkActor(record.samples.walk);
        assert(record.samples.walk.moving);
        record.walkCapture = await capture(`${name}-walking`, record.rules.id);
        await page.waitForFunction(() => !window.__allied.actor.isMoving && window.__allied.actor.tile === window.__allied.destination,
            undefined, { timeout: 60000 });
        if (record.rules.primary) {
            await page.evaluate(() => {
                const d = window.__ra2debug, f = window.__allied, actor = f.actor;
                f.target = f.spawn('E2', 3, { rx: actor.tile.rx + 2, ry: actor.tile.ry }, f.enemy);
                f.target.attackTrait.setDisabled(true); f.target.moveTrait.setDisabled(true);
                f.targetHealth = f.target.healthTrait.health;
                d.actionsApi.orderUnits([actor.id], 2, f.target.id);
            });
            await page.waitForFunction(() => window.__m23ActorTrace.some(sample => sample.firing), undefined, { timeout: 30000 });
            record.samples.fire = await page.evaluate(() => window.__m23ActorTrace.filter(sample => sample.firing).at(-1));
            checkActor(record.samples.fire);
            record.fireCapture = await capture(`${name}-firing`, record.rules.id);
            await page.waitForFunction(() => window.__allied.target.isDestroyed
                || window.__allied.target.healthTrait.health < window.__allied.targetHealth, undefined, { timeout: 30000 });
            record.nativeAttackChangedHealth = true;
            await page.evaluate(() => {
                const d = window.__ra2debug, f = window.__allied;
                d.actionsApi.orderUnits([f.actor.id], 11);
                if (f.target.isSpawned) d.game.unspawnObject(f.target);
            });
        }
        const cheer = record.rules.sequences.find(sequence => sequence.type === 33);
        const ready = record.samples.ready;
        if (cheer && cheer.startFrame + cheer.frameCount <= ready.bodyFrameCount) {
            record.cheerCooldownBefore = await page.evaluate(() => window.__ra2debug.localPlayer.cheerCooldownTicks);
            await page.waitForFunction(() => !window.__ra2debug.localPlayer.cheerCooldownTicks,
                undefined, { timeout: 60000 });
            await page.evaluate(() => window.__ra2debug.actionsApi.orderUnits([window.__allied.actor.id], 12));
            await page.waitForFunction(() => window.__allied.actor.stance === 5);
            record.samples.cheer = await page.evaluate(() => window.__m23ActorSample());
            record.cheerCapture = await capture(`${name}-cheer`, record.rules.id);
            await page.waitForFunction(() => window.__allied.actor.stance !== 5);
        } else if (cheer) {
            record.cheerException = { status: 'INTENTIONAL_NATIVE_ART_SEQUENCE_OVERRUN', nativeSequence: cheer,
                bodyFrameCount: ready.bodyFrameCount, policy: 'Preserve native source and ART; no invented frame expansion.' };
        }
        await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied;
            d.actionsApi.orderUnits([f.actor.id], 11);
        });
        await page.waitForTimeout(150);
        // Invoke the ordinary native warhead path; its suppression/scatter logic selects prone or panic.
        const woundDamage = options.nativeWoundDamageByActor?.[name] ?? 1;
        assert(Number.isSafeInteger(woundDamage) && woundDamage > 0);
        await page.evaluate(damage => {
            const d = window.__ra2debug, f = window.__allied, object = f.actor;
            f.woundSource = f.spawn('E2', 3, object.tile, f.enemy);
            f.woundSource.attackTrait.setDisabled(true); f.woundSource.moveTrait.setDisabled(true);
            f.woundSource.primaryWeapon.warhead.inflictDamage(damage, object,
                { obj: f.woundSource, player: f.enemy }, d.game, true);
        }, woundDamage);
        record.nativeWoundDamage = woundDamage;
        await page.waitForTimeout(100);
        record.samples.wounded = await page.evaluate(() => window.__m23ActorSample());
        checkActor(record.samples.wounded);
        assert(record.samples.wounded.health < ready.health);
        record.woundedCapture = await capture(`${name}-native-wound-response`, record.rules.id);
        await page.evaluate(() => {
            const d = window.__ra2debug, actor = window.__allied.actor;
            actor.healthTrait.inflictDamage(actor.healthTrait.maxHitPoints, actor, d.game);
            d.game.destroyObject(actor, { player: d.localPlayer });
        });
        await page.waitForTimeout(120);
        record.samples.death = await page.evaluate(() => window.__m23ActorSample());
        checkActor(record.samples.death);
        assert(record.samples.death.destroyed);
        record.deathCapture = await capture(`${name}-native-death`, record.rules.id);
        await page.waitForTimeout(500);
        record.trace = await page.evaluate(() => { clearInterval(window.__m23ActorTimer); return window.__m23ActorTrace; });
        assert(record.trace.filter(sample => !sample.pending).every(sample => sample.frame < sample.bodyFrameCount));
        if (index === 0 || options.recordEachActor) record.clip = await stopClip(`${name}-native-states`);
        await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied;
            if (f.woundSource.isSpawned) d.game.unspawnObject(f.woundSource);
        });
    }
    result.status = 'PASS_NATIVE_BUILDING_TRANSITIONS_AND_OBSERVED_ANIMATION';
}
