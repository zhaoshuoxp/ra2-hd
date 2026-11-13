import { OrdinaryCampaignCommands } from './ordinary-commands.mjs';

// Validation assistance issues ordinary repair and combat inputs. It never
// changes simulation rules, actors, source triggers, health, credits or RNG.
export function installObjectiveDefense(commands, { anchor, ground, air, radius = 25, chunk = 30 }) {
    commands.report.assistance = { anchor, ground, air, radius, chunk,
        policy: 'Ordinary paid repair and visible hostile threat interception. Friendly-owner disguises and terrain disguises remain hidden unless detected. Charging troops keep their existing orders. Air and ground use separate selected groups.' };
    commands.step = async (ticks, { defend = true } = {}) => {
        let state;
        for (let done = 0; done < ticks; done += chunk) {
            if (defend) {
                const targets = await commands.page.evaluate(({ anchor, radius, ground, air }) => {
                    const d = window.__ra2debug, g = d.game, player = g.localPlayer;
                    const center = player.getOwnedObjects().find(unit => unit.name === anchor);
                    if (!center) return {};
                    for (const building of player.getOwnedObjects().filter(unit => unit.isBuilding()
                        && unit.healthTrait.health < 80 && unit.rules.clickRepairable)) {
                        const repair = building.traits.getAll().find(trait => 'healLeftover' in trait && typeof trait.isDisabled === 'function');
                        if (repair?.isDisabled()) d.actionsApi.toggleRepairWrench(building.id);
                    }
                    const shroud = g.mapShroudTrait.getPlayerShroud(player);
                    const distance = unit => Math.hypot(unit.tile.rx - center.tile.rx, unit.tile.ry - center.tile.ry);
                    const candidates = g.world.getAllObjects().filter(unit => {
                        if (!unit.isUnit() || !unit.isSpawned || unit.isDestroyed || unit.rules.naval || unit.owner.isNeutral
                            || unit.owner === player || g.alliances.areAllied(player, unit.owner)
                            || shroud.isShrouded(unit.tile, unit.tileElevation) || distance(unit) > radius) return false;
                        const disguise = unit.disguiseTrait?.getDisguise();
                        return !disguise || player.sharedDetectDisguiseTrait?.has(unit)
                            || disguise.owner && disguise.owner !== player && !g.alliances.areAllied(player, disguise.owner);
                    });
                    const threat = unit => distance(unit) - Math.max(0, unit.primaryWeapon?.range ?? 0);
                    const nearest = list => list.sort((a, b) => threat(a) - threat(b) || a.id - b.id)[0]?.id;
                    const own = player.getOwnedObjects().filter(unit => unit.isUnit() && unit.isSpawned && !unit.isDestroyed);
                    return { ground: nearest(candidates.filter(unit => unit.zone !== 1)),
                        air: nearest(candidates.filter(unit => unit.zone === 1 && distance(unit) <= 14)),
                        center: [center.tile.rx, center.tile.ry + 2],
                        returnAir: own.filter(unit => (air.includes(unit.name) || air.includes(unit.id)) && distance(unit) > 6).map(unit => unit.id),
                        returnGround: own.filter(unit => (ground.includes(unit.name) || ground.includes(unit.id)) && distance(unit) > 16).map(unit => unit.id) };
                }, { anchor, radius, ground, air });
                if (targets.ground) await commands.order(ground, 2, targets.ground);
                else if (targets.returnGround?.length) await commands.order(targets.returnGround, 0, undefined, targets.center);
                if (targets.air) await commands.order(air, 2, targets.air);
                else if (targets.returnAir?.length) await commands.order(targets.returnAir, 0, undefined, targets.center);
            }
            state = await OrdinaryCampaignCommands.prototype.step.call(commands, Math.min(chunk, ticks - done), { defend: false });
            if (state.result) break;
        }
        return state;
    };
}
