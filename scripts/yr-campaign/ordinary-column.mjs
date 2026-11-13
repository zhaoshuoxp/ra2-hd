// Source-guided navigation with ordinary player orders. Enemy targeting uses
// only currently visible, detected actors; no map reveal or state edits.
export async function orderGroundColumn(commands, goal, { tanks = ['APOC'], artillery = ['V3'], escort = ['HTK'] } = {}) {
    const plan = await commands.page.evaluate(({ goal, tanks, artillery, escort }) => {
        const g = window.__ra2debug.game, shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
        const own = g.localPlayer.getOwnedObjects().filter(unit => unit.isUnit() && unit.isSpawned && !unit.isDestroyed);
        const matches = (names, unit) => names.includes(unit.name) || names.includes(unit.id);
        const front = own.filter(unit => matches(tanks, unit));
        if (!front.length) return;
        const ranged = own.filter(unit => matches(artillery, unit));
        const back = own.filter(unit => matches(escort, unit));
        const center = front.reduce((sum, unit) => [sum[0] + unit.tile.rx / front.length,
            sum[1] + unit.tile.ry / front.length], [0, 0]);
        const distance = unit => Math.hypot(unit.tile.rx - center[0], unit.tile.ry - center[1]);
        const enemies = g.world.getAllObjects().filter(unit => unit.isTechno() && unit.isSpawned && !unit.isDestroyed
            && !unit.rules.invisibleInGame && unit.rules.legalTarget !== false
            && !unit.owner.isNeutral && unit.owner !== g.localPlayer && !g.alliances.areAllied(g.localPlayer, unit.owner)
            && g.map.tileOccupation.calculateTilesForGameObject(unit.tile, unit)
                .some(tile => !shroud.isShrouded(tile, unit.tileElevation))
            && !unit.cloakableTrait?.isCloaked()
            && (!unit.disguiseTrait?.isDisguised() || g.localPlayer.sharedDetectDisguiseTrait?.has(unit)))
            .sort((a, b) => distance(a) - distance(b) || a.id - b.id);
        const artilleryDistance = unit => Math.min(Infinity, ...ranged.map(gun =>
            Math.hypot(gun.tile.rx - unit.tile.rx, gun.tile.ry - unit.tile.ry)));
        const ground = enemies.find(unit => unit.isUnit() && unit.zone !== 1 && !unit.rules.naval
            && artilleryDistance(unit) <= 8) ?? enemies.find(unit => unit.isUnit()
                && unit.zone !== 1 && !unit.rules.naval && distance(unit) <= 10);
        const structures = enemies.filter(unit => unit.isBuilding() && distance(unit) <= 28);
        const objective = structures.find(unit => ['CALAB', 'GACSPH'].includes(unit.name));
        const structure = objective ?? structures.find(unit => unit.primaryWeapon && unit.rules.isBaseDefense) ?? structures[0];
        const air = enemies.find(unit => unit.zone === 1 && distance(unit) <= 20);
        const infantry = enemies.find(unit => unit.isInfantry() && distance(unit) <= 12);
        // A player can force-fire the visible ground where a camouflaged tank
        // just fired. Retain that observed cell, never its hidden new position.
        const observed = [...(window.__campaignObservedFiringCells?.values() ?? [])]
            .filter(cell => g.currentTick - cell.tick <= 180
                && Math.hypot(cell.x - center[0], cell.y - center[1]) <= 22)
            .sort((a, b) => Math.hypot(a.x - center[0], a.y - center[1])
                - Math.hypot(b.x - center[0], b.y - center[1]))[0];
        const lag = Math.max(0, ...ranged.map(unit => distance(unit)));
        const direction = [goal[0] - center[0], goal[1] - center[1]], length = Math.hypot(...direction) || 1;
        const point = (unit, trailing) => {
            const wanted = [center[0] - direction[0] / length * trailing, center[1] - direction[1] / length * trailing];
            return g.map.tiles.getAll().filter(tile => g.map.mapBounds.isWithinPlayerBounds(tile)
                && Math.hypot(tile.rx - wanted[0], tile.ry - wanted[1]) <= 5
                && g.map.terrain.getPassableSpeed(tile, unit.rules.speedType, false, false) > 0
                && !g.map.getObjectsOnTile(tile).some(object => object.isBuilding() && !object.isDestroyed))
                .sort((a, b) => Math.hypot(a.rx - wanted[0], a.ry - wanted[1])
                    - Math.hypot(b.rx - wanted[0], b.ry - wanted[1]))[0];
        };
        const orders = [];
        if (objective && distance(objective) <= 16) orders.push({ ids: front.map(unit => unit.id), type: 2, target: objective.id });
        else if (observed && (!ground || Math.hypot(observed.x - center[0], observed.y - center[1]) < distance(ground))) {
            orders.push({ ids: front.map(unit => unit.id), type: ranged.length
                && Math.hypot(observed.x - center[0], observed.y - center[1]) > 7 ? 11 : 3,
                ...(!ranged.length || Math.hypot(observed.x - center[0], observed.y - center[1]) <= 7
                    ? { tile: [observed.x, observed.y] } : {}) });
        } else if (ground) orders.push({ ids: front.map(unit => unit.id), type: 2, target: ground.id });
        else if (lag > 10) orders.push({ ids: front.map(unit => unit.id), type: 11 });
        else if (structure && distance(structure) <= Math.max(13, (structure.primaryWeapon?.rules.range ?? 0) + 4) && ranged.length) {
            orders.push({ ids: front.map(unit => unit.id), type: 11 });
        } else orders.push({ ids: front.map(unit => unit.id), type: 4, tile: goal });
        if (ranged.length) {
            const target = structure ?? ground;
            if (objective) orders.push({ ids: ranged.map(unit => unit.id), type: 2, target: objective.id });
            else if (observed) orders.push({ ids: ranged.map(unit => unit.id), type: 3, tile: [observed.x, observed.y] });
            else if (target) orders.push({ ids: ranged.map(unit => unit.id), type: 2, target: target.id });
            else { const tile = point(ranged[0], 5); if (tile) orders.push({ ids: ranged.map(unit => unit.id), type: 0, tile: [tile.rx, tile.ry] }); }
        }
        if (back.length) {
            const target = air ?? infantry;
            if (target) orders.push({ ids: back.map(unit => unit.id), type: 2, target: target.id });
            else { const tile = point(back[0], 3); if (tile) orders.push({ ids: back.map(unit => unit.id), type: 0, tile: [tile.rx, tile.ry] }); }
        }
        return { tick: g.currentTick, center, front: front.length, artillery: ranged.length,
            distance: Math.hypot(goal[0] - center[0], goal[1] - center[1]), orders };
    }, { goal, tanks, artillery, escort });
    if (!plan) return;
    for (const order of plan.orders) await commands.order(order.ids, order.type, order.target, order.tile);
    return plan;
}
