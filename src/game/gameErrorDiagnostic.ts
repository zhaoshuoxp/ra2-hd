const PREFIX = '[Game error] ';

export function createGameErrorDiagnostic(error: any, game?: any): any {
    const describe = (object: any) => ({
        name: String(object.name).slice(0, 64), id: object.id, spawned: object.isSpawned, destroyed: object.isDestroyed,
        crashing: object.isCrashing, limbo: !!object.limboData, ammo: object.ammo, zone: object.zone,
        tile: object.tile && [object.tile.rx, object.tile.ry], elevation: object.tileElevation,
        parentId: object.spawnLinkTrait?.getParent()?.id,
    });
    const parents = (game?.getWorld()?.getAllObjects() ?? []).filter((object: any) => object.airSpawnTrait).slice(0, 16);
    return {
        schema: 'game-error-v1', time: new Date().toISOString(), map: game?.gameOpts?.mapName,
        tick: game?.currentTick,
        error: { name: String(error?.name ?? 'Error').slice(0, 128),
            message: String(error?.message ?? error).slice(0, 2048), stack: String(error?.stack ?? '').slice(0, 16384) },
        airSpawns: parents.map((parent: any) => ({ ...describe(parent), stored: parent.airSpawnTrait.availableSpawns,
            children: parent.airSpawnTrait.spawns.slice(0, 4).map(describe) })),
    };
}

export function reportGameError(error: any, game?: any): void {
    try { console.error(PREFIX + JSON.stringify(createGameErrorDiagnostic(error, game))); }
    catch { /* Diagnostics must never replace the original error dialog. */ }
}
