import assert from 'node:assert/strict';
import path from 'node:path';
import { NativeCampaignPilot } from './native-pilot.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'sov02smd.map');
let failure;
try {
    await pilot.open();
    let pair;
    for (let i = 0; i < 80 && !pair; i++) {
        pair = await pilot.page.evaluate(() => {
            const g = window.__ra2debug.game, own = g.localPlayer.getOwnedObjects().filter(u => u.isSpawned && !u.isDestroyed);
            const dog = own.find(u => u.name === 'DOG'), victim = dog && own.find(u => u.name === 'E2'
                && Math.hypot(u.tile.rx-dog.tile.rx, u.tile.ry-dog.tile.ry) < 5);
            return victim && { dog: dog.id, victim: victim.id, dogHp: dog.healthTrait.getHitPoints(), victimHp: victim.healthTrait.getHitPoints() };
        });
        if (!pair) await pilot.commands.step(90, { defend: false });
    }
    assert(pair, 'The original landed source dog and conscript must be present'); pilot.report.pair = pair;
    await pilot.page.evaluate(pair => {
        const d = window.__ra2debug, g = d.game;
        d.trainer.setEnabled(true);
        if (!d.trainer.send({ type: 'protect', targets: [g.world.getObjectById(pair.dog), g.world.getObjectById(pair.victim)] }))
            throw Error('Supported target protection rejected');
        window.__dogAudit = { launches: [], returns: [], hits: [] };
        const limbo = g.limboObject, unlimbo = g.unlimboObject;
        g.limboObject = function (u, ...args) { if (u.id === pair.dog) window.__dogAudit.launches.push(g.currentTick); return limbo.call(this,u,...args); };
        g.unlimboObject = function (u, ...args) { if (u.id === pair.dog) window.__dogAudit.returns.push(g.currentTick); return unlimbo.call(this,u,...args); };
        const victim = g.world.getObjectById(pair.victim), damage = victim.healthTrait.inflictDamage;
        victim.healthTrait.inflictDamage = function (amount, source, world) {
            window.__dogAudit.hits.push({ tick: g.currentTick, amount, attacker: source?.obj?.name, health: this.getHitPoints() });
            return damage.call(this,amount,source,world);
        };
        d.worldInteraction.minimapHandler.panToTile(victim.tile);
    }, pair);
    await pilot.commands.step(1, { defend: false });
    await pilot.commands.order([pair.dog], 3, pair.victim);
    pilot.report.protectedSamples = [];
    for (let i = 0; i < 120; i++) {
        await pilot.commands.step(2, { defend: false });
        const sample = await pilot.page.evaluate(pair => {
            const d = window.__ra2debug, g = d.game, owner = g.localPlayer;
            const dog = owner.getOwnedObjectById(pair.dog), victim = owner.getOwnedObjectById(pair.victim);
            return { tick: g.currentTick, dogSpawned: dog?.isSpawned, dogLimbo: !!dog?.limboData,
                dogHp: dog?.healthTrait.getHitPoints(), victimHp: victim?.healthTrait.getHitPoints(),
                protected: d.trainer.session.protectedObjects.has(dog), audit: window.__dogAudit };
        }, pair);
        pilot.report.protectedSamples.push(sample);
        if (sample.audit.returns.length >= 3) break;
    }
    const end = pilot.report.protectedSamples.at(-1);
    assert(end.audit.hits.length >= 3 && end.audit.returns.length >= 3, 'Exercise repeated real dog bites and returns');
    assert(pilot.report.protectedSamples.some(s => s.dogLimbo && s.protected));
    assert(pilot.report.protectedSamples.every(s => s.victimHp === pair.victimHp && s.dogHp === pair.dogHp));
    await pilot.page.screenshot({ path: path.join(pilot.out, 'native-protected-dog-and-bite-target.png') });
    await pilot.page.evaluate(() => {
        const d = window.__ra2debug, g = d.game;
        const home = Number(g.campaign.definition.ini.getSection('Basic').getString('HomeCell'));
        d.worldInteraction.minimapHandler.panToTile(g.map.getTileAtWaypoint(home));
    });
    await pilot.page.waitForTimeout(150);
    await pilot.restart('YR dog protection and repeated bite immunity');
    pilot.report.restoredProtection = await pilot.page.evaluate(pair => {
        const d = window.__ra2debug, g = d.game;
        return [pair.dog,pair.victim].map(id => ({ id, protected: d.trainer.session.protectedObjects.has(g.localPlayer.getOwnedObjectById(id)) }));
    }, pair);
    assert(pilot.report.restoredProtection.every(p => p.protected));
    await pilot.page.evaluate(pair => {
        const d = window.__ra2debug, victim = d.game.localPlayer.getOwnedObjectById(pair.victim);
        if (!d.trainer.send({ type: 'unprotect', targets: [victim] })) throw Error('Supported unprotect rejected');
    }, pair);
    await pilot.commands.step(1, { defend: false });
    await pilot.commands.order([pair.dog], 3, pair.victim);
    for (let i = 0; i < 100; i++) {
        await pilot.commands.step(3, { defend: false });
        if (await pilot.page.evaluate(id => !window.__ra2debug.game.localPlayer.getOwnedObjectById(id)
            || window.__ra2debug.game.localPlayer.getOwnedObjectById(id).isDestroyed, pair.victim)) break;
    }
    pilot.report.unprotectedControl = await pilot.page.evaluate(pair => {
        const d = window.__ra2debug, own = d.game.localPlayer;
        return { victimDead: !own.getOwnedObjectById(pair.victim) || own.getOwnedObjectById(pair.victim).isDestroyed,
            dogAlive: !!own.getOwnedObjectById(pair.dog) && !own.getOwnedObjectById(pair.dog).isDestroyed };
    }, pair);
    assert(pilot.report.unprotectedControl.victimDead && pilot.report.unprotectedControl.dogAlive);
    pilot.report.status = 'PASS_NATIVE_SUPPORTED_DOG_PROTECTION_LIMBO_BITE_IMMUNITY_NAMED_RESTART_AND_UNPROTECTED_CONTROL';
} catch (error) { failure = error; }
await pilot.finish(failure);
