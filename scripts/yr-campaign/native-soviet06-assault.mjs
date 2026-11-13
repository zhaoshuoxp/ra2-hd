import assert from 'node:assert/strict';
import { NativeCampaignPilot } from './native-pilot.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'sov06lmd.map');
let failure;
try {
    let state = await pilot.open();
    const commands = pilot.commands; commands.groundDefenders = ['HTNK']; commands.airDefenders = [];
    const bases = [
        { house: 'Americans', flag: '1', route: [[110, 125], [95, 115], [81, 108], [71, 102]] },
        { house: 'Alliance', flag: '2', route: [[78, 87], [84, 67], [82, 55]] },
        { house: 'YuriCountry', flag: '3', route: [[69, 49], [52, 42], [36, 34], [45, 17]] },
    ];
    let previous;
    for (const base of bases) {
        let complete = false;
        for (const [stage, goal] of base.route.entries()) {
            for (let i = 0; i < (stage === base.route.length - 1 ? 650 : 200); i++) {
                const plan = await pilot.page.evaluate(({ base, goal }) => {
                    const g = window.__ra2debug.game, shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
                    const army = g.localPlayer.getOwnedObjects().filter(unit => unit.name === 'LUNR' && unit.isSpawned && !unit.isDestroyed);
                    if (!army.length) return { troops: 0 };
                    const center = army.reduce((sum, unit) => [sum[0] + unit.tile.rx / army.length,
                        sum[1] + unit.tile.ry / army.length], [0, 0]);
                    const distance = unit => Math.hypot(unit.tile.rx - center[0], unit.tile.ry - center[1]);
                    const enemies = g.world.getAllObjects().filter(unit => unit.isTechno() && unit.isSpawned && !unit.isDestroyed
                        && ['Americans', 'Alliance', 'YuriCountry'].includes(unit.owner.name)
                        && !g.alliances.areAllied(g.localPlayer, unit.owner)
                        && g.map.tileOccupation.calculateTilesForGameObject(unit.tile, unit)
                            .some(tile => !shroud.isShrouded(tile, unit.tileElevation))
                        && !unit.cloakableTrait?.isCloaked()
                        && (!unit.disguiseTrait?.isDisguised() || g.localPlayer.sharedDetectDisguiseTrait?.has(unit)));
                    const threats = enemies.filter(unit => distance(unit) < 13
                        && (['YTNK', 'YAGGUN', 'LUNR', 'DISK'].includes(unit.name)));
                    const priority = unit => ({ YTNK: 5, YAGGUN: 4, LUNR: 3, DISK: 2 })[unit.name] ?? 0;
                    const threat = threats.sort((a, b) => priority(b) - priority(a) || distance(a) - distance(b))[0];
                    const facilities = enemies.filter(unit => unit.owner.name === base.house && unit.isBuilding() && distance(unit) < 25
                        && ['YACNST', 'YACOMD', 'YAWEAP', 'YABRCK', 'YAPOWR'].includes(unit.name));
                    const ranks = ['YACNST', 'YAWEAP', 'YABRCK', 'YACOMD', 'YAPOWR'];
                    const facility = facilities.sort((a, b) => ranks.indexOf(a.name) - ranks.indexOf(b.name)
                        || distance(a) - distance(b))[0];
                    const target = threat ?? facility;
                    return { tick: g.currentTick, troops: army.length, center, target: target?.id, targetName: target?.name,
                        distance: Math.hypot(goal[0] - center[0], goal[1] - center[1]),
                        complete: !!g.campaign.machine.variables.get(base.flag),
                        facilities: g.getAllPlayers().filter(owner => owner.name === base.house)
                            .flatMap(owner => owner.getOwnedObjects()).filter(unit => unit.isBuilding() && !unit.isDestroyed
                                && ranks.includes(unit.name)).map(unit => ({ name: unit.name, tile: [unit.tile.rx, unit.tile.ry] })) };
                }, { base, goal });
                assert(plan.troops, 'The ordinary lunar assault force was lost');
                if (plan.complete) {
                    complete = true;
                    (pilot.report.originalBases ??= []).push({ house: base.house, flag: base.flag, observedTick: plan.tick });
                    break;
                }
                const remaining = (stage === base.route.length - 1 || plan.facilities.length === 1) && !plan.target && plan.facilities
                    .sort((a, b) => Math.hypot(a.tile[0] - plan.center[0], a.tile[1] - plan.center[1])
                        - Math.hypot(b.tile[0] - plan.center[0], b.tile[1] - plan.center[1]))[0];
                const destination = remaining?.tile ?? goal;
                const key = plan.target ?? 'move-' + destination.join('-');
                if (key !== previous || plan.target === undefined && i % 20 === 0) {
                    await commands.order(['LUNR'], plan.target === undefined ? 0 : 2, plan.target,
                        plan.target === undefined ? destination : undefined); previous = key;
                }
                await commands.step(45, { defend: false });
                if (i % 5 === 0) state = await pilot.observe('original-lunar-assault-' + base.house + '-' + stage + '-' + i);
                if (plan.distance < 4 && !plan.target && stage < base.route.length - 1) break;
            }
            await pilot.checkpoint('last-lunar-objective-checkpoint.json');
            if (complete) break;
        }
        assert(complete, 'Original lunar base flag remains incomplete: ' + base.house);
        await pilot.checkpoint('original-' + base.house.toLowerCase() + '-base-cleared-checkpoint.json');
    }
    for (let i = 0; i < 90 && state.result !== 'victory'; i++) {
        await commands.step(60, { defend: false }); state = await pilot.observe('original-lunar-fire-sale-and-result-' + i);
    }
    assert.equal(state.result, 'victory');
    pilot.report.status = `PASS_NATIVE_ORIGINAL_${pilot.report.launch.difficulty.toUpperCase()}_SOVIET06_THREE_BASES_LUNAR_COMMAND_AND_SOURCE_VICTORY`;
} catch (error) { failure = error; }
await pilot.finish(failure);
