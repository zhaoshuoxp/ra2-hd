// Exercise player deploy orders, native damage and sustained gattling stages.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startSession } from './desktop-session.mjs';

const [receipt, output] = process.argv.slice(2);
const density = Number(process.argv.find(x => x.startsWith('--density='))?.split('=')[1] ?? 4);
const names = process.argv.find(x => x.startsWith('--families='))?.split('=')[1].split(',')
    ?? ['CAOS', 'TELE', 'YTNK', 'DISK', 'YURIPR'];
const diagnostic = process.argv.includes('--diagnostic');
const s = await startSession(receipt, output, 'yr', false, async ({ page }) => {
    await page.evaluate(density => {
        const g = window.__ra2debug.generalOptions.graphics;
        g.hdEnabled.value = density > 0;
        if (density) g.hdDensity.value = density;
    }, density);
});
const { page, report, stage, startClip, stopClip, close, out } = s;
const advance = async ticks => {
    const end = await page.evaluate(ticks => window.__ra2debug.game.currentTick + ticks, ticks);
    await page.waitForFunction(end => window.__ra2debug.game.currentTick >= end, end,
        { timeout: 90000, polling: 16 });
};
report.corrections = {};
report.requestedDensity = density || 'Original';
report.diagnostic = diagnostic;
await page.evaluate(() => {
    const d = window.__ra2debug, f = window.__allied;
    const transient = d.renderableManager.createTransientAnim.bind(d.renderableManager);
    d.renderableManager.createTransientAnim = (name, callback, ...args) => {
        const muzzle = { tick: d.game.currentTick, name };
        f.muzzles?.push(muzzle);
        return transient(name, anim => {
            callback?.(anim);
            muzzle.position = anim.getPosition?.()?.toArray();
        }, ...args);
    };
    f.reset = (name, near) => {
        for (const object of Object.values(f.actors)) if (object.isSpawned) d.game.unspawnObject(object);
        f.actors = {}; f.shots = []; f.muzzles = []; f.states = [];
        f.actor = f.spawn(name, name === 'YURIPR' ? 3 : 7,
            near ?? { rx: f.center.rx - 12, ry: f.center.ry - 12 });
        f.detailSize = [1400, 900];
        d.worldInteraction.minimapHandler.panToTile(f.actor.tile);
        const fire = f.actor.armedTrait.onWeaponFire.bind(f.actor.armedTrait);
        f.actor.armedTrait.onWeaponFire = (weapon, tick) => {
            f.shots.push({ tick, weapon: weapon.name, rof: weapon.rof,
                stage: f.actor.armedTrait.getGattlingStage(), target: f.actor.attackTrait.currentTarget?.obj?.id });
            return fire(weapon, tick);
        };
    };
    f.enemyUnit = (name, distance) => {
        const unit = f.spawn(name, name === 'E2' ? 3 : 7,
            { rx: f.actor.tile.rx + distance, ry: f.actor.tile.ry }, f.enemy);
        unit.moveTrait.setDisabled(true); unit.attackTrait?.setDisabled(true);
        return unit;
    };
    f.watch = setInterval(() => {
        const u = f.actor;
        if (!u?.isSpawned) return;
        const r = d.renderableManager.getRenderableByGameObject(u);
        const barrels = r?.unitVxlHd?.layers.flatMap(layer => layer.frames)
            .filter(frame => frame.batch.visible && frame.batch.userData.gattlingSpinRate !== undefined);
        f.states.push({ tick: d.game.currentTick, facing: u.turretTrait?.facing,
            stage: u.armedTrait.getGattlingStage(), heat: u.armedTrait.gattlingHeat,
            attack: u.attackTrait?.attackState, moving: u.isMoving,
            frame: r?.shpRenderable?.builder?.getFrame(), hd: !!(r?.unitVxlHd?.active || r?.shpRenderable?.builder?.hdOverride),
            position: u.position.worldPosition.toArray(), deployed: u.deployerTrait?.isDeployed(),
            barrels: barrels?.map(frame => ({ heading: frame.frame.heading,
                spinRate: frame.batch.userData.gattlingSpinRate, phase: frame.batch.material.uniforms.gattlingPhase.value })) });
    }, 16);
});
let failure, recording = false;
try {
    for (const name of names) {
        await page.evaluate(name => window.__allied.reset(name === 'TELE-FALL' ? 'TELE' : name), name);
        await page.waitForFunction(density => {
            const f = window.__allied, sample = f.sample(f.actor);
            return density ? sample.shpHd || sample.vxlHd : !!sample.name;
        }, density);
        const result = report.corrections[name] = {
            status: 'RUNNING', binding: await page.evaluate(() => window.__allied.sample(window.__allied.actor)),
        };
        result.recording = await startClip(); recording = true;
        if (name === 'CAOS') {
            await page.evaluate(() => {
                const d = window.__ra2debug, f = window.__allied;
                f.target = f.enemyUnit('E2', 2); f.far = f.enemyUnit('E2', 6);
                f.begin = d.game.currentTick;
                d.actionsApi.orderUnits([f.actor.id], 10);
            });
            await advance(120);
            result.deploy = await page.evaluate(() => {
                const f = window.__allied;
                return { deployed: f.actor.deployerTrait.isDeployed(),
                    weapon: f.actor.armedTrait.getDeployFireWeapon()?.name,
                    nearAffected: f.target.berserkTrait.isActive(), farAffected: f.far.berserkTrait.isActive(),
                    shots: f.shots };
            });
            await stage('CAOS-player-deploy');
            await page.evaluate(() => window.__ra2debug.actionsApi.orderUnits([window.__allied.actor.id], 10));
            await advance(8);
            await page.evaluate(() => {
                const d = window.__ra2debug, f = window.__allied;
                if (f.target.isSpawned) d.game.unspawnObject(f.target);
                f.target = f.enemyUnit('E2', 2); f.shots = [];
                d.actionsApi.orderUnits([f.actor.id], 2, f.target.id);
            });
            await advance(100);
            result.manual = await page.evaluate(() => {
                const f = window.__allied;
                return { affected: f.target.berserkTrait.isActive(), shots: f.shots };
            });
            if (!diagnostic) {
                assert(result.deploy.deployed && result.deploy.nearAffected && !result.deploy.farAffected);
                assert.equal(result.deploy.weapon, 'ChaosAttack'); assert(result.manual.affected);
            }
        } else if (name === 'TELE') {
            await page.evaluate(() => {
                const d = window.__ra2debug, f = window.__allied;
                f.target = f.building('NACNST', { rx: f.actor.tile.rx + 6, ry: f.actor.tile.ry }, f.enemy);
                f.actors[f.target.id] = f.target; f.before = f.target.healthTrait.getHitPoints();
                d.actionsApi.orderUnits([f.actor.id], 2, f.target.id);
            });
            await advance(260);
            result.buildingDamage = await page.evaluate(() => {
                const f = window.__allied;
                return { before: f.before, after: f.target.healthTrait.getHitPoints(),
                    target: f.target.name, shots: f.shots };
            });
            await stage('TELE-native-building-damage');
            if (!diagnostic) {
                assert(result.buildingDamage.after < result.buildingDamage.before);
                assert(result.buildingDamage.shots.every(s => s.weapon === 'MagneShake'));
            }
        } else if (name === 'TELE-FALL') {
            result.drops = [];
            for (const ground of ['clear', 'vehicle', 'building', 'water']) {
                await page.evaluate(ground => {
                    const d = window.__ra2debug, f = window.__allied, g = d.game;
                    f.reset('TELE');
                    if (ground === 'water') {
                        const rules = g.rules.getObject('HTNK', 7);
                        const dry = tile => tile && g.map.isWithinBounds(tile) && !tile.rampType
                            && g.map.terrain.getPassableSpeed(tile, rules.speedType, false, false) > 0
                            && !g.map.getGroundObjectsOnTile(tile).some(o => o.isTechno() || o.isTerrain());
                        let pair;
                        for (const a of g.map.tiles.getAll().filter(dry).sort((a, b) =>
                            Math.hypot(a.rx - f.center.rx, a.ry - f.center.ry) - Math.hypot(b.rx - f.center.rx, b.ry - f.center.ry))) {
                            for (let dx = -10; dx <= 10 && !pair; dx++) for (let dy = -10; dy <= 10 && !pair; dy++) {
                                const distance = Math.hypot(dx, dy);
                                if (distance < 6 || distance > 10) continue;
                                const b = g.map.tiles.getByMapCoords(a.rx + dx, a.ry + dy);
                                if (!dry(b)) continue;
                                const water = [.2, .35, .5, .65, .8].some(t =>
                                    g.map.tiles.getByMapCoords(Math.round(a.rx + dx * t), Math.round(a.ry + dy * t))?.landType === 7);
                                if (water) pair = [a, b];
                            }
                            if (pair) break;
                        }
                        if (!pair) throw Error('No legal coastal lift path over water');
                        f.reset('TELE', pair[0]); f.target = f.spawn('HTNK', 7, pair[1], f.enemy);
                        f.target.moveTrait.setDisabled(true); f.target.attackTrait.setDisabled(true);
                    } else f.target = f.enemyUnit('HTNK', 6);
                    f.before = f.target.healthTrait.getHitPoints();
                    d.actionsApi.orderUnits([f.actor.id], 2, f.target.id);
                }, ground);
                await page.waitForFunction(ground => {
                    const f = window.__allied;
                    return f.target.magneticLiftTrait.getController() === f.actor
                        && (ground === 'water' ? f.target.tile.landType === 7 && f.target.tileElevation > 0
                            : f.target.tileElevation * 104 >= 450);
                }, ground, { timeout: 30000, polling: 16 });
                const before = await page.evaluate(ground => {
                    const d = window.__ra2debug, f = window.__allied;
                    if (ground === 'vehicle') f.obstacle = f.spawn('HTNK', 7, f.target.tile, f.enemy);
                    if (ground === 'building') {
                        f.obstacle = f.building('NAPOWR', f.target.tile, f.enemy); f.actors[f.obstacle.id] = f.obstacle;
                    }
                    f.obstacle?.attackTrait?.setDisabled(true); f.obstacle?.moveTrait?.setDisabled(true);
                    const data = { ground, before: f.before, elevation: f.target.tileElevation,
                        tile: [f.target.tile.rx, f.target.tile.ry], landType: f.target.tile.landType,
                        obstacleBefore: f.obstacle?.healthTrait.getHitPoints(), obstacleTile: f.obstacle && [f.obstacle.tile.rx, f.obstacle.tile.ry] };
                    d.actionsApi.orderUnits([f.actor.id], 11); return data;
                }, ground);
                await page.waitForFunction(() => {
                    const u = window.__allied.target; return u.isDestroyed || !u.magneticLiftTrait.isActive();
                }, undefined, { timeout: 30000, polling: 16 });
                const after = await page.evaluate(() => {
                    const f = window.__allied;
                    return { after: f.target.healthTrait.getHitPoints(), destroyed: f.target.isDestroyed,
                        obstacleAfter: f.obstacle?.healthTrait.getHitPoints(), obstacleDestroyed: f.obstacle?.isDestroyed };
                });
                result.drops.push({ ...before, ...after }); await stage('TELE-drop-' + ground);
                if (!diagnostic) {
                    if (ground === 'clear') { assert.equal(after.after, before.before); assert(!after.destroyed); }
                    else assert(after.destroyed);
                    if (['vehicle', 'building'].includes(ground)) assert(after.obstacleAfter < before.obstacleBefore);
                }
                await page.evaluate(() => { window.__allied.obstacle = undefined; });
            }
        } else if (name === 'YTNK') {
            await page.evaluate(() => {
                const d = window.__ra2debug, f = window.__allied;
                f.target = f.building('NACNST', { rx: f.actor.tile.rx + 4, ry: f.actor.tile.ry }, f.enemy);
                f.actors[f.target.id] = f.target;
                d.actionsApi.orderUnits([f.actor.id], 2, f.target.id);
            });
            for (const value of [0, 1, 2]) {
                await page.waitForFunction(value => {
                    const f = window.__allied;
                    return f.actor.armedTrait.getGattlingStage() === value && f.shots.some(shot => shot.stage === value);
                }, value, { timeout: 30000, polling: 16 });
                await stage('YTNK-native-stage-' + (value + 1));
            }
            await advance(100);
            result.sustained = await page.evaluate(() => {
                const f = window.__allied;
                return { shots: f.shots, states: f.states, muzzles: f.muzzles,
                    stage: f.actor.armedTrait.getGattlingStage(), heat: f.actor.armedTrait.gattlingHeat };
            });
            await stage('YTNK-sustained-native-stage');
            await page.evaluate(() => window.__ra2debug.actionsApi.orderUnits([window.__allied.actor.id], 11));
            await advance(30);
            result.stopped = await page.evaluate(() => {
                const f = window.__allied;
                return { stage: f.actor.armedTrait.getGattlingStage(), heat: f.actor.armedTrait.gattlingHeat };
            });
            if (!diagnostic) {
                assert.equal(new Set(result.sustained.shots.map(x => x.stage)).size, 3);
                assert(result.sustained.muzzles.some(x => x.name === 'GUNFIRE'));
                assert(result.sustained.muzzles.some(x => x.name === 'VTMUZZLE'));
                assert.equal(result.stopped.stage, 0); assert.equal(result.stopped.heat, 0);
                if (density) for (const [value, rate] of [1, 2, 4].entries()) {
                    const samples = result.sustained.states.filter(s => s.stage === value);
                    assert(samples.some(s => s.barrels?.some(b => b.spinRate === rate)));
                    assert(new Set(samples.flatMap(s => s.barrels?.map(b => b.phase) ?? [])).size > 1);
                }
            }
        } else if (name === 'DISK') {
            await advance(90);
            result.rotation = await page.evaluate(() => {
                const f = window.__allied;
                return { ruleRot: f.actor.rules.rot, states: f.states };
            });
            await stage('DISK-continuous-idle-rotation');
            if (!diagnostic) {
                const states = result.rotation.states.filter((x, i, a) => !i || x.tick !== a[i - 1].tick);
                assert(new Set(states.map(x => Math.round(x.facing / 45) % 8)).size === 8);
                for (let i = 1; i < states.length; i++) {
                    const step = (states[i].facing - states[i - 1].facing + 360) % 360;
                    assert(step <= 22.5 * (states[i].tick - states[i - 1].tick));
                }
            }
        } else if (name === 'YURIPR') {
            await page.evaluate(() => {
                const d = window.__ra2debug, f = window.__allied;
                d.actionsApi.orderUnits([f.actor.id], 0, f.actor.tile.rx + 9, f.actor.tile.ry + 1);
            });
            await page.waitForFunction(() => window.__allied.actor.isMoving);
            await advance(65);
            result.movement = await page.evaluate(() => window.__allied.states);
            await stage('YURIPR-stable-native-movement');
            if (!diagnostic) assert(result.movement.some(x => x.moving && x.hd));
        }
        await stopClip(name + '-r10-native-feedback'); recording = false;
        result.status = diagnostic ? 'OBSERVED_BASELINE' : 'PASS_SELECTED_NATIVE_CASE';
        await fs.writeFile(path.join(out, 'corrections.json'), JSON.stringify(report.corrections, null, 2) + '\n');
        console.log(JSON.stringify({ family: name, status: result.status }));
    }
} catch (error) { failure = error; }
finally {
    if (recording) await stopClip('failed-r10-native-feedback');
    await page.evaluate(() => clearInterval(window.__allied.watch));
    await close(failure);
    if (diagnostic && !failure) {
        report.status = 'DIAGNOSTIC_BASELINE_COLLECTED';
        await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    }
}
if (failure) throw failure;
console.log(JSON.stringify({ status: report.status, output: out }));
