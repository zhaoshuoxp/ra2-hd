import { validateTrainerQueues } from './native-queues.mjs';
import { validateTrainerPowers } from './native-powers.mjs';
import { validateTrainerOwnership } from './native-ownership.mjs';
import { validateTrainerInput } from './native-input.mjs';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs/promises';

export async function validateTrainer(page, app, report, out, { smoke = false } = {}) {
    const locale = JSON.parse(await fs.readFile('public/res/locale/zh-CN.json', 'utf8'));
    report.trainer = { category: 'NATIVE_SCRIPTED_SIMULATION_AND_UI', smoke, checks: [] };
    const r = report.trainer;
    r.off = await page.evaluate(() => {
        const d = window.__ra2debug, t = d.trainer, p = d.localPlayer, kb = d.gameScreen.playerUi.worldInteraction.keyboardHandler;
        for (const bot of d.game.botManager.bots.values()) bot.onGameTick = () => {};
        const before = p.credits;
        kb.executeCommand('FreeMoney'); kb.executeCommand('BuildCheat'); kb.executeCommand('ToggleShroud');
        return { enabled: t.preferences.enabled, creditsUnchanged: before === p.credits, pending: t.session.pending,
            controls: !!document.querySelector('.trainer-overlay'), rejects: !t.send({ type: 'credits', mode: 'add', value: 1 }) };
    });
    assert.deepEqual(r.off, { enabled: false, creditsUnchanged: true, pending: 0, controls: false, rejects: true });
    r.checks.push('Default OFF; all three legacy commands and hidden dispatcher blocked');
    await page.evaluate(() => { const menu = window.__ra2debug.gameScreen.menu; menu.open(); menu.controller.pushScreen(4); });
    const master = page.getByRole('checkbox', { name: locale['trainer:enable'], exact: true });
    await master.check();
    await page.getByRole('button', { name: locale['trainer:economy'], exact: true }).click();
    const beforePause = await page.evaluate(() => ({ credits: window.__ra2debug.localPlayer.credits, tick: window.__ra2debug.game.currentTick }));
    await page.locator('[data-trainer-action=addCredits]').click();
    await page.waitForTimeout(200);
    const paused = await page.evaluate(() => ({ credits: window.__ra2debug.localPlayer.credits, pending: window.__ra2debug.trainer.session.pending }));
    assert.equal(paused.credits, beforePause.credits); assert.equal(paused.pending, 1);
    await page.screenshot({ path: path.join(out, 'trainer-paused-options.png') });
    await master.uncheck();
    assert.equal(await page.locator('.trainer-overlay').count(), 0);
    await master.check();
    assert.equal(await page.evaluate(() => window.__ra2debug.trainer.session.pending), 0);
    await page.evaluate(() => window.__ra2debug.trainer.send({ type: 'credits', mode: 'add', value: 10000 }));
    await page.evaluate(() => window.__ra2debug.gameScreen.menu.close());
    await page.waitForFunction(credits => window.__ra2debug.localPlayer.credits === credits + 10000, beforePause.credits);
    assert.equal(await page.evaluate(() => window.__ra2debug.trainer.session.pending), 0);
    r.checks.push('Paused Options shares master; queued action never advances simulation; OFF cancels queue and unmounts toolbar');
    await page.waitForTimeout(150);
    await page.getByRole('button', { name: locale['trainer:targets'], exact: true }).click();
    await page.screenshot({ path: path.join(out, 'trainer-toolbar.png') });
    await page.getByRole('button', { name: locale['trainer:close'], exact: true }).click();
    r.layout = await page.evaluate(() => {
        const d = window.__ra2debug, bar = document.querySelector('.trainer-bar'), rect = bar.getBoundingClientRect();
        return { logicalHeight: bar.offsetHeight, width: rect.width, right: rect.right, viewport: innerWidth, scale: d.gameScreen.viewport.value.scale,
            referenceHeight: d.gameScreen.viewport.value.height, camera: d.worldScene.camera?.get3DObject?.()?.zoom };
    });
    assert(r.layout.logicalHeight <= 32); assert(r.layout.right < r.layout.viewport - 120 * r.layout.scale);
    r.checks.push('Compact toolbar mounted without viewport reservation');
    r.semantics = await page.evaluate(smoke => {
        const d = window.__ra2debug, g = d.game, p = d.localPlayer, t = d.trainer, s = t.session;
        const enemy = g.getCombatants().find(x => x !== p), results = [];
        const check = (ok, message) => { if (!ok) throw new Error(message); results.push(message); };
        // Controlled fixture clock: the production application never advances ticks on behalf of paused trainer actions.
        g.speed.value = g.desiredSpeed.value = Number.EPSILON;
        const step = (n = 1) => { for (let i = 0; i < n; i++) g.update(); };
        const send = command => { check(t.send(command), `Accepted ${command.type}${command.effect ? ':' + command.effect : ''}`); step(); };
        const setEffect = (effect, enabled, value) => send({ type: 'effect', effect, enabled, ...(value === undefined ? {} : { value }) });
        const own = p.getOwnedObjects().find(o => o.isUnit() && o.healthTrait && !o.isDestroyed);
        check(!!own, 'Local selection fixture');
        // Isolate the economy assertion from an AI order queued before its planner was stopped.
        const enemyQueues = enemy.production.getAllQueues().map(queue => [queue, queue.status]);
        for (const [queue, status] of enemyQueues) if (status === 1) queue.status = 2;
        const enemyCredits = enemy.credits;
        send({ type: 'credits', mode: 'set', value: 20000 }); check(p.credits === 20000, 'Set credits');
        send({ type: 'credits', mode: 'add', value: 100 }); check(p.credits === 20100, 'Add credits');
        setEffect('minimum', true, 30000); p.credits = 1; step(); check(p.credits === 30000, 'Maintained minimum');
        check(enemy.credits === enemyCredits, 'AI credits unchanged with prior native production paused for this economy fixture');
        for (const [queue, status] of enemyQueues) queue.status = status;
        setEffect('minimum', false, 30000);
        const powerBefore = p.powerTrait.debugGetState().power;
        setEffect('power', true, 5000); check(p.powerTrait.debugGetState().power === powerBefore + 5000, 'Native local supply bonus');
        setEffect('power', false, 5000); check(p.powerTrait.debugGetState().power === powerBefore, 'Supply removal recalculates native power');
        own.healthTrait.inflictDamage(1, own, g); send({ type: 'heal', targets: [own] }); check(own.healthTrait.health === 100, 'Native full healing');
        send({ type: 'protect', targets: [own] }); own.healthTrait.inflictDamage(20, own, g); check(own.healthTrait.health === 100, 'Ordinary damage protected');
        own.invulnerableTrait.setActiveFor(200, g.currentTick, true);
        send({ type: 'unprotect', targets: [own] }); check(own.invulnerableTrait.isActive(), 'Force Shield independent of unprotect');
        own.healthTrait.inflictDamage(1, own, g); check(own.healthTrait.health < 100, 'Unprotected health API accepts damage');
        send({ type: 'protect', targets: [own] }); send({ type: 'clearProtection' }); check(s.protectedObjects.size === 0, 'Clear all protection');
        const worker = g.getConstructionWorker(p), base = p.getOwnedObjects().find(o => o.rules.constructionYard);
        const tileList = g.map.tiles.getAll().filter(tile => g.map.isWithinBounds(tile));
        const hidden = tileList.find(tile => g.mapShroudTrait.getPlayerShroud(p).isShrouded(tile));
        send({ type: 'reveal' }); check(!hidden || !g.mapShroudTrait.getPlayerShroud(p).isShrouded(hidden), 'One-shot reveal clears shroud');
        const powerName = p.country.side === 0 ? 'GAPOWR' : p.country.side === 1 ? 'NAPOWR' : 'YAPOWR';
        const remote = tileList.find(tile => !worker.canPlaceAt(powerName, tile) && worker.canPlaceAt(powerName, tile, { ignoreAdjacent: true }));
        check(!!remote, 'Remote valid footprint fixture'); setEffect('placement', true);
        check(worker.canPlaceAt(powerName, remote), 'Placement bypasses distance');
        check(!worker.canPlaceAt(powerName, base.tile, { normalizedTile: true }), 'Occupied footprint remains invalid');
        setEffect('placement', false); check(!worker.canPlaceAt(powerName, remote), 'Distance restriction restored');
        if (!smoke) {
            const place = (name, owner = p) => {
                if (owner !== p) g.mapShroudTrait.revealMap(owner, g);
                const cw = g.getConstructionWorker(owner);
                const tile = tileList.filter(x => Math.hypot(x.rx - base.tile.rx, x.ry - base.tile.ry) < 30)
                    .find(x => cw.canPlaceAt(name, x, { ignoreAdjacent: true }));
                if (!tile) throw new Error(`No legal fixture footprint: ${name}`);
                return cw.placeAt(name, tile)[0];
            };
            setEffect('technology', true);
            const infantry = p.country.side === 0 ? 'E1' : p.country.side === 1 ? 'E2' : 'INIT';
            const barracksName = p.country.side === 0 ? 'GAPILE' : p.country.side === 1 ? 'NAHAND' : 'YABRCK';
            const barracks = place(barracksName); step(90);
            const catalog = p.production.getAvailableObjects();
            check(catalog.some(o => o.name === infantry), 'Tech requires and uses real barracks');
            check(catalog.some(o => o.name === 'SNIPE'), 'Tech bypasses country ownership');
            check(catalog.some(o => o.requiresStolenAlliedTech || o.requiresStolenSovietTech || o.requiresStolenThirdTech), 'Stolen technology bypassed');
            check(catalog.every(o => o.techLevel >= 0 && o.buildLimit !== 0), 'Non-playable entries excluded');
            if (s.edition === 'ra2') check(!catalog.some(o => ['INIT', 'BORIS', 'YAPOWR', 'GGI'].includes(o.name)), 'RA2 excludes expansion catalog');
            const rulesSnapshot = JSON.stringify([g.rules.general, ...g.rules.infantryRules.values()].map(x => Object.entries(x).filter(([k]) => ['buildSpeed', 'cost', 'strength', 'techLevel', 'buildTimeMultiplier'].includes(k))));
            const enqueue = (queueType, objectType, name, quantity = 1) => {
                d.actionsApi.queueForProduction(queueType, objectType, name, quantity);
                for (const action of d.actionQueue.dequeueAll()) { action.player = p; action.process(); }
            };
            setEffect('construction', true); enqueue(0, 2, powerName); step();
            const buildingQueue = p.production.getQueue(0); check(buildingQueue.status === 3, 'Building paid to ready in one tick');
            const paidBuilding = buildingQueue.getFirst().creditsSpent;
            const beforeReset = p.credits; send({ type: 'reset' }); check(buildingQueue.getFirst().creditsSpent === paidBuilding && p.credits === beforeReset, 'Reset retains paid building progress');
            // Native cancel action refunds the actual paid amount.
            d.actionsApi.unqueueFromProduction(0, 2, powerName, 1);
            for (const action of d.actionQueue.dequeueAll()) { action.player = p; action.process(); }
            check(p.credits === beforeReset + paidBuilding, 'Cancellation refunds native paid amount');
            setEffect('production', true, 2); enqueue(2, 3, infantry); step(5);
            const iq = p.production.getQueue(2), item = iq.getFirst(); check(item && item.progress > 0 && item.progress < 1, 'Configurable unit production has intermediate progress');
            const partial = item.creditsSpent; setEffect('production', false, 2); check(item.creditsSpent >= partial, 'Removing speed never rewinds paid progress');
            setEffect('production', true, 1); const unitCount = p.getOwnedObjects().filter(o => o.name === infantry).length; step(100);
            check(p.getOwnedObjects().filter(o => o.name === infantry).length > unitCount, 'Native queue spawns completed unit');
            check(JSON.stringify([g.rules.general, ...g.rules.infantryRules.values()].map(x => Object.entries(x).filter(([k]) => ['buildSpeed', 'cost', 'strength', 'techLevel', 'buildTimeMultiplier'].includes(k)))) === rulesSnapshot, 'Shared base rules unchanged');
            const target = g.createUnitForPlayer(g.rules.getObject('E2', 3), enemy);
            const free = tileList.find(tile => g.map.terrain.getPassableSpeed(tile, target.rules.speedType, true, false) > 0 && !g.map.getGroundObjectsOnTile(tile).some(o => o.isTechno() || o.isTerrain()));
            g.spawnObject(target, free); target.attackTrait.setDisabled(true); target.moveTrait.setDisabled(true);
            send({ type: 'transfer', targets: [target] }); check(target.owner === p && p.getOwnedObjects().includes(target) && !enemy.getOwnedObjects().includes(target), 'Native transfer updates both owner registries');
            send({ type: 'protect', targets: [target] }); g.changeObjectOwner(target, enemy); g.changeObjectOwner(target, p); check(!s.protectedObjects.has(target), 'Ownership cycle never restores protection');
            const powerBuilding = place(powerName, enemy); step(90);
            const beforeCapture = p.powerTrait.debugGetState().power;
            send({ type: 'transfer', targets: [powerBuilding] }); check(powerBuilding.owner === p && p.powerTrait.debugGetState().power > beforeCapture, 'Building transfer updates native supply');
            const swBuildings = s.edition === 'yr' ? ['GACSPH', 'GAWEAT', 'NAMISL', 'NAIRON', 'AMRADR', 'YAPPET', 'YAGNTC', 'NAPSIS', 'NARADR', 'GATECH'] : ['GACSPH', 'GAWEAT', 'NAMISL', 'NAIRON', 'AMRADR'];
            setEffect('power', true, 100000);
            for (const name of swBuildings) place(name); step(90);
            const powers = p.superWeaponsTrait.getAll(); check(powers.length >= (s.edition === 'yr' ? 10 : 5), 'Owned special power fixtures granted natively');
            for (const sw of powers) { sw.resetTimer(); sw.resumeTimer(); }
            send({ type: 'ready' }); check(powers.every(sw => sw.status === 2), 'All eligible owned powers readied');
            const names = powers.map(sw => sw.name); results.push(`Owned powers: ${names.join(', ')}`);
            setEffect('recharge', true); powers[0].resetTimer(); step(); check(powers[0].status === 2, 'Recharge bypass is sustained');
            setEffect('recharge', false); powers[0].resetTimer(); step(); check(powers[0].status !== 2, 'Recharge removal returns native timer');
            // Preserve a live fixture for subsequent targeting and keyboard UI checks.
            window.trainerFixture = { own, target, base, barracks, names, step, enqueue, place };
        }
        check(!t.send({ type: 'credits', mode: 'set', value: NaN }), 'Non-finite credits rejected');
        check(!t.send({ type: 'effect', effect: 'production', enabled: true, value: 121 }), 'Out-of-range duration rejected');
        const envelope = { session: 'stale', edition: s.edition, actor: p, command: { type: 'reveal' } };
        check(!s.dispatch(envelope), 'Stale session rejected');
        send({ type: 'reset' }); check(Object.values(s.effects).every(x => !x) && !s.protectedObjects.size, 'Reset clears all sustained features');
        check(d.gameScreen.replay.trainerModified, 'Replay marked modified');
        let blocked = false; try { d.gameScreen.replay.serialize(); } catch { blocked = true; } check(blocked, 'Invalid modified replay cannot serialize');
        t.setEnabled(false); check(!t.send({ type: 'reveal' }), 'OFF blocks dispatcher after changes'); t.setEnabled(true);
        g.speed.value = g.desiredSpeed.value = 6;
        return results;
    }, smoke);
    r.checks.push(...r.semantics);
    if (!smoke) await validateTrainerQueues(page, report);
    if (!smoke) await validateTrainerOwnership(page, report);
    if (!smoke) await validateTrainerPowers(page, report);
    if (!smoke) await validateTrainerInput(page, app, report, out, locale);
    await page.screenshot({ path: path.join(out, 'trainer-features.png') });
    await page.evaluate(() => window.__ra2debug.trainer.setEnabled(false));
    assert.equal(await page.locator('.trainer-overlay').count(), 0);
    r.status = 'PASS';
}
