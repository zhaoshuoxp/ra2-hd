import assert from 'node:assert/strict';
import { startSession } from '../m1/yuri-units/desktop-session.mjs';

const [receipt, output, densityArg = '4'] = process.argv.slice(2);
const density = Number(densityArg);
assert([2, 4].includes(density));
const session = await startSession(receipt, output, 'yr', false, async ({ page }) => {
    await page.evaluate(density => {
        const graphics = window.__ra2debug.generalOptions.graphics;
        graphics.hdEnabled.value = density !== 0;
        if (density) graphics.hdDensity.value = density;
    }, density);
});
const { page, report, stage, startClip, stopClip, close } = session;
const wait = (predicate, timeout = 30000) => page.waitForFunction(predicate, undefined, { timeout });
let failure;
try {
    report.density = density || 'Original';
    await page.evaluate(() => {
        const d = window.__ra2debug, f = window.__allied, g = d.game;
        g.mapShroudTrait.revealMap(f.enemy, g);
        f.actor = f.spawn('DISK', 7, { rx: f.center.rx - 8, ry: f.center.ry - 8 });
        f.refinery = f.building('NAREFN', { rx: f.center.rx - 4, ry: f.center.ry - 8 }, f.enemy);
        f.drainEvents = []; f.acquisitions = []; f.payments = [];
        f.funds = () => ({ tick: g.currentTick, player: f.player.credits, enemy: f.enemy.credits });
        const u = f.actor, trait = u.drainTrait, attack = u.attackTrait;
        const snapshot = (event, target) => {
            const range = trait.rangeHelper ?? attack.rangeHelper;
            const weapon = u.armedTrait.getWeapons().find(w => w.rules.drainWeapon);
            f.drainEvents.push({ event, tick: g.currentTick, target: target?.name, targetId: target?.id,
                targetSpawned: target?.isSpawned, targetDestroyed: target?.isDestroyed,
                friendly: target && g.areFriendly(u, target), interrupted: trait.interrupted,
                currentTarget: attack.currentTarget?.obj?.name, currentTargetId: attack.currentTarget?.obj?.id,
                nextPayment: trait.nextPayment, funds: f.funds(),
                centerOffsetLeptons: target && Math.hypot(u.position.worldPosition.x - target.position.worldPosition.x,
                    u.position.worldPosition.z - target.position.worldPosition.z),
                actorTile: [u.tile.rx, u.tile.ry], targetTile: target && [target.tile.rx, target.tile.ry],
                cellRangefinding: weapon.rules.cellRangefinding, weaponRange: weapon.range,
                centerDistance: target && range.distance2(u, target) / 256,
                tileDistance: target && range.tileDistance(u, target),
                inRange: target && range.isInWeaponRange(u, target, weapon, g.rules) });
        };
        const start = trait.start, stop = trait.stop, create = attack.createAttackTask;
        trait.start = function(target, game, projectile) {
            const result = start.call(this, target, game, projectile); snapshot('start', target); return result;
        };
        trait.stop = function(game) {
            if (this.getTarget()) snapshot('stop', this.getTarget());
            return stop.call(this, game);
        };
        attack.createAttackTask = function(game, target, tile, weapon, options) {
            f.acquisitions.push({ tick: g.currentTick, target: target?.name, targetId: target?.id,
                weapon: weapon.rules.name, passive: !!options?.passive, drainTarget: trait.getTarget()?.name });
            return create.call(this, game, target, tile, weapon, options);
        };
        const prepare = trait.prepare;
        if (prepare) trait.prepare = function(projectile, target, game) {
            const result = prepare.call(this, projectile, target, game);
            snapshot('prepare', target);
            f.pendingObserved = (f.pendingObserved ?? 0) + Number(this.isEngaged() && !this.getTarget());
            return result;
        };
        f.animationSamples = [];
        f.sampleAnimation = () => {
            if (f.animationDone) return;
            const renderable = d.renderableManager.getRenderableByGameObject(u);
            const plugin = renderable?.plugins.find(p => p.animationName === 'DISKRAY');
            const anim = plugin?.animation, controller = anim?.animation;
            if (trait.getTarget()) f.animationSamples.push({ tick: g.currentTick, target: trait.getTarget().name,
                name: anim?.name, frame: controller?.getCurrentFrame(), state: controller?.getState(),
                loop: controller?.loopNo, loopCount: anim?.getAnimProps()?.loopCount,
                retailLoopCount: anim?.objectArt.art.getNumber('LoopCount', 1),
                attached: !!anim?.get3DObject()?.parent, visible: anim?.mainObj?.get3DObject()?.visible });
            requestAnimationFrame(f.sampleAnimation);
        };
        requestAnimationFrame(f.sampleAnimation);
        f.lastFunds = f.funds();
        f.fundsTimer = setInterval(() => {
            const funds = f.funds();
            if (funds.player !== f.lastFunds.player || funds.enemy !== f.lastFunds.enemy) f.payments.push(funds);
            f.lastFunds = funds;
        }, 10);
    });
    await wait(() => window.__allied.enemy.getOwnedObjects().some(u => u.name === 'HARV'));
    await page.evaluate(() => {
        const d = window.__ra2debug, f = window.__allied;
        // Keep the real delayed free harvester as an acquisition target, with mining isolated.
        f.harvesters = f.enemy.getOwnedObjects().filter(u => u.name === 'HARV');
        for (const unit of f.harvesters) {
            unit.unitOrderTrait.clearOrders(); unit.unitOrderTrait.cancelAllTasks();
            unit.moveTrait.setDisabled(true); unit.attackTrait.setDisabled(true);
        }
        f.before = f.funds();
        d.actionsApi.orderUnits([f.actor.id], 2, f.refinery.id);
        d.worldInteraction.minimapHandler.panToTile(f.refinery.centerTile);
    });
    await wait(() => window.__allied.actor.drainTrait.getTarget() === window.__allied.refinery);
    await startClip();
    await wait(() => window.__allied.player.credits >= window.__allied.before.player + 90, 12000);
    report.money = await page.evaluate(() => {
        const f = window.__allied;
        return { before: f.before, after: f.funds(), binding: f.sample(f.actor),
            target: f.actor.drainTrait.getTarget()?.name, harvesters: f.harvesters.map(u => u.name),
            payments: f.payments.slice() };
    });
    assert.equal(report.money.after.player - report.money.before.player,
        report.money.before.enemy - report.money.after.enemy);
    assert.equal(report.money.target, 'NAREFN');
    assert.equal(report.money.binding.vxlHd, density !== 0);
    await stage('refinery-three-native-payments-with-nearby-harvester');
    await stopClip('refinery-continuous-native-diskray');

    await page.evaluate(() => {
        const d = window.__ra2debug, f = window.__allied;
        d.actionsApi.orderUnits([f.actor.id], 11);
    });
    await wait(() => !window.__allied.actor.drainTrait.getTarget());
    await page.evaluate(() => { window.__allied.stopped = window.__allied.funds(); });
    await wait(() => window.__ra2debug.game.currentTick >= window.__allied.stopped.tick + 65);
    report.stop = await page.evaluate(() => ({ before: window.__allied.stopped,
        after: window.__allied.funds(), acquisitions: window.__allied.acquisitions.slice() }));
    assert.equal(report.stop.after.player, report.stop.before.player);
    assert.equal(report.stop.after.enemy, report.stop.before.enemy);
    assert(report.stop.acquisitions.some(row => row.passive && row.tick >= report.stop.before.tick - 2));

    // A new explicit attack may replace an active drain without waiting for its next transfer.
    await page.evaluate(() => {
        const d = window.__ra2debug, f = window.__allied;
        f.before = f.funds(); d.actionsApi.orderUnits([f.actor.id], 2, f.refinery.id);
    });
    await wait(() => window.__allied.player.credits > window.__allied.before.player);
    await page.evaluate(() => {
        const d = window.__ra2debug, f = window.__allied;
        f.power = f.building('NAPOWR', f.refinery.tile, f.enemy);
        d.actionsApi.orderUnits([f.actor.id], 2, f.power.id);
    });
    await wait(() => window.__allied.actor.drainTrait.getTarget() === window.__allied.power);
    report.manualRetarget = await page.evaluate(() => {
        const f = window.__allied;
        f.powerStarted = f.funds();
        return { oldTargetReleased: !f.refinery.drainedBy?.has(f.actor),
            blackout: f.enemy.powerTrait.externalBlackouts.has(f.actor) };
    });
    assert(report.manualRetarget.oldTargetReleased && report.manualRetarget.blackout);
    await startClip();
    await wait(() => window.__ra2debug.game.currentTick >= window.__allied.powerStarted.tick + 150);
    assert(await page.evaluate(() => {
        const f = window.__allied;
        return f.actor.drainTrait.getTarget() === f.power && f.enemy.powerTrait.externalBlackouts.has(f.actor)
            && f.player.credits === f.powerStarted.player;
    }));
    await stage('power-blackout-retained-with-native-nearby-target');
    await stopClip('power-continuous-native-diskray');
    await page.evaluate(() => {
        const d = window.__ra2debug, f = window.__allied;
        const tile = d.game.map.tiles.getAll().filter(t => d.game.map.isWithinBounds(t)
            && Math.hypot(t.rx - f.actor.tile.rx, t.ry - f.actor.tile.ry) > 10)[0];
        d.actionsApi.orderUnits([f.actor.id], 0, tile.rx, tile.ry);
    });
    await wait(() => !window.__allied.actor.drainTrait.getTarget()
        && !window.__allied.enemy.powerTrait.externalBlackouts.has(window.__allied.actor));
    report.moveCancelsBlackout = true;

    for (const action of ['capture', 'destroy']) {
        await page.evaluate(() => {
            const d = window.__ra2debug, f = window.__allied;
            d.game.changeObjectOwner(f.refinery, f.enemy);
            d.actionsApi.orderUnits([f.actor.id], 2, f.refinery.id);
        });
        await wait(() => window.__allied.actor.drainTrait.getTarget() === window.__allied.refinery);
        await page.evaluate(action => {
            const d = window.__ra2debug, f = window.__allied;
            if (action === 'capture') d.game.changeObjectOwner(f.refinery, f.player);
            else d.game.destroyObject(f.refinery);
        }, action);
        await wait(() => !window.__allied.actor.drainTrait.getTarget());
        report[action + 'EndsDrain'] = true;
    }
    await stage('native-capture-and-destruction-end-drain');
    report.animation = await page.evaluate(() => {
        const f = window.__allied;
        return ['NAREFN', 'NAPOWR'].map(target => {
            // Exclude the initial render frame before the plugin creates its animation.
            const samples = f.animationSamples.filter(s => s.target === target && s.name);
            return { target, samples: samples.length, frames: [...new Set(samples.map(s => s.frame))],
                maxLoop: Math.max(...samples.map(s => s.loop)), retailLoopCount: samples[0]?.retailLoopCount,
                continuous: samples.every(s => s.attached && s.visible && s.state === 1 && s.loopCount === -1) };
        });
    });
    for (const animation of report.animation) {
        assert(animation.samples > 30 && animation.frames.length > 3 && animation.maxLoop >= 2);
        assert(animation.continuous, JSON.stringify(animation));
    }
    report.pendingObserved = await page.evaluate(() => window.__allied.pendingObserved);
    assert(report.pendingObserved > 0);
    report.alignment = await page.evaluate(() => window.__allied.drainEvents
        .filter(e => e.event === 'start').map(e => ({ target: e.target, offsetLeptons: e.centerOffsetLeptons })));
    assert(report.alignment.length >= 4 && report.alignment.every(e => e.offsetLeptons <= 1),
        JSON.stringify(report.alignment));
    assert(await page.evaluate(() => {
        const d = window.__ra2debug, f = window.__allied;
        return !d.renderableManager.getRenderableByGameObject(f.actor).plugins
            .find(p => p.animationName === 'DISKRAY').animation;
    }));
} catch (error) {
    failure = error;
    report.diagnostic = await page.evaluate(() => {
        const f = window.__allied, u = f.actor;
        const tasks = list => list.map(t => ({ name: t.constructor.name, status: t.status,
            targetTile: t.targetTile && [t.targetTile.rx, t.targetTile.ry], offset: t.options?.targetOffset,
            path: t.path?.map(n => [n.tile.rx, n.tile.ry]), children: tasks(t.children) }));
        return { actor: u.position.worldPosition, refinery: f.refinery.position.worldPosition,
            attackState: u.attackTrait.attackState, currentTarget: u.attackTrait.currentTarget?.obj?.name,
            tasks: tasks(u.unitOrderTrait.getTasks()), lastMoveResult: u.moveTrait.lastMoveResult };
    });
}
finally {
    Object.assign(report, await page.evaluate(() => {
        const f = window.__allied;
        clearInterval(f.fundsTimer); f.animationDone = true;
        return { drainEvents: f.drainEvents, acquisitions: f.acquisitions, payments: f.payments, animationSamples: f.animationSamples };
    }));
    await close(failure);
}
if (failure) throw failure;
console.log(report.status);
