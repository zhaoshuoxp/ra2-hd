// Scenario PlayerControl extends input authority without merging ownership,
// credits, diplomacy or objective counts. Ordinary allies do not grant control.
export function canControlOwner(player: any, owner: any): boolean {
    return player !== undefined && player !== null && (owner === player || owner?.campaignController === player);
}

export function controllablePlayers(player: any): any[] {
    return player?.campaignControlledPlayers ?? (player ? [player] : []);
}

export function controllableObjects(player: any): any[] {
    return controllablePlayers(player).flatMap(owner => owner.getOwnedObjects());
}
