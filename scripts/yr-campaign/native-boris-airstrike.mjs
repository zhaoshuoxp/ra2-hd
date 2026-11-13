import assert from 'node:assert/strict';
import { NativeCampaignPilot } from './native-pilot.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'sov03umd.map');
const targetName = process.argv.find(value => value.startsWith('--target='))?.slice(9) ?? 'NASAM';
const policy = Number(process.argv.find(value => value.startsWith('--expect-policy='))?.slice(16) ?? 45);
assert(['NASAM', 'NAPSYB'].includes(targetName));
let failure;
try {
    await pilot.open();
    assert.equal(pilot.report.launch.semanticsVersion, policy);
    pilot.report.scope = 'One ordinary attack on a revealed source building with read-only weapon, guidance and task observation. No world, actor, health, RNG or source changes; no complete mission or HD art acceptance.';
    const target = await pilot.page.evaluate(name => {
        const g = window.__ra2debug.game, shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
        const boris = g.localPlayer.getOwnedObjects().find(unit => unit.name === 'BORIS' && !unit.isDestroyed);
        if (!boris) throw Error('The original Boris unit is absent');
        return g.world.getAllObjects().filter(unit => unit.name === name && !unit.isDestroyed
            && unit.owner !== g.localPlayer && !g.alliances.areAllied(g.localPlayer, unit.owner)
            && !shroud.isShrouded(unit.tile, unit.tileElevation))
            .sort((a, b) => Math.hypot(a.tile.rx-boris.tile.rx, a.tile.ry-boris.tile.ry)
                - Math.hypot(b.tile.rx-boris.tile.rx, b.tile.ry-boris.tile.ry))
            .map(unit => ({ id: unit.id, name: unit.name, tile: [unit.tile.rx, unit.tile.ry] }))[0];
    }, targetName);
    assert(target); pilot.report.target = target;
    await pilot.page.evaluate(() => {
        const g = window.__ra2debug.game, before = g.getHash();
        window.__borisDamageAudit = [];
        window.__borisPlaneDepartures = [];
        window.__borisPlaneUnspawn = g.unspawnObject;
        g.unspawnObject = function (object, ...args) {
            if (object.isAircraft?.() && object.name === 'BPLN') window.__borisPlaneDepartures.push({
                id: object.id, tick: g.currentTick, position: object.position.worldPosition.toArray(),
                tile: [object.tile.rx, object.tile.ry], withinMap: g.map.mapBounds.isWithinHardBounds(object.tile),
                realTile: !!g.map.tiles.getByMapCoords(object.tile.rx, object.tile.ry) });
            return window.__borisPlaneUnspawn.call(this, object, ...args);
        };
        window.__borisDamageSubscription = g.events.subscribe(event => {
            if (event.target?.name !== 'BORIS' || typeof event.damageHitPoints !== 'number') return;
            const source = event.attacker, attacker = source?.obj ?? source;
            window.__borisDamageAudit.push({ tick: g.currentTick, damage: event.damageHitPoints,
                health: event.currentHealth, weapon: source?.weapon?.rules.name,
                attacker: attacker && { id: attacker.id, name: attacker.name,
                    owner: attacker.owner?.name, tile: attacker.tile && [attacker.tile.rx, attacker.tile.ry],
                    primary: attacker.primaryWeapon?.rules.name, secondary: attacker.secondaryWeapon?.rules.name } });
        });
        if (g.getHash() !== before) throw Error('Read-only damage observation changed the source world');
    });
    await pilot.commands.order(['BORIS'], 2, target.id);
    pilot.report.airstrikeSamples = [];
    for (let i = 0; i < 160; i++) {
        await pilot.commands.step(15, { defend: false, repair: false });
        const sample = await pilot.page.evaluate(targetId => {
            const g = window.__ra2debug.game;
            const task = (value, depth = 0) => ({ name: value.constructor.name, status: value.status,
                cancelling: value.isCancelling(), target: value.target?.obj?.id,
                children: depth < 3 ? value.children?.map(child => task(child, depth+1)) : undefined });
            const describe = unit => unit && ({ id: unit.id, name: unit.name, health: unit.healthTrait.health,
                spawned: unit.isSpawned, destroyed: unit.isDestroyed, tile: [unit.tile.rx, unit.tile.ry],
                moving: unit.moveTrait?.isMoving(), position: unit.position.worldPosition.toArray(),
                withinMap: g.map.mapBounds.isWithinHardBounds(unit.tile), attackTarget: unit.attackTrait?.currentTarget?.obj?.id,
                tasks: unit.unitOrderTrait?.getTasks().map(value => task(value)) });
            const boris = g.localPlayer.getOwnedObjects(true).find(unit => unit.name === 'BORIS');
            const strike = boris?.airstrikeTrait;
            const target = g.world.hasObjectId(targetId) ? g.world.getObjectById(targetId) : undefined;
            return { tick: g.currentTick, boris: describe(boris), target: describe(target),
                targetPower: target?.owner.powerTrait && { power: target.owner.powerTrait.power, drain: target.owner.powerTrait.drain },
                readyAt: strike?.readyAt, guidedTarget: strike?.getTarget()?.id, designatedTarget: strike?.target?.id,
                planes: strike?.planes.map(({ plane }) => describe(plane)) ?? [],
                incomingDamage: window.__borisDamageAudit.splice(0) };
        }, target.id);
        pilot.report.airstrikeSamples.push(sample);
        if ((!sample.target || sample.target.destroyed) && (!process.argv.includes('--observe-return') || !sample.planes.length)) break;
        if (!sample.boris || sample.boris.destroyed) { pilot.report.originalHeroLost = true; break; }
    }
    pilot.report.departures = await pilot.page.evaluate(() => window.__borisPlaneDepartures);
    if (process.argv.includes('--observe-return')) {
        assert(pilot.report.airstrikeSamples.some(s => s.planes.length), 'The ordinary order must launch actual strike aircraft');
        assert(pilot.report.departures.length > 0, 'The surviving strike aircraft must complete their return');
        assert(pilot.report.departures.every(p => !p.withinMap && !p.realTile), 'Strike aircraft must fly out beyond the map edge before removal');
    }
    await pilot.checkpoint('observed-original-airstrike-checkpoint.json');
    await pilot.observe('original-airstrike-observation-complete');
    pilot.report.status = 'PASS_NATIVE_ORIGINAL_SINGLE_ORDER_AIRSTRIKE_OBSERVATION_ONLY';
} catch (error) { failure = error; }
await pilot.session?.page.evaluate(() => window.__borisDamageSubscription?.unsubscribe()).catch(() => {});
await pilot.session?.page.evaluate(() => {
    if (window.__borisPlaneUnspawn) window.__ra2debug.game.unspawnObject = window.__borisPlaneUnspawn;
}).catch(() => {});
await pilot.finish(failure);
