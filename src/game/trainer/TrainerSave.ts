import { TRAINER_LIMITS, type TrainerCommand } from './TrainerRuntime';

export type SavedTrainerCommand = Exclude<TrainerCommand, { targets: readonly any[] }>
    | { type: 'heal' | 'protect' | 'unprotect' | 'transfer'; targets: number[] };
export interface SavedTrainerEvent { tick: number; phase: 'boundary' | 'tick'; command: SavedTrainerCommand }
export interface SavedTrainer {
    version: 1;
    enabled: boolean;
    events: SavedTrainerEvent[];
    pending: SavedTrainerCommand[];
}

export function serializeTrainerCommand(command: TrainerCommand): SavedTrainerCommand {
    return 'targets' in command ? { ...command, targets: command.targets.map(object => object.id) } : { ...command };
}

export function restoreTrainerCommand(command: SavedTrainerCommand, game: any): TrainerCommand {
    return 'targets' in command ? { ...command, targets: command.targets.map(id => game.getWorld().getObjectById(id)) } : { ...command };
}

// Structural validation precedes simulation; live identity and ownership checks
// still run through TrainerSession when each saved command is applied.
export function validSavedTrainerCommand(command: SavedTrainerCommand): boolean {
    if (!command || typeof command !== 'object') return false;
    const integer = (value: unknown, max: number) => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= max;
    switch (command.type) {
        case 'credits': return ['set', 'add'].includes(command.mode) && integer(command.value, TRAINER_LIMITS.credits);
        case 'effect':
            if (typeof command.enabled !== 'boolean') return false;
            switch (command.effect) {
                case 'minimum': return integer(command.value, TRAINER_LIMITS.credits);
                case 'power': return integer(command.value, TRAINER_LIMITS.power);
                case 'production': return Number.isFinite(command.value) && command.value! >= 1 && command.value! <= 120;
                case 'construction': case 'technology': case 'placement': case 'recharge': return command.value === undefined;
                default: return false;
            }
        case 'heal': case 'protect': case 'unprotect': case 'transfer': return Array.isArray(command.targets)
            && command.targets.length > 0 && command.targets.length <= TRAINER_LIMITS.targets
            && command.targets.every(id => Number.isSafeInteger(id) && id >= 0);
        case 'reveal': case 'ready': case 'clearProtection': case 'reset': return true;
        default: return false;
    }
}
