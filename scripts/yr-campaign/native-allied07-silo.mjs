import assert from 'node:assert/strict';
import { NativeCampaignPilot } from './native-pilot.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'all07smd.map');
let failure;
try {
    let state = await pilot.open();
    const commands = pilot.commands;
    commands.groundDefenders = ['HTNK', 'E2', 'MTNK', 'MGTK'];
    commands.airDefenders = ['HTK', 'FV']; commands.groundPriority = ['MIND', 'YURI', 'VIRUS'];
    commands.autoForceShield = true;
    for (let i = 0; i < 5200 && !state.result; i++) {
        const plan = await pilot.page.evaluate(() => {
            const g = window.__ra2debug.game, shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
            const all = [9, 14].flatMap(id => g.campaign.resolveHouse(id).getOwnedObjects(true))
                .filter(unit => !unit.isDestroyed && !unit.rules.insignificant && !unit.isAircraft());
            const point = unit => {
                const foundation = unit.isBuilding() ? unit.art?.foundation : undefined;
                return [unit.tile.rx + Math.floor((foundation?.width ?? 1) / 2),
                    unit.tile.ry + Math.floor((foundation?.height ?? 1) / 2)];
            };
            const visible = all.filter(unit => unit.isSpawned && !unit.rules.invisibleInGame && unit.rules.legalTarget !== false
                && !unit.cloakableTrait?.isCloaked() && !shroud.isShrouded(unit.tile, unit.tileElevation)
                && (!unit.disguiseTrait?.isDisguised() || g.localPlayer.sharedDetectDisguiseTrait?.has(unit)));
            const weapon = g.localPlayer.superWeaponsTrait.getAll().find(weapon => weapon.rules.type === 0);
            const ground = visible.filter(unit => unit.zone !== 1);
            const score = target => ({ YACNST: 100, YAWEAP: 80, YABRCK: 70, YAREFN: 40 }[target.name] ?? 0)
                + ground.reduce((sum, unit) => sum + (Math.hypot(...point(unit).map((value, i) => value - point(target)[i])) < 7
                    ? unit.isBuilding() ? 8 : 2 : 0), 0);
            const target = weapon?.status === 2 && ground.sort((a, b) => score(b) - score(a) || a.id - b.id)[0];
            return { tick: g.currentTick, remaining: all.map(unit => ({ id: unit.id, name: unit.name,
                owner: unit.owner.name, spawned: unit.isSpawned, health: unit.healthTrait.health,
                tile: unit.tile && [unit.tile.rx, unit.tile.ry] })),
                target: target && { id: target.id, name: target.name, tile: point(target), health: target.healthTrait.health },
                airborne: visible.filter(unit => unit.zone === 1).map(unit => unit.id) };
        });
        if (plan.target) {
            await pilot.page.evaluate(tile => window.__ra2debug.actionsApi.activateSuperWeapon(0,
                { rx: tile[0], ry: tile[1] }), plan.target.tile);
            pilot.report.commands.push({ kind: 'ordinary-paid-nuclear-strike', tick: plan.tick, ...plan.target });
        }
        if (plan.airborne.length && i % 10 === 0)
            await commands.order(['FV'], 2, plan.airborne[0]);
        await commands.step(90);
        if (i % 10 === 0) {
            state = await pilot.observe('original-tierra-paid-silo-and-source-forces-' + i);
            pilot.report.remainingRequiredForces = plan.remaining;
            if (!state.result) await pilot.checkpoint('last-tierra-silo-checkpoint.json');
        }
        assert(state.own.some(unit => unit.name === 'NAMISL'), 'The normally built silo was lost');
    }
    state = await pilot.observe('original-tierra-source-final-result');
    assert.equal(state.result, 'victory');
    pilot.report.status = 'PASS_NATIVE_ORIGINAL_ALLIED07_FULL_OBJECTIVE_CHAIN_ORDINARY_PAID_FORCES_SUPERWEAPONS_AND_SOURCE_FINAL_VICTORY';
} catch (error) { failure = error; }
await pilot.finish(failure);
