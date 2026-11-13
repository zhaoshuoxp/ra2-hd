import type { CampaignDefinition, CampaignDifficulty, CampaignInstruction, CampaignTrigger } from '../../data/campaign/CampaignDefinition';

// These query current world state, rather than remembering a notification.
// A temporary empty house before its landing must not latch a later defeat.
const currentStateEvents = new Set([9, 10, 11, 17, 27, 28, 30, 32, 36, 37, 52, 55, 56, 57, 58, 60, 61]);

export interface CampaignTriggerState {
    enabled: boolean;
    finished: boolean;
    enabledTick: number;
    fired: number;
    latched: boolean[];
    remainingTargets: string[];
    sourceTimerTicks?: number;
}
export interface CampaignTriggerSnapshot {
    version: 1;
    tick: number;
    localVariables: [string, boolean][];
    triggers: [string, CampaignTriggerState][];
    pending: string[];
}
export interface CampaignTriggerHost {
    targets(trigger: CampaignTrigger): string[];
    condition(instruction: CampaignInstruction, trigger: CampaignTrigger, elapsedTicks: number): boolean | string[];
    action(instruction: CampaignInstruction, trigger: CampaignTrigger): void;
    randomInt?(minimum: number, maximum: number): number;
}

// Timers advance only with simulation ticks. A satisfied event is latched until
// the tag fires, so destruction and elapsed-time events can form a conjunction.
export class CampaignTriggerMachine {
    readonly noEffectActions: { tick: number; key: string; index?: number; opcode: number; reason: string }[] = [];
    readonly states = new Map<string, CampaignTriggerState>();
    readonly variables = new Map<string, boolean>();
    tick = 0;
    private pending: string[] = [];
    private forced = new Set<string>();
    private active = new Set<string>();

    constructor(readonly definition: CampaignDefinition, readonly difficulty: CampaignDifficulty,
        private readonly host: CampaignTriggerHost, private readonly ticksPerSecond = 15,
        private readonly legacyConditionLatches = false, private readonly semanticsVersion = 1) {
        definition.assertValid();
        for (const [id, variable] of definition.variables) this.variables.set(id, variable.value);
        for (const trigger of definition.triggers.values()) {
            const state = { enabled: !trigger.disabled, finished: false, enabledTick: 0,
                fired: 0, latched: trigger.events.map(() => false), remainingTargets: host.targets(trigger) };
            this.states.set(trigger.id, state); this.resetSourceTimer(trigger, state);
        }
    }

    setEnabled(id: string, enabled: boolean): void {
        const state = this.require(id);
        if (enabled && (!state.enabled || this.semanticsVersion >= 24)) {
            state.enabledTick = this.tick; state.latched.fill(false);
            this.resetSourceTimer(this.definition.triggers.get(id)!, state);
        }
        state.enabled = enabled;
    }

    private resetSourceTimer(trigger: CampaignTrigger, state: CampaignTriggerState): void {
        if (!trigger.events.some(event => event.opcode === 51)) return;
        if (this.semanticsVersion < 24 || !this.host.randomInt) throw new Error('Source random delay requires campaign interpreter 24');
        // Retail TriggerClass owns one timer. Its reset visits events in order;
        // the last elapsed/random event supplies that shared timer's duration.
        for (const event of trigger.events) if (event.opcode === 13 || event.opcode === 51) {
            const seconds = Number(event.params[1]);
            if (!Number.isSafeInteger(seconds) || seconds < 0) throw new Error('Invalid original random-delay duration');
            const duration = event.opcode === 51 ? Math.trunc(seconds / 2) + this.host.randomInt(0, seconds) : seconds;
            if (!Number.isSafeInteger(duration) || duration < 0 || duration > seconds * 1.5) throw new Error('Invalid source timer RNG result');
            state.sourceTimerTicks = duration * this.ticksPerSecond;
        }
    }
    destroy(id: string): void { this.require(id).finished = true; }
    renewConsumedCaptureTag(tagId: string, target: string): boolean {
        if (this.definition.edition !== 'yr' || this.semanticsVersion < 38)
            throw new Error('Fresh source capture tags require YR interpreter 38');
        const tag = this.definition.tags.get(tagId);
        if (!tag || tag.repeat !== 0) throw new Error('Fresh capture tag requires an original volatile tag');
        const chain = this.definition.triggerChain(tag.trigger);
        if (chain.some(id => this.definition.triggers.get(id)!.events.length !== 1
            || this.definition.triggers.get(id)!.events[0].opcode !== 48))
            throw new Error('Fresh capture tag requires its source ownership notification');
        if (!this.require(tag.trigger).finished) return false;
        for (const id of chain) {
            if (this.active.has(id) || this.pending.includes(id)) throw new Error('Cannot replace an executing source capture tag');
            const trigger = this.definition.triggers.get(id)!;
            this.states.set(id, { enabled: !trigger.disabled, finished: false, enabledTick: this.tick,
                fired: 0, latched: [false], remainingTargets: [target] });
        }
        return true;
    }
    addTarget(id: string, target: string): void {
        const state = this.require(id);
        if (!state.remainingTargets.includes(target)) state.remainingTargets.push(target);
    }
    bindTargets(): void {
        if (this.tick !== 0) throw new Error('Targets must be bound before simulation starts');
        for (const trigger of this.definition.triggers.values()) this.require(trigger.id).remainingTargets = this.host.targets(trigger);
    }
    force(id: string): void {
        this.require(id);
        if (this.active.has(id) || this.forced.has(id)) throw new Error(`Recursive forced trigger: ${id}`);
        this.pending.push(id);
    }

    update(): void {
        this.forced.clear();
        const consumed = new Set<string>();
        for (const trigger of this.definition.triggers.values()) {
            const state = this.require(trigger.id);
            if (!state.enabled || state.finished || !trigger.difficulties[this.difficulty]) continue;
            const tag = this.evaluateTrigger(trigger, (...args) => this.host.condition(...args));
            if (tag) consumed.add(tag);
            this.drainForced();
        }
        this.drainForced();
        // Linked records share their root tag, rather than forming a sequence
        // of forced actions. All eligible records see this simulation event;
        // a volatile tag is consumed after that dispatch completes.
        for (const id of consumed) for (const trigger of this.definition.triggerChain(this.definition.tags.get(id)!.trigger)) {
            this.require(trigger).finished = true;
        }
        this.tick++;
    }

    notify(ids: string[], opcode: number, condition: CampaignTriggerHost['condition']): void {
        // Attached entry notifications occur before capture changes ownership.
        // Polling a global absence first can otherwise falsely lose the mission.
        if (!this.active.size) this.forced.clear();
        const consumed = new Set<string>();
        for (const id of ids) {
            const trigger = this.definition.triggers.get(id)!;
            if (!trigger.events.some(event => event.opcode === opcode)) continue;
            if (this.active.has(id)) throw new Error(`Recursive trigger notification: ${id}`);
            const tag = this.evaluateTrigger(trigger, (event, trigger, elapsed) => event.opcode === opcode
                ? condition(event, trigger, elapsed) : this.host.condition(event, trigger, elapsed));
            if (tag) consumed.add(tag);
            this.drainForced();
        }
        for (const id of consumed) for (const trigger of this.definition.triggerChain(this.definition.tags.get(id)!.trigger)) {
            this.require(trigger).finished = true;
        }
    }

    private evaluateTrigger(trigger: CampaignTrigger, condition: CampaignTriggerHost['condition']): string | undefined {
        const state = this.require(trigger.id);
        if (!state.enabled || state.finished || !trigger.difficulties[this.difficulty]) return;
        if (this.semanticsVersion >= 26 && !trigger.events.length) return;
        const touched = new Set<string>(), tag = this.definition.tagsForTrigger(trigger.id)[0];
        trigger.events.forEach((event, index) => {
            if (state.latched[index] && tag?.repeat !== 1 && (this.legacyConditionLatches || !currentStateEvents.has(event.opcode))) return;
            let result: boolean | string[];
            if (event.opcode === 13 || event.opcode === 51) result = this.tick - state.enabledTick
                >= (state.sourceTimerTicks ?? Number(event.params[1]) * this.ticksPerSecond);
            else if (event.opcode === 47) result = this.tick >= Number(event.params[1]) * this.ticksPerSecond;
            else if (event.opcode === 8) result = true;
            else if (event.opcode === 36 || event.opcode === 37) result = (this.variables.get(event.params[1]) ?? false) === (event.opcode === 36);
            else result = condition(event, trigger, this.tick - state.enabledTick);
            if (Array.isArray(result)) { result.forEach(id => touched.add(id)); state.latched[index] = result.length > 0; }
            else state.latched[index] = result;
        });
        if (tag?.repeat === 1) state.remainingTargets = state.remainingTargets.filter(id => !touched.has(id));
        if (state.latched.every(Boolean) && (tag?.repeat !== 1 || !state.remainingTargets.length)) {
            this.fire(trigger);
            if (tag && tag.repeat !== 2) return tag.id;
        }
    }

    private drainForced(): void {
        while (this.pending.length) {
            const id = this.pending.shift()!;
            if (this.forced.has(id)) throw new Error(`Recursive forced trigger: ${id}`);
            this.forced.add(id);
            const trigger = this.definition.triggers.get(id)!;
            if (!this.require(id).finished && trigger.difficulties[this.difficulty]) this.fire(trigger);
        }
    }

    private fire(trigger: CampaignTrigger): void {
        const state = this.require(trigger.id);
        this.active.add(trigger.id);
        try {
            if (this.definition.tagsForTrigger(trigger.id)[0]?.repeat === 2) this.resetSourceTimer(trigger, state);
            for (const action of trigger.actions) {
                const parameter = action.params[1];
                switch (action.opcode) {
                    case 12: this.destroy(parameter); break;
                    case 22: this.force(parameter); break;
                    case 53:
                        // Installed RA2 handler 0x6b1f10 returns success for a null type
                        // pointer before scanning or enabling any trigger.
                        if (this.semanticsVersion >= 26 && parameter === '0' && !this.definition.triggers.has(parameter)) {
                            this.noEffectActions.push({ tick: this.tick, key: action.key, index: action.index,
                                opcode: action.opcode, reason: 'Retail null trigger pointer; no effect' });
                        } else this.setEnabled(parameter, true);
                        break;
                    case 54:
                        if (parameter === '0' && !this.definition.triggers.has(parameter)) {
                            this.noEffectActions.push({ tick: this.tick, key: action.key, index: action.index,
                                opcode: action.opcode, reason: 'Retail null trigger pointer; no effect' });
                        } else this.setEnabled(parameter, false);
                        break;
                    case 56: this.variables.set(parameter, true); break;
                    case 57: this.variables.set(parameter, false); break;
                    default: this.host.action(action, trigger);
                }
            }
            state.fired++;
            state.latched.fill(false);
            state.enabledTick = this.tick;
            const tag = this.definition.tagsForTrigger(trigger.id)[0];
            if (tag?.repeat !== 2) state.finished = true;
        } finally { this.active.delete(trigger.id); }
    }

    private require(id: string): CampaignTriggerState {
        const state = this.states.get(id);
        if (!state) throw new Error(`Unknown campaign trigger: ${id}`);
        return state;
    }

    snapshot(): CampaignTriggerSnapshot {
        return structuredClone({ version: 1, tick: this.tick, localVariables: [...this.variables],
            triggers: [...this.states], pending: this.pending });
    }

    restore(snapshot: CampaignTriggerSnapshot): void {
        if (snapshot.version !== 1 || !Number.isSafeInteger(snapshot.tick) || snapshot.tick < 0
            || snapshot.triggers.length !== this.states.size || new Set(snapshot.triggers.map(([id]) => id)).size !== this.states.size
            || snapshot.triggers.some(([id, state]) => !this.states.has(id)
                || typeof state.enabled !== 'boolean' || typeof state.finished !== 'boolean'
                || !Number.isSafeInteger(state.enabledTick) || state.enabledTick < 0 || state.enabledTick > snapshot.tick
                || !Number.isSafeInteger(state.fired) || state.fired < 0
                || state.sourceTimerTicks !== undefined && (!Number.isSafeInteger(state.sourceTimerTicks) || state.sourceTimerTicks < 0)
                || this.semanticsVersion >= 24 && this.definition.triggers.get(id)!.events.some(event => event.opcode === 51)
                    !== (state.sourceTimerTicks !== undefined)
                || state.latched.length !== this.definition.triggers.get(id)!.events.length || state.latched.some(value => typeof value !== 'boolean'))
            || snapshot.pending.some(id => !this.states.has(id))) throw new Error('Incompatible campaign trigger snapshot');
        const copy = structuredClone(snapshot);
        this.tick = copy.tick;
        this.variables.clear(); copy.localVariables.forEach(([id, value]) => this.variables.set(id, value));
        this.states.clear(); copy.triggers.forEach(([id, value]) => this.states.set(id, value));
        this.pending = copy.pending;
    }
}
