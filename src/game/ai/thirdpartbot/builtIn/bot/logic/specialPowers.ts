import { GameApi, ActionsApi, ObjectType } from '../../game-api';
import { SuperWeaponType } from '@/game/type/SuperWeaponType';
import { SuperWeaponStatus } from '@/game/SuperWeapon';

export function useSpecialPowers(game: GameApi, actions: ActionsApi, playerName: string): void {
    const mayAttack = game.getCurrentTick() >= (game.getPlayerData(playerName).aiPacing?.firstAttack ?? 0);
    const ready = game.getAllSuperWeaponData().filter((s: any) => s.playerName === playerName && s.status === SuperWeaponStatus.Ready);
    if (!ready.length) return;
    const enemies = game.getVisibleUnits(playerName, 'enemy').map(id => game.getGameObjectData(id)).filter(Boolean) as any[];
    const own = game.getVisibleUnits(playerName, 'self').map(id => game.getGameObjectData(id)).filter(Boolean) as any[];
    for (const power of ready as any[]) {
        if (!mayAttack && power.type !== SuperWeaponType.ForceShield) continue;
        let target: any, destination: any;
        switch (power.type) {
            case SuperWeaponType.MultiMissile:
            case SuperWeaponType.LightningStorm:
                target = enemies.filter(u => u.rules.type === ObjectType.Building)
                    .sort((a, b) => (b.rules.cost || 0) - (a.rules.cost || 0))[0]?.tile;
                break;
            case SuperWeaponType.AmerParaDrop:
            case SuperWeaponType.ParaDrop:
                target = enemies.find(u => u.rules.type === ObjectType.Building)?.tile;
                break;
            case SuperWeaponType.IronCurtain:
                target = own.filter(u => u.rules.type === ObjectType.Vehicle && !u.rules.organic && !u.rules.harvester &&
                    enemies.some(v => Math.hypot(v.tile.rx - u.tile.rx, v.tile.ry - u.tile.ry) < 12))
                    .sort((a, b) => (b.rules.cost || 0) - (a.rules.cost || 0))[0]?.tile;
                break;
            case SuperWeaponType.ChronoSphere: {
                const tank = own.find(u => u.rules.type === ObjectType.Vehicle && !u.rules.naval && !u.rules.organic && !u.rules.harvester && !!u.rules.primary);
                const enemy = enemies.find(u => u.rules.constructionYard) ?? enemies.find(u => u.rules.type === ObjectType.Building);
                if (tank && enemy && Math.hypot(tank.tile.rx - enemy.tile.rx, tank.tile.ry - enemy.tile.ry) > 15) {
                    for (let dx = -5; dx <= 5 && !destination; dx++) for (let dy = -5; dy <= 5 && !destination; dy++) {
                        const center = game.mapApi.getTile(enemy.tile.rx + dx, enemy.tile.ry + dy);
                        if (!center || Math.hypot(dx, dy) < 4) continue;
                        const tiles = [-1, 0, 1].flatMap(x => [-1, 0, 1].map(y => game.mapApi.getTile(center.rx + x, center.ry + y)));
                        if (tiles.every(t => t && game.mapApi.isPassableTile(t, tank.rules.speedType, false) && !game.mapApi.getObjectsOnTile(t).length)) destination = center;
                    }
                    if (destination) target = tank.tile;
                }
                break;
            }
            case SuperWeaponType.PsychicReveal:
            case SuperWeaponType.SpyPlane:
                target = enemies.find(u => u.rules?.constructionYard)?.tile;
                if (!target) {
                    const enemy = game.getPlayers().find(p => p !== playerName && !game.areAlliedPlayers(playerName, p) && !game.isPlayerDefeated(p));
                    target = enemy && game.getPlayerData(enemy).startLocation;
                }
                break;
            case SuperWeaponType.PsychicDominator:
            case SuperWeaponType.GeneticConverter: {
                const candidates = enemies.filter(u => power.type === SuperWeaponType.GeneticConverter
                    ? u.rules?.type === ObjectType.Infantry : !u.rules?.immuneToPsionics && u.rules?.type !== ObjectType.Building);
                const radius = power.type === SuperWeaponType.GeneticConverter ? 5 : 1;
                target = candidates.map(u => ({ tile: u.tile, value: candidates.filter(v => Math.hypot(v.tile.rx - u.tile.rx, v.tile.ry - u.tile.ry) <= radius)
                    .reduce((sum, v) => sum + (v.rules?.cost || 1), 0) })).sort((a, b) => b.value - a.value)[0]?.tile;
                break;
            }
            case SuperWeaponType.ForceShield:
                target = own.filter(u => u.rules?.type === ObjectType.Building && u.hitPoints < .75 * u.maxHitPoints &&
                    enemies.some(v => Math.hypot(v.tile.rx - u.tile.rx, v.tile.ry - u.tile.ry) < 10))
                    .sort((a, b) => (b.rules?.cost ?? 0) - (a.rules?.cost ?? 0))[0]?.tile;
                break;
        }
        if (target) actions.activateSuperWeapon(power.type, { rx: target.rx ?? target.x, ry: target.ry ?? target.y }, destination);
    }
}
