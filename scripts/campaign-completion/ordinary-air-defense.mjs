// Native validation assistance: ordinary visible-target player orders only.
// The original world, rules, objectives, timers and AI remain untouched.
export async function ordinaryAirDefense(page, report, reserve = 10) {
    const orders = await page.evaluate(reserve => {
        const d = window.__ra2debug, g = d.game, c = g.campaign;
        if (c.inputLocked || c.result || c.captureMedia().movies.some(movie =>
            movie.placement === 'fullscreen' || movie.placement === 'transmission-paused')) return [];
        const army = g.localPlayer.getOwnedObjects().filter(object => object.name === 'JUMPJET'
            && object.isSpawned && !object.isDestroyed).sort((a, b) => a.id - b.id);
        if (!army.length) return [];
        const anchors = g.localPlayer.getOwnedObjects().filter(object => object.isBuilding() && !object.isDestroyed);
        const shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
        const enemies = g.world.getAllObjects().filter(object => object.isTechno() && object.isSpawned && !object.isDestroyed
            && !object.owner.isNeutral && !g.areFriendly({ owner: g.localPlayer }, object)
            && !shroud.isShrouded(object.tile, object.tileElevation) && !object.cloakableTrait?.isCloaked()
            && (!object.disguiseTrait?.isDisguised() || g.localPlayer.sharedDetectDisguiseTrait?.has(object)));
        const close = (object, radius) => anchors.some(anchor => Math.hypot(
            anchor.tile.rx - object.tile.rx, anchor.tile.ry - object.tile.ry) < radius);
        const ground = enemies.filter(object => object.zone !== 1 && !object.rules.naval && close(object, 20))
            .sort((a, b) => Number(b.name === 'FLAKT') - Number(a.name === 'FLAKT') || a.id - b.id)[0];
        const naval = enemies.filter(object => ['HYD', 'DRED'].includes(object.name) && close(object, 52))
            .sort((a, b) => Number(b.name === 'HYD') - Number(a.name === 'HYD') || a.id - b.id)[0];
        const result = [];
        const submit = (units, target) => {
            if (!units.length || !target) return;
            const ids = units.map(object => object.id);
            d.actionsApi.orderUnits(ids, 2, target.id);
            result.push({ kind: 'ordinary-visible-air-defense', tick: g.currentTick, ids, type: 2,
                target: target.id, targetName: target.name });
        };
        if (ground && naval) {
            const count = Math.min(reserve, Math.max(1, Math.floor(army.length / 3)));
            submit(army.slice(0, count), ground); submit(army.slice(count), naval);
        } else submit(army, naval ?? ground);
        return result;
    }, reserve);
    report.commands.push(...orders);
    return orders;
}
