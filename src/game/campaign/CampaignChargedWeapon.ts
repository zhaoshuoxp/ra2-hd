// Map-wide charged combat is the user's requested Soviet05 extension. Original
// map/weapon bytes and released journal policies remain unchanged.
export function campaignChargedWeaponRange(shooter: any, weapon: any): number | undefined {
    if (shooter?.owner?.campaignChargingVersion !== 1 || !shooter?.campaignMapWeaponRange
        || weapon?.rules?.name !== 'EiffelBolt' || !shooter.overpoweredTrait?.hasChargersToPowerOn()
        || shooter.owner.isAi || !shooter.poweredTrait?.isPoweredOn()) return;
    return shooter.campaignMapWeaponRange;
}

// A receiver can be inside an original EnteredBy ring that enables its delayed
// ownership trigger. Walk through that source ring before charging; a ranged
// approach otherwise stops outside it and leaves the original handoff dormant.
export function campaignChargeApproach(game: any, shooter: any, receiver: any): { tile: any; wait: number } | undefined {
    const campaign = game.campaign;
    if (!receiver?.campaignMapWeaponRange || !canCampaignChargeTarget(shooter, receiver, game)
        || receiver.owner.campaignController === shooter.owner.campaignController || !receiver.tag) return;
    const definition = campaign.definition, root = definition.tags.get(receiver.tag.id)?.trigger;
    const receiverTrigger = root && definition.triggerChain(root).map((id: string) => definition.triggers.get(id))
        .find((trigger: any) => trigger.actions.some((action: any) => action.opcode === 14
        && campaign.resolveHouse(Number(action.params[1])) === shooter.owner));
    if (!receiverTrigger) return;
    const cells = definition.cellTags.filter((cell: any) => {
        const trigger = definition.triggers.get(definition.tags.get(cell.tag)?.trigger), state = trigger && campaign.machine.states.get(trigger.id);
        return state?.enabled && !state.fired && trigger.events.some((event: any) => event.opcode === 1
            && campaign.resolveHouse(Number(event.params[1])) === shooter.owner)
            && trigger.actions.some((action: any) => action.opcode === 53 && action.params[1] === receiverTrigger.id);
    }).map((cell: any) => game.map.tiles.getByMapCoords(cell.x, cell.y)).filter((tile: any) => tile
        && Math.abs(tile.rx - receiver.tile.rx) + Math.abs(tile.ry - receiver.tile.ry) < 16);
    cells.sort((a: any, b: any) => Math.hypot(a.rx - shooter.tile.rx, a.ry - shooter.tile.ry)
        - Math.hypot(b.rx - shooter.tile.rx, b.ry - shooter.tile.ry) || a.ry - b.ry || a.rx - b.rx);
    if (!cells.length) return;
    const seconds = Math.max(0, ...receiverTrigger.events.filter((event: any) => event.opcode === 13)
        .map((event: any) => Number(event.params[1])));
    return { tile: cells[0], wait: seconds * 15 + 2 };
}

export function canCampaignChargeTarget(shooter: any, target: any, relations?: { areFriendly(a: any, b: any): boolean }): boolean {
    return shooter?.owner?.campaignChargingVersion === 1 && !!target?.isBuilding?.() && !!target.overpoweredTrait
        && (shooter.owner === target.owner || !!target.campaignMapWeaponRange && (!!relations?.areFriendly(shooter, target)
            || !!shooter.owner.campaignController && !!relations?.areFriendly({ owner: shooter.owner.campaignController }, target)));
}
