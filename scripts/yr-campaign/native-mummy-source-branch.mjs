import assert from 'node:assert/strict';
import { NativeCampaignPilot } from './native-pilot.mjs';
import { advanceSupportedPrisms } from './supported-prism-column.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'all04dmd.map');
assert(process.argv.some(value => value.startsWith('--checkpoint=')));
let failure;
try {
    await pilot.open();
    const source = await pilot.page.evaluate(() => {
        const g = window.__ra2debug.game;
        const pyramid = g.world.getAllObjects().find(actor => actor.name === 'CAEGYP02'
            && actor.isSpawned && !actor.isDestroyed && actor.tile.rx === 77 && actor.tile.ry === 139);
        if (!pyramid) throw Error('The original Mummy 1 pyramid must still be intact');
        const own = g.localPlayer.getOwnedObjects().filter(actor => actor.isSpawned && !actor.isDestroyed);
        return { pyramid: { id: pyramid.id, name: pyramid.name, tile: [77,139], health: pyramid.healthTrait.health },
            prisms: own.filter(actor => actor.name === 'SREF').map(actor => actor.id),
            air: own.filter(actor => actor.name === 'JUMPJET').map(actor => actor.id),
            mummies: g.world.getAllObjects().filter(actor => actor.name === 'MUMY').map(actor => actor.id) };
    });
    assert(source.prisms.length && source.mummies.length === 0);
    pilot.report.source = source;
    await advanceSupportedPrisms(pilot, source.pyramid, source, 'original-mummy-pyramid-ordinary-assault');
    for (let i = 0; i < 30; i++) {
        const arrived = await pilot.page.evaluate(() => window.__ra2debug.game.world.getAllObjects()
            .some(actor => actor.name === 'MUMY' && actor.isSpawned && !actor.isDestroyed));
        if (arrived) break;
        await pilot.commands.step(5, { defend: false, repair: false });
    }
    pilot.report.branch = await pilot.page.evaluate(pyramidId => {
        const g = window.__ra2debug.game, all = g.world.getAllObjects();
        const pyramid = all.find(actor => actor.id === pyramidId);
        return { tick: g.currentTick, pyramidDestroyed: !pyramid || pyramid.isDestroyed,
            inspectionModified: !!g.campaign.inspectionModified,
            actors: all.filter(actor => actor.name === 'MUMY' && actor.isSpawned && !actor.isDestroyed)
                .map(actor => ({ id: actor.id, tile: [actor.tile.rx,actor.tile.ry], health: actor.healthTrait.health })),
            teams: [...g.campaign.teams.instances.values()].filter(team => team.type === '09070B7C')
                .map(team => ({ type: team.type, phase: team.phase,
                    members: team.members.map(actor => ({ id: actor.id, name: actor.name, spawned: actor.isSpawned })) })) };
    }, source.pyramid.id);
    assert(pilot.report.branch.pyramidDestroyed && !pilot.report.branch.inspectionModified);
    assert(pilot.report.branch.actors.length && pilot.report.branch.teams.some(team =>
        team.members.some(actor => actor.name === 'MUMY' && actor.spawned)));
    await pilot.checkpoint('original-mummy-source-branch-checkpoint.json');
    pilot.report.status = 'PASS_ORIGINAL_PYRAMID_DESTRUCTION_TRIGGER_SPAWNS_SOURCE_MUMMY_THROUGH_ORDINARY_ORDERS';
} catch (error) { failure = error; }
await pilot.finish(failure);
