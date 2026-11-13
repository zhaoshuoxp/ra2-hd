import assert from 'node:assert/strict';
import { NativeCampaignPilot } from './native-pilot.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'all01umd.map');
let failure;
try {
    let state = await pilot.open();
    let lastTarget, returnedArmor = false;
    for (let i = 0; i < 220 && !state.result; i++) {
        const fight = await pilot.page.evaluate(() => {
            const g = window.__ra2debug.game, shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
            if (!g.campaign.machine.variables.get('3') || g.campaign.inputLocked) return;
            const target = g.world.getAllObjects().filter(unit => unit.isTechno() && unit.isSpawned && !unit.isDestroyed
                && ['Special', 'Soviet2House'].includes(unit.owner.name) && !unit.rules.insignificant
                && !shroud.isShrouded(unit.tile, unit.tileElevation))
                .sort((a, b) => Math.hypot(a.tile.rx - 95, a.tile.ry - 105)
                    - Math.hypot(b.tile.rx - 95, b.tile.ry - 105))[0];
            return { target: target?.id, name: target?.name, owner: target?.owner.name };
        });
        if (fight && !returnedArmor) {
            await pilot.commands.order(['MTNK', 'MGTK'], 4, undefined, [103, 110]); returnedArmor = true;
        }
        if (fight?.target !== undefined && fight.target !== lastTarget) {
            await pilot.commands.order(['MTNK', 'MGTK', 'GGI'], 3, fight.target); lastTarget = fight.target;
            (pilot.report.originalArmorDefense ??= []).push(fight);
        }
        await pilot.commands.step(90, { defend: false });
        if (i % 5 === 0) state = await pilot.observe('original-countdown-time-warp-and-tanya-' + i);
        const ready = await pilot.page.evaluate(() => {
            const g = window.__ra2debug.game;
            return !!g.campaign.machine.variables.get('3') && !g.campaign.inputLocked
                && g.localPlayer.getOwnedObjects().some(unit => unit.name === 'TANY' && unit.isSpawned && !unit.isDestroyed);
        });
        if (ready) break;
    }
    pilot.report.transition = await pilot.page.evaluate(() => {
        const g = window.__ra2debug.game;
        return { tick: g.currentTick, timeWarp: !!g.campaign.machine.variables.get('3'), locked: g.campaign.inputLocked,
            owned: g.localPlayer.getOwnedObjects().filter(unit => !unit.isDestroyed)
                .map(unit => ({ id: unit.id, name: unit.name, tile: [unit.tile.rx, unit.tile.ry], spawned: unit.isSpawned })),
            dominators: g.world.getAllObjects().filter(unit => unit.name === 'YAPPPT' && !unit.isDestroyed)
                .map(unit => ({ id: unit.id, tile: [unit.tile.rx, unit.tile.ry], owner: unit.owner.name })) };
    });
    assert(pilot.report.transition.timeWarp, 'Original time warp has not occurred');
    assert(pilot.report.transition.owned.some(unit => unit.name === 'TANY'), 'Original Tanya reinforcement is absent');
    await pilot.restart('Original YR Allied01 time warp and Tanya arrival');
    await pilot.checkpoint('original-tanya-arrival-checkpoint.json');
    pilot.report.status = 'PASS_NATIVE_ORIGINAL_ALLIED01_TIME_WARP_TANYA_AND_EXACT_RESTART_GOALS_PENDING';
} catch (error) { failure = error; }
await pilot.finish(failure);
