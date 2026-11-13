import assert from 'node:assert/strict';
import { NativeCampaignPilot } from './native-pilot.mjs';

const pilot = new NativeCampaignPilot(process.argv[2], 'all01umd.map');
let failure;
try {
    let state = await pilot.open();
    const commands = pilot.commands;
    for (const name of ['NANRCT', 'YAPPPT']) {
        let previous, completed = false;
        for (let i = 0; i < 600 && !state.result; i++) {
            const plan = await pilot.page.evaluate(name => {
                const g = window.__ra2debug.game, shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
                const hero = g.localPlayer.getOwnedObjects().find(unit => unit.name === 'TANY' && unit.isSpawned && !unit.isDestroyed);
                const goal = g.world.getAllObjects().find(unit => unit.name === name && !unit.isDestroyed);
                if (!hero) return { hero: false, completed: !goal };
                const distance = unit => Math.hypot(unit.tile.rx - hero.tile.rx, unit.tile.ry - hero.tile.ry);
                const enemies = g.world.getAllObjects().filter(unit => unit.isTechno() && unit.isSpawned && !unit.isDestroyed
                    && unit.owner !== g.localPlayer && !unit.owner.isNeutral && !g.alliances.areAllied(g.localPlayer, unit.owner)
                    && !shroud.isShrouded(unit.tile, unit.tileElevation) && !unit.cloakableTrait?.isCloaked()
                    && (!unit.disguiseTrait?.isDisguised() || g.localPlayer.sharedDetectDisguiseTrait?.has(unit)));
                const threat = enemies.filter(unit => unit.isInfantry() && distance(unit) < 11)
                    .sort((a, b) => Number(b.name === 'DOG') - Number(a.name === 'DOG') || distance(a) - distance(b))[0];
                const target = threat ?? goal;
                const visible = target && !shroud.isShrouded(target.tile, target.tileElevation);
                return { tick: g.currentTick, hero: true, tile: [hero.tile.rx, hero.tile.ry], health: hero.healthTrait.health,
                    target: visible ? target.id : undefined, name: target?.name, completed: !goal,
                    destination: name === 'NANRCT' ? [55, 72] : [46, 69] };
            }, name);
            if (plan.completed) { completed = true; (pilot.report.originalIslandGoals ??= []).push({ name, tick: plan.tick }); break; }
            assert(plan.hero, 'Original Tanya was lost in ordinary island combat');
            const key = plan.target ?? plan.destination.join('-');
            if (key !== previous || plan.target === undefined && i % 20 === 0) {
                await commands.order(['TANY'], plan.target === undefined ? 4 : 2, plan.target,
                    plan.target === undefined ? plan.destination : undefined); previous = key;
            }
            await commands.step(45, { defend: false });
            if (i % 5 === 0) state = await pilot.observe('original-tanya-swim-and-' + name + '-' + i);
        }
        assert(completed, 'Original island objective remains: ' + name);
        await pilot.checkpoint('original-' + name.toLowerCase() + '-cleared-checkpoint.json');
    }
    for (let i = 0; i < 100 && !state.result; i++) {
        await commands.step(60, { defend: false }); state = await pilot.observe('original-allied01-result-delay-' + i);
    }
    assert.equal(state.result, 'victory');
    pilot.report.status = `PASS_NATIVE_ORIGINAL_${pilot.report.launch.difficulty.toUpperCase()}_ALLIED01_CITY_POWER_TIME_WARP_ARMOR_TANYA_SWIM_NUCLEAR_PLANT_DOMINATOR_AND_SOURCE_VICTORY`;
} catch (error) { failure = error; }
await pilot.finish(failure);
