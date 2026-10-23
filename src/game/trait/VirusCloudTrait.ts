import { NotifyDestroy } from './interface/NotifyDestroy';
import { NotifyTick } from './interface/NotifyTick';
import { InfDeathType } from '../gameobject/infantry/InfDeathType';
import { Warhead } from '../Warhead';
import { RadialTileFinder } from '../map/tileFinder/RadialTileFinder';
import { TriggerAnimEvent } from '../event/TriggerAnimEvent';
import { globalRules } from '../rules/globalRules';
import { GameSpeed } from '../GameSpeed';
import { fnv32a } from '@/util/math';
import { Coords } from '../Coords';
import { Vector3 } from '../math/Vector3';
interface Cloud {
    tile: any;
    particle: string;
    starts: number;
    expires: number;
    nextDamage: number;
    source: any;
    visible: boolean;
    position: Vector3;
    velocity: { x: number; y: number };
    active: boolean;
}
export class VirusCloudTrait {
    private clouds: Cloud[] = [];
    [NotifyDestroy.onDestroy](unit: any, game: any, source: any): void {
        if (!unit.isInfantry() || !unit.rules.isHuman || unit.infDeathType !== InfDeathType.Virus) return;
        const anim = game.art.getAnimation(globalRules(game.rules).getString('InfantryVirus'));
        const particle = anim.art.getString('SpawnsParticle');
        if (!particle) return;
        const frames = anim.animationFrameCount ?? 0;
        const delay = Math.ceil(frames * GameSpeed.BASE_TICKS_PER_SECOND / (anim.art.getNumber('Rate', 900) / 60));
        for (let i = 0; i < anim.art.getNumber('NumParticles'); i++) this.add(particle, unit.tile, game.currentTick + delay, source, game);
    }
    private add(particle: string, tile: any, starts: number, source: any, game: any, position?: Vector3): void {
        const rules = game.rules.getIni().getSection(particle);
        if (!rules) return;
        this.clouds.push({ tile, particle, starts, expires: starts + rules.getNumber('MaxEC'),
            nextDamage: starts + rules.getNumber('MaxDC'), source, visible: false, active: true,
            position: position?.clone() ?? Coords.tile3dToWorld(tile.rx + .5, tile.ry + .5, tile.z),
            // YR gas drift is capped at two leptons per axis per simulation tick.
            velocity: { x: game.generateRandomInt(-2, 2), y: game.generateRandomInt(-2, 2) } });
    }
    [NotifyTick.onTick](game: any): void {
        for (const cloud of [...this.clouds]) {
            if (game.currentTick < cloud.starts) continue;
            const rules = game.rules.getIni().getSection(cloud.particle);
            if (game.currentTick >= cloud.expires) {
                cloud.active = false;
                this.clouds.splice(this.clouds.indexOf(cloud), 1);
                const next = rules.getString('NextParticle');
                if (next) this.add(next, cloud.tile, game.currentTick, cloud.source, game, cloud.position);
                continue;
            }
            cloud.position.x += cloud.velocity.x;
            cloud.position.z += cloud.velocity.y;
            const tileAtPosition = game.map.tiles.getByMapCoords(Math.floor(cloud.position.x / Coords.LEPTONS_PER_TILE), Math.floor(cloud.position.z / Coords.LEPTONS_PER_TILE));
            if (tileAtPosition) cloud.tile = tileAtPosition;
            if (!cloud.visible) {
                cloud.visible = true;
                const frames = rules.getNumber('EndStateAI') - rules.getNumber('StartFrame') + 1;
                const advance = Math.max(1, rules.getNumber('StateAIAdvance'));
                game.events.dispatch(new TriggerAnimEvent(rules.getString('Image'), cloud.tile, false, {
                    Start: String(rules.getNumber('StartFrame')), End: String(rules.getNumber('EndStateAI')),
                    Rate: String(900 / advance), LoopCount: String(Math.max(1, Math.ceil(rules.getNumber('MaxEC') / (frames * advance)))),
                    Translucency: String(rules.getNumber('Translucency', 0)),
                }, cloud));
            }
            if (game.currentTick >= cloud.nextDamage) {
                cloud.nextDamage += Math.max(1, rules.getNumber('MaxDC'));
                const warhead = new Warhead(game.rules.getWarhead(rules.getString('Warhead')));
                const targets = new Set<any>();
                const finder = new RadialTileFinder(game.map.tiles, game.map.mapBounds, cloud.tile, { width: 1, height: 1 }, 0, warhead.rules.cellSpread, () => true);
                let tile;
                while ((tile = finder.getNextTile())) for (const unit of game.map.getGroundObjectsOnTile(tile)) if (unit.isTechno()) targets.add(unit);
                for (const unit of targets) {
                    if (unit.isDestroyed || !unit.isSpawned || unit.warpedOutTrait.isActive() || !warhead.canDamage(unit, unit.tile, unit.zone)) continue;
                    const damage = warhead.computeDamage(rules.getNumber('Damage'), unit, game);
                    if (damage > 0) warhead.inflictDamage(damage, unit, cloud.source, game, false);
                }
            }
        }
    }
    getHash(): number { return fnv32a(this.clouds.flatMap(c => [c.position.x, c.position.z, c.velocity.x, c.velocity.y, c.starts, c.expires, c.nextDamage])); }
    dispose(): void { for (const cloud of this.clouds) cloud.active = false; this.clouds = []; }
}
