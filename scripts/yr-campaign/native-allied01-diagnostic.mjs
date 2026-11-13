import fs from 'node:fs/promises';
import path from 'node:path';
import { NativeCampaignPilot } from './native-pilot.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'all01umd.map');
let failure;
try {
    await pilot.open();
    await pilot.page.evaluate(() => {
        const g = window.__ra2debug.game, proto = Object.getPrototypeOf(g.localPlayer.getOwnedObjects()[0].position);
        const move = proto.moveToTileCoords;
        proto.moveToTileCoords = function (...args) {
            try { return move.apply(this, args); }
            catch (error) {
                const actor = g.world.getAllObjects().find(unit => unit.position === this);
                const cell = tile => tile && [tile.rx, tile.ry];
                const vector = value => value && [value.x, value.y, value.z];
                const task = value => value && { type: value.constructor.name, status: value.status,
                    target: cell(value.targetTile), targetOffset: vector(value.targetOffset),
                    waypoint: vector(value.currentWaypointLeptons), destination: vector(value.destinationLeptons),
                    path: value.path?.map(node => cell(node.tile)), children: value.children?.map(task) };
                window.__originalMoveFailure = { tick: g.currentTick, args, id: actor?.id, name: actor?.name,
                    owner: actor?.owner?.name, tile: actor && [actor.tile.rx, actor.tile.ry],
                    positionOffset: vector(actor?.position.getTileOffset()),
                    task: task(actor?.unitOrderTrait?.getCurrentTask?.()),
                    locomotor: actor?.moveTrait?.locomotor?.constructor.name,
                    move: actor?.moveTrait?.debugGetState?.() };
                throw error;
            }
        };
    });
    const steps = await pilot.page.evaluate(() => window.__ra2debug.game.currentTick < 7000 ? 70 : 0);
    for (let i = 0; i < steps; i++) {
        await pilot.commands.step(15, { defend: false });
        if (i % 5 === 0) await pilot.observe('original-transition-diagnostic-' + i);
    }
    await pilot.checkpoint('last-uninterrupted-transition-checkpoint.json');
    pilot.report.diagnostic = await pilot.page.evaluate(() => {
        const g = window.__ra2debug.game, owner = g.getAllPlayers().find(player => player.name === 'Confederation');
        const rules = g.rules.getBuilding('YAPPPT');
        return { tick: g.currentTick, rules: { techLevel: rules.techLevel, prerequisite: rules.prerequisite,
            owner: rules.owner, cost: rules.cost, strength: rules.strength, factory: rules.factory },
            owner: { credits: owner.credits, defeated: owner.defeated, country: owner.country.name,
                techLevel: owner.techLevel, buildings: [...owner.buildings].map(unit => ({ name: unit.name,
                    tile: [unit.tile.rx, unit.tile.ry], live: !unit.isDestroyed, spawned: unit.isSpawned })),
                available: owner.production.isAvailableForProduction(rules, true),
                queues: [...owner.production.queues].map(([type, queue]) => ({ type, status: queue.status,
                    items: queue.getAll().map(item => ({ name: item.rules.name, quantity: item.quantity })) })) },
            baseTrace: g.campaign.baseBuilder.trace };
    });
    await pilot.commands.step(300, { defend: false });
    pilot.report.status = 'OBSERVED_ORIGINAL_TRANSITION_DIAGNOSTIC';
} catch (error) {
    failure = error;
    pilot.report.moveFailure = await pilot.page.evaluate(() => window.__originalMoveFailure).catch(() => undefined);
    await fs.writeFile(path.join(pilot.out, 'read-only-move-failure.json'), JSON.stringify(pilot.report.moveFailure, null, 2) + '\n');
}
await pilot.finish(failure);
