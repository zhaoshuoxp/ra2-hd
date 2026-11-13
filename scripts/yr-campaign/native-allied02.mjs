import assert from 'node:assert/strict';
import { NativeCampaignPilot } from './native-pilot.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'all02umd.map');
let failure;
try {
    let state = await pilot.open();
    const commands = pilot.commands; commands.groundDefenders = ['E1', 'GGI', 'MTNK', 'SREF', 'BFRT']; commands.airDefenders = ['GGI', 'FV', 'BFRT'];
    const has = name => state.own.some(unit => unit.name === name && unit.spawned);
    if (!has('GACNST')) {
        const cell = await pilot.page.evaluate(() => {
            const g = window.__ra2debug.game, unit = g.localPlayer.getOwnedObjects().find(unit => unit.name === 'AMCV');
            const worker = g.getConstructionWorker(unit.owner);
            const tile = g.map.tiles.getAll().filter(tile => g.map.mapBounds.isWithinPlayerBounds(tile)
                && Math.hypot(tile.rx - unit.tile.rx, tile.ry - unit.tile.ry) < 10
                && worker.canPlaceAt(unit.rules.deploysInto, tile, { ignoreObjects: [unit], ignoreAdjacent: true }))
                .sort((a, b) => Math.hypot(a.rx - 167, a.ry - 128) - Math.hypot(b.rx - 167, b.ry - 128))[0];
            if (!tile) throw Error('No legal original Hollywood MCV deployment cell');
            return [tile.rx, tile.ry];
        });
        await commands.order(['AMCV'], 0, undefined, cell); await commands.step(180);
        await commands.order(['AMCV'], 9); await commands.step(180); state = await pilot.observe('original-hollywood-base-deployment');
        assert(has('GACNST'));
    }
    const fortress = state.own.find(unit => unit.name === 'BFRT' && unit.spawned);
    if (fortress && !fortress.passengers?.length) {
        await commands.order(['GGI'], 17, fortress.id); await commands.step(240);
        state = await pilot.observe('ordinary-original-fortress-boarding');
    }
    if (state.tick < 3000) {
        await commands.order(['GGI'], 0, undefined, [167, 124]);
        await commands.order(['E1'], 0, undefined, [165, 126]);
        await commands.step(150, { defend: false }); await commands.order(['GGI'], 9);
    }
    for (const [name, near] of [['GAPOWR', [171, 128]], ['GAREFN', [171, 122]], ['GAPILE', [164, 131]],
        ['GAWEAP', [175, 132]], ['AMRADR', [169, 134]]]) {
        if (!has(name)) { await commands.build(name, near); state = await pilot.observe('ordinary-hollywood-base-' + name); }
        if (name === 'GAPILE' && state.own.filter(unit => unit.name === 'GGI').length < 10) await commands.queue('GGI', 8);
        if (name === 'GAWEAP' && !has('MTNK')) await commands.queue('MTNK', 6);
        if (name === 'GAWEAP') await commands.order(['GAWEAP'], 0, undefined, [171, 131]);
        await pilot.checkpoint('last-hollywood-base-checkpoint.json');
    }
    if (state.own.filter(unit => unit.name === 'GAPOWR').length < 2) {
        await commands.build('GAPOWR', [173, 131]); state = await pilot.observe('ordinary-hollywood-second-power');
    }
    if (state.own.filter(unit => unit.name === 'GAREFN').length < 2) {
        await commands.build('GAREFN', [175, 125]); state = await pilot.observe('ordinary-hollywood-second-refinery');
    }
    if (!has('GATECH')) { await commands.build('GATECH', [166, 137]); state = await pilot.observe('ordinary-hollywood-battle-lab'); }
    if (state.own.filter(unit => unit.name === 'GAPOWR').length < 3) {
        await commands.build('GAPOWR', [172, 137]); state = await pilot.observe('ordinary-hollywood-third-power');
    }
    if (!has('GAWEAP')) { await commands.build('GAWEAP', [175, 132]); state = await pilot.observe('ordinary-protected-replacement-factory'); }
    const baseOnly = process.argv.includes('--base-only');
    if (!baseOnly) {
        if (!has('SREF')) await commands.queue('SREF', 12);
        await commands.order(['GAWEAP'], 0, undefined, [158, 129]);
        for (let i = 0; i < 600; i++) {
            await commands.step(120); state = await pilot.observe('ordinary-hollywood-prism-production-' + i);
            if (state.own.filter(unit => unit.name === 'SREF' && unit.spawned).length >= 12) break;
        }
        assert(state.own.filter(unit => unit.name === 'SREF' && unit.spawned).length >= 12, 'Ordinary paid Hollywood prism force is incomplete');
    }
    await pilot.restart(baseOnly ? 'Original YR Allied02 Hollywood paid base'
        : 'Original YR Allied02 Hollywood paid base and twelve prism tanks');
    await pilot.checkpoint(baseOnly ? 'original-hollywood-paid-base-checkpoint.json' : 'original-hollywood-prism-base-checkpoint.json');
    pilot.report.status = baseOnly ? 'PASS_NATIVE_ORIGINAL_ALLIED02_PAID_BASE_AND_EXACT_RESTART_GOALS_PENDING'
        : 'PASS_NATIVE_ORIGINAL_ALLIED02_PAID_BASE_PRISM_FORCE_AND_EXACT_RESTART_GOALS_PENDING';
} catch (error) { failure = error; }
await pilot.finish(failure);
