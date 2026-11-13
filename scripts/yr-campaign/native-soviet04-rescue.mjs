import assert from 'node:assert/strict';
import { NativeCampaignPilot } from './native-pilot.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'sov04dmd.map');
let failure;
try {
    let state = await pilot.open(), commands = pilot.commands;
    const scouts = state.own.filter(unit => unit.name === 'DRON').slice(0, 2).map(unit => unit.id);
    assert.equal(scouts.length, 2, 'Resume the legitimately produced rescue scouts');
    commands.groundDefenders = ['HTNK', 'E2', ...state.own.filter(unit => unit.name === 'DRON' && !scouts.includes(unit.id)).map(unit => unit.id)];
    await commands.order(scouts, 4, undefined, [110, 115]);
    if (!state.own.some(unit => unit.name === 'TESLA')) await commands.build('TESLA', [82, 128]);
    for (let i = 0; i < 30; i++) {
        state = await pilot.observe('ordinary-rescue-transport-ready-' + i);
        if (state.own.some(unit => unit.name === 'HTK')) break;
        await commands.step(60);
    }
    const transport = state.own.find(unit => unit.name === 'HTK'); assert(transport);
    const engage = async () => {
        const targets = await pilot.page.evaluate(scouts => {
            const g = window.__ra2debug.game;
            if (g.campaign.inputLocked) return;
            const own = g.localPlayer.getOwnedObjects().filter(unit => scouts.includes(unit.id) && !unit.isDestroyed);
            const shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
            const target = g.world.getAllObjects().filter(unit => unit.name === 'YURI' && unit.isSpawned && !unit.isDestroyed
                && !shroud.isShrouded(unit.tile, unit.tileElevation) && !unit.cloakableTrait?.isCloaked()
                && own.some(scout => Math.hypot(scout.tile.rx - unit.tile.rx, scout.tile.ry - unit.tile.ry) < 14))
                .sort((a, b) => a.id - b.id)[0];
            return target && { id: target.id, owner: target.owner.name };
        }, scouts);
        if (targets) await commands.order(scouts, 3, targets.id);
    };
    for (const goal of [[110, 115], [135, 88], [147, 77], [138, 70]]) {
        await commands.order(scouts, 4, undefined, goal);
        await commands.order([transport.id], 0, undefined, goal);
        for (let i = 0; i < 55; i++) {
            await engage(); await commands.step(60); state = await pilot.observe('original-escorted-discovery-' + goal.join('-') + '-' + i);
            if (state.own.some(unit => unit.name === 'RMNV') && !await pilot.page.evaluate(() => window.__ra2debug.game.campaign.inputLocked)) break;
            const truck = state.own.find(unit => unit.id === transport.id);
            assert(truck, 'The ordinary rescue transport was lost');
            if (Math.hypot(truck.tile[0] - goal[0], truck.tile[1] - goal[1]) < 3
                && state.own.some(unit => scouts.includes(unit.id) && Math.hypot(unit.tile[0] - goal[0], unit.tile[1] - goal[1]) < 3)) break;
        }
        if (state.own.some(unit => unit.name === 'RMNV')) break;
    }
    for (let i = 0; i < 50 && !state.own.some(unit => unit.name === 'RMNV'); i++) {
        await engage(); await commands.step(60); state = await pilot.observe('original-romanov-recovery-' + i);
    }
    const romanov = state.own.find(unit => unit.name === 'RMNV'); assert(romanov, 'Original Romanov has not been freed');
    await commands.order([transport.id], 0, undefined, [139, 72]);
    await commands.step(120, { defend: false }); await commands.order([transport.id], 11);
    for (let i = 0; i < 50; i++) {
        await engage();
        await commands.order([romanov.id], 17, transport.id);
        await commands.step(60); state = await pilot.observe('ordinary-romanov-boarding-' + i);
        if (state.own.find(unit => unit.id === transport.id)?.passengers?.includes(romanov.id)) break;
    }
    assert(state.own.find(unit => unit.id === transport.id)?.passengers?.includes(romanov.id), 'Ordinary Romanov boarding did not complete');
    await pilot.checkpoint('original-romanov-boarded-checkpoint.json');
    for (const goal of [[147, 77], [135, 88], [110, 115], [95, 141]]) {
        await commands.order([transport.id], 0, undefined, goal);
        for (let i = 0; i < 50; i++) {
            await commands.step(60); state = await pilot.observe('ordinary-romanov-safe-return-' + goal.join('-') + '-' + i);
            const truck = state.own.find(unit => unit.id === transport.id); assert(truck, 'The ordinary rescue transport was lost');
            if (Math.hypot(truck.tile[0] - goal[0], truck.tile[1] - goal[1]) < 3) break;
        }
    }
    await pilot.restart('Original YR Soviet04 Romanov in an ordinary allied transport');
    await pilot.checkpoint('rescued-romanov-base-checkpoint.json');
    pilot.report.status = 'PASS_NATIVE_ORIGINAL_SOVIET04_DISCOVERY_ORDINARY_ROMANOV_TRANSPORT_AND_NAMED_RESTART_FINAL_BASES_PENDING';
} catch (error) { failure = error; }
await pilot.finish(failure);
