import assert from 'node:assert/strict';
import { NativeCampaignPilot } from './native-pilot.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'all04dmd.map');
let failure;
try {
    let state = await pilot.open();
    const helicopter = state.own.find(unit => unit.name === 'SHAD');
    assert(helicopter);
    await pilot.commands.order(['TANY'], 17, helicopter.id);
    await pilot.commands.step(180, { defend: false });
    state = await pilot.observe('tanya-aboard-original-nighthawk');
    assert(state.own.find(unit => unit.id === helicopter.id)?.passengers?.length);
    await pilot.commands.order(['SHAD'], 0, undefined, [83, 96]);
    for (let i = 0; i < 30; i++) {
        await pilot.commands.step(90, { defend: false });
        state = await pilot.observe('ordinary-pyramid-overflight-' + i);
        const transport = state.own.find(unit => unit.id === helicopter.id);
        if (!transport || Math.hypot(transport.tile[0] - 83, transport.tile[1] - 96) < 2) break;
    }
    pilot.report.overflight = await pilot.page.evaluate(() => {
        const g = window.__ra2debug.game;
        return { variables: Object.fromEntries(g.campaign.machine.variables), trace: g.campaign.trace,
            objects: g.localPlayer.getOwnedObjects(true).filter(unit => ['SHAD', 'TANY'].includes(unit.name))
                .map(unit => ({ id: unit.id, name: unit.name, spawned: unit.isSpawned,
                    tile: [unit.tile.rx, unit.tile.ry], cargo: unit.transportTrait?.units.map(u => u.name) })) };
    });
    assert(!pilot.report.overflight.variables['2'], 'A living transported Tanya must not trigger Tanya lost');
    assert(!pilot.report.overflight.variables['3'], 'Overflight cannot complete the original prison rescue');
    pilot.report.status = 'PASS_ORIGINAL_TANYA_TRANSPORT_PYRAMID_OVERFLIGHT_NO_DEATH_OR_RESCUE';
} catch (error) { failure = error; }
await pilot.finish(failure);
