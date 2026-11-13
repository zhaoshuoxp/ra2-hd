import { Coords } from '../Coords';
import { GameSpeed } from '../GameSpeed';
import { LightningStormCloudEvent } from '../event/LightningStormCloudEvent';
import { CollisionType } from '../gameobject/unit/CollisionType';
import { Warhead } from '../Warhead';

interface Strike { tile: any; animationName: string; elevation: number; duration: number; remaining: number; hitRemaining: number }
export interface CampaignLightningVisual { position: any; animationName: string; frame: number }

export function campaignLightningVisual(game: any, tile: any, name: string, duration: number, remaining: number,
    elevation: number): CampaignLightningVisual {
    const animation = game.art.getAnimation(name), rate = animation.art.getNumber('Rate', 60 * GameSpeed.BASE_TICKS_PER_SECOND);
    const frame = Math.min(animation.animationFrameCount - 1,
        Math.floor((duration - remaining) * rate / (60 * GameSpeed.BASE_TICKS_PER_SECOND)));
    return { position: Coords.tile3dToWorld(tile.rx + .5, tile.ry + .5, tile.z + elevation), animationName: name, frame };
}

export function campaignLightningTiming(animation: any): { duration: number; hitRemaining: number } {
    const frames = animation.animationFrameCount, rate = animation.art.getNumber('Rate', 60 * GameSpeed.BASE_TICKS_PER_SECOND);
    if (!Number.isSafeInteger(frames) || frames < 2 || !Number.isFinite(rate) || rate <= 0) throw new Error('Invalid original lightning cloud animation');
    const ticksPerFrame = GameSpeed.BASE_TICKS_PER_SECOND * 60 / rate;
    const duration = Math.ceil(frames * ticksPerFrame);
    // Original cloud dispatch compares animation stage strictly above half
    // the source frame count. Simulation owns that boundary, not rendering.
    const hit = Math.ceil((Math.floor(frames / 2) + 1) * ticksPerFrame);
    return { duration, hitRemaining: duration - hit };
}

// Action 90 creates one cloud, without starting the weather controller,
// radar blackout or subsequent random strikes. Damage follows cloud timing.
export class CampaignLightning {
    private strikes: Strike[] = [];
    constructor(private game: any) {}
    strike(tile: any): void {
        const names = this.game.rules.audioVisual.weatherConClouds;
        if (!names.length) throw new Error('Missing original lightning cloud animations');
        const name = names[this.game.generateRandomInt(0, names.length - 1)];
        const timing = campaignLightningTiming(this.game.art.getAnimation(name));
        const elevation = (this.game.map.tileOccupation.getBridgeOnTile(tile)?.tileElevation ?? 0)
            + Coords.worldToTileHeight(this.game.rules.general.flightLevel);
        this.strikes.push({ tile, animationName: name, elevation, ...timing, remaining: timing.duration });
        this.game.events.dispatch(new LightningStormCloudEvent(Coords.tile3dToWorld(tile.rx + .5, tile.ry + .5, tile.z + elevation), name));
    }
    update(): void {
        for (const strike of this.strikes) {
            if (--strike.remaining !== strike.hitRemaining) continue;
            const { tile } = strike, rules = this.game.rules.general.lightningStorm;
            const bridge = this.game.map.tileOccupation.getBridgeOnTile(tile), elevation = bridge?.tileElevation ?? 0;
            new Warhead(this.game.rules.getWarhead(rules.warhead)).detonate(this.game, rules.damage, tile, elevation,
                Coords.tile3dToWorld(tile.rx + .5, tile.ry + .5, tile.z + elevation), this.game.map.getTileZone(tile),
                bridge ? CollisionType.OnBridge : CollisionType.None, this.game.createTarget(bridge, tile),
                undefined, false, undefined, undefined, true);
        }
        this.strikes = this.strikes.filter(strike => strike.remaining > 0);
    }
    snapshot(): unknown {
        return this.strikes.map(strike => ({ tile: [strike.tile.rx, strike.tile.ry], animationName: strike.animationName,
            elevation: strike.elevation, duration: strike.duration,
            remaining: strike.remaining, hitRemaining: strike.hitRemaining }));
    }
    presentation(): CampaignLightningVisual[] {
        return this.strikes.map(strike => campaignLightningVisual(this.game, strike.tile, strike.animationName,
            strike.duration, strike.remaining, strike.elevation));
    }
}
