import { Coords } from '../Coords';
import { TriggerParticleEvent, type CampaignSparkSystemVisual, type CampaignSparkVisual } from '../event/TriggerParticleEvent';

interface Spark {
    age: number;
    velocity: [number, number, number];
    elevation: number;
    visual: CampaignSparkVisual;
}
interface SparkSystem {
    id: number;
    name: string;
    particle: string;
    tile: any;
    age: number;
    remaining: number;
    sparks: Spark[];
    visual: CampaignSparkSystemVisual;
}

// Original action88 selects ParticleSystems, whose HoldsWhat selects Particles.
// All lifetime, spawn decisions and motion advance on simulation ticks only.
export class CampaignParticleSystems {
    private nextId = 1;
    private active: SparkSystem[] = [];
    constructor(private readonly game: any) {}

    create(index: number, tile: any): void {
        const ini = this.game.rules.getIni(), names = [...(ini.getSection('ParticleSystems')?.entries.values() ?? [])];
        const name = names[index], spec = typeof name === 'string' ? ini.getSection(name) : undefined;
        const particle = spec?.getString('HoldsWhat'), body = particle && ini.getSection(particle);
        if (!spec || !body || spec.getString('BehavesLike') !== 'Spark' || body.getString('BehavesLike') !== 'Spark') {
            throw new Error(`Unsupported original campaign particle system: ${name ?? index}`);
        }
        const remaining = spec.getNumber('SparkSpawnFrames');
        if (!Number.isSafeInteger(remaining) || remaining < 1 || spec.getNumber('ParticleCap') < 2
            || body.getNumber('XVelocity') <= 0 || body.getNumber('YVelocity') <= 0 || body.getNumber('ZVelocityRange') <= 0) {
            throw new Error(`Invalid original spark system: ${name}`);
        }
        const position = Coords.tile3dToWorld(tile.rx + .5, tile.ry + .5, tile.z);
        const system: SparkSystem = { id: this.nextId++, name, particle, tile, age: 0, remaining, sparks: [],
            visual: { active: true, position, sparks: [], flash: false, lightSize: spec.getNumber('LightSize'),
                particleCap: spec.getNumber('ParticleCap'), oneFrameLight: spec.getBool('OneFrameLight') } };
        this.colors(particle); this.active.push(system);
        if (!this.game.campaign?.restoring) this.show(system);
    }

    private colors(particle: string): [number, number, number][] {
        const value = this.game.rules.getIni().getSection(particle)!.getString('ColorList');
        const colors = [...value.matchAll(/\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/g)]
            .map(match => match.slice(1).map(Number) as [number, number, number]);
        if (colors.length < 2 || colors.flat().some(value => value > 255)) throw new Error(`Invalid spark colors: ${particle}`);
        return colors;
    }

    private random(): number { return this.game.prng.generateRandomInt(0, 0x7ffffffe); }
    private signedRemainder(limit: number): number { return this.game.prng.generateRandomInt(-0x80000000, 0x7fffffff) % limit; }
    private emit(system: SparkSystem): void {
        const ini = this.game.rules.getIni(), spec = ini.getSection(system.name)!, body = ini.getSection(system.particle)!;
        const half = Math.max(1, Math.floor(spec.getNumber('ParticleCap') / 2)), count = this.random() % half + half;
        // The original burst computes a shared perturbation before each
        // particle's own velocity, even when the direct trigger has no parent.
        this.signedRemainder(body.getNumber('XVelocity'));
        this.signedRemainder(body.getNumber('YVelocity'));
        this.signedRemainder(body.getNumber('ZVelocityRange'));
        for (let i = 0; i < count; i++) {
            const velocity: Spark['velocity'] = [this.signedRemainder(body.getNumber('XVelocity')),
                this.signedRemainder(body.getNumber('YVelocity')),
                body.getNumber('MinZVelocity') + this.random() % body.getNumber('ZVelocityRange')];
            const visual: CampaignSparkVisual = { active: true, position: system.visual.position.clone(), color: this.colors(system.particle)[0] };
            const spark: Spark = { age: 0, velocity, elevation: 0, visual };
            system.sparks.push(spark); system.visual.sparks.push(visual);
        }
        system.visual.flash = spec.getBool('OneFrameLight') || system.age === 1;
    }

    update(): void {
        const ini = this.game.rules.getIni(), gravity = this.game.rules.audioVisual.gravity;
        if (!Number.isFinite(gravity) || gravity < 0) throw new Error('Missing original spark gravity');
        for (const system of [...this.active]) {
            const spec = ini.getSection(system.name)!, body = ini.getSection(system.particle)!, colors = this.colors(system.particle);
            system.age++; system.visual.flash = false;
            if (system.remaining > 0) {
                if (system.remaining === 1 || this.random() / 0x7fffffff < spec.getNumber('SpawnSparkPercentage')) this.emit(system);
                system.remaining--;
            }
            for (const spark of [...system.sparks]) {
                spark.age++; spark.visual.position.x += spark.velocity[0]; spark.visual.position.z += spark.velocity[1];
                spark.elevation += spark.velocity[2]; spark.visual.position.y = system.visual.position.y + spark.elevation * Coords.zScale;
                spark.velocity[2] -= gravity;
                const progress = Math.min(colors.length - 1, spark.age * body.getNumber('ColorSpeed'));
                const start = Math.min(colors.length - 2, Math.floor(progress)), fraction = progress - start;
                spark.visual.color = colors[start].map((value, i) => value + (colors[start + 1][i] - value) * fraction) as Spark['visual']['color'];
                if (spark.age >= body.getNumber('MaxEC') || spark.elevation < 0) {
                    spark.visual.active = false; system.sparks.splice(system.sparks.indexOf(spark), 1);
                    system.visual.sparks.splice(system.visual.sparks.indexOf(spark.visual), 1);
                }
            }
            if (!system.remaining && !system.sparks.length) {
                system.visual.active = false; this.active.splice(this.active.indexOf(system), 1);
            }
        }
    }

    private show(system: SparkSystem): void { this.game.events.dispatch(new TriggerParticleEvent(system.name, system.visual)); }
    showRestored(): void { for (const system of this.active) this.show(system); }
    removeAt(tile: any): void {
        for (const system of [...this.active]) if (system.tile.rx === tile.rx && system.tile.ry === tile.ry) {
            system.visual.active = false;
            for (const spark of system.sparks) spark.visual.active = false;
            this.active.splice(this.active.indexOf(system), 1);
        }
    }
    snapshot(): unknown {
        return { nextId: this.nextId, systems: this.active.map(system => ({ id: system.id, name: system.name,
            particle: system.particle, tile: [system.tile.rx, system.tile.ry], age: system.age, remaining: system.remaining,
            flash: system.visual.flash, sparks: system.sparks.map(spark => ({ age: spark.age, velocity: [...spark.velocity],
                elevation: spark.elevation, position: spark.visual.position.toArray(), color: [...spark.visual.color] })) })) };
    }
    dispose(): void {
        for (const system of this.active) { system.visual.active = false; for (const spark of system.sparks) spark.visual.active = false; }
        this.active = [];
    }
}
