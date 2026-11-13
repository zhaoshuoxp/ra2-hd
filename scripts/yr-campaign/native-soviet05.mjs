import assert from 'node:assert/strict';
import { NativeCampaignPilot } from './native-pilot.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'sov05umd.map');
let failure;
try {
    let state = await pilot.open(), commands = pilot.commands;
    commands.groundDefenders = ['HTNK', 'SHK', 'DRON', 'APOC'];
    const has = name => state.own.some(unit => unit.name === name && unit.spawned);
    if (!has('NACNST') && !has('SMCV')) {
        await commands.order(['SUB', 'SQD', 'HYD', 'DRED'], 0, undefined, [143, 41]);
        await commands.order(['SAPC'], 0, undefined, [139, 54]);
        for (let i = 0; i < 65; i++) {
            await commands.step(60); state = await pilot.observe('ordinary-northern-landing-' + i);
            const boats = state.own.filter(unit => unit.name === 'SAPC' && unit.spawned);
            if (boats.every(unit => Math.hypot(unit.tile[0] - 139, unit.tile[1] - 54) < 7)) break;
        }
        await commands.order(['SAPC'], 10);
        for (let i = 0; i < 45 && !has('SMCV'); i++) {
            await commands.step(60); state = await pilot.observe('original-mcv-unloading-' + i);
        }
        assert(has('SMCV'), 'Original MCV has not landed through ordinary transport unloading');
    }
    if (!has('NACNST')) {
        const deployment = await pilot.page.evaluate(() => {
            const g = window.__ra2debug.game, mcv = g.localPlayer.getOwnedObjects().find(unit => unit.name === 'SMCV');
            const worker = g.getConstructionWorker(mcv.owner);
            const tile = g.map.tiles.getAll().filter(tile => g.map.mapBounds.isWithinPlayerBounds(tile)
                && Math.hypot(tile.rx - mcv.tile.rx, tile.ry - mcv.tile.ry) < 12
                && worker.canPlaceAt(mcv.rules.deploysInto, tile, { ignoreObjects: [mcv], ignoreAdjacent: true }))
                .sort((a, b) => Math.hypot(a.rx - 136, a.ry - 59) - Math.hypot(b.rx - 136, b.ry - 59))[0];
            if (!tile) throw Error('No legal ordinary landing-base deployment cell');
            return [tile.rx, tile.ry];
        });
        await commands.order(['SMCV'], 0, undefined, deployment); await commands.step(360);
        await commands.order(['SMCV'], 9);
        for (let i = 0; i < 20 && !has('NACNST'); i++) {
            await commands.step(60); state = await pilot.observe('ordinary-original-mcv-deployment-' + i);
        }
        assert(has('NACNST'), 'Original ordinary MCV deployment failed');
        await pilot.checkpoint('original-deployed-mcv-checkpoint.json');
    }
    await commands.order(['SAPC'], 0, undefined, [143, 42]);
    await commands.order(['HTNK', 'HTK'], 4, undefined, [135, 65]);
    for (const [name, tile] of [['NAPOWR', [140, 58]], ['NAREFN', [132, 62]], ['NAHAND', [138, 62]]]) {
        if (has(name)) continue;
        await commands.build(name, tile); state = await pilot.observe('ordinary-paid-northern-base-' + name);
        await pilot.checkpoint('last-base-checkpoint.json');
    }
    if (!has('NATECH')) {
        for (const goal of [[137, 65], [130, 67]]) {
            await commands.build('NABNKR', goal); state = await pilot.observe('ordinary-frontier-bunker');
            const bunker = state.own.filter(unit => unit.name === 'NABNKR').sort((a, b) => b.id - a.id)[0];
            const squad = state.own.filter(unit => unit.name === 'E2' && unit.spawned).slice(0, 5).map(unit => unit.id);
            if (squad.length) { await commands.order(squad, 8, bunker.id); await commands.step(180); }
        }
        await commands.queue('SHK', 6);
        for (const [name, tile] of [['NAWEAP', [130, 66]], ['NARADR', [135, 58]], ['NAPOWR', [143, 61]],
            ['TESLA', [134, 68]], ['TESLA', [141, 64]], ['NATECH', [130, 60]]]) {
            if (name !== 'TESLA' && name !== 'NAPOWR' && has(name)) continue;
            await commands.build(name, tile); state = await pilot.observe('ordinary-secured-base-' + name);
            if (name === 'NAWEAP') await commands.queue('DRON', 3);
            await pilot.checkpoint('last-base-checkpoint.json');
        }
    }
    if (!process.argv.includes('--assault-only')) {
        await pilot.restart('Original YR Soviet05 ordinary landing and established northern base');
        commands = pilot.commands; state = await pilot.observe('original-restored-northern-base');
        await pilot.checkpoint('original-base-checkpoint.json');
    }
    if (process.argv.includes('--base-only')) {
        pilot.report.status = 'PASS_NATIVE_ORIGINAL_SOVIET05_LANDING_PAID_BASE_AND_EXACT_RESTART_FINAL_GOALS_PENDING';
    } else {
        if (!has('NANRCT')) { await commands.build('NANRCT', [141, 59]); state = await pilot.observe('ordinary-nuclear-base-power'); }
        if (state.own.filter(unit => unit.name === 'NAREFN').length < 2) {
            await commands.build('NAREFN', [129, 62]); state = await pilot.observe('ordinary-second-refinery');
        }
        for (const [name, count] of [['APOC', 4], ['ZEP', 4]]) await commands.queue(name, count);
        await commands.order(['NAWEAP'], 0, undefined, [135, 66]);
        for (let i = 0; i < 400; i++) {
            await commands.step(120); state = await pilot.observe('ordinary-paid-sub-pen-assault-production-' + i);
            if (state.own.filter(unit => unit.name === 'ZEP' && unit.spawned).length >= 4) break;
            assert(has('NAWEAP') && has('HARV'), 'The original northern production economy was lost');
            if (i % 30 === 0) await pilot.checkpoint('last-production-checkpoint.json');
        }
        assert(state.own.filter(unit => unit.name === 'ZEP' && unit.spawned).length >= 4,
            'Ordinary paid Kirov production has not completed');
        await pilot.checkpoint('ordinary-paid-kirov-assault-checkpoint.json');
        for (const goal of [[96, 58], [72, 89], [51, 130], [75, 181], [111, 182], [137, 168]]) {
            await commands.order(['ZEP'], 0, undefined, goal);
            for (let i = 0; i < 120; i++) {
                await commands.step(60);
                if (i % 5 === 0) state = await pilot.observe('ordinary-western-air-assault-' + goal.join('-') + '-' + i);
                const ships = state.own.filter(unit => unit.name === 'ZEP' && unit.spawned);
                assert(ships.length, 'The ordinary western Kirov approach was lost');
                if (ships.every(unit => Math.hypot(unit.tile[0] - goal[0], unit.tile[1] - goal[1]) < 5)) break;
            }
            await pilot.checkpoint('last-kirov-approach-checkpoint.json');
        }
        let targetAssigned;
        for (let i = 0; i < 700 && !state.result; i++) {
            const goal = await pilot.page.evaluate(() => {
                const g = window.__ra2debug.game, shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
                const pen = g.world.getAllObjects().find(unit => unit.name === 'YAYARD' && !unit.isDestroyed);
                return pen && { id: pen.id, visible: g.map.tileOccupation.calculateTilesForGameObject(pen.tile, pen)
                    .some(tile => !shroud.isShrouded(tile, pen.tileElevation)) };
            });
            if (goal?.visible && targetAssigned !== goal.id) {
                await commands.order(['ZEP'], 2, goal.id); targetAssigned = goal.id;
            } else if (goal && targetAssigned === undefined && i % 30 === 0)
                await commands.order(['ZEP'], 0, undefined, [137, 154]);
            await commands.step(60);
            if (i % 5 === 0) state = await pilot.observe('original-sub-pen-and-iris-objective-' + i);
            if (goal) assert(state.own.some(unit => unit.name === 'ZEP'), 'The ordinary sub-pen assault was lost');
        }
        state = await pilot.observe('original-iris-result'); assert.equal(state.result, 'victory');
        pilot.report.status = `PASS_NATIVE_ORIGINAL_${pilot.report.launch.difficulty.toUpperCase()}_SOVIET05_LANDING_BASE_RESTART_SUB_PEN_IRIS_AND_SOURCE_VICTORY`;
    }
} catch (error) { failure = error; }
await pilot.finish(failure);
