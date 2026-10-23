import { SuperWeaponsTrait } from '@/game/trait/SuperWeaponsTrait';
import { GameSpeed } from '@/game/GameSpeed';
import { SuperWeaponStatus } from '@/game/SuperWeapon';
import { SuperWeaponReadyEvent } from '@/game/event/SuperWeaponReadyEvent';
import type { GameEdition } from '@/editions/GameEdition';

export const TRAINER_LIMITS = { credits: 10_000_000, power: 100_000, secondsMin: 1, secondsMax: 120, targets: 512, pending: 64 } as const;
export type TrainerEffect = 'minimum' | 'power' | 'construction' | 'production' | 'technology' | 'placement' | 'recharge';
export type TrainerCommand =
    | { type: 'credits'; mode: 'set' | 'add'; value: number }
    | { type: 'effect'; effect: TrainerEffect; enabled: boolean; value?: number }
    | { type: 'heal' | 'protect' | 'unprotect' | 'transfer'; targets: readonly any[] }
    | { type: 'reveal' | 'ready' | 'clearProtection' | 'reset' };
export interface TrainerEnvelope { session: string; edition: GameEdition; actor: any; command: TrainerCommand }
export interface TrainerEffects {
    minimum: number; power: number; construction: boolean; production: number;
    technology: boolean; placement: boolean; recharge: boolean;
}
const emptyEffects = (): TrainerEffects => ({ minimum: 0, power: 0, construction: false, production: 0, technology: false, placement: false, recharge: false });
const sessions = new WeakMap<object, TrainerSession>();
const players = new WeakMap<object, TrainerSession>();
let generation = 0;
export function trainerEffects(player: any): Readonly<TrainerEffects> | undefined {
    const session = player && players.get(player);
    return session?.allowed() ? session.effects : undefined;
}
export function trainerProtects(game: any, object: any): boolean {
    const session = game && sessions.get(game);
    return !!(session?.allowed() && object.owner === session.player && session.protectedObjects.has(object));
}
export function tickTrainer(game: any): void { sessions.get(game)?.tick(); }
export function forgetTrainerObject(game: any, object: any): void { sessions.get(game)?.protectedObjects.delete(object); }
export function disposeTrainer(game: any): void { sessions.get(game)?.dispose(); }

/** Bound only by the offline skirmish screen. Playback never creates a session. */
export class TrainerSession {
    readonly id = `trainer-${++generation}`;
    readonly protectedObjects = new Set<any>();
    readonly enabledEffects = new Set<TrainerEffect>();
    effects = emptyEffects();
    private queue: TrainerEnvelope[] = [];
    private disposed = false;
    modified = false;
    lastResult: 'applied' | 'rejected' = 'applied';
    constructor(readonly game: any, readonly player: any, readonly edition: GameEdition,
        private readonly enabled: () => boolean, private readonly offline: () => boolean,
        private readonly changed: () => void, private readonly markModified: () => void) {
        sessions.get(game)?.dispose();
        sessions.set(game, this);
        players.set(player, this);
    }
    get pending(): number { return this.queue.length; }
    isEffectEnabled(effect: TrainerEffect): boolean {
        const pending = this.queue.map(e => e.command).filter(c => c.type === 'effect' && c.effect === effect).at(-1);
        return pending?.type === 'effect' ? pending.enabled : this.enabledEffects.has(effect);
    }
    allowed(): boolean {
        return !this.disposed && this.enabled() && this.offline() && this.game.status === 1 &&
            this.game.localPlayer === this.player && !this.player.isAi && !this.player.isObserver && !this.player.defeated &&
            sessions.get(this.game) === this && players.get(this.player) === this;
    }
    private validTarget(object: any, transfer = false): boolean {
        return !!(object?.isTechno?.() && object.isSpawned && !object.isDestroyed && !object.isCrashing &&
            object.healthTrait?.getHitPoints() > 0 && this.game.getWorld().hasObjectId(object.id) && this.game.getWorld().getObjectById(object.id) === object &&
            !object.warpedOutTrait?.isActive() && !object.temporalTrait?.isActive?.() &&
            (transfer ? object.owner !== this.player : object.owner === this.player));
    }
    canTransfer(object: any): boolean { return this.allowed() && this.validTarget(object, true); }
    validate(envelope: TrainerEnvelope): boolean {
        if (!this.allowed() || envelope.session !== this.id || envelope.edition !== this.edition || envelope.actor !== this.player) return false;
        const c = envelope.command;
        if (!c || typeof c !== 'object') return false;
        const integer = (n: any, max: number) => Number.isInteger(n) && n >= 0 && n <= max;
        switch (c.type) {
            case 'credits': return ['set', 'add'].includes(c.mode) && integer(c.value, TRAINER_LIMITS.credits) &&
                (c.mode !== 'add' || this.player.credits + c.value <= TRAINER_LIMITS.credits);
            case 'effect':
                if (typeof c.enabled !== 'boolean') return false;
                switch (c.effect) {
                    case 'minimum': return integer(c.value, TRAINER_LIMITS.credits);
                    case 'power': return integer(c.value, TRAINER_LIMITS.power);
                    case 'production': return Number.isFinite(c.value) && c.value! >= 1 && c.value! <= 120;
                    case 'construction': case 'technology': case 'placement': case 'recharge': return c.value === undefined;
                    default: return false;
                }
            case 'heal': case 'protect': case 'unprotect': case 'transfer':
                return Array.isArray(c.targets) && c.targets.length > 0 && c.targets.length <= TRAINER_LIMITS.targets &&
                    c.targets.every(o => this.validTarget(o, c.type === 'transfer'));
            case 'reveal': case 'ready': case 'clearProtection': case 'reset': return true;
            default: return false;
        }
    }
    dispatch(envelope: TrainerEnvelope): boolean {
        if (!this.validate(envelope)) return false;
        // Reset is a supported paused cleanup transaction; it cannot advance simulation.
        if (envelope.command.type === 'reset') { this.reset(); return true; }
        if (this.queue.length >= TRAINER_LIMITS.pending) return false;
        const c = envelope.command;
        this.queue.push({ ...envelope, command: 'targets' in c ? { ...c, targets: [...new Set(c.targets)] } : { ...c } });
        this.changed();
        return true;
    }
    tick(): void {
        if (!this.allowed()) { this.reset(); return; }
        const queued = this.queue.splice(0);
        for (const envelope of queued) {
            if (!this.validate(envelope)) { this.lastResult = 'rejected'; continue; }
            this.lastResult = 'applied';
            this.modified = true;
            this.markModified();
            this.apply(envelope.command);
        }
        for (const object of this.protectedObjects) if (!this.validTarget(object)) this.protectedObjects.delete(object);
        if (this.effects.minimum) this.player.credits = Math.max(this.player.credits, this.effects.minimum);
        if (this.effects.recharge) this.readyPowers();
        if (queued.length) this.changed();
    }
    private apply(c: TrainerCommand): void {
        switch (c.type) {
            case 'credits': this.player.credits = c.mode === 'set' ? c.value : this.player.credits + c.value; break;
            case 'effect': {
                if (c.enabled) this.enabledEffects.add(c.effect);
                else this.enabledEffects.delete(c.effect);
                if (c.effect === 'minimum' || c.effect === 'power' || c.effect === 'production') this.effects[c.effect] = c.enabled ? c.value! : 0;
                else this.effects[c.effect] = c.enabled;
                if (c.effect === 'power') this.player.powerTrait.setTrainerSupply(this.effects.power, this.game);
                break;
            }
            case 'heal': for (const o of c.targets) o.healthTrait.healToFull(o, this.game); break;
            case 'protect': for (const o of c.targets) this.protectedObjects.add(o); break;
            case 'unprotect': for (const o of c.targets) this.protectedObjects.delete(o); break;
            case 'clearProtection': this.protectedObjects.clear(); break;
            case 'transfer':
                for (const o of c.targets) {
                    o.slaveMaster?.slaveMinerTrait?.releaseSlave(o, this.game);
                    this.game.changeObjectOwner(o, this.player);
                    for (const passenger of [...(o.transportTrait?.units ?? []), ...(o.garrisonTrait?.getOccupants() ?? [])]) {
                        if (passenger.owner !== this.player) this.game.changeObjectOwner(passenger, this.player);
                    }
                }
                break;
            case 'reveal': this.game.mapShroudTrait.revealMap(this.player, this.game); break;
            case 'ready': this.readyPowers(); break;
            case 'reset': this.reset(); break;
        }
    }
    private readyPowers(): void {
        for (const power of this.player.superWeaponsTrait.getAll()) {
            // Native power/warp/effect locks and multi-stage targeting remain authoritative.
            if (power.owner !== this.player || power.status !== SuperWeaponStatus.Charging || power.chargeTicks <= 0 ||
                (power.rules.isPowered && this.player.powerTrait.isLowPower()) ||
                this.game.traits.get(SuperWeaponsTrait).hasActiveEffect(power.rules.type, this.player)) continue;
            power.chargeTicks = 0;
            power.status = SuperWeaponStatus.Ready;
            this.game.events.dispatch(new SuperWeaponReadyEvent(power));
        }
    }
    reset(): void {
        const dirty = this.pending || this.protectedObjects.size || this.enabledEffects.size;
        this.queue = [];
        this.protectedObjects.clear();
        this.effects = emptyEffects();
        this.enabledEffects.clear();
        this.player.powerTrait?.setTrainerSupply(0, this.game);
        if (dirty) this.changed();
    }
    dispose(): void {
        if (this.disposed) return;
        this.reset();
        this.disposed = true;
        sessions.delete(this.game);
        if (players.get(this.player) === this) players.delete(this.player);
        this.changed();
    }
}
export function trainerBuildTicks(player: any, building: boolean, nativeTicks: number): number {
    const effects = trainerEffects(player);
    if (building && effects?.construction) return 1;
    return !building && effects?.production ? Math.min(nativeTicks, Math.ceil(effects.production * GameSpeed.BASE_TICKS_PER_SECOND)) : nativeTicks;
}
