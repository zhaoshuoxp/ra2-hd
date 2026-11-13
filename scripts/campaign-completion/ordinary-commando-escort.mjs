// Ordinary commando/GI escort micro. Visible attack targets only; no state edits.
export async function escortCommando(page, commands, goal, ticks, { manageEngineers = true } = {}) {
    let previous;
    const observations = [];
    for (let done = 0; done < ticks; done += 30) {
        const state = await page.evaluate(() => {
            const g = window.__ra2debug.game, own = g.localPlayer.campaignControlledPlayers.flatMap(p => p.getOwnedObjects());
            const tanya = own.find(o => o.name === 'TANY' && o.isSpawned && !o.isDestroyed);
            if (!tanya) return { status: 'ACTOR_GONE', tick: g.currentTick };
            const combat = own.filter(o => ['TANY', 'E1'].includes(o.name) && o.isSpawned && !o.isDestroyed);
            const engineers = own.filter(o => o.name === 'ENGINEER' && o.isSpawned && !o.isDestroyed);
            const shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
            const foes = g.world.getAllObjects().filter(o => o.isUnit() && o.isSpawned && !o.isDestroyed
                && !o.owner.isNeutral && !g.areFriendly(tanya, o) && !shroud.isShrouded(o.tile, o.tileElevation)
                && !o.cloakableTrait?.isCloaked() && combat.some(u => Math.hypot(o.tile.rx - u.tile.rx, o.tile.ry - u.tile.ry) < 10));
            const foot = foes.filter(o => o.isInfantry()).sort((a, b) => Number(b.rules.detectDisguise) - Number(a.rules.detectDisguise)
                || Math.hypot(a.tile.rx - tanya.tile.rx, a.tile.ry - tanya.tile.ry)
                - Math.hypot(b.tile.rx - tanya.tile.rx, b.tile.ry - tanya.tile.ry) || a.id - b.id)[0];
            const escort = combat.filter(o => o.name === 'E1').sort((a, b) =>
                Math.hypot(a.tile.rx - tanya.tile.rx, a.tile.ry - tanya.tile.ry)
                - Math.hypot(b.tile.rx - tanya.tile.rx, b.tile.ry - tanya.tile.ry))[0] ?? tanya;
            return { status: 'ACTIVE', tick: g.currentTick, tanya: [tanya.tile.rx, tanya.tile.ry], hp: tanya.healthTrait.health,
                engineers: engineers.length, soldiers: combat.length - 1, target: foot?.id, targetName: foot?.name,
                rear: !foes.length && [escort.tile.rx, escort.tile.ry] };
        });
        observations.push(state);
        if (state.status !== 'ACTIVE') return { ...state, observations };
        const key = state.target ?? goal.join(',');
        if (previous !== key) {
            await commands.order(['TANY', 'E1'], state.target ? 2 : 4, state.target, state.target ? undefined : goal);
            previous = key;
        }
        if (manageEngineers) {
            if (state.rear) await commands.order(['ENGINEER'], 0, undefined, state.rear);
            else await commands.order(['ENGINEER'], 11);
        }
        await commands.step(Math.min(30, ticks - done), { defend: false });
    }
    return { status: 'ORDINARY_ESCORT_INTERVAL_COMPLETE', observations };
}
