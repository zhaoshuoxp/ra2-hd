import assert from 'node:assert/strict';
import { NativeCampaignPilot } from './native-pilot.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'all07smd.map');
let failure;
try {
    let state = await pilot.open();
    let commands = pilot.commands;
    commands.groundDefenders = ['HTNK', 'E2', 'MTNK', 'MGTK', 'SREF'];
    commands.airDefenders = ['HTK', 'FV']; commands.groundPriority = ['YURI', 'MIND', 'VIRUS'];
    commands.autoForceShield = true; commands.autoDominatorCounterstrike = true;
    await commands.order(['MGTK'], 0, undefined, [84, 125]);
    await commands.order(['MTNK', 'SREF', 'FV'], 0, undefined, [100, 184]);
    await commands.step(180);
    const deployment = await pilot.page.evaluate(() => {
        const g = window.__ra2debug.game;
        const mcv = g.localPlayer.getOwnedObjects().find(unit => unit.name === 'AMCV' && unit.isSpawned && !unit.isDestroyed);
        if (!mcv) return;
        const worker = g.getConstructionWorker(g.localPlayer);
        const tile = g.map.tiles.getAll().filter(tile => Math.hypot(tile.rx - mcv.tile.rx, tile.ry - mcv.tile.ry) < 12
            && worker.canPlaceAt('GACNST', tile, { ignoreAdjacent: true, ignoreObjects: [mcv] }))
            .sort((a, b) => Math.hypot(a.rx - mcv.tile.rx, a.ry - mcv.tile.ry)
                - Math.hypot(b.rx - mcv.tile.rx, b.ry - mcv.tile.ry))[0];
        if (!tile) throw Error('No legal original Allied MCV deployment cell');
        return { id: mcv.id, cell: [tile.rx, tile.ry] };
    });
    if (deployment) {
        await commands.order([deployment.id], 0, undefined, deployment.cell);
        for (let i = 0; i < 40; i++) {
            await commands.step(60);
            const ready = await pilot.page.evaluate(id => {
                const g = window.__ra2debug.game, mcv = g.world.getAllObjects().find(unit => unit.id === id);
                return !mcv ? 'deployed' : !mcv.moveTrait.isMoving()
                    && g.getConstructionWorker(g.localPlayer).canPlaceAt('GACNST', mcv.tile,
                        { ignoreAdjacent: true, ignoreObjects: [mcv] }) ? 'ready' : 'moving';
            }, deployment.id);
            if (ready === 'deployed') break;
            if (ready === 'ready') await commands.order([deployment.id], 9);
        }
    }
    state = await pilot.observe('original-tierra-allied-chrono-mcv-deployment-and-soviet-relief');
    assert(state.own.some(unit => unit.name === 'GACNST'));
    assert(state.own.some(unit => unit.name === 'NACNST'));
    await pilot.checkpoint('original-two-faction-construction-yards-checkpoint.json');
    for (const [name, tile, required = 1] of [['GAPOWR', [107, 196]], ['GAREFN', [106, 191]], ['GAPILE', [105, 199]],
        ['GAWEAP', [102, 192]], ['AMRADR', [108, 199]], ['GATECH', [103, 198]], ['GASPYSAT', [105, 197]],
        ['ATESLA', [109, 190]],
        ['ATESLA', [100, 194], 2], ['ATESLA', [106, 200], 3],
        ['GAPOWR', [107, 198], 2], ['GAPOWR', [101, 198], 3]]) {
        if (state.own.filter(unit => unit.name === name).length < required) await commands.build(name, tile);
        state = await pilot.observe('ordinary-tierra-allied-economy-' + name);
        await pilot.checkpoint('last-allied-economy-checkpoint.json');
        if (name === 'GAWEAP') {
            await commands.queue('CMIN', 2);
            await commands.order(['GAWEAP'], 0, undefined, [105, 194]);
        }
    }
    for (let i = 0; i < 700; i++) {
        await commands.step(90);
        if (i % 10 === 0) {
            state = await pilot.observe('ordinary-tierra-two-faction-income-' + i);
            await pilot.checkpoint('last-allied-economy-checkpoint.json');
        }
        assert(state.own.some(unit => unit.name === 'NACNST'), 'The original critical Soviet yard was lost');
        if (state.credits >= 20000 && state.own.filter(unit => unit.name === 'CMIN').length >= 2) break;
    }
    assert(state.credits >= 20000);
    await pilot.restart('Original YR Allied07 repaired Soviet base, chrono-arrived Allied base and paid safe mining income');
    await pilot.checkpoint('original-two-faction-economy-checkpoint.json');
    pilot.report.status = 'PASS_NATIVE_ORIGINAL_ALLIED07_REPAIRED_SOVIET_BASE_CHRONO_ALLIED_MCV_TWO_FACTIONS_ECONOMY_AND_RESTART_STAGE';
} catch (error) { failure = error; }
await pilot.finish(failure);
