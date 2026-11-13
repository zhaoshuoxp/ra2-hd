// Read-only path planning and ordinary clicks; hazards must be visible to the player.
export async function advanceInfiltrator(page, commands, id, targetId, ticks) {
    const interventions = [];
    let previous, issuedAt = -1000;
    for (let done = 0; done < ticks; done += 10) {
        const state = await page.evaluate(({ id, targetId }) => {
            const g = window.__ra2debug.game, objects = g.world.getAllObjects();
            const spy = objects.find(unit => unit.id === id && unit.isSpawned && !unit.isDestroyed);
            if (!spy) return { tick: g.currentTick, status: 'NO_LONGER_ON_MAP' };
            const target = objects.find(unit => unit.id === targetId && unit.isSpawned && !unit.isDestroyed);
            if (!target) return { tick: g.currentTick, status: 'TARGET_GONE' };
            const shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer), excludeTiles = new Set();
            const hazards = objects.filter(unit => unit.isTechno() && unit.isSpawned && !unit.isDestroyed
                && !unit.owner.isNeutral && !g.areFriendly(spy, unit) && !shroud.isShrouded(unit.tile, unit.tileElevation)
                && !unit.cloakableTrait?.isCloaked() && (unit.rules.detectDisguise || unit.isVehicle() && unit.rules.crusher));
            for (const unit of hazards) {
                const radius = unit.rules.detectDisguise ? 5 : 2;
                for (let y = unit.tile.ry - radius; y <= unit.tile.ry + radius; y++) {
                    for (let x = unit.tile.rx - radius; x <= unit.tile.rx + radius; x++) {
                        const tile = g.map.tiles.getByMapCoords(x, y);
                        if (tile && Math.hypot(x - unit.tile.rx, y - unit.tile.ry) <= radius) excludeTiles.add(tile);
                    }
                }
            }
            const before = g.getHash();
            // Temporary path endpoints can reorder the live graph's neighbor
            // lists even when its restored topology and world hash are equal.
            // Build an independent navigation instance without subscriptions.
            const live = g.map.terrain, occupation = Object.create(g.map.tileOccupation);
            Object.defineProperty(occupation, 'onChange', { value: { subscribe() {} } });
            const bounds = Object.create(g.map.mapBounds);
            Object.defineProperty(bounds, 'onLocalResize', { value: { subscribe() {} } });
            const planning = new live.constructor(g.map.tiles, live.theaterType, bounds, occupation, g.rules);
            const path = planning.computePath(spy.rules.speedType, true, spy.tile, !!spy.onBridge,
                target.tile, !!target.onBridge, { ignoredBlockers: [spy, target],
                    excludeTiles: node => excludeTiles.has(node.tile), bestEffort: false }).reverse();
            if (before !== g.getHash()) throw Error('Read-only infiltration planning changed the world');
            const visible = g.map.tileOccupation.calculateTilesForGameObject(target.tile, target)
                .some(tile => !shroud.isShrouded(tile, target.tileElevation));
            const next = path[Math.min(path.length - 1, 5)];
            return { tick: g.currentTick, status: 'ON_MAP', tile: [spy.tile.rx, spy.tile.ry], pathLength: path.length,
                next: next && [next.tile.rx, next.tile.ry], enter: visible && path.length > 0 && path.length < 5,
                hazards: hazards.map(unit => ({ id: unit.id, name: unit.name })) };
        }, { id, targetId });
        if (state.status !== 'ON_MAP') return { ...state, interventions };
        if (state.enter) {
            if (previous !== 'enter') {
                await commands.order([id], 8, targetId); previous = 'enter';
                interventions.push({ tick: state.tick, kind: 'ordinary-infiltrate', targetId });
            }
        } else if (state.next) {
            const key = state.next.join(',');
            if (previous !== key && (state.tick - issuedAt >= 50 || !previous || previous === 'enter')) {
                await commands.order([id], 0, undefined, state.next); previous = key; issuedAt = state.tick;
                interventions.push({ tick: state.tick, kind: 'ordinary-move', tile: state.next, hazards: state.hazards });
            }
        } else return { ...state, status: 'NO_SAFE_READ_ONLY_PATH', interventions };
        await commands.step(Math.min(10, ticks - done), { defend: false });
    }
    return { status: 'ORDINARY_INFILTRATION_INTERVAL_COMPLETE', interventions };
}
