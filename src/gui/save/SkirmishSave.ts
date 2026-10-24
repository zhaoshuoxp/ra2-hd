import { Crc32 } from '@/data/Crc32';
import { ActionType } from '@/game/action/ActionType';
import { GameStatus } from '@/game/Game';
import { GameSpeed } from '@/game/GameSpeed';
import { SOLO_TICKS_PER_SECOND } from '@/gui/screen/game/gameMenu/gameSpeedControl';
import { AiDifficulty } from '@/game/gameopts/GameOpts';
import { getTrainerSession, TRAINER_LIMITS, type TrainerCommand, type TrainerSession } from '@/game/trainer/TrainerRuntime';
import { serializeTrainerCommand, restoreTrainerCommand, validSavedTrainerCommand,
    type SavedTrainer, type SavedTrainerEvent } from '@/game/trainer/TrainerSave';

export const SAVE_SIMULATION_VERSION = 1;
const maxSpeed = Math.max(...SOLO_TICKS_PER_SECOND) / GameSpeed.BASE_TICKS_PER_SECOND;
export interface SavedAction { tick: number; type: ActionType; data: number[] }
export interface SkirmishSave {
    version: 1;
    simulationVersion: number;
    id: string;
    name: string;
    savedAt: number;
    edition: 'ra2' | 'yr';
    engineVersion: string;
    modHash: string;
    gameId: string;
    gameTimestamp: number;
    gameOpts: any;
    mapData: string;
    playerName: string;
    initialSpeed: number;
    speed: number;
    tick: number;
    hash: number;
    actions: SavedAction[];
    speeds: { tick: number; value: number }[];
    checkpoints: { tick: number; hash: number }[];
    trainer?: SavedTrainer;
}
export class SaveError extends Error {
    constructor(public readonly key: string) { super(key); }
}
export function saveChecksum(save: SkirmishSave): number {
    return Crc32.calculateCrc(new TextEncoder().encode(JSON.stringify(save)));
}
export function validateSave(save: SkirmishSave, edition?: string): void {
    const invalid = () => { throw new SaveError('HD:SaveInvalid'); };
    if (!save || save.version !== 1 || save.simulationVersion !== SAVE_SIMULATION_VERSION)
        throw new SaveError('HD:SaveIncompatible');
    if (!['ra2', 'yr'].includes(save.edition) || edition && edition !== save.edition)
        throw new SaveError('HD:SaveEditionMismatch');
    if (typeof save.id !== 'string' || !save.id || typeof save.name !== 'string' || save.name.length > 80 ||
        typeof save.gameId !== 'string' || typeof save.playerName !== 'string' ||
        typeof save.engineVersion !== 'string' || typeof save.modHash !== 'string' ||
        !Number.isSafeInteger(save.gameTimestamp) || !Number.isFinite(save.savedAt) ||
        !Number.isSafeInteger(save.tick) || save.tick < 0 || save.tick > 20_000_000 ||
        !Number.isInteger(save.hash) || !save.gameOpts || typeof save.gameOpts.mapName !== 'string' ||
        !Array.isArray(save.gameOpts.humanPlayers) || save.gameOpts.humanPlayers.length !== 1 ||
        save.gameOpts.humanPlayers[0]?.name !== save.playerName || typeof save.mapData !== 'string' ||
        !save.mapData.length || save.mapData.length > 16_000_000 ||
        !Number.isFinite(save.initialSpeed) || save.initialSpeed <= 0 || save.initialSpeed > maxSpeed ||
        !Number.isFinite(save.speed) || save.speed <= 0 || save.speed > maxSpeed) invalid();
    if (!Array.isArray(save.actions) || !Array.isArray(save.speeds) || !Array.isArray(save.checkpoints) ||
        save.actions.length > 2_000_000 || save.speeds.length > save.tick + 1 ||
        save.checkpoints.length > save.tick + 1) invalid();
    let lastTick = -1;
    for (const action of save.actions) {
        if (!Number.isSafeInteger(action.tick) || action.tick < lastTick || action.tick >= save.tick ||
            !Number.isInteger(action.type) || action.type < ActionType.NoAction || action.type > ActionType.PingLocation ||
            action.type === ActionType.DebugCommand || !Array.isArray(action.data) || action.data.length > 65536 ||
            action.data.some(byte => !Number.isInteger(byte) || byte < 0 || byte > 255)) invalid();
        lastTick = action.tick;
    }
    lastTick = -1;
    for (const speed of save.speeds) {
        if (!Number.isSafeInteger(speed.tick) || speed.tick <= lastTick || speed.tick >= save.tick ||
            !Number.isFinite(speed.value) || speed.value <= 0 || speed.value > maxSpeed) invalid();
        lastTick = speed.tick;
    }
    lastTick = -1;
    for (const point of save.checkpoints) {
        if (!Number.isSafeInteger(point.tick) || point.tick <= lastTick || point.tick > save.tick ||
            !Number.isInteger(point.hash)) invalid();
        lastTick = point.tick;
    }
    if (save.trainer !== undefined) {
        const trainer = save.trainer;
        if (!trainer || trainer.version !== 1 || typeof trainer.enabled !== 'boolean'
            || !Array.isArray(trainer.events) || trainer.events.length > 2_000_000
            || !Array.isArray(trainer.pending) || trainer.pending.length > TRAINER_LIMITS.pending
            || !trainer.enabled && trainer.pending.length > 0
            || trainer.pending.some(command => !validSavedTrainerCommand(command) || command.type === 'reset')) invalid();
        lastTick = -1;
        let lastPhase = 'boundary';
        for (const event of trainer.events) {
            if (!Number.isSafeInteger(event.tick) || event.tick < lastTick || event.tick > save.tick
                || !['boundary', 'tick'].includes(event.phase) || event.tick === save.tick && event.phase !== 'boundary'
                || event.tick === lastTick && lastPhase === 'tick' && event.phase === 'boundary'
                || !validSavedTrainerCommand(event.command)
                || event.phase === 'boundary' && event.command.type !== 'reset') invalid();
            lastTick = event.tick; lastPhase = event.phase;
        }
    }
}

// Rebuild the simulation before creating renderers. Running the original seeded
// AI also restores its missions, pending orders, caches and production planning.
export class SkirmishSaveJournal {
    private actions: SavedAction[] = [];
    private speeds: SkirmishSave['speeds'] = [];
    private checkpoints: SkirmishSave['checkpoints'] = [];
    private invalid?: string;
    private lastSpeed?: number;
    private trainerEvents: SavedTrainerEvent[] = [];
    constructor(private readonly header: Omit<SkirmishSave,
        'version' | 'simulationVersion' | 'id' | 'name' | 'savedAt' | 'tick' | 'hash' | 'speed' | 'actions' | 'speeds' | 'checkpoints' | 'trainer'>,
        saved?: SkirmishSave) {
        if (header.gameOpts.aiPlayers?.some((player: any) => player?.difficulty === AiDifficulty.Custom))
            this.invalid = 'HD:SaveCustomAi';
        if (saved) {
            this.actions = structuredClone(saved.actions);
            this.speeds = structuredClone(saved.speeds);
            this.checkpoints = structuredClone(saved.checkpoints);
            this.lastSpeed = this.speeds.at(-1)?.value;
            this.trainerEvents = structuredClone(saved.trainer?.events ?? []);
        }
    }
    invalidate(): void { this.invalid = 'HD:SaveModified'; }
    recordTrainer(game: any, command: TrainerCommand, phase: SavedTrainerEvent['phase']): void {
        this.trainerEvents.push({ tick: game.currentTick, phase, command: serializeTrainerCommand(command) });
    }
    beforeTick(game: any, actions: any[]): void {
        if (this.invalid) return;
        if (game.currentTick % 300 === 0 && this.checkpoints.at(-1)?.tick !== game.currentTick)
            this.checkpoints.push({ tick: game.currentTick, hash: game.getHash() });
        if (this.lastSpeed !== game.speed.value) {
            this.lastSpeed = game.speed.value;
            this.speeds.push({ tick: game.currentTick, value: game.speed.value });
        }
        try {
            for (const action of actions) {
                if (action.actionType === ActionType.DebugCommand) throw new Error('Unrecordable debug command');
                const data = action.serialize();
                if (!(data instanceof Uint8Array)) throw new Error('Action serialization failed');
                this.actions.push({ tick: game.currentTick, type: action.actionType, data: Array.from(data) });
            }
        } catch (error) {
            this.invalid = 'HD:SaveModified';
            console.error('[Skirmish save] Command journal incomplete', error);
        }
    }
    capture(game: any, speed: number, name: string, id: string = crypto.randomUUID()): SkirmishSave {
        if (this.invalid) throw new SaveError(this.invalid);
        if (game.status !== GameStatus.Started || game.localPlayer?.defeated)
            throw new SaveError('HD:SaveUnavailable');
        const save: SkirmishSave = { ...structuredClone(this.header), version: 1,
            simulationVersion: SAVE_SIMULATION_VERSION, id, name: name.trim().slice(0, 80), savedAt: Date.now(),
            tick: game.currentTick, hash: game.getHash(), speed,
            actions: structuredClone(this.actions), speeds: structuredClone(this.speeds),
            checkpoints: structuredClone(this.checkpoints) };
        const trainer = getTrainerSession(game);
        if (trainer && (trainer.enabledForSave || this.trainerEvents.length || trainer.pending))
            save.trainer = { version: 1, enabled: trainer.enabledForSave, events: structuredClone(this.trainerEvents),
                pending: trainer.pendingCommands().map(serializeTrainerCommand) };
        validateSave(save);
        return save;
    }
}

export async function restoreSkirmish(game: any, player: any, factory: any, save: SkirmishSave,
    progress: (fraction: number) => void, cancel?: { throwIfCancelled(): void },
    trainer?: { session: TrainerSession; setEnabled(enabled: boolean): void }): Promise<void> {
    validateSave(save);
    game.speed.value = game.desiredSpeed.value = save.initialSpeed;
    game.start();
    if (save.trainer && !trainer) throw new SaveError('HD:SaveIncompatible');
    if (save.trainer) trainer!.setEnabled(true);
    const trainerEvents = save.trainer?.events ?? [];
    let trainerIndex = 0;
    const applyTrainer = (phase: SavedTrainerEvent['phase']) => {
        while (trainerEvents[trainerIndex]?.tick === game.currentTick && trainerEvents[trainerIndex].phase === phase) {
            const command = restoreTrainerCommand(trainerEvents[trainerIndex++].command, game);
            if (command.type === 'reset') trainer!.session.reset(phase);
            else if (!trainer!.session.dispatch({ session: trainer!.session.id, edition: save.edition, actor: player, command }))
                throw new SaveError('HD:SaveRestoreMismatch');
        }
    };
    const checkpoints = new Map(save.checkpoints.map(point => [point.tick, point.hash]));
    let actionIndex = 0, speedIndex = 0, yieldAt = performance.now() + 12;
    while (game.currentTick < save.tick) {
        cancel?.throwIfCancelled();
        const tick = game.currentTick;
        applyTrainer('boundary');
        if (checkpoints.has(tick) && game.getHash() !== checkpoints.get(tick)) throw new SaveError('HD:SaveRestoreMismatch');
        if (save.speeds[speedIndex]?.tick === tick)
            game.speed.value = game.desiredSpeed.value = save.speeds[speedIndex++].value;
        while (save.actions[actionIndex]?.tick === tick) {
            const record = save.actions[actionIndex++];
            const action = factory.create(record.type);
            action.unserialize(new Uint8Array(record.data));
            action.player = player;
            action.process();
        }
        applyTrainer('tick');
        game.update();
        if (game.status !== GameStatus.Started) throw new SaveError('HD:SaveRestoreMismatch');
        if (performance.now() >= yieldAt) {
            progress(game.currentTick / save.tick);
            await new Promise(resolve => setTimeout(resolve, 0));
            yieldAt = performance.now() + 12;
        }
    }
    applyTrainer('boundary');
    if (save.trainer) {
        trainer!.setEnabled(save.trainer.enabled);
        for (const savedCommand of save.trainer.pending) {
            const command = restoreTrainerCommand(savedCommand, game);
            if (!trainer!.session.dispatch({ session: trainer!.session.id, edition: save.edition, actor: player, command }))
                throw new SaveError('HD:SaveRestoreMismatch');
        }
    }
    if (game.getHash() !== save.hash) throw new SaveError('HD:SaveRestoreMismatch');
    game.speed.value = game.desiredSpeed.value = save.speed;
    progress(1);
}
