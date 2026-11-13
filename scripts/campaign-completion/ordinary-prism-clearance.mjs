// Test assistance: ordinary visible-target building orders and simulation turns.
// Original ownership, power, weapons, damage, targeting and source goals apply.
export async function clearVisiblePrismTargets(page, commands, identities) {
    const interventions = [];
    for (const identity of identities) {
        const candidates = await page.evaluate(identity => {
            const g = window.__ra2debug.game, owners = g.localPlayer.campaignControlledPlayers ?? [g.localPlayer];
            const prism = owners.flatMap(owner => owner.getOwnedObjects()).find(object => object.id === identity
                && object.name === 'MAYAN' && object.isSpawned && !object.isDestroyed);
            if (!prism || prism.owner.powerTrait.isLowPower()) return [];
            const shroud = g.mapShroudTrait.getPlayerShroud(g.localPlayer);
            return g.world.getAllObjects().filter(object => object.isBuilding() && object.isSpawned
                && !object.isDestroyed && !object.rules.insignificant && !object.owner.isNeutral
                && !g.areFriendly(prism, object) && !shroud.isShrouded(object.tile, object.tileElevation)
                && prism.attackTrait.rangeHelper.isInWeaponRange(prism, object, prism.primaryWeapon, g.rules))
                .sort((a, b) => Number(b.name === 'NACNST') - Number(a.name === 'NACNST') || a.id - b.id)
                .map(object => ({ id: object.id, name: object.name }));
        }, identity);
        for (const target of candidates) {
            const live = await page.evaluate(id => {
                const g = window.__ra2debug.game, object = g.world.getAllObjects().find(object => object.id === id);
                return !g.campaign.result && object?.isSpawned && !object.isDestroyed;
            }, target.id);
            if (!live) continue;
            await commands.order([identity], 2, target.id);
            const state = await commands.step(70, { defend: false, repair: false });
            interventions.push({ tick: state.tick, prism: identity, target });
            if (state.result) return { status: state.result, interventions };
        }
    }
    return { status: 'ORDINARY_VISIBLE_PRISM_TARGETS_ATTEMPTED', interventions };
}
