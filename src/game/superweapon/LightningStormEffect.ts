import { Coords } from "@/game/Coords";
import { LightningStormCloudEvent } from "@/game/event/LightningStormCloudEvent";
import { LightningStormManifestEvent } from "@/game/event/LightningStormManifestEvent";
import { CollisionType } from "@/game/gameobject/unit/CollisionType";
import { RangeHelper } from "@/game/gameobject/unit/RangeHelper";
import { GameSpeed } from "@/game/GameSpeed";
import { RandomTileFinder } from "@/game/map/tileFinder/RandomTileFinder";
import { Warhead } from "@/game/Warhead";
import { SuperWeaponEffect, TileCoord } from "@/game/superweapon/SuperWeaponEffect";
import { Game } from "@/game/Game";
import { Vector3 } from "@/game/math/Vector3";
import { campaignLightningTiming, campaignLightningVisual } from '../campaign/CampaignLightning';
import { Player } from '../Player';
enum LightningStormState {
    Approaching,
    Manifesting
}
interface Cloud {
    tile: TileCoord;
    durationTicks: number;
    ticksLeft: number;
    hitRemaining?: number;
    animationName?: string;
    elevation?: number;
}
export class LightningStormEffect extends SuperWeaponEffect {
    private state: LightningStormState = LightningStormState.Approaching;
    private clouds: Cloud[] = [];
    private manifestStartTimer: number = 0;
    private manifestEndTimer: number = 0;
    private nextDirectHitTimer: number = 0;
    private nextRandomHitTimer: number = 0;
    constructor(type: any, owner: Player, tile: TileCoord, private readonly campaignDuration?: number) {
        super(type, owner, tile);
    }
    onStart(game: Game): void {
        const lightningStorm = game.rules.general.lightningStorm;
        this.manifestStartTimer = lightningStorm.deferment;
        this.manifestEndTimer = this.campaignDuration ?? lightningStorm.duration;
        this.nextDirectHitTimer = 0;
        this.nextRandomHitTimer = 0;
    }
    onTick(game: Game): boolean {
        if (this.state === LightningStormState.Approaching) {
            if (this.manifestStartTimer > 0) {
                this.manifestStartTimer--;
            }
            else {
                this.state = LightningStormState.Manifesting;
                game.events.dispatch(new LightningStormManifestEvent(this.tile));
            }
        }
        if (this.state === LightningStormState.Manifesting) {
            const lightningStorm = game.rules.general.lightningStorm;
            if (this.manifestEndTimer > 0) {
                this.manifestEndTimer--;
                if (this.nextDirectHitTimer > 0) {
                    this.nextDirectHitTimer--;
                }
                if (this.nextDirectHitTimer <= 0) {
                    this.nextDirectHitTimer = lightningStorm.hitDelay;
                    this.spawnCloudAt(this.tile, game);
                }
                if (this.nextRandomHitTimer > 0) {
                    this.nextRandomHitTimer--;
                }
                if (this.nextRandomHitTimer <= 0) {
                    this.nextRandomHitTimer = lightningStorm.scatterDelay;
                    const radius = Math.floor(lightningStorm.cellSpread / 2);
                    const separation = lightningStorm.separation;
                    const rangeHelper = new RangeHelper(game.map.tileOccupation);
                    const tileFinder = new RandomTileFinder(game.map.tiles, game.map.mapBounds, this.tile, radius, game, (tile) => !this.clouds.some(cloud => rangeHelper.tileDistance(tile, cloud.tile) < separation), false);
                    const randomTile = tileFinder.getNextTile();
                    if (randomTile) {
                        this.spawnCloudAt(randomTile, game);
                    }
                }
            }
            for (const cloud of this.clouds.slice()) {
                if (cloud.ticksLeft > 0) {
                    cloud.ticksLeft--;
                    if (cloud.ticksLeft === (cloud.hitRemaining ?? Math.floor(cloud.durationTicks / 2))) {
                        const warheadName = lightningStorm.warhead;
                        const warhead = new Warhead(game.rules.getWarhead(warheadName));
                        const tile = cloud.tile;
                        const bridge = game.map.tileOccupation.getBridgeOnTile(tile);
                        const elevation = bridge?.tileElevation ?? 0;
                        const zone = game.map.getTileZone(tile);
                        warhead.detonate(game as any, lightningStorm.damage, tile, elevation,
                            Coords.tile3dToWorld(tile.rx + .5, tile.ry + .5, tile.z + elevation), zone,
                            bridge ? CollisionType.OnBridge : CollisionType.None, game.createTarget(bridge, tile),
                            this.owner ? { player: this.owner, weapon: undefined } as any : undefined,
                            false, undefined, undefined, true);
                    }
                }
                else {
                    this.clouds.splice(this.clouds.indexOf(cloud), 1);
                }
            }
            if (!this.clouds.length && this.manifestEndTimer <= 0) {
                return true;
            }
        }
        return false;
    }
    private spawnCloudAt(tile: TileCoord, game: Game): void {
        const clouds = game.rules.audioVisual.weatherConClouds;
        const cloudIndex = game.generateRandomInt(0, clouds.length - 1);
        const animation = game.art.getAnimation(clouds[cloudIndex]);
        const rate = animation.art.getNumber("Rate", 60 * GameSpeed.BASE_TICKS_PER_SECOND) / 60;
        const timing = (game.gameOpts.campaign?.semanticsVersion ?? 0) >= 12 ? campaignLightningTiming(animation) : undefined;
        const durationTicks = timing?.duration ?? Math.floor((GameSpeed.BASE_TICKS_PER_SECOND / rate) * 60);
        const elevation = (game.map.tileOccupation.getBridgeOnTile(tile)?.tileElevation ?? 0) +
            Coords.worldToTileHeight(game.rules.general.flightLevel);
        this.clouds.push({
            tile,
            durationTicks,
            ticksLeft: durationTicks,
            ...(timing ? { hitRemaining: timing.hitRemaining, animationName: clouds[cloudIndex], elevation } : {})
        });
        const position = Coords.tile3dToWorld(tile.rx + 0.5, tile.ry + 0.5, tile.z + elevation);
        game.events.dispatch(new LightningStormCloudEvent(position, timing ? clouds[cloudIndex] : undefined));
    }
    campaignSnapshot(): unknown {
        return { owner: this.owner?.name ?? null, tile: [this.tile.rx, this.tile.ry], status: this.status, state: this.state,
            ...(this.campaignDuration === undefined ? {} : { campaignDuration: this.campaignDuration }),
            manifestStartTimer: this.manifestStartTimer, manifestEndTimer: this.manifestEndTimer,
            nextDirectHitTimer: this.nextDirectHitTimer, nextRandomHitTimer: this.nextRandomHitTimer,
            clouds: this.clouds.map(cloud => ({ tile: [cloud.tile.rx, cloud.tile.ry], duration: cloud.durationTicks,
                remaining: cloud.ticksLeft, hitRemaining: cloud.hitRemaining, animationName: cloud.animationName,
                elevation: cloud.elevation })) };
    }
    campaignPresentation(game: Game): { manifestTicks?: number; clouds: ReturnType<typeof campaignLightningVisual>[] } {
        return { ...(this.state === LightningStormState.Manifesting ? { manifestTicks: this.manifestEndTimer } : {}),
            clouds: this.clouds.filter(cloud => cloud.animationName && cloud.ticksLeft > 0).map(cloud =>
                campaignLightningVisual(game, cloud.tile, cloud.animationName!, cloud.durationTicks, cloud.ticksLeft, cloud.elevation!)) };
    }
}
