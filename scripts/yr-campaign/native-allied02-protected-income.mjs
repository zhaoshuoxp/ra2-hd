import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { NativeCampaignPilot } from './native-pilot.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'all02umd.map');
let failure;
try {
    let state = await pilot.open();
    const commands = pilot.commands;
    commands.groundDefenders = ['CLNT', 'MTNK', 'SREF', 'E1', 'GGI'];
    commands.airDefenders = ['FV', 'GGI'];
    if (!state.own.some(unit => unit.name === 'GASPYSAT')) {
        await commands.order(['CMIN'], 0, undefined, [167, 120]);
        await commands.order(['CLNT'], 0, undefined, [159, 117]);
        await commands.order(['SREF', 'MTNK'], 0, undefined, [159, 120]);
        await commands.build('GAPOWR', [169, 130]);
        await commands.build('GASPYSAT', [168, 132]);
        await commands.queue('FV', 3);
        await commands.order(['GAWEAP'], 0, undefined, [168, 130]);
    }
    await pilot.checkpoint('original-spy-satellite-mining-defense-checkpoint.json');
    for (let i = 0; i < 600; i++) {
        const plan = await pilot.page.evaluate(() => {
            const g = window.__ra2debug.game, own = g.localPlayer.getOwnedObjects()
                .filter(unit => unit.isSpawned && !unit.isDestroyed);
            const shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
            const ore = g.world.getAllObjects().filter(unit => unit.isOverlay() && unit.isTiberium()
                && !unit.isDestroyed && unit.value > 0
                && !shroud.isShrouded(unit.tile, 0) && Math.hypot(unit.tile.rx - 166, unit.tile.ry - 127) < 33)
                .sort((a, b) => Math.hypot(a.tile.rx - 166, a.tile.ry - 127)
                    - Math.hypot(b.tile.rx - 166, b.tile.ry - 127))[0];
            const miners = own.filter(unit => unit.name === 'CMIN');
            const enemies = g.world.getAllObjects().filter(unit => unit.isUnit() && unit.isSpawned
                && !unit.isDestroyed && unit.owner !== g.localPlayer && !unit.owner.isNeutral
                && !g.alliances.areAllied(g.localPlayer, unit.owner)
                && !shroud.isShrouded(unit.tile, unit.tileElevation) && unit.zone !== 1
                && (!unit.disguiseTrait?.isDisguised() || g.localPlayer.sharedDetectDisguiseTrait?.has(unit))
                && !unit.cloakableTrait?.isCloaked()
                && Math.hypot(unit.tile.rx - 158, unit.tile.ry - 119) < 24)
                .sort((a, b) => Number(b.name === 'YURI') - Number(a.name === 'YURI')
                    || Math.hypot(a.tile.rx - 158, a.tile.ry - 119) - Math.hypot(b.tile.rx - 158, b.tile.ry - 119));
            return { ore: ore && [ore.tile.rx, ore.tile.ry], miners: miners.map(unit => ({ id: unit.id,
                tile: [unit.tile.rx, unit.tile.ry], status: unit.harvesterTrait.status, ore: unit.harvesterTrait.debugGetState(),
                tasks: unit.unitOrderTrait.getTasks().map(task => task.constructor.name) })),
                target: enemies[0] && { id: enemies[0].id, name: enemies[0].name,
                    tile: [enemies[0].tile.rx, enemies[0].tile.ry] } };
        });
        (pilot.report.miningSamples ??= []).push({ tick: state.tick, ...plan });
        if (plan.ore) {
            const close = plan.ore[0] >= 154;
            if (close) for (const miner of plan.miners)
                if (![4, 5, 6, 7, 8].includes(miner.status) && (i % 15 === 0 || miner.status < 2))
                    await commands.order([miner.id], 14, undefined, plan.ore);
            if (!close && i % 8 === 0) {
                await commands.order(['CLNT'], 0, undefined, [plan.ore[0] + 4, plan.ore[1] + 2]);
                await commands.order(['SREF', 'MTNK'], 4, undefined, [plan.ore[0] + 7, plan.ore[1] + 5]);
            }
        }
        if (plan.target) {
            await commands.order(['CLNT'], 2, plan.target.id);
            await commands.order(['SREF', 'MTNK'], 2, plan.target.id);
        }
        await commands.step(90, { defend: false });
        if (i % 5 === 0) {
            state = await pilot.observe('ordinary-hollywood-protected-mining-' + i);
            await pilot.checkpoint('last-protected-mining-checkpoint.json');
        }
        assert(state.own.some(unit => unit.name === 'GACNST'));
        assert(plan.miners.length, 'The ordinary protected miners were lost');
        if (state.credits >= 23000) break;
    }
    state = await pilot.observe('original-hollywood-protected-income');
    await fs.writeFile(path.join(pilot.out, 'mining-observation.json'), JSON.stringify(pilot.report.miningSamples, null, 2) + '\n');
    assert(state.credits >= 23000, 'The original mining economy has not reached the assault budget');
    await pilot.restart('Original YR Allied02 spy satellite, protected miners and earned assault budget');
    await pilot.checkpoint('original-hollywood-protected-income-checkpoint.json');
    pilot.report.status = 'PASS_NATIVE_ORIGINAL_ALLIED02_PROTECTED_MINERS_SATELLITE_AND_PAID_ASSAULT_BUDGET';
} catch (error) { failure = error; }
await pilot.finish(failure);
