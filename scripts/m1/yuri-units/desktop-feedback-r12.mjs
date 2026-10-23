// Compare native Yuri clone and Yuri Prime deploy abilities without changing rules.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startSession } from './desktop-session.mjs';

const [receipt, output] = process.argv.slice(2);
const density = Number(process.argv.find(x => x.startsWith('--density='))?.split('=')[1] ?? 4);
const diagnostic = process.argv.includes('--diagnostic');
const session = await startSession(receipt, output, 'yr', false, async ({ page }) => {
    await page.evaluate(density => {
        const graphics = window.__ra2debug.generalOptions.graphics;
        graphics.hdEnabled.value = density > 0;
        if (density) graphics.hdDensity.value = density;
    }, density);
});
const { page, report, stage, startClip, stopClip, close, out } = session;
const advance = async ticks => {
    const end = await page.evaluate(ticks => window.__ra2debug.game.currentTick + ticks, ticks);
    await page.waitForFunction(end => window.__ra2debug.game.currentTick >= end, end,
        { timeout: 60000, polling: 16 });
};
report.requestedDensity = density || 'Original';
report.diagnostic = diagnostic;
report.abilities = [];
let failure, recording = false;
try {
    for (const name of ['YURI', 'YURIPR']) for (const phase of ['idle', 'after-control']) {
        const result = { name, phase };
        report.abilities.push(result);
        result.before = await page.evaluate(name => {
            const d = window.__ra2debug, f = window.__allied;
            for (const unit of Object.values(f.actors)) if (unit.isSpawned) d.game.unspawnObject(unit);
            f.actors = {}; f.shots = []; f.effects = []; f.samples = [];
            f.actor = f.spawn(name, 3, { rx: f.center.rx - 12, ry: f.center.ry - 12 });
            f.actor.attackTrait.setDisabled(true);
            f.detailSize = [1400, 900];
            d.worldInteraction.minimapHandler.panToTile(f.actor.tile);
            f.target = f.spawn('E2', 3, { rx: f.actor.tile.rx + 2, ry: f.actor.tile.ry }, f.enemy);
            f.target.attackTrait.setDisabled(true); f.target.moveTrait.setDisabled(true);
            const armed = f.actor.armedTrait, fire = armed.onWeaponFire.bind(armed);
            armed.onWeaponFire = (weapon, tick) => {
                f.shots.push({ tick, name: weapon.name }); return fire(weapon, tick);
            };
            if (!f.originalTransient) {
                f.originalTransient = d.renderableManager.createTransientAnim.bind(d.renderableManager);
                d.renderableManager.createTransientAnim = (name, ...args) => {
                    f.effects.push({ name, tick: d.game.currentTick }); return f.originalTransient(name, ...args);
                };
            }
            clearInterval(f.abilityTimer);
            f.abilityTimer = setInterval(() => f.samples.push({ ...f.sample(f.actor),
                stance: f.actor.stance, deployState: f.actor.deployerTrait.deployFireState,
                targetDestroyed: f.target.isDestroyed, targetHp: f.target.healthTrait.getHitPoints() }), 25);
            return { actor: f.sample(f.actor), target: f.sample(f.target),
                rules: { primary: f.actor.primaryWeapon.name, secondary: f.actor.secondaryWeapon.name,
                    deployFire: f.actor.rules.deployFire, deployer: !!f.actor.deployerTrait,
                    undeployDelay: f.actor.rules.undeployDelay,
                    immuneToPsionics: f.actor.rules.immuneToPsionics,
                    immuneToPsionicWeapons: f.actor.rules.immuneToPsionicWeapons },
                warhead: { name: f.actor.secondaryWeapon.warhead.rules.name,
                    affectsAllies: f.actor.secondaryWeapon.warhead.rules.affectsAllies } };
        }, name);
        await page.waitForFunction(density => {
            const f = window.__allied, d = window.__ra2debug;
            return density ? f.sample(f.actor).shpHd : !!d.renderableManager.getRenderableByGameObject(f.actor);
        }, density, { timeout: 30000 });
        result.binding = await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied;
            return { actor: f.sample(f.actor), allocation: d.sovietUnitsHd?.families[f.actor.name] };
        });
        assert.equal(result.binding.actor.shpHd, density > 0);
        if (density) assert.equal(result.binding.allocation.density, density);
        await stage(name + '-' + phase + '-before-deploy');
        result.videoCrop = await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied;
            const r = d.renderableManager.getRenderableByGameObject(f.actor);
            const p = r.getPosition().clone().project(d.worldScene.camera), v = d.worldScene.viewport;
            const canvas = d.renderer.renderer.domElement, ratio = canvas.width / d.renderer.width;
            const x = (v.x + (p.x + 1) * v.width / 2) * ratio;
            const y = (v.y + (1 - p.y) * v.height / 2) * ratio;
            return [Math.round(x - 700), Math.round(y - 540), 1400, 900];
        });
        result.canvas = await startClip(); recording = true;
        if (phase === 'after-control') {
            await page.evaluate(() => {
                const d = window.__ra2debug, f = window.__allied;
                f.actor.attackTrait.setDisabled(false);
                f.controlTarget = f.spawn('HTNK', 7,
                    { rx: f.actor.tile.rx + 4, ry: f.actor.tile.ry }, f.enemy);
                f.controlTarget.attackTrait.setDisabled(true); f.controlTarget.moveTrait.setDisabled(true);
                d.actionsApi.orderUnits([f.actor.id], 2, f.controlTarget.id);
            });
            await page.waitForFunction(() => window.__allied.controlTarget.owner === window.__allied.player,
                undefined, { timeout: 30000, polling: 16 });
        }
        result.deploy = await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied;
            f.actor.attackTrait.setDisabled(true);
            const result = { tick: d.game.currentTick, primaryCooldown: f.actor.primaryWeapon.getCooldownTicks(),
                secondaryCooldown: f.actor.secondaryWeapon.getCooldownTicks() };
            d.actionsApi.orderUnits([f.actor.id], 10); return result;
        });
        await advance(Math.max(160, result.deploy.primaryCooldown + result.before.rules.undeployDelay + 40));
        result.after = await page.evaluate(() => {
            const f = window.__allied;
            return { actor: f.sample(f.actor), target: f.sample(f.target), shots: f.shots,
                effects: f.effects, samples: f.samples, controlled: f.controlTarget && f.sample(f.controlTarget),
                controlRetained: f.controlTarget?.owner === f.player };
        });
        await stage(name + '-' + phase + '-after-deploy');
        result.clip = await stopClip(name + '-' + phase + '-deploy'); recording = false;
        if (!diagnostic) {
            assert(result.after.actor.spawned && !result.after.actor.destroyed, name + ' caster must survive');
            assert(result.after.target.destroyed, name + ' pulse must damage nearby enemy infantry');
            assert.equal(result.after.actor.health, 100, name + ' pulse must preserve caster health');
            assert.equal(result.after.actor.deployed, false, name + ' must automatically undeploy after firing');
            assert.equal(result.after.shots.filter(shot => shot.name === (name === 'YURI' ? 'PsiWave' : 'SuperPsiWave')).length, 1);
            assert(result.after.effects.some(effect => effect.name === 'RING1'), name + ' pulse effect must appear');
            if (phase === 'after-control') {
                assert(result.deploy.primaryCooldown > (name === 'YURIPR' ? 75 : 150));
                assert(result.after.controlRetained && !result.after.controlled.destroyed);
            }
        }
        if (!diagnostic && name === 'YURIPR' && phase === 'after-control') {
            await page.evaluate(() => {
                const d = window.__ra2debug, f = window.__allied;
                f.target = f.spawn('E2', 3, { rx: f.actor.tile.rx + 2, ry: f.actor.tile.ry }, f.enemy);
                f.target.attackTrait.setDisabled(true); f.target.moveTrait.setDisabled(true);
                d.actionsApi.orderUnits([f.actor.id], 10);
            });
            await advance(360);
            result.repeat = await page.evaluate(() => {
                const f = window.__allied;
                return { actor: f.sample(f.actor), target: f.sample(f.target),
                    shots: f.shots.filter(shot => shot.name === 'SuperPsiWave').length };
            });
            assert(result.repeat.target.destroyed && !result.repeat.actor.destroyed);
            assert.equal(result.repeat.shots, 2);
            await page.evaluate(() => window.__ra2debug.actionsApi.orderUnits([window.__allied.actor.id], 10));
            await advance(5);
            await page.evaluate(() => window.__ra2debug.actionsApi.orderUnits([window.__allied.actor.id], 10));
            await advance(240);
            result.cancel = await page.evaluate(() => {
                const f = window.__allied;
                return { deployed: f.actor.deployerTrait.isDeployed(),
                    shots: f.shots.filter(shot => shot.name === 'SuperPsiWave').length };
            });
            assert(!result.cancel.deployed); assert.equal(result.cancel.shots, 2);
            await page.evaluate(() => {
                const d = window.__ra2debug, f = window.__allied;
                f.actor.attackTrait.setDisabled(false);
                f.nextTarget = f.spawn('E2', 3, { rx: f.actor.tile.rx + 4, ry: f.actor.tile.ry }, f.enemy);
                f.nextTarget.attackTrait.setDisabled(true); f.nextTarget.moveTrait.setDisabled(true);
                d.actionsApi.orderUnits([f.actor.id], 2, f.nextTarget.id);
            });
            await page.waitForFunction(() => window.__allied.nextTarget.owner === window.__allied.player,
                undefined, { timeout: 30000, polling: 16 });
            result.controlRecovery = await page.evaluate(() => {
                const f = window.__allied;
                return { newTargetControlled: f.nextTarget.owner === f.player,
                    oldTargetReleased: f.controlTarget.owner === f.enemy };
            });
            assert(result.controlRecovery.newTargetControlled && result.controlRecovery.oldTargetReleased);
        }
    }
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.consoleErrors, []);
} catch (error) {
    failure = error;
    if (recording) await stopClip('partial-failure').catch(() => {});
} finally {
    await page.evaluate(() => clearInterval(window.__allied.abilityTimer)).catch(() => {});
    await close(failure);
}
if (diagnostic && !failure) {
    report.status = report.abilities.some(result => result.phase === 'after-control'
        && !result.after.shots.some(shot => shot.name.endsWith('PsiWave')))
        ? 'REPRODUCED_DEPLOY_CANCELLED_DURING_PRIMARY_COOLDOWN' : 'DIAGNOSTIC_NO_CANCELLATION_OBSERVED';
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}
if (failure) throw failure;
