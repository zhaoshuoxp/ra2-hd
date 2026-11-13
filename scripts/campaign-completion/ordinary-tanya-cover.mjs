// Native assistance only: visible infantry, real weapon range/LOS and ordinary orders.
export async function coverTanya(page, commands, ticks, goal) {
    let previous, moving = false;
    const interventions = [];
    for (let done = 0; done < ticks; done += 10) {
        const state = await page.evaluate(() => {
            const g = window.__ra2debug.game;
            const owners = g.localPlayer.campaignControlledPlayers ?? [g.localPlayer];
            const tanya = owners.flatMap(owner => owner.getOwnedObjects())
                .find(unit => unit.name === 'TANY' && unit.isSpawned && !unit.isDestroyed);
            if (!tanya) throw Error('Original Tanya is absent');
            const shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
            const enemies = g.world.getAllObjects().filter(unit => unit.isInfantry?.()
                && unit.isSpawned && !unit.isDestroyed && !unit.owner.isNeutral
                && !g.areFriendly(tanya, unit) && !shroud.isShrouded(unit.tile, unit.tileElevation)
                && !unit.cloakableTrait?.isCloaked() && !unit.disguiseTrait?.isDisguised()
                && tanya.attackTrait.rangeHelper.isInWeaponRange(tanya, unit, tanya.primaryWeapon, g.rules)
                && tanya.attackTrait.losHelper.hasLineOfSight(tanya, unit, tanya.primaryWeapon));
            enemies.sort((a, b) => Number(b.name === 'DOG') - Number(a.name === 'DOG')
                || Math.hypot(a.tile.rx - tanya.tile.rx, a.tile.ry - tanya.tile.ry)
                    - Math.hypot(b.tile.rx - tanya.tile.rx, b.tile.ry - tanya.tile.ry) || a.id - b.id);
            return { tick: g.currentTick, id: tanya.id, tile: [tanya.tile.rx, tanya.tile.ry],
                health: tanya.healthTrait.health, target: tanya.unitOrderTrait.tasks[0]?.target?.obj?.id,
                enemy: enemies[0] && { id: enemies[0].id, name: enemies[0].name } };
        });
        if (state.health < 30) return { status: 'STOPPED_LOW_HEALTH', state, interventions };
        if (state.enemy) {
            if (state.target !== state.enemy.id) {
                await commands.order([state.id], 2, state.enemy.id);
                interventions.push({ tick: state.tick, ...state.enemy });
            }
            moving = false;
        } else if (goal && !moving && Math.hypot(goal[0] - state.tile[0], goal[1] - state.tile[1]) > 1.5) {
            await commands.order([state.id], 0, undefined, goal);
            moving = true;
        }
        previous = state;
        const result = await commands.step(Math.min(10, ticks - done), { defend: false, repair: false });
        if (result.result) return { status: result.result, state, interventions };
    }
    return { status: 'ORDINARY_ASSISTANCE_COMPLETED', state: previous, interventions };
}
