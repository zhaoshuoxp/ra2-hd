// Native assistance uses ordinary focus-fire and movement, never actor or task edits.
export async function advanceArmor(page, commands, names, ticks, goal, support = {}) {
    let marching = false;
    const interventions = [], recovering = new Set();
    for (let done = 0; done < ticks; done += 20) {
        const state = await page.evaluate(({ names, support, recovering }) => {
            const g = window.__ra2debug.game, owners = g.localPlayer.campaignControlledPlayers ?? [g.localPlayer];
            const army = owners.flatMap(owner => owner.getOwnedObjects()).filter(unit => unit.isSpawned
                && !unit.isDestroyed && !unit.isCrashing && (names.includes(unit.name) || names.includes(unit.id)));
            if (!army.length) return { tick: g.currentTick, units: [] };
            const healers = owners.flatMap(owner => owner.getOwnedObjects()).filter(unit => unit.isSpawned
                && !unit.isDestroyed && !unit.isCrashing && support.repairNames?.includes(unit.name)
                && unit.primaryWeapon?.rules.damage < 0);
            const active = army.filter(unit => !support.retreatTile || (unit.healthTrait.health >= (support.retreatHealth ?? 60)
                && (!recovering.includes(unit.id) || unit.healthTrait.health >= 95)));
            const shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
            const armed = unit => !!unit.primaryWeapon && unit.primaryWeapon.rules.damage > 0;
            const priority = unit => support.priorityNames?.includes(unit.name) ? -1
                : unit.name === 'DRON' ? 0 : unit.isVehicle() && armed(unit) ? 1
                : unit.name === 'TESLA' ? 2 : unit.isInfantry() && armed(unit) ? 3
                    : armed(unit) ? 4 : unit.rules.factory ? 5 : 6;
            const enemies = g.world.getAllObjects().filter(unit => unit.isTechno() && unit.isSpawned
                && !unit.isDestroyed && !unit.isCrashing && !unit.owner.isNeutral && !unit.rules.insignificant
                && !g.areFriendly(army[0], unit) && !shroud.isShrouded(unit.tile, unit.tileElevation)
                && unit.zone !== 1 && !unit.cloakableTrait?.isCloaked()
                && (!unit.disguiseTrait?.isDisguised() || g.localPlayer.sharedDetectDisguiseTrait?.has(unit))
                && active.some(tank => Math.hypot(tank.tile.rx - unit.tile.rx, tank.tile.ry - unit.tile.ry) < 9));
            const candidates = enemies.map(unit => ({ unit, inRange: active.filter(tank =>
                tank.attackTrait.rangeHelper.isInWeaponRange(tank, unit, tank.primaryWeapon, g.rules)
                && tank.attackTrait.losHelper.hasLineOfSight(tank, unit, tank.primaryWeapon)).length }));
            candidates.sort((a, b) => Number(b.inRange > 0) - Number(a.inRange > 0)
                || priority(a.unit) - priority(b.unit) || b.inRange - a.inRange
                || a.unit.healthTrait.health - b.unit.healthTrait.health || a.unit.id - b.unit.id);
            const enemy = candidates[0]?.unit;
            return { tick: g.currentTick, units: army.map(unit => ({ id: unit.id, health: unit.healthTrait.health,
                recovering: !active.includes(unit), tile: [unit.tile.rx, unit.tile.ry],
                target: unit.unitOrderTrait.tasks.find(task => !task.isCancelling())?.target?.obj?.id })),
                healers: healers.map(unit => ({ id: unit.id, tile: [unit.tile.rx, unit.tile.ry],
                    target: unit.unitOrderTrait.tasks.find(task => !task.isCancelling())?.target?.obj?.id })),
                enemy: enemy && { id: enemy.id, name: enemy.name } };
        }, { names, support, recovering: [...recovering] });
        if (!state.units.length) return { status: 'ARMY_LOST', interventions };
        const withdrawing = state.units.filter(unit => unit.recovering);
        for (const unit of state.units) {
            if (unit.recovering && !recovering.has(unit.id)) {
                await commands.order([unit.id], 0, undefined, support.retreatTile);
                interventions.push({ tick: state.tick, kind: 'ordinary-retreat', id: unit.id, health: unit.health });
                recovering.add(unit.id);
            } else if (!unit.recovering) recovering.delete(unit.id);
        }
        for (const healer of state.healers ?? []) {
            const patients = withdrawing.filter(unit => Math.hypot(unit.tile[0] - support.retreatTile[0],
                unit.tile[1] - support.retreatTile[1]) < 5).sort((a, b) => a.health - b.health || a.id - b.id);
            const patient = patients[0];
            if (patient && healer.target !== patient.id) {
                await commands.order([healer.id], 2, patient.id);
                interventions.push({ tick: state.tick, kind: 'ordinary-repair', healer: healer.id, patient: patient.id });
            }
        }
        const active = state.units.filter(unit => !unit.recovering);
        if (state.enemy) {
            const changing = active.filter(unit => unit.target !== state.enemy.id);
            if (changing.length) {
                await commands.order(changing.map(unit => unit.id), 2, state.enemy.id);
                interventions.push({ tick: state.tick, ...state.enemy });
            }
            marching = false;
        } else if (goal && !marching && active.some(unit => Math.hypot(unit.tile[0] - goal[0], unit.tile[1] - goal[1]) > 2)) {
            await commands.order(active.map(unit => unit.id), 0, undefined, goal); marching = true;
        }
        const result = await commands.step(Math.min(20, ticks - done), { defend: false });
        if (result.result) return { status: result.result, interventions };
    }
    return { status: 'ORDINARY_ASSISTANCE_COMPLETED', interventions };
}

// Explicit repair clicks are recorded as ordinary attack orders with a negative-damage weapon.
export async function repairArmor(page, commands, names, ticks) {
    const interventions = [];
    for (let done = 0; done < ticks; done += 60) {
        const state = await page.evaluate(names => {
            const g = window.__ra2debug.game, own = (g.localPlayer.campaignControlledPlayers ?? [g.localPlayer])
                .flatMap(owner => owner.getOwnedObjects()).filter(unit => unit.isSpawned && !unit.isDestroyed);
            return { tick: g.currentTick, patients: own.filter(unit => names.includes(unit.name) && unit.healthTrait.health < 100)
                .map(unit => ({ id: unit.id, health: unit.healthTrait.health })).sort((a, b) => a.health - b.health || a.id - b.id),
                healers: own.filter(unit => unit.primaryWeapon?.rules.damage < 0 && unit.name === 'FV')
                    .map(unit => ({ id: unit.id, target: unit.unitOrderTrait.tasks.find(task => !task.isCancelling())?.target?.obj?.id })) };
        }, names);
        if (!state.patients.length) return { status: 'ORDINARY_REPAIR_COMPLETE', interventions };
        if (!state.healers.length) return { status: 'NO_REPAIR_VEHICLES', interventions };
        for (let i = 0; i < state.healers.length; i++) {
            const healer = state.healers[i], patient = state.patients[i % state.patients.length];
            if (healer.target !== patient.id) {
                await commands.order([healer.id], 2, patient.id);
                interventions.push({ tick: state.tick, healer: healer.id, patient: patient.id, health: patient.health });
            }
        }
        await commands.step(Math.min(60, ticks - done), { defend: false });
    }
    return { status: 'ORDINARY_REPAIR_INTERVAL_COMPLETE', interventions };
}
