// One stronger, paid defensive input schedule for the M0.2 stability retry.
// This does not alter rules, health, credits, spawning, AI or simulation time.
export function issueStabilityDefense() {
    const d = window.__ra2debug, g = window.__m01RunGame;
    if (g.status !== 1) return;
    const p = d.localPlayer, owned = p.getOwnedObjects(), yard = owned.find(o => o.name === 'GACNST');
    if (!yard) return;
    const s = window.__m01HumanSequence ??= { structures: { index: 0 }, armory: { index: 0 }, actions: [],
        infantryQueued: 0, infantry: {}, anchors: owned.filter(o => o.name === 'E1').map(o => ({ rx: o.tile.rx, ry: o.tile.ry })) };
    const record = (action, fields) => s.actions.push({ tick: g.currentTick, action, credits: p.credits, ...fields });
    for (const plan of [
        { key: 'structures', queue: 0, names: ['GAPOWR', 'GAPILE', 'GAREFN', 'GAREFN', 'GAPOWR'] },
        { key: 'armory', queue: 1, names: Array(32).fill('GAPILL') },
    ]) {
        const state = s[plan.key], name = plan.names[state.index];
        if (!name) continue;
        const matching = owned.filter(o => o.name === name);
        if (state.pending && matching.some(o => !state.beforeIds.includes(o.id))) {
            state.index++; state.pending = false; continue;
        }
        const q = p.production.getQueue(plan.queue);
        if (!state.pending && q.status === 0 && p.credits > 500 && p.production.getAvailableObjects().some(o => o.name === name)) {
            d.actionsApi.queueForProduction(plan.queue, 2, name, 1);
            state.pending = true; state.beforeIds = matching.map(o => o.id); record('QueueForProduction', { name });
        } else if (state.pending && q.status === 3) {
            const tiles = [];
            for (let dx = -10; dx <= 10; dx++) for (let dy = -10; dy <= 10; dy++) tiles.push({ rx: yard.tile.rx + dx, ry: yard.tile.ry + dy });
            const offsets = [[5, 2], [2, 5], [-2, 4], [4, -2]];
            const [ox, oy] = plan.queue === 1 ? offsets[state.index % offsets.length] : [-3, -3];
            const distance = t => (t.rx - yard.tile.rx - ox) ** 2 + (t.ry - yard.tile.ry - oy) ** 2;
            tiles.sort((a, b) => distance(a) - distance(b));
            const tile = tiles.find(t => g.getConstructionWorker(p).canPlaceAt(name, t, { normalizedTile: true }));
            if (tile) { d.actionsApi.placeBuilding(name, tile.rx, tile.ry); record('PlaceBuilding', { name, tile }); }
        }
    }
    if (s.infantryQueued < 48 && owned.filter(o => o.name === 'E1').length < 35 && p.credits > 700 &&
        p.production.getQueue(2).status === 0 && p.production.getAvailableObjects().some(o => o.name === 'E1')) {
        d.actionsApi.queueForProduction(2, 3, 'E1', 1); s.infantryQueued++; record('QueueForProduction', { name: 'E1' });
    }
    for (const u of owned.filter(o => o.name === 'E1')) {
        if (!s.infantry[u.id]) {
            const anchor = s.anchors[Object.keys(s.infantry).length % s.anchors.length];
            s.infantry[u.id] = { issued: g.currentTick };
            if (anchor) { d.actionsApi.orderUnits([u.id], 0, anchor.rx, anchor.ry); record('MoveToDefenseAnchor', { id: u.id, anchor }); }
        } else if (g.currentTick - s.infantry[u.id].issued > 100 && !u.isMoving && u.deployerTrait && !u.deployerTrait.isDeployed()) {
            d.actionsApi.orderUnits([u.id], 10); record('DeployInfantry', { id: u.id });
        }
    }
    for (const b of owned.filter(o => o.isBuilding() && o.healthTrait.health < 95 && o.rules.repairable && o.rules.clickRepairable)) {
        const repair = b.traits.getAll().find(t => typeof t.isDisabled === 'function' && 'healLeftover' in t);
        if (repair?.isDisabled() && p.credits > 0) { d.actionsApi.toggleRepairWrench(b.id); record('ToggleRepair', { id: b.id }); }
    }
}
