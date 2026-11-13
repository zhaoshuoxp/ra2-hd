import assert from 'node:assert/strict';
import { NativeCampaignPilot } from './native-pilot.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'sov06lmd.map');
let failure;
try {
    let state = await pilot.open(), commands = pilot.commands;
    commands.groundDefenders = ['HTNK', 'LUNR']; commands.airDefenders = ['LUNR'];
    const has = name => state.own.some(unit => unit.name === name && unit.spawned);
    if (!has('NACNST') && has('SMCV')) {
        const cell = await pilot.page.evaluate(() => {
            const g = window.__ra2debug.game, unit = g.localPlayer.getOwnedObjects().find(unit => unit.name === 'SMCV');
            const worker = g.getConstructionWorker(unit.owner);
            const tile = g.map.tiles.getAll().filter(tile => g.map.mapBounds.isWithinPlayerBounds(tile)
                && Math.hypot(tile.rx - unit.tile.rx, tile.ry - unit.tile.ry) <= 15
                && worker.canPlaceAt(unit.rules.deploysInto, tile, { ignoreObjects: [unit], ignoreAdjacent: true }))
                .sort((a, b) => Math.hypot(a.rx - 126, a.ry - 138) - Math.hypot(b.rx - 126, b.ry - 138))[0];
            if (!tile) throw Error('No legal ordinary Moon base deployment cell');
            return [tile.rx, tile.ry];
        });
        await commands.order(['SMCV'], 0, undefined, cell); await commands.step(360);
        await commands.order(['SMCV'], 9); await commands.step(180); state = await pilot.observe('ordinary-moon-base-deployment');
        assert(has('NACNST'), 'Original MCV has not established the Moon base');
    }
    await commands.order(['HTNK'], 4, undefined, [116, 133]);
    await commands.order(['LUNR'], 0, undefined, [121, 140]);
    for (const [name, tile] of [['NAPOWR', [130, 137]], ['NAHAND', [127, 133]]]) {
        if (!has(name)) { await commands.build(name, tile); state = await pilot.observe('ordinary-moon-base-' + name); }
    }
    pilot.report.originalLunarProduction = await pilot.page.evaluate(() => {
        const g = window.__ra2debug.game, rules = g.rules.infantryRules.get('LUNR');
        return { sourcePrerequisite: rules.prerequisite, available: g.localPlayer.production.isAvailableForProduction(rules),
            hasFactory: g.localPlayer.production.hasFactoryFor(rules),
            meetsPrerequisites: g.localPlayer.production.meetsPrerequisites(rules), credits: g.localPlayer.credits,
            techLevel: rules.techLevel, productionTechLevel: g.localPlayer.production.maxTechLevel };
    });
    await pilot.checkpoint('original-moon-barracks-checkpoint.json');
    assert(pilot.report.originalLunarProduction.available, 'Original lunar infantry cannot enter ordinary production: '
        + JSON.stringify(pilot.report.originalLunarProduction));
    await commands.order(['NAHAND'], 0, undefined, [121, 140]);
    const committed = state.own.filter(unit => unit.name === 'LUNR' && unit.spawned).length
        + state.queues.flatMap(queue => queue.items).filter(item => item.name === 'LUNR')
            .reduce((sum, item) => sum + item.quantity, 0);
    if (committed < 45) await commands.queue('LUNR', 45 - committed);
    let previousTarget, replacements = false;
    for (let i = 0; i < 500; i++) {
        const target = await pilot.page.evaluate(() => {
            const g = window.__ra2debug.game, shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
            const army = g.localPlayer.getOwnedObjects().filter(unit => unit.name === 'LUNR' && unit.isSpawned && !unit.isDestroyed);
            if (!army.length) return;
            const center = army.reduce((sum, unit) => [sum[0] + unit.tile.rx / army.length,
                sum[1] + unit.tile.ry / army.length], [0, 0]);
            return g.world.getAllObjects().filter(unit => unit.isTechno() && unit.isSpawned && !unit.isDestroyed
                && !unit.owner.isNeutral && !g.alliances.areAllied(g.localPlayer, unit.owner)
                && !shroud.isShrouded(unit.tile, unit.tileElevation) && !unit.cloakableTrait?.isCloaked()
                && Math.hypot(unit.tile.rx - center[0], unit.tile.ry - center[1]) < 12)
                .sort((a, b) => Number(b.name === 'YTNK') - Number(a.name === 'YTNK')
                    || Math.hypot(a.tile.rx - center[0], a.tile.ry - center[1])
                    - Math.hypot(b.tile.rx - center[0], b.tile.ry - center[1]))[0]?.id;
        });
        if (target !== undefined && target !== previousTarget) await commands.order(['LUNR'], 2, target);
        else if (target === undefined && (previousTarget !== undefined || i % 10 === 0))
            await commands.order(['LUNR'], 0, undefined, [121, 140]);
        previousTarget = target;
        await commands.step(90, { defend: false }); state = await pilot.observe('ordinary-paid-moon-infantry-' + i);
        if (state.own.filter(unit => unit.name === 'LUNR' && unit.spawned).length >= 42) break;
        assert(has('NAHAND'), 'Original Moon barracks lost during ordinary infantry production');
        if (!replacements && !state.queues.some(queue => queue.items.some(item => item.name === 'LUNR'))) {
            assert(state.credits >= 12000, 'Original limited Moon reserve cannot fund the ordinary replacements');
            await commands.queue('LUNR', 35); replacements = true;
        }
    }
    assert(state.own.filter(unit => unit.name === 'LUNR' && unit.spawned).length >= 40,
        'Ordinary source lunar infantry production did not complete');
    await pilot.restart('Original YR Soviet06 Moon base and paid lunar infantry');
    commands = pilot.commands; commands.groundDefenders = ['HTNK']; commands.airDefenders = [];
    await pilot.checkpoint('original-moon-force-checkpoint.json');
    pilot.report.status = 'PASS_NATIVE_ORIGINAL_SOVIET06_MOON_BASE_PAID_INFANTRY_AND_RESTART_GOALS_PENDING';
} catch (error) { failure = error; }
await pilot.finish(failure);
