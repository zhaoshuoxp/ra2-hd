// Finite human test inputs. All spending, construction and placement use normal actions.
export function issueDefenseSequence() {
    const debug = window.__ra2debug;
    const game = window.__m01RunGame;
    if (game.status !== 1) return;
    const player = debug.localPlayer;
    const owned = player.getOwnedObjects();
    const yard = owned.find(object => object.name === 'GACNST');
    if (!yard) return;
    const state = window.__m01HumanSequence ??= {
        structures: { index: 0 }, armory: { index: 0 }, actions: [],
    };
    const plans = [
        { key: 'structures', queue: 0, names: ['GAPOWR', 'GAPILE', 'GAREFN'] },
        { key: 'armory', queue: 1, names: Array(8).fill('GAPILL') },
    ];
    for (const plan of plans) {
        const current = state[plan.key];
        const name = plan.names[current.index];
        if (!name) continue;
        const matching = owned.filter(object => object.name === name);
        if (current.pending && matching.some(object => !current.beforeIds.includes(object.id))) {
            current.index++;
            current.pending = false;
            continue;
        }
        const queue = player.production.getQueue(plan.queue);
        if (!current.pending && queue.status === 0 &&
            player.production.getAvailableObjects().some(object => object.name === name)) {
            debug.actionsApi.queueForProduction(plan.queue, 2, name, 1);
            current.pending = true;
            current.beforeIds = matching.map(object => object.id);
            state.actions.push({ tick: game.currentTick, action: 'QueueForProduction', name });
        } else if (current.pending && queue.status === 3) {
            const candidates = [];
            for (let dx = -8; dx <= 10; dx++) for (let dy = -8; dy <= 10; dy++) {
                candidates.push({ rx: yard.tile.rx + dx, ry: yard.tile.ry + dy });
            }
            const offset = plan.queue === 1 ? 5 : -3;
            const distance = tile => (tile.rx - yard.tile.rx - offset) ** 2 +
                (tile.ry - yard.tile.ry - offset) ** 2;
            candidates.sort((a, b) => distance(a) - distance(b));
            const tile = candidates.find(tile => game.getConstructionWorker(player)
                .canPlaceAt(name, tile, { normalizedTile: true }));
            if (tile) {
                debug.actionsApi.placeBuilding(name, tile.rx, tile.ry);
                state.actions.push({ tick: game.currentTick, action: 'PlaceBuilding', name, tile });
            }
        }
    }
}
