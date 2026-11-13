import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { NativeCampaignPilot } from './native-pilot.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'all05umd.map');
let failure;
async function support(initial = false) {
    return pilot.page.evaluate(initial => {
        const d = window.__ra2debug, g = d.game;
        if (g.campaign.inputLocked || g.campaign.result) return;
        d.trainer.setEnabled(true);
        const targets = g.localPlayer.getOwnedObjects().filter(unit => unit.isTechno() && unit.isSpawned
            && !unit.isDestroyed && !unit.isCrashing && unit.healthTrait.getHitPoints() > 0);
        const commands = [{ type: 'protect', targets }];
        if (initial) commands.push({ type: 'reveal' }, { type: 'heal', targets },
            { type: 'credits', mode: 'set', value: 5000000 },
            { type: 'effect', effect: 'power', enabled: true, value: 100000 },
            { type: 'effect', effect: 'production', enabled: true, value: 1 },
            { type: 'effect', effect: 'construction', enabled: true });
        if (!commands.every(command => d.trainer.send(command))) throw Error('Supported feedback trainer command rejected');
    }, initial);
}
async function audit(label) {
    const sample = await pilot.page.evaluate(label => {
        const d = window.__ra2debug, g = d.game, c = g.campaign;
        const describe = unit => ({ id: unit.id, name: unit.name, owner: unit.owner.name,
            health: unit.healthTrait?.health, spawned: unit.isSpawned, destroyed: unit.isDestroyed,
            limbo: unit.limboData && { keys: Object.keys(unit.limboData),
                transport: unit.limboData.transport?.id },
            tile: [unit.tile.rx, unit.tile.ry], naval: unit.rules.naval, insignificant: unit.rules.insignificant,
            aircraft: unit.isAircraft(), target: unit.attackTrait?.currentTarget?.obj?.id });
        const houses = ['BadGuy1 House', 'BadGuy2 House'].map(name => ({ name,
            objects: c.resolveHouse(name).getOwnedObjects(true)
                .filter(unit => !unit.isDestroyed && !unit.rules.insignificant && unit.isTechno()
                    && !unit.isAircraft()).map(describe) }));
        const { groups, placedBindings, tiles, ...terrain } = d.terrainHd;
        return { label, tick: g.currentTick, result: c.result, houses,
            actors: structuredClone(d.sovietUnitsHd), environment: structuredClone(d.environmentHd),
            terrain: structuredClone(terrain), gpu: structuredClone(d.renderer.renderer.info.memory),
            owned: g.localPlayer.getOwnedObjects().filter(unit => ['ROBO', 'JUMPJET', 'DEST'].includes(unit.name))
                .map(describe), trace: c.trace.filter(row => [1, 2, 56].includes(row.opcode)) };
    }, label);
    pilot.report.feedbackSamples.push(sample);
    await fs.writeFile(path.join(pilot.out, 'feedback-progress.json'), JSON.stringify(pilot.report, null, 2)+'\n');
    return sample;
}
try {
    let state = await pilot.open();
    assert.equal(pilot.report.launch.semanticsVersion, 48);
    pilot.report.scope = 'Supported invulnerability, map reveal, credits, power and accelerated production exercise the reported trainer play configuration. '
        + 'All construction, movement and attacks use normal serialized player actions. Original source actors, rules, tasks, triggers and results are unchanged. '
        + 'This modified-play regression qualifies victory conditions, live resource behavior and supported save paths; it gives no unmodified mission-goal credit.';
    pilot.report.feedbackSamples = [];
    await support(true); await pilot.commands.step(1, { defend: false });
    const build = [['GAPOWR', [45, 111]], ['GAPILE', [48, 113]], ['AMRADR', [43, 100]],
        ['GAWEAP', [47, 108]], ['GATECH', [42, 107]], ['GAROBO', [42, 112]], ['GASPYSAT', [44, 105]]];
    for (const [name, tile] of build) {
        const exists = await pilot.page.evaluate(name => window.__ra2debug.game.localPlayer
            .getOwnedObjects().some(unit => unit.name === name && !unit.isDestroyed), name);
        if (!exists) await pilot.commands.build(name, tile);
        await support();
    }
    for (const [name, wanted] of [['ROBO', 36], ['JUMPJET', 16], ['DEST', 6]]) {
        const count = await pilot.page.evaluate(name => window.__ra2debug.game.localPlayer.getOwnedObjects()
            .filter(unit => unit.name === name && !unit.isDestroyed).length, name);
        if (count < wanted) await pilot.commands.queue(name, wanted-count);
    }
    for (let i = 0; i < 180; i++) {
        await support(); await pilot.commands.step(30, { defend: false });
        const counts = await pilot.page.evaluate(() => {
            const own = window.__ra2debug.game.localPlayer.getOwnedObjects().filter(unit => unit.isSpawned && !unit.isDestroyed);
            return Object.fromEntries(['ROBO', 'JUMPJET', 'DEST'].map(name => [name, own.filter(unit => unit.name === name).length]));
        });
        if (counts.ROBO >= 36 && counts.JUMPJET >= 16 && counts.DEST >= 6) break;
    }
    await pilot.checkpoint('supported-feedback-force-checkpoint.json');
    state = await audit('supported-original-force-ready');
    assert(state.owned.filter(unit => unit.name === 'ROBO').length >= 30);
    const assigned = {};
    for (let i = 0; i < 2400 && !state.result; i++) {
        await support();
        const plan = await pilot.page.evaluate(() => {
            const g = window.__ra2debug.game, shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
            const enemy = ['BadGuy1 House', 'BadGuy2 House'].flatMap(name => g.campaign.resolveHouse(name).getOwnedObjects())
                .filter(unit => unit.isTechno() && unit.isSpawned && !unit.isDestroyed
                    && (!unit.rules.insignificant || unit.garrisonTrait?.isOccupied())
                    && !unit.cloakableTrait?.isCloaked()
                    && (!unit.disguiseTrait?.isDisguised() || g.localPlayer.sharedDetectDisguiseTrait?.has(unit))
                    && g.map.tileOccupation.calculateTilesForGameObject(unit.tile, unit)
                        .some(tile => !shroud.isShrouded(tile, unit.tileElevation)));
            const own = g.localPlayer.getOwnedObjects().filter(unit => unit.isUnit() && unit.isSpawned && !unit.isDestroyed);
            const orders = [];
            for (const name of ['ROBO', 'JUMPJET', 'DEST']) {
                const force = own.filter(unit => unit.name === name);
                if (!force.length) continue;
                const center = force.reduce((sum, unit) => [sum[0]+unit.tile.rx/force.length,
                    sum[1]+unit.tile.ry/force.length], [0, 0]);
                const distance = unit => Math.hypot(unit.tile.rx-center[0], unit.tile.ry-center[1]);
                const targets = enemy.filter(target => name !== 'DEST' || target.rules.naval)
                    .filter(target => force.some(unit => unit.attackTrait.selectWeaponVersus(unit, target, g, false, true)))
                    .sort((a, b) => Number(b.name === 'MIND')-Number(a.name === 'MIND')
                        || Number(b.isBuilding())-Number(a.isBuilding()) || distance(a)-distance(b) || a.id-b.id);
                const target = targets[0];
                if (target) orders.push({ name, target: target.id, type: target.name,
                    tile: [target.tile.rx, target.tile.ry], force: force.length });
            }
            return { orders, inputLocked: g.campaign.inputLocked, result: g.campaign.result };
        });
        if (!plan.inputLocked && !plan.result) for (const order of plan.orders) {
            if (assigned[order.name] !== order.target || i % 60 === 0) {
                await pilot.commands.order([order.name], 2, order.target); assigned[order.name] = order.target;
            }
        }
        await pilot.commands.step(45, { defend: false });
        if (i % 20 === 0 || await pilot.page.evaluate(() => !!window.__ra2debug.game.campaign.result)) {
            state = await audit('ordinary-supported-source-targets-'+i);
            if (i % 100 === 0 && !state.result) await pilot.checkpoint('last-supported-feedback-checkpoint.json');
        }
    }
    state = await audit('final-source-victory-conditions');
    assert.equal(state.result, 'victory', 'Original Allied05 victory must follow real source-house clearance');
    await pilot.completeResultFlow();
    pilot.report.status = 'PASS_SUPPORTED_TRAINER_ALLIED05_SOURCE_HOUSES_CLEARED_ORIGINAL_VICTORY_AND_LIVE_HD_RESOURCES';
} catch (error) { failure = error; }
await pilot.finish(failure);
