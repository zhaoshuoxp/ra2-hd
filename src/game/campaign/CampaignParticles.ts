import { Coords } from '../Coords';
import { Warhead } from '../Warhead';
import { CollisionType } from '../gameobject/unit/CollisionType';
import { TriggerAnimEvent } from '../event/TriggerAnimEvent';

interface MissionParticle {
    name: string;
    tile: any;
    age: number;
    state: number;
    elevation: number;
    visual: { position: any; active: boolean };
}

// Frozen <=16 journal mapping. New interpreters use CampaignParticleSystems
// for the original system registry and its HoldsWhat particle references.
export class CampaignParticles {
    private active: MissionParticle[] = [];
    constructor(private readonly game: any) {}
    create(index: number, tile: any): void {
        const names = [...(this.game.rules.getIni().getSection('Particles')?.entries.values() ?? [])];
        const name = names[index];
        if (typeof name !== 'string') throw new Error(`Invalid campaign particle index: ${index}`);
        this.spawn(name, tile, 0);
    }
    private spawn(name: string, tile: any, elevation: number): void {
        const spec = this.game.rules.getIni().getSection(name);
        if (!spec || !['Fire', 'Gas', 'Smoke'].includes(spec.getString('BehavesLike'))) throw new Error(`Unsupported campaign particle: ${name}`);
        const particle: MissionParticle = { name, tile, age: 0, state: spec.getNumber('StartStateAI'), elevation,
            visual: { active: true, position: Coords.tile3dToWorld(tile.rx + .5, tile.ry + .5, tile.z) } };
        particle.visual.position.y += elevation * Coords.zScale;
        this.active.push(particle);
        if (!this.game.campaign?.restoring) this.show(particle);
    }
    private show(particle: MissionParticle): void {
        const spec = this.game.rules.getIni().getSection(particle.name)!;
        const image = spec.getString('Image').toUpperCase();
        const end = spec.getNumber('EndStateAI'), advance = Math.max(1, spec.getNumber('StateAIAdvance', 1));
        if (!image) throw new Error(`Campaign particle has no image: ${particle.name}`);
        this.game.events.dispatch(new TriggerAnimEvent(image, particle.tile, false, {
            Start: String(particle.state), End: String(end), Rate: String(900 / advance), LoopCount: '1',
            Translucency: String(spec.getNumber('Translucency')), Normalized: 'no',
        }, particle.visual));
    }
    update(): void {
        for (const particle of [...this.active]) {
            const spec = this.game.rules.getIni().getSection(particle.name)!;
            particle.age++;
            const advance = Math.max(1, spec.getNumber('StateAIAdvance', 1));
            if (particle.age % advance === 0) particle.state++;
            const damage = spec.getNumber('Damage'), damageDelay = Math.max(1, spec.getNumber('MaxDC', 1));
            if (damage && particle.age % damageDelay === 0 && particle.state <= spec.getNumber('FinalDamageState', Infinity)) {
                const warhead = new Warhead(this.game.rules.getWarhead(spec.getString('Warhead')));
                warhead.detonate(this.game, damage, particle.tile, 0, particle.visual.position,
                    this.game.map.getTileZone(particle.tile), CollisionType.None, this.game.createTarget(undefined, particle.tile), undefined, false, undefined);
            }
            if (particle.age >= spec.getNumber('MaxEC', Infinity)
                || spec.getBool('DeleteOnStateLimit') && particle.state >= spec.getNumber('EndStateAI')) {
                particle.visual.active = false; this.active.splice(this.active.indexOf(particle), 1);
                const next = spec.getString('NextParticle');
                if (next) {
                    const offset = spec.getNumberArray('NextParticleOffset');
                    if ((offset[0] ?? 0) !== 0 || (offset[1] ?? 0) !== 0) throw new Error('Horizontal campaign particle successor offsets are not implemented');
                    this.spawn(next, particle.tile, particle.elevation + (offset[2] ?? 0));
                }
            }
        }
    }
    showRestored(): void { for (const particle of this.active) this.show(particle); }
    snapshot(): unknown {
        return this.active.map(particle => ({ name: particle.name, tile: [particle.tile.rx, particle.tile.ry],
            age: particle.age, state: particle.state, elevation: particle.elevation }));
    }
    dispose(): void { for (const particle of this.active) particle.visual.active = false; this.active = []; }
}
