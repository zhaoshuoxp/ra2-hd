// Controlled legal fixtures exercise native orders in the immutable copied Mac app.
import assert from 'node:assert/strict';
import { startSession } from './desktop-session.mjs';

const [receipt, output, namesArg = 'INIT,BRUTE,VIRUS,YURIPR,LTNK,YTNK,TELE,MIND,CAOS,DISK,BSUB,YHVR,PCV,SMIN'] = process.argv.slice(2);
const session = await startSession(receipt, output, 'yr', false, async ({ page }) => {
    await page.evaluate(() => { window.__ra2debug.generalOptions.graphics.hdDensity.value = 4; });
});
const { page, report, stage, startClip, stopClip, close } = session;
const failures = [];
const wait = (fn, timeout = 45000) => page.waitForFunction(fn, undefined, { timeout });
await page.evaluate(() => {
    const f = window.__allied, sample = f.sample;
    f.sample = u => ({ ...sample(u), owner: u.owner?.name,
        controlled: u.mindControllerTrait?.getTargets().map(t => t.id),
        lifted: u.magneticLiftTrait?.isActive(), berserk: u.berserkTrait?.isActive(),
        drainTarget: u.drainTrait?.getTarget()?.id, gattlingHeat: u.armedTrait?.gattlingHeat,
        specialWeapon: u.armedTrait?.specialWeaponIndex, cloaked: u.cloakableTrait?.isCloaked(),
        submerged: u.submergibleTrait?.isSubmerged(), slaveWork: u.slaveWorkState, ownerCredits: u.owner?.credits });
    f.actionBuildings = [];
    f.trackedSlaveTimer = setInterval(() => {
        for (const u of [...Object.values(f.actors), ...f.actionBuildings])
            for (const slave of u.slaveMinerTrait?.getSlaves() ?? []) f.actors[slave.id] = slave;
    }, 50);
});
report.families = {};
for (const name of namesArg.split(',')) {
    const result = report.families[name] = { status: 'RUNNING' };
    let recording = false;
    try {
        await page.evaluate(name => {
            const d = window.__ra2debug, f = window.__allied, g = d.game;
            let near = { rx: f.center.rx - 8, ry: f.center.ry - 8 };
            if (name === 'SMIN') {
                const ore = g.map.tiles.getAll().filter(t => g.map.getObjectsOnTile(t).some(o => o.isOverlay() && o.isTiberium()));
                near = g.map.tiles.getAll().filter(t => g.map.isWithinBounds(t) && !t.rampType && g.map.getTileZone(t) === 0)
                    .sort((a, b) => Math.min(...ore.map(o => Math.hypot(b.rx - o.rx, b.ry - o.ry)))
                        - Math.min(...ore.map(o => Math.hypot(a.rx - o.rx, a.ry - o.ry))))[0];
            }
            f.actor = f.spawn(name, ['INIT', 'BRUTE', 'VIRUS', 'YURIPR'].includes(name) ? 3 : 7, near);
            d.worldInteraction.minimapHandler.panToTile(f.actor.tile);
        }, name);
        await wait(() => { const f = window.__allied, s = f.sample(f.actor); return s.shpHd || s.vxlHd; });
        result.binding = await page.evaluate(() => window.__allied.sample(window.__allied.actor));
        result.recording = await startClip(); recording = true; await stage(name + '-ready');
        await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied, u = f.actor, g = d.game;
            f.destination = g.map.tiles.getAll().filter(t => g.map.isWithinBounds(t) && !t.rampType
                && g.map.getTileZone(t) === (u.name === 'BSUB' ? 2 : 0)
                && g.map.terrain.getPassableSpeed(t, u.rules.speedType, u.isInfantry(), false) > 0
                && (!u.rules.deploysInto || g.getConstructionWorker(u.owner).canPlaceAt(u.rules.deploysInto, t,
                    { ignoreObjects: [u], ignoreAdjacent: true }))
                && !g.map.getGroundObjectsOnTile(t).some(o => o.isTechno() || o.isTerrain()))
                .sort((a, b) => Math.abs(Math.hypot(a.rx - u.tile.rx, a.ry - u.tile.ry) - 5)
                    - Math.abs(Math.hypot(b.rx - u.tile.rx, b.ry - u.tile.ry) - 5))[0];
            if (!f.destination) throw Error('No native movement destination');
            d.actionsApi.orderUnits([u.id], 0, f.destination.rx, f.destination.ry);
        });
        await wait(() => { const f = window.__allied; return f.traces.some(row => row.some(s => s.id === f.actor.id && s.moving)); });
        await wait(() => { const f = window.__allied; return !f.actor.isMoving && Math.hypot(f.actor.tile.rx - f.destination.rx, f.actor.tile.ry - f.destination.ry) < 2; });
        result.nativeMovement = true;
        await page.evaluate(() => window.__ra2debug.worldInteraction.minimapHandler.panToTile(window.__allied.actor.tile));
        await stage(name + '-moved');
        if (name === 'PCV') {
            await page.evaluate(() => window.__ra2debug.actionsApi.orderUnits([window.__allied.actor.id], 10));
            await wait(() => !window.__allied.actor.isSpawned && [...window.__allied.player.buildings].some(b => b.name === 'YACNST'));
            result.nativeDeployment = true; result.boundary = 'YACNST uses the accepted Original building baseline; Task C joint HD handoff remains separate.';
            await stage('PCV-deployed');
        } else if (name === 'SMIN') {
            await page.evaluate(() => {
                const d = window.__ra2debug, f = window.__allied, g = d.game;
                f.creditStart = f.player.credits;
                const ore = g.map.tiles.getAll().filter(t => g.map.getObjectsOnTile(t).some(o => o.isOverlay() && o.isTiberium()))
                    .sort((a, b) => Math.hypot(a.rx - f.actor.tile.rx, a.ry - f.actor.tile.ry) - Math.hypot(b.rx - f.actor.tile.rx, b.ry - f.actor.tile.ry))[0];
                f.oreDestination = ore; d.actionsApi.orderUnits([f.actor.id], 0, ore.rx, ore.ry);
            });
            await wait(() => {
                const f = window.__allied; f.refinery = [...f.player.buildings].find(b => b.name === 'YAREFN' && b.slaveMinerTrait);
                if (f.refinery && !f.actionBuildings.includes(f.refinery)) f.actionBuildings.push(f.refinery);
                return f.refinery?.slaveMinerTrait.getSlaves().some(s => s.isSpawned);
            }, 60000);
            await wait(() => window.__allied.traces.flat().some(s => s.name === 'SLAV' && s.shpHd && s.slaveWork === 'shovel'), 60000);
            await stage('SMIN-native-workers-shovel');
            await wait(() => window.__allied.traces.flat().some(s => s.name === 'SLAV' && s.shpHd && s.slaveWork === 'carry'), 60000);
            await wait(() => window.__allied.player.credits > window.__allied.creditStart, 60000);
            result.nativeDeploymentHarvestCarryCredits = true;
            result.nativeWorkers = await page.evaluate(() => window.__allied.traces.flat().filter(s => s.name === 'SLAV' && s.shpHd));
            await stage('SMIN-native-workers-carry');
            await page.evaluate(() => {
                const d = window.__ra2debug, f = window.__allied;
                d.actionsApi.orderUnits([f.refinery.id], 0, f.destination.rx, f.destination.ry);
            });
            await wait(() => {
                const f = window.__allied;
                f.mobileAgain = f.player.getOwnedObjects().find(u => u.name === 'SMIN' && u.isSpawned && u !== f.actor);
                if (f.mobileAgain) f.actors[f.mobileAgain.id] = f.mobileAgain;
                return f.mobileAgain && f.sample(f.mobileAgain).vxlHd && f.mobileAgain.isMoving;
            });
            result.nativeUndeployMobileHd = await page.evaluate(() => window.__allied.sample(window.__allied.mobileAgain));
            await stage('SMIN-native-undeploy-mobile');
            await page.evaluate(() => { const d = window.__ra2debug, f = window.__allied;
                d.actionsApi.orderUnits([f.mobileAgain.id], 0, f.oreDestination.rx, f.oreDestination.ry);
            });
            await wait(() => {
                const f = window.__allied;
                f.refinery = [...f.player.buildings].find(b => b.name === 'YAREFN' && b.slaveMinerTrait);
                if (f.refinery && !f.actionBuildings.includes(f.refinery)) f.actionBuildings.push(f.refinery);
                return f.refinery?.slaveMinerTrait.getSlaves().some(s => s.isSpawned);
            }, 60000);
            await page.evaluate(() => { const d = window.__ra2debug, f = window.__allied; d.game.changeObjectOwner(f.refinery, f.enemy); });
            assert(await page.evaluate(() => { const f = window.__allied; return f.refinery.slaveMinerTrait.getSlaves().every(u => u.owner === f.enemy); }));
            result.nativeWorkerOwnerChange = true; await stage('SMIN-native-worker-owner-change');
            await page.evaluate(() => {
                const d = window.__ra2debug, f = window.__allied;
                f.workersBeforeRelease = f.refinery.slaveMinerTrait.getSlaves(); d.game.unspawnObject(f.refinery);
            });
            assert(await page.evaluate(() => { const f = window.__allied; return f.workersBeforeRelease.every(u => !u.slaveMaster && !u.slaveWorkState && u.isSpawned); }));
            result.nativeWorkerRelease = true;
        } else if (name === 'YHVR') {
            await page.evaluate(() => {
                const d = window.__ra2debug, f = window.__allied;
                f.passenger = f.spawn('INIT', 3, f.actor.tile); d.actionsApi.orderUnits([f.passenger.id], 17, f.actor.id);
            });
            await wait(() => window.__allied.actor.transportTrait.units.includes(window.__allied.passenger));
            await stage('YHVR-loaded');
            await page.evaluate(() => {
                const d = window.__ra2debug, f = window.__allied, g = d.game, u = f.actor;
                f.water = g.map.tiles.getAll().filter(t => g.map.isWithinBounds(t) && g.map.getTileZone(t) === 2
                    && g.map.terrain.getPassableSpeed(t, u.rules.speedType, false, false) > 0)
                    .sort((a, b) => Math.hypot(a.rx - u.tile.rx, a.ry - u.tile.ry) - Math.hypot(b.rx - u.tile.rx, b.ry - u.tile.ry))[0];
                d.actionsApi.orderUnits([u.id], 0, f.water.rx, f.water.ry);
            });
            await wait(() => window.__ra2debug.game.map.getTileZone(window.__allied.actor.tile) === 2);
            result.nativeWaterTransition = true; await stage('YHVR-water');
            await page.evaluate(() => { const d = window.__ra2debug, f = window.__allied; d.actionsApi.orderUnits([f.actor.id], 0, f.destination.rx, f.destination.ry); });
            await wait(() => !window.__allied.actor.isMoving && window.__allied.actor.zone === 0);
            await page.evaluate(() => window.__ra2debug.actionsApi.orderUnits([window.__allied.actor.id], 10));
            await wait(() => !window.__allied.actor.transportTrait.units.length && window.__allied.passenger.isSpawned);
            result.nativeBoardWaterShoreUnload = true; await stage('YHVR-unloaded');
        } else if (name === 'DISK') {
            for (const building of ['NAPOWR', 'NAREFN']) {
                await page.evaluate(building => {
                    const d = window.__ra2debug, f = window.__allied;
                    d.game.mapShroudTrait.revealMap(f.enemy, d.game);
                    const before = new Set(f.enemy.getOwnedObjects().map(u => u.id));
                    f.target = f.building(building, { rx: f.actor.tile.rx + 3, ry: f.actor.tile.ry }, f.enemy);
                    for (const u of f.enemy.getOwnedObjects()) if (!before.has(u.id) && u !== f.target && u.isUnit())
                        d.game.unspawnObject(u);
                    f.actionBuildings.push(f.target); f.creditsBefore = f.player.credits;
                    const foundation = f.target.getFoundation();
                    f.drainCenter = { rx: f.target.tile.rx + Math.floor(foundation.width / 2),
                        ry: f.target.tile.ry + Math.floor(foundation.height / 2) };
                    d.actionsApi.orderUnits([f.actor.id], 0, f.drainCenter.rx, f.drainCenter.ry);
                }, building);
                result.fixtureDisclosure = 'Enemy shroud is revealed for legal nearby foundations; the refinery automatic free harvester is removed to isolate drain behavior.';
                await wait(() => { const f = window.__allied; return !f.actor.isMoving
                    && Math.hypot(f.actor.tile.rx - f.drainCenter.rx, f.actor.tile.ry - f.drainCenter.ry) < 2; });
                await page.evaluate(() => {
                    const d = window.__ra2debug, f = window.__allied; d.actionsApi.orderUnits([f.actor.id], 2, f.target.id);
                });
                await wait(() => window.__allied.actor.drainTrait.getTarget() === window.__allied.target);
                if (building === 'NAPOWR') assert(await page.evaluate(() => {
                    const f = window.__allied; return f.target.owner.powerTrait.externalBlackouts.has(f.actor);
                }));
                if (building === 'NAREFN') await wait(() => window.__allied.player.credits > window.__allied.creditsBefore);
                result[building === 'NAPOWR' ? 'nativePowerDrain' : 'nativeMoneyDrain'] = true; await stage('DISK-drain-' + building);
                await page.evaluate(() => { const d = window.__ra2debug, f = window.__allied; d.actionsApi.orderUnits([f.actor.id], 11); d.game.unspawnObject(f.target); });
            }
        } else {
            const targets = name === 'MIND' ? 4 : 1;
            for (let index = 0; index < targets; index++) {
                await page.evaluate(({ name, index }) => {
                    const d = window.__ra2debug, f = window.__allied, u = f.actor;
                    const infantry = ['INIT', 'VIRUS', 'YURIPR', 'CAOS', 'BRUTE'].includes(name);
                    f.target = f.spawn(infantry ? 'E2' : 'HTNK', infantry ? 3 : 7,
                        { rx: u.tile.rx + (name === 'TELE' ? 6 : 3), ry: u.tile.ry + index }, f.enemy);
                    f.target.attackTrait?.setDisabled(true); f.target.moveTrait.setDisabled(true);
                    f.targetHealth = f.target.healthTrait.health;
                    if (name === 'YTNK') {
                        f.durableTarget = setInterval(() => { if (f.target.isSpawned) f.target.healthTrait.health = 100; }, 50);
                    }
                    d.actionsApi.orderUnits([u.id], 2, f.target.id);
                }, { name, index });
                if (name === 'YURIPR' || name === 'MIND') await wait(() => window.__allied.target.owner === window.__allied.player);
                else if (name === 'TELE') await wait(() => window.__allied.target.magneticLiftTrait.isActive() && window.__allied.target.tileElevation > 0);
                else if (name === 'CAOS') await wait(() => window.__allied.target.berserkTrait.isActive());
                else if (name === 'YTNK') await wait(() => { const f = window.__allied; return f.actor.armedTrait.gattlingHeat >= f.actor.rules.gattlingStages.at(-2); });
                else await wait(() => window.__allied.target.isDestroyed || window.__allied.target.healthTrait.health < window.__allied.targetHealth);
                result.nativeAttack = true; await stage(name + '-attack-' + index);
            }
            if (name === 'TELE') {
                await page.evaluate(() => window.__ra2debug.actionsApi.orderUnits([window.__allied.actor.id], 11));
                await wait(() => !window.__allied.target.magneticLiftTrait.isActive());
                result.nativeMagneticLiftRelease = true; await stage('TELE-released');
            }
            if (name === 'MIND') {
                await wait(() => window.__allied.actor.healthTrait.health < 100);
                result.nativeCapacityAndOverload = await page.evaluate(() => window.__allied.sample(window.__allied.actor));
                assert(result.nativeCapacityAndOverload.controlled.length >= 4); await stage('MIND-native-overload');
            }
            if (name === 'BSUB') {
                result.nativeMissileChildren = await page.evaluate(() => window.__allied.traces.flat().filter(s => s.name === 'CMISL' && s.vxlHd && s.spawned));
                assert(result.nativeMissileChildren.length, 'Boomer must launch a native HD CMISL child');
                result.nativeSubmergeBeforeAttack = await page.evaluate(() => window.__allied.traces.flat()
                    .some(s => s.id === window.__allied.actor.id && s.submerged));
                assert(result.nativeSubmergeBeforeAttack, 'Native Boomer submerge must be observed');
            }
            if (name === 'YTNK') {
                result.nativeGroundStages = await page.evaluate(() => {
                    const f = window.__allied;
                    return [...new Set(f.traces.flat().filter(s => s.id === f.actor.id).map(s => s.specialWeapon))];
                });
                assert(result.nativeGroundStages.includes(4));
                await page.evaluate(() => {
                    const d = window.__ra2debug, f = window.__allied;
                    if (f.target.isSpawned) d.game.unspawnObject(f.target);
                    f.target = f.spawn('ZEP', 7, { rx: f.actor.tile.rx + 3, ry: f.actor.tile.ry }, f.player);
                    f.target.attackTrait.setDisabled(true);
                    d.actionsApi.orderUnits([f.target.id], 0, f.target.tile.rx + 3, f.target.tile.ry);
                });
                await wait(() => window.__allied.target.zone === 1);
                await page.evaluate(() => {
                    const d = window.__ra2debug, f = window.__allied;
                    d.game.changeObjectOwner(f.target, f.enemy); d.actionsApi.orderUnits([f.actor.id], 2, f.target.id);
                });
                await wait(() => window.__allied.actor.isFiring && window.__allied.target.zone === 1);
                result.nativeAirTargetAttack = true; await stage('YTNK-native-air-attack');
            }
            if (name === 'YURIPR') result.deployAbilityEvidence =
                'This action sweep does not exercise PsiWave; use desktop-feedback-r12.mjs for native deploy verification.';
            await page.evaluate(() => { const d = window.__ra2debug, f = window.__allied; clearInterval(f.durableTarget); d.actionsApi.orderUnits([f.actor.id], 11); });
        }
        result.clip = await stopClip(name + '-native-actions'); recording = false;
        result.finalSample = await page.evaluate(() => window.__allied.sample(window.__allied.actor));
        result.status = 'PASS_SELECTED_NATIVE_ACTIONS';
    } catch (error) {
        result.status = 'FAIL'; result.failure = error.stack; failures.push(name + ': ' + error.message);
        result.diagnostics = await page.evaluate(() => {
            const f = window.__allied, d = window.__ra2debug;
            return { tick: d.game?.currentTick, actor: f.sample(f.actor), target: f.target && f.sample(f.target),
                creditsBefore: f.creditsBefore, playerCredits: f.player.credits, enemyCredits: f.enemy.credits,
                drainTarget: f.actor.drainTrait?.getTarget()?.id, refinery: f.target?.rules.refinery,
                nextPayment: f.actor.drainTrait?.nextPayment, drainInterrupted: f.actor.drainTrait?.interrupted,
                attackTarget: f.actor.attackTrait?.currentTarget?.obj?.id,
                attackState: f.actor.attackTrait?.attackState, drainWeapons: f.actor.armedTrait?.getWeapons()
                    .filter(w => w.rules.drainWeapon).map(w => ({ name: w.rules.name, range: w.range })) };
        }).catch(() => undefined);
        if (recording) { try { result.clip = await stopClip(name + '-partial'); } catch {} }
    } finally {
        await page.evaluate(() => {
            const f = window.__allied, g = window.__ra2debug.game; clearInterval(f.durableTarget);
            if (g) for (const u of [...Object.values(f.actors), ...f.actionBuildings]) if (u.isSpawned) g.unspawnObject(u);
            f.actionBuildings = [];
        });
    }
}
await page.evaluate(() => clearInterval(window.__allied.trackedSlaveTimer));
report.caseFailures = failures;
const failure = failures.length ? Error(failures.join('\n')) : undefined;
await close(failure);
if (failure) throw failure;
