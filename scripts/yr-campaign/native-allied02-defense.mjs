import assert from 'node:assert/strict';
import { NativeCampaignPilot } from './native-pilot.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'all02umd.map');
let failure;
try {
    let state = await pilot.open();
    const commands = pilot.commands; commands.groundDefenders = ['CLNT', 'MTNK', 'SREF', 'E1', 'GGI'];
    commands.airDefenders = ['GGI', 'FV'];
    for (const [name, near] of [['ATESLA', [163, 126]], ['ATESLA', [163, 131]], ['GAPOWR', [177, 128]],
        ['ATESLA', [165, 122]], ['ATESLA', [166, 133]], ['GAPOWR', [178, 134]]]) {
        const psychic = await pilot.page.evaluate(() => {
            const g = window.__ra2debug.game, shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
            const target = g.world.getAllObjects().filter(unit => unit.name === 'YURI' && unit.isSpawned && !unit.isDestroyed
                && !g.alliances.areAllied(g.localPlayer, unit.owner) && !shroud.isShrouded(unit.tile, unit.tileElevation)
                && Math.hypot(unit.tile.rx - 166, unit.tile.ry - 127) < 20)
                .sort((a, b) => a.id - b.id)[0];
            return target?.id;
        });
        if (psychic !== undefined) await commands.order(['CLNT'], 2, psychic);
        await commands.build(name, near); state = await pilot.observe('ordinary-hollywood-fixed-defense-' + name + '-' + near.join('-'));
        await pilot.checkpoint('last-hollywood-defense-checkpoint.json');
    }
    assert(state.own.some(unit => unit.name === 'GACNST'));
    assert(state.own.filter(unit => unit.name === 'ATESLA').length >= 4);
    await commands.order(['MTNK', 'SREF'], 0, undefined, [175, 134]);
    await commands.step(240);
    await pilot.restart('Original YR Allied02 four paid prism towers, power and protected construction base');
    await pilot.checkpoint('original-fortified-hollywood-base-checkpoint.json');
    pilot.report.status = 'PASS_NATIVE_ORIGINAL_ALLIED02_FOUR_PAID_PRISM_TOWERS_POWER_AND_EXACT_RESTART';
} catch (error) { failure = error; }
await pilot.finish(failure);
