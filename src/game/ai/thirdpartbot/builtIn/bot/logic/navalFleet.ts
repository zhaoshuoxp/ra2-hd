import { ActionsApi, GameApi, ObjectType, OrderType, ProductionApi, QueueType, SpeedType, ZoneType } from '../../game-api';

// Naval units use their own production queue and reachable water, rather than
// joining land squads whose rally points and paths may be inaccessible.
export function updateNavalFleet(game: GameApi, actions: ActionsApi, production: ProductionApi, playerName: string): void {
    const pacing = game.getPlayerData(playerName).aiPacing;
    const mayAttack = game.getCurrentTick() >= (pacing?.firstAttack ?? 0);
    const ships = game.getVisibleUnits(playerName, 'self', r => r.type === ObjectType.Vehicle && r.naval && !!r.primary)
        .map(id => game.getUnitData(id)).filter(Boolean);
    const available = production.getAvailableObjects(QueueType.Ships);
    if (ships.length < (pacing?.maxShips ?? 4) && !production.getQueueData(QueueType.Ships).size && game.getPlayerData(playerName).credits >= 1500) {
        const capitals = ['BSUB', 'CARRIER', 'DRED'];
        const capitalCount = ships.filter(s => capitals.includes(s!.name)).length;
        const escorts = ['DEST', 'SUB', 'AEGIS', 'DLPH', 'SQD'];
        const preferences = capitalCount < (pacing?.maxCapitalShips ?? 2) ? [...capitals, ...escorts] : escorts;
        const choice = preferences.map(name => available.find(r => r.name === name)).find(Boolean);
        if (choice) actions.queueForProduction(QueueType.Ships, choice.type, choice.name, 1);
    }
    const enemies = game.getVisibleUnits(playerName, 'enemy').map(id => game.getUnitData(id)).filter(Boolean);
    if (!ships.length || !mayAttack) return;
    const water = game.mapApi.getReachabilityMap(SpeedType.Float, false);
    for (const ship of ships) {
        if (!ship!.isIdle) continue;
        const weapons = [ship!.primaryWeapon, ship!.secondaryWeapon].filter(Boolean);
        const targets = enemies.filter(enemy => {
            if (enemy!.zone === ZoneType.Water) return weapons.some(w => w.projectileRules.isAntiGround);
            if (enemy!.zone === ZoneType.Air) return weapons.some(w => w.projectileRules.isAntiAir);
            return ['BSUB', 'DRED', 'CARRIER', 'DEST'].includes(ship!.name);
        }).sort((a, b) => Math.hypot(a!.tile.rx - ship!.tile.rx, a!.tile.ry - ship!.tile.ry) - Math.hypot(b!.tile.rx - ship!.tile.rx, b!.tile.ry - ship!.tile.ry));
        let attacked = false;
        for (const target of targets) {
            const weapon = target!.rules.naval ? ship!.primaryWeapon : ship!.secondaryWeapon ?? ship!.primaryWeapon;
            const range = weapon?.maxRange ?? 0;
            const tile = findWaterNear(target!.tile, range, ship!, game, water);
            if (!tile) continue;
            actions.orderUnits([ship!.id], OrderType.Attack, target!.id);
            attacked = true;
            break;
        }
        if (attacked) continue;
        const opponent = game.getPlayers().find(name => name !== playerName && !game.areAlliedPlayers(playerName, name) && !game.isPlayerDefeated(name));
        if (!opponent) continue;
        const point = game.getPlayerData(opponent).startLocation;
        const destination = findWaterNear({ rx: point.x, ry: point.y }, 40, ship!, game, water);
        if (destination && Math.hypot(destination.rx - ship!.tile.rx, destination.ry - ship!.tile.ry) > 2) {
            actions.orderUnits([ship!.id], OrderType.Move, destination.rx, destination.ry);
        }
    }
}
function findWaterNear(center: any, radius: number, ship: any, game: GameApi, reachability: any): any {
    for (let ring = 0; ring <= Math.ceil(radius); ring++) {
        const perimeter = ring ? Array.from({ length: ring * 2 }, (_, i) => i - ring).flatMap(n => [[n, -ring], [ring, n], [-n, ring], [-ring, -n]]) : [[0, 0]];
        for (const [dx, dy] of perimeter) {
            if (Math.hypot(dx, dy) > radius) continue;
            const tile = game.mapApi.getTile(center.rx + dx, center.ry + dy);
            if (tile && game.mapApi.isPassableTile(tile, SpeedType.Float, false) && reachability.isReachable({ tile: ship.tile }, { tile })) return tile;
        }
    }
}
