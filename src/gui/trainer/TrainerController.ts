import { activeEdition } from '@/editions/activeEdition';
import { TrainerSession, TRAINER_LIMITS, type TrainerCommand, type TrainerEffect } from '@/game/trainer/TrainerRuntime';
import { PointerType } from '@/engine/type/PointerType';

export const TRAINER_ACTIONS = ['addCredits', 'power', 'heal', 'protect', 'transfer', 'reveal', 'construction', 'technology', 'placement', 'clearProtection', 'production', 'ready', 'recharge', 'unprotect', 'reset', 'setCredits', 'minimum'] as const;
export type TrainerAction = typeof TRAINER_ACTIONS[number];
export interface TrainerPreferences {
    version: 1; enabled: boolean; credits: number; power: number; seconds: number;
    bindings: Partial<Record<TrainerAction, number>>;
}
export const trainerDefaults = (): TrainerPreferences => ({ version: 1, enabled: false, credits: 10000, power: 1000, seconds: 1,
    bindings: Object.fromEntries(TRAINER_ACTIONS.slice(0, 10).map((key, i) => [key, (i + 1) % 10])) });
export function parseTrainerPreferences(raw?: string): TrainerPreferences {
    const defaults = trainerDefaults();
    try {
        const value = JSON.parse(raw ?? 'null');
        if (value?.version !== 1) return defaults;
        const validInt = (n: any, max: number) => Number.isInteger(n) && n >= 0 && n <= max;
        const bindings: TrainerPreferences['bindings'] = {};
        const seen = new Set<number>();
        for (const action of TRAINER_ACTIONS) {
            const digit = value.bindings?.[action];
            if (validInt(digit, 9) && !seen.has(digit)) { bindings[action] = digit; seen.add(digit); }
        }
        return { version: 1, enabled: value.enabled === true,
            credits: validInt(value.credits, TRAINER_LIMITS.credits) ? value.credits : defaults.credits,
            power: validInt(value.power, TRAINER_LIMITS.power) ? value.power : defaults.power,
            seconds: Number.isFinite(value.seconds) && value.seconds >= 1 && value.seconds <= 120 ? value.seconds : defaults.seconds,
            bindings: value.bindings && typeof value.bindings === 'object' ? bindings : defaults.bindings };
    } catch { return defaults; }
}
export function trainerEditableTarget(target: any): boolean {
    return !!target?.closest?.('input, textarea, select, [contenteditable="true"], [role="textbox"]');
}
export class TrainerController {
    preferences = trainerDefaults();
    session?: TrainerSession;
    status = 'menu';
    targeting = false;
    private listeners = new Set<() => void>();
    private prefs?: { getItem(key: string): string | undefined; setItem(key: string, value: string): any };
    private keys?: any;
    private interaction?: any;
    private pointer?: any;
    private mode?: any;
    private inputHeld = false;
    private restoreLock = false;
    private selection: any[] = [];
    readonly subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
    readonly changed = () => { for (const listener of this.listeners) listener(); };
    initialize(prefs: NonNullable<TrainerController['prefs']>, keys: any): void {
        this.endSession(); this.prefs = prefs; this.keys = keys;
        this.preferences = parseTrainerPreferences(prefs.getItem('_r_trainer_v1'));
        this.changed();
    }
    private persist(): void { this.prefs?.setItem('_r_trainer_v1', JSON.stringify(this.preferences)); this.changed(); }
    setEnabled(enabled: boolean): void {
        if (typeof enabled !== 'boolean') return;
        if (!enabled) { this.cancelTarget(); this.releaseInput(); this.session?.reset(); }
        this.preferences.enabled = enabled;
        this.persist();
    }
    setNumber(key: 'credits' | 'power' | 'seconds', value: number): boolean {
        if (!Number.isFinite(value) || (key === 'seconds' ? value < 1 || value > 120 :
            !Number.isInteger(value) || value < 0 || value > TRAINER_LIMITS[key])) return false;
        this.preferences[key] = value; this.persist(); return true;
    }
    bindingConflict(action: TrainerAction, digit: number): boolean {
        return Object.entries(this.preferences.bindings).some(([k, v]) => k !== action && v === digit) ||
            !!this.keys?.getCommandType({ keyCode: 48 + digit, ctrlKey: true, shiftKey: true, altKey: false, metaKey: false });
    }
    setBinding(action: TrainerAction, digit?: number): boolean {
        if (digit !== undefined && (!Number.isInteger(digit) || digit < 0 || digit > 9 || this.bindingConflict(action, digit))) return false;
        this.preferences.bindings[action] = digit; this.persist(); return true;
    }
    beginSession(game: any, player: any, offline: () => boolean, markModified: () => void): void {
        this.endSession();
        this.session = new TrainerSession(game, player, activeEdition, () => this.preferences.enabled, offline, this.changed, markModified);
        this.status = 'readyStatus'; this.changed();
    }
    endSession(): void {
        this.cancelTarget(); this.releaseInput(); this.session?.dispose(); this.session = undefined;
        this.interaction = undefined; this.pointer = undefined; this.selection = []; this.status = 'menu'; this.changed();
    }
    bindInteraction(interaction: any, pointer: any): void { this.interaction = interaction; this.pointer = pointer; }
    get canAct(): boolean { return this.session?.allowed() ?? false; }
    get canUseKeys(): boolean { return this.canAct && !!this.interaction?.isEnabled() && !this.inputHeld; }
    captureInput(): void {
        if (this.inputHeld || !this.interaction?.isEnabled()) return;
        this.selection = [...this.session!.game.getUnitSelection().getSelectedUnits()];
        this.inputHeld = true; this.restoreLock = this.pointer?.getUserLockMode() ?? false;
        this.interaction.pausePanning(); this.interaction.keyboardHandler.pause();
        this.pointer?.unlock(true);
    }
    releaseInput(): void {
        if (!this.inputHeld) return;
        this.inputHeld = false;
        this.interaction?.unpausePanning(); this.interaction?.keyboardHandler.unpause();
        if (this.restoreLock && this.interaction?.isEnabled()) this.pointer?.lock();
        this.restoreLock = false;
    }
    selected(): any[] {
        return this.inputHeld ? this.selection : this.session?.game.getUnitSelection().getSelectedUnits() ?? [];
    }
    send(command: TrainerCommand): boolean {
        const field = command.type === 'credits' || (command.type === 'effect' && command.effect === 'minimum') ? 'credits' :
            command.type === 'effect' && command.effect === 'power' ? 'power' : command.type === 'effect' && command.effect === 'production' ? 'seconds' : undefined;
        if (field && typeof document !== 'undefined' && document.querySelector(`input[data-trainer-number="${field}"][aria-invalid="true"]`)) {
            this.status = 'rejected'; this.changed(); return false;
        }
        const session = this.session;
        const accepted = !!session?.dispatch({ session: session.id, edition: activeEdition, actor: session.player, command });
        this.status = accepted ? command.type === 'reset' ? 'resetDone' : 'queued' : 'rejected';
        if (command.type === 'reset') { this.cancelTarget(); this.releaseInput(); }
        this.changed(); return accepted;
    }
    effect(effect: TrainerEffect): void {
        const current = this.session?.isEffectEnabled(effect);
        const value = effect === 'minimum' ? this.preferences.credits : effect === 'power' ? this.preferences.power : effect === 'production' ? this.preferences.seconds : undefined;
        this.send({ type: 'effect', effect, enabled: !current, ...(value === undefined ? {} : { value }) });
    }
    run(action: TrainerAction): void {
        if (!this.canAct) return;
        switch (action) {
            case 'addCredits': case 'setCredits': this.send({ type: 'credits', mode: action === 'setCredits' ? 'set' : 'add', value: this.preferences.credits }); break;
            case 'heal': case 'protect': case 'unprotect': this.send({ type: action, targets: this.selected() }); break;
            case 'transfer': this.startTarget(); break;
            case 'reveal': case 'ready': case 'clearProtection': case 'reset': this.send({ type: action }); break;
            default: this.effect(action);
        }
    }
    private startTarget(): void {
        if (!this.canAct || !this.interaction?.isEnabled()) { this.status = 'resumeTarget'; this.changed(); return; }
        this.releaseInput(); this.cancelTarget();
        const session = this.session!;
        const mode = {
            enter: () => { this.targeting = true; this.status = 'target'; this.changed(); },
            hover: (hover: any, minimap: boolean) => this.pointer?.setPointerType(!minimap && session.canTransfer(hover?.gameObject) ? PointerType.Select : PointerType.NoMove),
            execute: (hover: any, minimap: boolean) => {
                if (!minimap && session.canTransfer(hover?.gameObject)) {
                    this.send({ type: 'transfer', targets: [hover.gameObject] }); this.cancelTarget(); return true;
                }
                return false;
            },
            cancel: () => { this.targeting = false; this.changed(); },
        };
        this.mode = mode;
        this.interaction.setMode(mode);
    }
    cancelTarget(): void {
        if (this.mode && this.interaction?.getMode() === this.mode) this.interaction.setMode(undefined);
        this.mode = undefined; this.targeting = false;
    }
}
export const offlineTrainer = new TrainerController();
