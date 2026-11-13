import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { campaignSession, waitWorld, stepWorld } from '../m3-2/native-session.mjs';
const out = path.resolve(process.argv[2]);
await fs.mkdir(out, { recursive: false });
const report = {
    status: 'RUNNING', errors: [], failedResources: [], observations: [],
    scope: 'Fresh original Allied03 civilian reinforcements and passive player fire. No player attack, trainer, reveal, spawn, health/rule/source/objective or RNG edit. The original harmless opening passersby remain excluded.'
};
let app, page;
try {
    ({ app, page } = await campaignSession(out, report, { density: 2 }));
    await page.evaluate(() => window.__ra2debug.mainMenuController.screens.get(22).launchPrepared('all03u.map'));
    await waitWorld(page, 'all03u.map');
    report.setup = await page.evaluate(() => {
        const g = window.__ra2debug.game;
        window.__civilianDamage = [];
        window.__civilianSpawns = [];
        const observe = target => {
            if (target.isInfantry() && target.rules.civilian) {
                window.__civilianSpawns.push({
                    tick: g.currentTick, id: target.id, name: target.name,
                    weapon: target.primaryWeapon?.name, insignificant: target.rules.insignificant
                });
                const inflict = target.healthTrait.inflictDamage;
                target.healthTrait.inflictDamage = function (amount, source, world) {
                    window.__civilianDamage.push({
                        tick: g.currentTick, target: target.id, targetOwner: target.owner.name,
                        amount, armed: !!target.primaryWeapon, insignificant: target.rules.insignificant, attacker: source?.obj?.id, attackerOwner: source?.player?.name, weapon: source?.weapon?.name
                    });
                    return inflict.call(this, amount, source, world);
                };
            }
        };
        g.world.getAllObjects().forEach(observe);
        const create = g.createObject;
        g.createObject = function (...args) { const target = create.apply(this, args); observe(target); return target; };
        return { launch: g.campaign.launch, sourceTaskForce: '0B76E6CC', sourceTeams: ['0B76EA4C', '0B76E59C', '0A148DCC'] };
    });
    for (let ticks = 0; ticks < 16000; ticks += 150) {
        await stepWorld(page, 150);
        const observation = await page.evaluate(() => {
            const g = window.__ra2debug.game;
            return {
                tick: g.currentTick, spawned: window.__civilianSpawns, damage: window.__civilianDamage,
                sourceHordes: [...g.campaign.teams.instances.values()].filter(t => ['0B76EA4C', '0B76E59C', '0A148DCC'].includes(t.type))
                    .map(t => ({
                    type: t.type, phase: t.phase, members: t.members.map(u => ({ id: u.id, name: u.name,
                        spawned: u.isSpawned, tile: [u.tile.rx, u.tile.ry] }))
                }))
            };
        });
        report.observations.push(observation);
        if (observation.damage.some(hit => hit.attackerOwner === 'Player House' && hit.amount > 0 && !hit.armed))
            break;
    }
    assert(report.observations.at(-1).sourceHordes.length > 0, 'Original armed hordes never arrived');
    assert(report.observations.at(-1).damage.some(hit => hit.attackerOwner === 'Player House' && hit.amount > 0 && !hit.armed), 'Player forces never passively damaged a source-spawned unarmed civilian');
    await page.screenshot({ path: path.join(out, 'native-passive-hostile-civilian-fire.png') });
    assert.deepEqual(report.errors, []);
    assert.deepEqual(report.failedResources, []);
    report.status = 'PASS_ACTUAL_PASSIVE_FIRE_ON_ORIGINAL_UNARMED_HOSTILE_CIVILIANS';
}
catch (error) {
    report.status = 'FAIL';
    report.error = error.stack;
    process.exitCode = 1;
    await page?.screenshot({ path: path.join(out, 'failure.png') }).catch(() => { });
}
finally {
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await app?.close();
}
console.log(JSON.stringify({ status: report.status, error: report.error, out }));
