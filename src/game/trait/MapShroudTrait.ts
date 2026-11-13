import { MapShroud, ShroudFlag } from "@/game/map/MapShroud";
import { NotifyTick } from "@/game/trait/interface/NotifyTick";
import { NotifyOwnerChange } from "@/game/trait/interface/NotifyOwnerChange";
import { NotifyAllianceChange } from "@/game/trait/interface/NotifyAllianceChange";
import { isNotNullOrUndefined } from "@/util/typeGuard";
import { NotifySpawn } from "@/game/trait/interface/NotifySpawn";
import { NotifyUnspawn } from "@/game/trait/interface/NotifyUnspawn";
import { RadarTrait } from "@/game/trait/RadarTrait";
import { RadarEventType } from "@/game/rules/general/RadarRules";
import { ObjectType } from "@/engine/type/ObjectType";
import { NotifyPower } from "@/game/trait/interface/NotifyPower";
import { NotifyElevationChange } from "@/game/trait/interface/NotifyElevationChange";
export class MapShroudTrait implements NotifyTick, NotifyOwnerChange, NotifyAllianceChange, NotifySpawn, NotifyUnspawn, NotifyPower, NotifyElevationChange {
    private map: any;
    private alliances: any;
    private shroudByPlayer: Map<any, any>;
    private revealedToAll: Set<any>;
    private gapGenerators: Set<any>;
    private sourceScouting = false;
    private allyReveal = true;
    private handleTileOccupationUpdate: (params: {
        object: any;
        type: string;
    }) => void;
    constructor(map: any, alliances: any) {
        this.map = map;
        this.alliances = alliances;
        this.shroudByPlayer = new Map();
        this.revealedToAll = new Set();
        this.gapGenerators = new Set();
        this.handleTileOccupationUpdate = ({ object: e, type: t }) => {
            if ("removed" !== t && e.isTechno()) {
                const r = e.owner;
                for (const i of [r, ...this.scoutingAllies(r)]) {
                    this.shroudByPlayer.get(i)?.revealFrom(e);
                }
            }
        };
    }
    getPlayerShroud(player: any) {
        return this.shroudByPlayer.get(player);
    }
    init(gameState: any) {
        this.sourceScouting = (gameState.gameOpts?.campaign?.semanticsVersion ?? 0) >= 19;
        this.allyReveal = !this.sourceScouting || gameState.rules.getIni().getSection('General').getBool('AllyReveal', true);
        gameState.map.tileOccupation.onChange.subscribe(this.handleTileOccupationUpdate);
        const baseShroud = new MapShroud().fromTiles(this.map.tiles);
        for (const combatant of gameState.getCombatants()) {
            const playerShroud = baseShroud.clone();
            this.shroudByPlayer.set(combatant, playerShroud);
            this.revealObjects(playerShroud, combatant, gameState);
            playerShroud.update();
        }
    }
    [NotifyElevationChange.onElevationChange](object: any, gameState: any, previousElevation: number) {
        if (Math.floor(object.tileElevation) !== Math.floor(previousElevation)) {
            const owner = object.owner;
            for (const ally of [owner, ...this.scoutingAllies(owner)]) {
                this.shroudByPlayer.get(ally)?.revealFrom(object);
            }
        }
    }
    [NotifyTick.onTick](gameState: any) {
        for (const [player, shroud] of this.shroudByPlayer) {
            if (player.defeated && !player.isObserver) {
                this.shroudByPlayer.delete(player);
            }
            else {
                shroud.update();
            }
        }
    }
    [NotifyOwnerChange.onChange](object: any, previousOwner: any, gameState: any) {
        if (object.isBuilding() &&
            object.rules.spySat &&
            (this.revealMap(object.owner, gameState),
                previousOwner
                    .getOwnedObjectsByType(ObjectType.Building)
                    .find((e: any) => e.rules.spySat) || this.resetShroud(previousOwner, gameState))) {
        }
        if (object.isSpawned) {
            for (const ally of [object.owner, ...this.scoutingAllies(object.owner)]) {
                this.shroudByPlayer.get(ally)?.revealFrom(object);
            }
        }
    }
    [NotifyAllianceChange.onChange](alliance: any, isFormed: boolean, gameState: any) {
        if (this.sourceScouting) {
            if (isFormed) for (const player of gameState.getCombatants()) {
                const shroud = this.getPlayerShroud(player);
                if (shroud) { this.revealObjects(shroud, player, gameState); shroud.invalidateFull(); }
            }
            return;
        }
        if (isFormed) {
            const firstPlayerShroud = this.getPlayerShroud(alliance.players.first);
            const alliedShrouds = gameState.alliances
                .getAllies(alliance.players.first)
                .map((player: any) => this.getPlayerShroud(player))
                .filter(isNotNullOrUndefined);
            for (const alliedShroud of alliedShrouds) {
                firstPlayerShroud.merge(alliedShroud);
            }
            firstPlayerShroud.invalidateFull();
            for (const alliedShroud of alliedShrouds) {
                alliedShroud.copy(firstPlayerShroud);
                alliedShroud.invalidateFull();
            }
        }
    }
    [NotifySpawn.onSpawn](object: any, gameState: any) {
        if (object.isBuilding()) {
            if (object.rules.spySat) {
                this.revealMap(object.owner, gameState);
            }
            if (object.rules.revealToAll) {
                this.revealedToAll.add(object);
                for (const combatant of gameState.getCombatants()) {
                    if (combatant === object.owner || gameState.alliances.areAllied(object.owner, combatant)) {
                        continue;
                    }
                    this.shroudByPlayer.get(combatant)?.revealObject(object);
                    gameState.traits
                        .get(RadarTrait)
                        .addEventForPlayer(RadarEventType.EnemyObjectSensed, combatant, object.centerTile, gameState);
                }
            }
            if (object.gapGeneratorTrait) {
                this.gapGenerators.add(object);
            }
        }
    }
    [NotifyUnspawn.onUnspawn](object: any, gameState: any) {
        if (object.isBuilding()) {
            if (object.rules.spySat &&
                !object.owner
                    .getOwnedObjectsByType(ObjectType.Building)
                    .find((e: any) => e.rules.spySat)) {
                this.resetShroud(object.owner, gameState);
            }
            if (object.rules.revealToAll) {
                this.revealedToAll.delete(object);
            }
            if (object.gapGeneratorTrait) {
                this.gapGenerators.delete(object);
            }
        }
    }
    [NotifyPower.onPowerLow](player: any, gameState: any) {
        this.updateGaps(gameState, player);
    }
    [NotifyPower.onPowerRestore](player: any, gameState: any) {
        this.updateGaps(gameState, player);
    }
    [NotifyPower.onPowerChange](player: any, gameState: any) { }
    revealMap(player: any, gameState: any) {
        this.shroudByPlayer.get(player)?.revealAll();
        this.markOwnGapTiles(gameState, player);
        this.updateGaps(gameState);
    }
    resetShroud(player: any, gameState: any) {
        const shroud = this.shroudByPlayer.get(player);
        if (shroud) {
            shroud.reset();
            this.markOwnGapTiles(gameState, player);
            this.revealObjects(shroud, player, gameState);
        }
    }
    revealObjects(shroud: any, player: any, gameState: any) {
        // Source alliances are directed: the object owner grants its sight to
        // the viewer. Reading the viewer's outgoing list exposes neutral
        // prisoners before the player reaches their original discovery tags.
        const allies = this.sourceScouting ? this.allyReveal
            ? gameState.getCombatants().filter((owner: any) => owner !== player && gameState.alliances.areAllied(owner, player)) : []
            : gameState.alliances.getAllies(player);
        const objectsToReveal = [
            ...player.getOwnedObjects(),
            ...allies.flatMap((ally: any) => ally.getOwnedObjects()),
        ];
        for (const object of objectsToReveal) {
            shroud.revealFrom(object);
        }
        this.revealedToAll.forEach((object) => shroud.revealObject(object));
    }
    private scoutingAllies(owner: any): any[] { return this.sourceScouting && !this.allyReveal ? [] : this.alliances.getAllies(owner); }
    updateGaps(gameState: any, specificPlayer?: any) {
        for (const gapGenerator of this.gapGenerators) {
            if (!specificPlayer || gapGenerator.owner === specificPlayer) {
                gapGenerator.gapGeneratorTrait.update(gapGenerator, gameState);
            }
        }
    }
    markOwnGapTiles(gameState: any, player: any) {
        for (const gapGenerator of this.gapGenerators) {
            if (gapGenerator.owner === player || gameState.alliances.areAllied(gapGenerator.owner, player)) {
                this.getPlayerShroud(player)?.toggleFlagsAround(gapGenerator.tile, gapGenerator.gapGeneratorTrait.radiusTiles, ShroudFlag.Darken, true);
            }
        }
    }
    dispose() {
        this.map.tileOccupation.onChange.unsubscribe(this.handleTileOccupationUpdate);
    }
}
