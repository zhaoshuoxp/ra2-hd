import assert from 'node:assert/strict';
import { NativeCampaignPilot } from './native-pilot.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'all07smd.map');
let failure;
try {
    let state = await pilot.open();
    const commands = pilot.commands;
    commands.groundDefenders = ['HTNK', 'E2', 'MTNK', 'MGTK', 'SREF'];
    commands.airDefenders = ['HTK', 'FV']; commands.groundPriority = ['MIND', 'YURI', 'VIRUS'];
    commands.autoForceShield = true; commands.autoDominatorCounterstrike = true;
    pilot.report.priorMeaningfulRestart = 'all07-economy45-r5: two-faction economy named save, exact full process restart and another 180 ticks';
    let assigned, escortAssigned;
    for (let i = 0; i < 2200 && !state.result; i++) {
        if (await pilot.page.evaluate(() => window.__ra2debug.game.campaign.inputLocked)) {
            await commands.step(60, { defend: false });
            state = await pilot.observe('original-tierra-ending-presentation-' + i);
            continue;
        }
        const plan = await pilot.page.evaluate(() => {
            const g = window.__ra2debug.game, shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
            const ships = g.localPlayer.getOwnedObjects().filter(unit => unit.name === 'ZEP' && unit.isSpawned && !unit.isDestroyed);
            const jets = g.localPlayer.getOwnedObjects().filter(unit => unit.name === 'JUMPJET' && unit.isSpawned && !unit.isDestroyed);
            const army = ships.length ? ships : jets;
            if (!army.length) throw Error('The ordinary paid Tierra air force was lost');
            const center = army.reduce((sum, unit) => [sum[0] + unit.tile.rx / army.length,
                sum[1] + unit.tile.ry / army.length], [0, 0]);
            const all = [9, 14].flatMap(id => g.campaign.resolveHouse(id).getOwnedObjects(true))
                .filter(unit => !unit.isDestroyed && !unit.rules.insignificant && !unit.isAircraft());
            const available = all.filter(unit => unit.isSpawned && !unit.rules.invisibleInGame && unit.rules.legalTarget !== false
                && !unit.cloakableTrait?.isCloaked() && !shroud.isShrouded(unit.tile, unit.tileElevation)
                && (!unit.disguiseTrait?.isDisguised() || g.localPlayer.sharedDetectDisguiseTrait?.has(unit)));
            const distance = unit => Math.hypot(unit.tile.rx - center[0], unit.tile.ry - center[1]);
            const ground = available.filter(unit => unit.zone !== 1 && (!unit.isUnit() || !unit.rules.naval));
            const target = ground.sort((a, b) => {
                const score = unit => distance(unit) - (unit.name === 'YAGGUN' && distance(unit) < 24 ? 30 : 0)
                    - (unit.isBuilding() ? 8 : 0);
                return score(a) - score(b) || a.id - b.id;
            })[0];
            const escort = available.filter(unit => unit.isUnit() && !unit.rules.naval)
                .sort((a, b) => Number(b.zone === 1) - Number(a.zone === 1) || distance(a) - distance(b))[0];
            const weapon = g.localPlayer.superWeaponsTrait.getAll().find(weapon => weapon.rules.type === 0);
            const nuclearTarget = weapon?.status === 2 && ground.filter(unit => unit.isBuilding())
                .sort((a, b) => Number(b.name === 'YACNST') - Number(a.name === 'YACNST') || distance(a) - distance(b))[0];
            return { target: target && { id: target.id, name: target.name, owner: target.owner.name, tile: [target.tile.rx, target.tile.ry] },
                escort: escort?.id, center, remaining: all.map(unit => ({ id: unit.id, name: unit.name, spawned: unit.isSpawned,
                    owner: unit.owner.name, tile: unit.tile && [unit.tile.rx, unit.tile.ry] })),
                nuclearTarget: nuclearTarget && { id: nuclearTarget.id, tile: [nuclearTarget.tile.rx, nuclearTarget.tile.ry] } };
        });
        if (plan.nuclearTarget) {
            await pilot.page.evaluate(tile => window.__ra2debug.actionsApi.activateSuperWeapon(0,
                { rx: tile[0], ry: tile[1] }), plan.nuclearTarget.tile);
            (pilot.report.ordinaryNuclearStrikes ??= []).push({ tick: state.tick, ...plan.nuclearTarget });
        }
        if (plan.target && assigned !== plan.target.id) {
            await commands.order(['ZEP'], 2, plan.target.id); assigned = plan.target.id;
            (pilot.report.visibleFinalTargets ??= []).push({ tick: state.tick, ...plan.target });
        }
        if (plan.escort && escortAssigned !== plan.escort) {
            await commands.order(['JUMPJET'], 2, plan.escort); escortAssigned = plan.escort;
        } else if (!plan.escort && i % 20 === 0) {
            await commands.order(['JUMPJET'], 0, undefined, plan.center.map(Math.round));
        }
        await commands.step(90);
        if (i % 10 === 0) {
            state = await pilot.observe('original-tierra-required-houses-air-assault-' + i);
            pilot.report.remainingRequiredForces = plan.remaining;
            if (!state.result) await pilot.checkpoint('last-tierra-final-forces-checkpoint.json');
        }
        assert(state.own.some(unit => unit.name === 'NACNST'), 'The original critical repaired Soviet yard was lost');
    }
    state = await pilot.observe('original-tierra-source-final-victory');
    assert.equal(state.result, 'victory');
    pilot.report.status = 'PASS_NATIVE_ORIGINAL_ALLIED07_REPAIRED_SOVIET_BASE_CHRONO_ALLIED_BASE_COASTAL_NAVY_TWO_REQUIRED_HOUSES_AND_SOURCE_FINAL_VICTORY';
} catch (error) { failure = error; }
await pilot.finish(failure);
