import assert from 'node:assert/strict';
import { NativeCampaignPilot } from './native-pilot.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'all07smd.map');
async function run() {
    let state = await pilot.open();
    let commands = pilot.commands;
    commands.groundDefenders = ['HTNK', 'SHK', 'E2', 'DRON'];
    commands.airDefenders = ['HTK', 'FLAKT']; commands.groundPriority = ['YURI', 'MIND', 'VIRUS'];
    let defenseQueued = false;
    const queueDefense = async () => {
        if (defenseQueued || !state.own.some(unit => unit.name === 'NAWEAP')) return;
        for (const [name, desired] of [['HTNK', 8], ['HTK', 6], ['E2', 15]]) {
            const count = desired - state.own.filter(unit => unit.name === name).length;
            if (count > 0) await commands.queue(name, count);
        }
        await commands.order(['NAWEAP', 'NAHAND'], 0, undefined, [84, 125]);
        defenseQueued = true;
    };
    for (const name of ['NACNST', 'NAPOWR']) {
        const plan = await pilot.page.evaluate(name => {
            const g = window.__ra2debug.game;
            const building = g.world.getAllObjects().find(unit => unit.name === name && !unit.isDestroyed);
            const engineer = g.localPlayer.getOwnedObjects().filter(unit => unit.name === 'ENGINEER' && unit.isSpawned && !unit.isDestroyed)
                .sort((a, b) => Math.hypot(a.tile.rx - building.tile.rx, a.tile.ry - building.tile.ry)
                    - Math.hypot(b.tile.rx - building.tile.rx, b.tile.ry - building.tile.ry))[0];
            return { id: building.id, owner: building.owner.name, health: building.healthTrait.health, engineer: engineer?.id };
        }, name);
        if (plan.health === 100 || plan.owner === 'Americans') continue;
        assert(plan.engineer !== undefined);
        await commands.order([plan.engineer], 15, plan.id);
        for (let i = 0; i < 60; i++) {
            await commands.step(60, { defend: false });
            if (i % 5 === 0) state = await pilot.observe('original-tierra-engineer-repair-' + name + '-' + i);
            const ready = await pilot.page.evaluate(id => {
                const g = window.__ra2debug.game;
                return g.world.hasObjectId(id) && g.world.getObjectById(id).healthTrait.health === 100;
            }, plan.id);
            if (ready) break;
        }
    }
    state = await pilot.observe('original-repaired-soviet-base-and-ownership');
    assert(state.own.some(unit => unit.name === 'NACNST' && unit.health > 0));
    await queueDefense();
    if (!state.own.some(unit => unit.name === 'NAPOWR')) await commands.build('NAPOWR', [80, 132]);
    for (let i = state.own.filter(unit => unit.name === 'NAPOWR').length; i < 3; i++) {
        await commands.build('NAPOWR', [78 + i * 3, 133]);
        state = await pilot.observe('ordinary-tierra-early-soviet-power-' + i);
    }
    for (const [name, tile] of [['NAREFN', [82, 132]], ['NAHAND', [78, 122]], ['NAWEAP', [78, 125]],
        ['NARADR', [78, 128]], ['TESLA', [86, 119]], ['TESLA', [86, 132]],
        ['NATECH', [78, 135]], ['NANRCT', [82, 139]], ['NAMISL', [76, 139]]]) {
        if (!state.own.some(unit => unit.name === name)) await commands.build(name, tile);
        state = await pilot.observe('ordinary-tierra-soviet-base-' + name);
        await pilot.checkpoint('last-tierra-base-checkpoint.json');
        if (name === 'NAWEAP') await queueDefense();
        if (name === 'NARADR') {
            for (const tile of [[84, 120], [83, 126], [87, 130]]) {
                await commands.build('TESLA', tile);
                state = await pilot.observe('ordinary-tierra-critical-yard-defense-' + tile.join('-'));
                await pilot.checkpoint('last-tierra-base-checkpoint.json');
            }
            if (process.argv.includes('--base-only')) {
                await pilot.restart('Original YR Allied07 engineer-repaired Soviet base, paid radar and defenses');
                pilot.report.status = 'PASS_NATIVE_ORIGINAL_ALLIED07_ENGINEER_REPAIR_PAID_BASE_RADAR_DEFENSE_AND_EXACT_RESTART_GOALS_PENDING';
                return;
            }
        }
    }
    if (!state.own.some(unit => unit.name === 'NAWEAP')) {
        await commands.build('NAWEAP', [78, 125]);
        state = await pilot.observe('ordinary-tierra-rebuilt-war-factory');
    }
    await commands.queue('HARV', 2);
    await commands.queue('ZEP', 10);
    for (let i = 0; i < 900; i++) {
        await commands.step(90);
        if (i % 10 === 0) state = await pilot.observe('ordinary-tierra-paid-soviet-air-defense-and-bombers-' + i);
        assert(state.own.some(unit => unit.name === 'NACNST'), 'The original critical Soviet yard was lost');
        if (!state.queues.some(queue => queue.items.some(item => ['HARV', 'HTK', 'HTNK', 'ZEP'].includes(item.name)))
            && state.own.filter(unit => unit.name === 'ZEP').length >= 8) break;
    }
    assert(state.own.filter(unit => unit.name === 'ZEP').length >= 8);
    await pilot.restart('Original YR Allied07 engineer-repaired Soviet yard, original ownership, paid Soviet base and Kirov force');
    commands = pilot.commands;
    await pilot.checkpoint('original-tierra-soviet-base-and-kirovs-checkpoint.json');
    pilot.report.status = 'PASS_NATIVE_ORIGINAL_ALLIED07_ENGINEER_REPAIR_SOVIET_BASE_PAID_KIROVS_AND_MEANINGFUL_RESTART_STAGE';
}
let failure;
try { await run(); }
catch (error) { failure = error; }
await pilot.finish(failure);
