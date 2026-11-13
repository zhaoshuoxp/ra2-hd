import assert from 'node:assert/strict';
import { NativeCampaignPilot } from './native-pilot.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'sov07tmd.map');
let failure;
try {
    let state = await pilot.open(), commands = pilot.commands;
    commands.groundDefenders = ['TTNK', 'HTNK', 'SHK']; commands.airDefenders = ['HTK', 'FLAKT'];
    if (state.queues.some(queue => queue.items.some(item => item.name === 'NAREFN')))
        await commands.cancel('NAREFN', 1);
    await pilot.page.evaluate(() => {
        const d = window.__ra2debug, radar = [...d.game.localPlayer.buildings].find(unit => unit.name === 'NARADR');
        if (!radar) throw Error('Original economy recovery requires the paid optional radar');
        d.actionsApi.sellBuilding(radar.id);
    });
    pilot.report.commands.push({ kind: 'ordinary-radar-sale-to-fund-replacement-miner' });
    await commands.step(120); state = await pilot.observe('ordinary-cancellation-and-radar-sale');
    await commands.queue('HARV', 1);
    for (let i = 0; i < 40 && !state.own.some(unit => unit.name === 'HARV' && unit.spawned); i++) {
        await commands.step(90); state = await pilot.observe('ordinary-replacement-miner-production-' + i);
    }
    assert(state.own.some(unit => unit.name === 'HARV' && unit.spawned), 'Ordinary paid replacement miner failed');
    let previous;
    for (let i = 0; i < 550; i++) {
        const plan = await pilot.page.evaluate(() => {
            const g = window.__ra2debug.game, shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
            const miner = g.localPlayer.getOwnedObjects().find(unit => unit.name === 'HARV' && unit.isSpawned && !unit.isDestroyed);
            if (!miner) return;
            const target = g.world.getAllObjects().filter(unit => unit.isTechno() && unit.isSpawned && !unit.isDestroyed
                && !unit.owner.isNeutral && !g.alliances.areAllied(g.localPlayer, unit.owner)
                && unit.zone !== 1 && !unit.rules.naval && !shroud.isShrouded(unit.tile, unit.tileElevation)
                && !unit.cloakableTrait?.isCloaked()
                && (!unit.disguiseTrait?.isDisguised() || g.localPlayer.sharedDetectDisguiseTrait?.has(unit))
                && Math.hypot(unit.tile.rx - miner.tile.rx, unit.tile.ry - miner.tile.ry) < 12)
                .sort((a, b) => Math.hypot(a.tile.rx - miner.tile.rx, a.tile.ry - miner.tile.ry)
                    - Math.hypot(b.tile.rx - miner.tile.rx, b.tile.ry - miner.tile.ry))[0];
            return { miner: miner.id, tile: [miner.tile.rx, miner.tile.ry], target: target?.id,
                cargo: miner.harvesterTrait?.debugGetState(), health: miner.healthTrait.health };
        });
        assert(plan, 'The ordinary escorted replacement miner was lost');
        const key = plan.target ?? plan.tile.join('-');
        if (key !== previous) {
            await commands.order(['TTNK', 'HTNK', 'SHK'], plan.target === undefined ? 4 : 2, plan.target,
                plan.target === undefined ? plan.tile : undefined); previous = key;
        }
        await commands.step(60, { groundDefenders: [] });
        if (i % 5 === 0) state = await pilot.observe('ordinary-escorted-ore-economy-' + i);
        if (state.credits >= 6000) break;
    }
    state = await pilot.observe('original-recovered-economy'); assert(state.credits >= 6000);
    await pilot.restart('Original YR Soviet07 ordinary escorted miner and recovered ore income');
    commands = pilot.commands;
    await pilot.checkpoint('original-recovered-economy-checkpoint.json');
    pilot.report.status = 'PASS_NATIVE_ORIGINAL_SOVIET07_ORDINARY_ECONOMY_RECOVERY_ESCORT_AND_EXACT_RESTART';
} catch (error) { failure = error; }
await pilot.finish(failure);
