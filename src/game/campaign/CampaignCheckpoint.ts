import { ActionType } from '../action/ActionType';
import { getTrainerSession, type TrainerCommand, type TrainerSession } from '../trainer/TrainerRuntime';
import { restoreTrainerCommand, serializeTrainerCommand, validSavedTrainer, type SavedTrainer, type SavedTrainerEvent } from '../trainer/TrainerSave';
import type { CampaignMoviePlacement } from '../../data/campaign/CampaignMoviePolicy';

export interface CampaignCommand { tick: number; player: number; type: number; data: number[] }
export interface CampaignCameraMove {
    from: { x: number; y: number };
    to: { x: number; y: number };
    speed: number;
    progress: number;
    lastTick: number;
}
export function validCampaignCameraMove(value: any): value is CampaignCameraMove {
    return !!value && [value.from?.x, value.from?.y, value.to?.x, value.to?.y].every(Number.isFinite)
        && Number.isInteger(value.speed) && value.speed >= 0 && value.speed <= 4
        && Number.isFinite(value.progress) && value.progress >= 0 && value.progress < 1
        && Number.isSafeInteger(value.lastTick) && value.lastTick >= 0;
}
export interface CampaignPresentationSnapshot {
    movies: { id: string; placement: CampaignMoviePlacement; time: number }[];
    speech: { id: string; mission: boolean }[];
    speechPolicy: 'restart-current-utterance';
    music?: { sound: string; time: number };
    cameraPan?: { x: number; y: number };
    cameraMove?: CampaignCameraMove;
}
export function validCampaignPresentation(value: any, semanticsVersion = 24): value is CampaignPresentationSnapshot {
    return !!value && value.speechPolicy === 'restart-current-utterance'
        && (value.cameraPan === undefined || Number.isFinite(value.cameraPan?.x) && Number.isFinite(value.cameraPan?.y))
        && (value.cameraMove === undefined || validCampaignCameraMove(value.cameraMove))
        && (value.music === undefined || typeof value.music?.sound === 'string' && /^[a-z0-9-]+$/i.test(value.music.sound)
            && Number.isFinite(value.music.time) && value.music.time >= 0 && value.music.time <= 86400)
        && Array.isArray(value.movies) && value.movies.length <= 64 && value.movies.every((entry: any) =>
            typeof entry?.id === 'string' && /^[a-z0-9_]+$/i.test(entry.id)
            && (['fullscreen', 'transmission'].includes(entry.placement)
                || semanticsVersion >= 25 && entry.placement === 'transmission-paused')
            && Number.isFinite(entry.time) && entry.time >= 0 && entry.time <= 86400)
        && Array.isArray(value.speech) && value.speech.length <= 128 && value.speech.every((entry: any) =>
            typeof entry?.id === 'string' && entry.id.length <= 128 && typeof entry.mission === 'boolean');
}
export interface CampaignCheckpoint {
    schemaVersion: 1;
    compatibility: 'm3-1-campaign-journal-v3';
    identity: { edition: string; mission: string; sourceSha256: string; provenanceDigest: string };
    gameId: string | number;
    timestamp: number;
    options: any;
    tick: number;
    commands: CampaignCommand[];
    pendingCommands?: CampaignCommand[];
    expected: { worldHash: number; rng: unknown; mission: unknown; world: unknown; pendingCallbacks: number };
    mediaPolicy: 'no-pending-media' | 'resume-presentation-v1';
    presentation?: CampaignPresentationSnapshot;
    trainer?: SavedTrainer;
    playTime?: { elapsedMs: number; speed: number };
    checksum: string;
}

export function validCampaignPendingCommands(checkpoint: CampaignCheckpoint): boolean {
    const commands = checkpoint.pendingCommands;
    return commands === undefined || checkpoint.identity?.edition === 'yr'
        && (checkpoint.options?.campaign?.semanticsVersion ?? 1) >= 31
        && Array.isArray(commands) && commands.length <= 10000 && commands.every(command =>
            command?.tick === checkpoint.tick && Number.isSafeInteger(command.player) && command.player >= 0
            && Number.isInteger(command.type) && command.type >= 0 && command.type !== ActionType.DebugCommand
            && Array.isArray(command.data) && command.data.length <= 65536
            && command.data.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255));
}

async function digest(value: unknown): Promise<string> {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
function identity(game: any): CampaignCheckpoint['identity'] {
    const launch = game.gameOpts.campaign;
    if (!launch) throw new Error('A campaign world is required');
    return { edition: launch.edition, mission: launch.mission, sourceSha256: launch.sourceSha256, provenanceDigest: launch.provenanceDigest };
}
// The frozen d1e21e8c build wrote these minifier-generated diagnostic keys.
// Migrate only those explicit aliases; retain and compare every state value.
export function canonicalCampaignWorld(value: any): any {
    const legacy: Record<string, string> = { Zs: 'HealthTrait', ws: 'GarrisonTrait', qs: 'DeployerTrait',
        Fc: 'HarvesterTrait', R: 'PowerTrait' };
    if (Array.isArray(value)) return value.map(canonicalCampaignWorld);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => {
        if (key !== 'traits' || !item || typeof item !== 'object' || Array.isArray(item)) return [key, canonicalCampaignWorld(item)];
        const entries = Object.entries(item).map(([name, state]) => [legacy[name] ?? name, canonicalCampaignWorld(state)]);
        if (new Set(entries.map(([name]) => name)).size !== entries.length) throw new Error('Duplicate campaign state identity');
        return [key, Object.fromEntries(entries)];
    }));
}

function state(game: any): CampaignCheckpoint['expected'] {
    return { worldHash: game.getHash(), rng: game.prng.snapshot(), mission: structuredClone(game.campaign.checkpointState()),
        world: game.debugGetState ? JSON.parse(JSON.stringify(game.debugGetState())) : null, pendingCallbacks: game.afterTickCallbacks.length };
}

function stateDifferences(expected: any, actual: any, path = '', output: string[] = []): string[] {
    if (output.length >= 8 || Object.is(expected, actual)) return output;
    if (expected && actual && typeof expected === 'object' && typeof actual === 'object') {
        for (const key of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
            stateDifferences(expected[key], actual[key], path ? `${path}.${key}` : key, output);
            if (output.length >= 8) break;
        }
    } else {
        const describe = (value: unknown) => JSON.stringify(value)?.slice(0, 96) ?? 'undefined';
        output.push(`${path}: expected ${describe(expected)}, received ${describe(actual)}`);
    }
    return output;
}

// Rebuild the complete world from its resource pins, seeds and every applied
// command. This preserves object graphs, orders and RNG without serializing
// class instances or pretending a trigger-only snapshot is a world save.
export class CampaignJournal {
    private commands: CampaignCommand[] = [];
    private trainerEvents: SavedTrainerEvent[] = [];
    private invalid?: string;
    private pendingInput?: () => any[];
    private inputPlayer?: any;
    get trusted(): boolean { return this.invalid === undefined; }

    bindInput(game: any, player: any, queue: { getAll(): any[]; push(...actions: any[]): void }, factory: any,
        checkpoint?: CampaignCheckpoint): void {
        if (game.gameOpts.campaign.edition !== 'yr' || (game.gameOpts.campaign.semanticsVersion ?? 1) < 31) return;
        if (checkpoint && (!validCampaignPendingCommands(checkpoint)
            || checkpoint.pendingCommands?.some(command => command.player >= game.getAllPlayers().length))) {
            throw Error('Invalid campaign pending input');
        }
        this.pendingInput = () => queue.getAll(); this.inputPlayer = player;
        for (const command of checkpoint?.pendingCommands ?? []) {
            if (command.player !== game.getPlayerNumber(player)) throw Error('Campaign pending input owner mismatch');
            const action = factory.create(command.type);
            action.unserialize(new Uint8Array(command.data)); action.player = player;
            queue.push(action);
        }
    }

    recordTrainer(game: any, command: TrainerCommand, phase: SavedTrainerEvent['phase']): void {
        if (game.campaign.restoring) return;
        this.trainerEvents.push({ tick: game.currentTick, phase, command: serializeTrainerCommand(command) });
    }

    record(game: any, player: any, actions: any[]): void {
        if (this.invalid) return;
        try {
            for (const action of actions) {
                if (action.actionType === ActionType.NoAction) continue;
                if (action.actionType === ActionType.DebugCommand) throw new Error('Debug commands cannot produce an accepted campaign checkpoint');
                const data = action.serialize();
                if (!(data instanceof Uint8Array)) throw new Error(`Action ${action.actionType} has no binary serializer`);
                this.commands.push({ tick: game.currentTick, player: game.getPlayerNumber(player), type: action.actionType, data: [...data] });
            }
        } catch (error) { this.invalid = error instanceof Error ? error.message : String(error); }
    }

    async capture(game: any): Promise<CampaignCheckpoint> {
        if (this.invalid) throw new Error(this.invalid);
        if (game.campaign.inspectionModified) throw new Error('A diagnostic reveal cannot produce a campaign checkpoint');
        if (game.status !== 1) throw new Error('Capture requires a started world at a simulation boundary');
        if (game.campaign.pendingMedia?.length && !game.campaign.captureMedia) throw new Error('Saving while mission media is pending is not implemented');
        const presentation = game.campaign.captureMedia?.();
        if (presentation && !validCampaignPresentation(presentation, game.gameOpts.campaign?.semanticsVersion ?? 1)) throw new Error('Invalid campaign media snapshot');
        const payload: Omit<CampaignCheckpoint, 'checksum'> = { schemaVersion: 1, compatibility: 'm3-1-campaign-journal-v3',
            identity: identity(game), gameId: game.id, timestamp: game.startTimestamp, options: structuredClone(game.gameOpts),
            tick: game.currentTick, commands: structuredClone(this.commands), expected: state(game),
            mediaPolicy: presentation ? 'resume-presentation-v1' : 'no-pending-media', ...(presentation ? { presentation } : {}) };
        if (game.gameOpts.campaign.edition === 'yr' && (game.gameOpts.campaign.semanticsVersion ?? 1) >= 31) {
            payload.pendingCommands = (this.pendingInput?.() ?? []).filter(action => action.actionType !== ActionType.NoAction)
                .map(action => {
                    if (action.actionType === ActionType.DebugCommand) throw Error('Debug commands cannot produce an accepted campaign checkpoint');
                    const data = action.serialize();
                    if (!(data instanceof Uint8Array)) throw Error('Campaign pending input has no binary serializer');
                    return { tick: game.currentTick, player: game.getPlayerNumber(this.inputPlayer), type: action.actionType, data: [...data] };
                });
            if (!validCampaignPendingCommands(payload as CampaignCheckpoint)) throw Error('Invalid campaign pending input');
        }
        const trainer = getTrainerSession(game);
        if (trainer && (trainer.enabledForSave || this.trainerEvents.length || trainer.pending)) {
            payload.trainer = { version: 1, enabled: trainer.enabledForSave, events: structuredClone(this.trainerEvents),
                pending: trainer.pendingCommands().map(serializeTrainerCommand) };
            if (!validSavedTrainer(payload.trainer, game.currentTick)) throw Error('Invalid campaign trainer snapshot');
        }
        if (game.campaign.playTime) payload.playTime = { elapsedMs: game.campaign.playTime.elapsedMs, speed: game.desiredSpeed.value };
        return { ...payload, checksum: await digest(payload) };
    }

    async restore(game: any, factory: any, checkpoint: CampaignCheckpoint, options: {
        cancelled?: () => boolean; progress?: (tick: number) => Promise<void>;
        trainer?: { session: TrainerSession; setEnabled(enabled: boolean): void };
        legacyPlaySpeed?: number;
    } = {}): Promise<void> {
        const { checksum, ...payload } = checkpoint;
        if (checkpoint.schemaVersion !== 1 || checkpoint.compatibility !== 'm3-1-campaign-journal-v3'
            || !validCampaignPendingCommands(checkpoint)
            || !(checkpoint.mediaPolicy === 'no-pending-media' || checkpoint.mediaPolicy === 'resume-presentation-v1'
                && validCampaignPresentation(checkpoint.presentation, checkpoint.options?.campaign?.semanticsVersion ?? 1))
            || checkpoint.trainer !== undefined && !validSavedTrainer(checkpoint.trainer, checkpoint.tick)
            || checkpoint.playTime !== undefined && (!Number.isFinite(checkpoint.playTime.elapsedMs) || checkpoint.playTime.elapsedMs < 0
                || !Number.isFinite(checkpoint.playTime.speed) || checkpoint.playTime.speed <= 0 || checkpoint.playTime.speed > 7.5)
            || await digest(payload) !== checksum) throw new Error('Invalid or incompatible campaign checkpoint');
        if (JSON.stringify(identity(game)) !== JSON.stringify(checkpoint.identity) || game.id !== checkpoint.gameId
            || game.startTimestamp !== checkpoint.timestamp || JSON.stringify(game.gameOpts) !== JSON.stringify(checkpoint.options)) {
            throw new Error('Campaign checkpoint resource, seed or options mismatch');
        }
        if (game.currentTick !== 0 || !Number.isSafeInteger(checkpoint.tick) || checkpoint.tick < 0) throw new Error('Restoration requires a fresh world');
        if (checkpoint.pendingCommands?.some(command => command.player >= game.getAllPlayers().length)) throw Error('Invalid campaign pending input owner');
        const records = new Map<number, CampaignCommand[]>();
        let previousTick = -1;
        for (const command of checkpoint.commands) {
            if (!Number.isSafeInteger(command.tick) || command.tick < previousTick || command.tick >= checkpoint.tick
                || !Number.isSafeInteger(command.player) || command.player < 0 || command.player >= game.getAllPlayers().length
                || !Number.isInteger(command.type) || command.type === ActionType.DebugCommand
                || !Array.isArray(command.data) || command.data.some(byte => !Number.isInteger(byte) || byte < 0 || byte > 255)) {
                throw new Error('Invalid campaign command history');
            }
            previousTick = command.tick;
            const tickRecords = records.get(command.tick) ?? [];
            tickRecords.push(command); records.set(command.tick, tickRecords);
        }
        game.campaign.restoring = true;
        try {
            if (checkpoint.trainer && !options.trainer) throw Error('Campaign trainer restoration is unavailable');
            if (checkpoint.trainer) options.trainer!.setEnabled(true);
            const trainerEvents = checkpoint.trainer?.events ?? [];
            let trainerIndex = 0;
            const applyTrainer = (phase: SavedTrainerEvent['phase']) => {
                while (trainerEvents[trainerIndex]?.tick === game.currentTick && trainerEvents[trainerIndex].phase === phase) {
                    const command = restoreTrainerCommand(trainerEvents[trainerIndex++].command, game);
                    if (command.type === 'reset') options.trainer!.session.reset(phase);
                    else if (!options.trainer!.session.dispatch({ session: options.trainer!.session.id,
                        edition: checkpoint.identity.edition as 'ra2' | 'yr', actor: game.localPlayer, command })) {
                        throw Error('Campaign trainer command reconstruction failed');
                    }
                }
            };
            while (game.currentTick < checkpoint.tick) {
                if (options.cancelled?.()) throw new Error('Campaign restoration cancelled');
                const tick = game.currentTick;
                applyTrainer('boundary');
                for (const command of records.get(tick) ?? []) {
                    const action = factory.create(command.type);
                    action.unserialize(new Uint8Array(command.data));
                    action.player = game.getPlayer(command.player); action.process();
                }
                applyTrainer('tick');
                game.update();
                if (game.currentTick === tick) throw new Error(`Campaign replay stopped before saved tick ${checkpoint.tick}`);
                if (game.currentTick % 120 === 0) await options.progress?.(game.currentTick);
            }
            applyTrainer('boundary');
            if (checkpoint.trainer) {
                options.trainer!.setEnabled(checkpoint.trainer.enabled);
                for (const saved of checkpoint.trainer.pending) {
                    if (!options.trainer!.session.dispatch({ session: options.trainer!.session.id,
                        edition: checkpoint.identity.edition as 'ra2' | 'yr', actor: game.localPlayer,
                        command: restoreTrainerCommand(saved, game) })) throw Error('Campaign pending trainer command reconstruction failed');
                }
            }
            const expected = { ...checkpoint.expected, world: canonicalCampaignWorld(checkpoint.expected.world) };
            const actual = state(game);
            if (JSON.stringify(actual) !== JSON.stringify(expected)) {
                throw new Error(`Campaign checkpoint reconstruction diverged (${stateDifferences(expected, actual).join('; ')})`);
            }
            this.commands = structuredClone(checkpoint.commands);
            this.trainerEvents = structuredClone(trainerEvents);
            game.campaign.trainerModified = trainerEvents.length > 0;
            game.campaign.playTime?.restore(checkpoint.playTime?.elapsedMs
                ?? game.currentTime / (options.legacyPlaySpeed ?? game.speed.value));
        } finally { game.campaign.restoring = false; }
    }
}
