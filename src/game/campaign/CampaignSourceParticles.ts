import { Coords } from '../Coords';
import { TriggerAnimEvent } from '../event/TriggerAnimEvent';
import { CampaignParticleSystems } from './CampaignParticleSystems';

interface SmokeParticle {
    id: number;
    age: number;
    remaining: number;
    velocity: number;
    drift: [number, number];
    visual: { position: any; active: boolean; frame: number; translucency: number };
}
interface SmokeSystem {
    id: number;
    name: string;
    particle: string;
    tile: any;
    age: number;
    interval: number;
    stopped: boolean;
    particles: SmokeParticle[];
}

// New19 reads the system registry before resolving HoldsWhat. Saved <=18
// particle mappings and snapshots remain frozen in their original classes.
export class CampaignSourceParticles {
    private readonly sparks: CampaignParticleSystems;
    private nextId = 1;
    private readonly smoke: SmokeSystem[] = [];
    constructor(private readonly game: any) { this.sparks = new CampaignParticleSystems(game); }

    create(index: number, tile: any): void {
        const ini = this.game.rules.getIni(), names = [...(ini.getSection('ParticleSystems')?.entries.values() ?? [])];
        const name = names[index], spec = typeof name === 'string' ? ini.getSection(name) : undefined;
        if (spec?.getString('BehavesLike') === 'Spark') { this.sparks.create(index, tile); return; }
        const particle = spec?.getString('HoldsWhat'), body = particle && ini.getSection(particle);
        if (!spec || !body || spec.getString('BehavesLike') !== 'Smoke' || body.getString('BehavesLike') !== 'Smoke') {
            throw new Error(`Unsupported original campaign particle system: ${name ?? index}`);
        }
        if (!spec.getBool('Spawns') || spec.getNumber('SpawnFrames') < 1 || spec.getNumber('Slowdown') <= 0
            || spec.getNumber('SpawnCutoff') < spec.getNumber('SpawnFrames') || spec.getNumber('SpawnRadius') < 0
            || spec.getNumber('ParticleCap') < 1 || body.getNumber('MaxEC') < 1 || !body.getString('Image')
            || body.getNumber('StateAIAdvance') < 1 || body.getNumber('WindEffect') !== 0 || body.getString('NextParticle')) {
            throw new Error(`Unsupported original smoke parameters: ${name}`);
        }
        this.smoke.push({ id: this.nextId++, name, particle, tile, age: 0,
            interval: spec.getNumber('SpawnFrames'), stopped: false, particles: [] });
    }

    private random(): number { return this.game.prng.generateRandomInt(-0x80000000, 0x7fffffff); }
    private emit(system: SmokeSystem): void {
        const ini = this.game.rules.getIni(), spec = ini.getSection(system.name)!, body = ini.getSection(system.particle)!;
        // The source makes both signed offset draws, then velocity and EC.
        const radius = spec.getNumber('SpawnRadius') + 1, x = this.random() % radius, y = this.random() % radius;
        const position = Coords.tile3dToWorld(system.tile.rx + .5, system.tile.ry + .5, system.tile.z);
        position.x += x; position.z += y; position.y += 10 * Coords.zScale;
        let velocity = Math.fround(body.getNumber('Velocity') + this.random() % 2);
        const maxEc = body.getNumber('MaxEC'), remaining = maxEc + Math.abs(this.random() % maxEc);
        velocity = Math.max(2, Math.fround(velocity - (system.interval - spec.getNumber('SpawnFrames')) * Math.fround(.35)));
        const particle: SmokeParticle = { id: this.nextId++, age: 0, remaining, velocity, drift: [0, 0],
            visual: { position, active: true, frame: body.getNumber('StartStateAI'),
                translucency: body.getNumber('Translucency') + (system.interval > spec.getNumber('SpawnTranslucencyCutoff') ? 25 : 0) } };
        system.particles.push(particle);
        if (!this.game.campaign?.restoring) this.show(system, particle);
    }

    update(): void {
        this.sparks.update();
        const ini = this.game.rules.getIni();
        for (const system of [...this.smoke]) {
            const spec = ini.getSection(system.name)!, body = ini.getSection(system.particle)!;
            system.age++;
            for (const particle of [...system.particles]) {
                particle.age++;
                if (this.game.currentTick & 1) {
                    if (Math.abs(this.random()) % 4 === 0) {
                        const axis = Math.abs(this.random()) % 2;
                        particle.drift[axis] = Math.max(-5, Math.min(5, particle.drift[axis] + Math.abs(this.random()) % 3 - 1));
                    }
                }
                const period = body.getNumber('StateAIAdvance') + (particle.id & 1);
                if ((particle.id + particle.age) % period === 0) particle.visual.frame++;
                particle.visual.position.x += particle.drift[0]; particle.visual.position.z += particle.drift[1];
                particle.visual.position.y += particle.velocity * Coords.zScale;
                if (particle.velocity > 3) particle.velocity = Math.fround(particle.velocity - body.getNumber('Deacc'));
                particle.remaining--;
                if (!particle.remaining || body.getBool('DeleteOnStateLimit') && particle.visual.frame >= body.getNumber('EndStateAI')) {
                    particle.visual.active = false; system.particles.splice(system.particles.indexOf(particle), 1);
                }
            }
            if (!system.stopped && this.game.currentTick % Math.max(1, Math.trunc(system.interval)) === 0) this.emit(system);
            system.interval = Math.fround(system.interval + spec.getNumber('Slowdown'));
            if (system.interval > spec.getNumber('SpawnCutoff')) system.stopped = true;
            if (system.stopped && !system.particles.length) this.smoke.splice(this.smoke.indexOf(system), 1);
        }
    }

    private show(system: SmokeSystem, particle: SmokeParticle): void {
        const body = this.game.rules.getIni().getSection(system.particle)!;
        this.game.events.dispatch(new TriggerAnimEvent(body.getString('Image').toUpperCase(), system.tile, false, {
            Start: '0', End: String(body.getNumber('EndStateAI')), Rate: '900', LoopCount: '-1',
            Translucency: String(particle.visual.translucency), Normalized: 'no',
        }, particle.visual));
    }
    showRestored(): void { this.sparks.showRestored(); for (const system of this.smoke) for (const particle of system.particles) this.show(system, particle); }
    removeAt(tile: any): void {
        this.sparks.removeAt(tile);
        for (const system of [...this.smoke]) if (system.tile.rx === tile.rx && system.tile.ry === tile.ry) {
            for (const particle of system.particles) particle.visual.active = false;
            this.smoke.splice(this.smoke.indexOf(system), 1);
        }
    }
    snapshot(): unknown {
        return { sparks: this.sparks.snapshot(), nextId: this.nextId, smoke: this.smoke.map(system => ({
            id: system.id, name: system.name, particle: system.particle, tile: [system.tile.rx, system.tile.ry],
            age: system.age, interval: system.interval, stopped: system.stopped, particles: system.particles.map(particle => ({
                id: particle.id, age: particle.age, remaining: particle.remaining, velocity: particle.velocity,
                drift: [...particle.drift], frame: particle.visual.frame, translucency: particle.visual.translucency,
                position: particle.visual.position.toArray(),
            })),
        })) };
    }
    dispose(): void {
        this.sparks.dispose();
        for (const system of this.smoke) for (const particle of system.particles) particle.visual.active = false;
        this.smoke.length = 0;
    }
}
