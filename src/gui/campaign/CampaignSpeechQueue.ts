import { ChannelType } from '../../engine/sound/ChannelType';

export class CampaignSpeechQueue {
    readonly outcomes: { id: string; reason: string }[] = [];
    private queue: { id: string; mission: boolean; serial: number }[] = [];
    private current?: { id: string; handle: any; mission: boolean; serial: number };
    private nextSerial = 1;
    private boundaryWaiters: { through: number; resolve(): void }[] = [];
    private missionWaiters: (() => void)[] = [];
    private idleWaiters: (() => void)[] = [];
    private disposed = false;
    private savedMusicVolume?: number;
    private paused = false;
    constructor(private readonly specs: any, private readonly sound: any, private readonly mixer: any,
        private readonly strings: any, private readonly subtitle: (text: string) => void,
        private readonly pending: (ids: string[]) => void, private readonly error: (message: string) => void) {}
    init(): void {}
    isIdle(): boolean { return !this.current && !this.queue.length; }
    cancel(): void {
        this.queue = [];
        const handle = this.current?.handle; this.current = undefined; handle?.stop();
        this.sound.audioSystem.setDucking?.(this, ChannelType.Music);
        if (this.savedMusicVolume !== undefined) this.mixer.setVolume(ChannelType.Music, this.savedMusicVolume);
        this.savedMusicVolume = undefined; this.subtitle(''); this.updatePending();
    }
    snapshot(): { id: string; mission: boolean }[] {
        return [...(this.current ? [{ id: this.current.id, mission: this.current.mission }] : []),
            ...this.queue.map(({ id, mission }) => ({ id, mission }))];
    }
    restore(entries: { id: string; mission: boolean }[]): void {
        if (this.current || this.queue.length || entries.length > 128 || entries.some(entry =>
            typeof entry.id !== 'string' || typeof entry.mission !== 'boolean' || !this.specs.getSpec(entry.id))) throw new Error('Invalid saved campaign speech queue');
        this.queue = entries.map(entry => ({ ...entry, serial: this.nextSerial++ })); this.advance(); this.updatePending();
    }
    setPaused(paused: boolean): void {
        if (this.paused === paused) return;
        this.paused = paused;
        if (paused && this.current) {
            const { id, mission, serial, handle } = this.current;
            this.current = undefined; this.queue.unshift({ id, mission, serial }); handle.stop(); this.subtitle('');
        }
        if (!paused) this.advance();
        this.updatePending();
    }
    play(id: string, priority = false): void { this.enqueue(id, priority); }
    playMission(id: string): void { this.enqueue(id, true); }
    whenMissionComplete(): Promise<void> {
        if (!this.current?.mission && !this.queue.some(item => item.mission)) return Promise.resolve();
        return new Promise(resolve => this.missionWaiters.push(resolve));
    }
    finishForResult(): Promise<void> {
        // Retain the current utterance and source mission narration. Repeated
        // routine battlefield notices do not delay the result presentation.
        this.queue = this.queue.filter(item => item.mission);
        this.updatePending();
        return this.isIdle() ? Promise.resolve() : new Promise(resolve => this.idleWaiters.push(resolve));
    }
    whenMissionBoundaryComplete(): Promise<void> {
        const through = this.nextSerial - 1;
        if (!this.hasMissionThrough(through)) return Promise.resolve();
        return new Promise(resolve => this.boundaryWaiters.push({ through, resolve }));
    }
    private hasMissionThrough(through: number): boolean {
        return !!(this.current?.mission && this.current.serial <= through)
            || this.queue.some(item => item.mission && item.serial <= through);
    }
    private enqueue(id: string, mission: boolean): void {
        if (this.disposed) return;
        if (!mission && (this.current?.id === id || this.queue.some(item => !item.mission && item.id === id))) return;
        const firstRoutine = mission ? this.queue.findIndex(item => !item.mission) : -1;
        const item = { id, mission, serial: this.nextSerial++ };
        if (firstRoutine < 0) this.queue.push(item); else this.queue.splice(firstRoutine, 0, item);
        this.advance(); this.updatePending();
    }
    private updatePending(): void {
        this.pending([...(this.current ? [this.current.id] : []), ...this.queue.map(item => item.id)]);
        if (!this.current?.mission && !this.queue.some(item => item.mission)) this.missionWaiters.splice(0).forEach(resolve => resolve());
        if (this.isIdle()) this.idleWaiters.splice(0).forEach(resolve => resolve());
        this.boundaryWaiters = this.boundaryWaiters.filter(waiter => {
            if (this.hasMissionThrough(waiter.through)) return true;
            waiter.resolve(); return false;
        });
    }
    private advance(): void {
        if (this.current || this.disposed || this.paused) return;
        const item = this.queue.shift();
        if (!item) {
            this.sound.audioSystem.setDucking?.(this, ChannelType.Music);
            if (this.savedMusicVolume !== undefined) this.mixer.setVolume(ChannelType.Music, this.savedMusicVolume);
            this.savedMusicVolume = undefined; this.subtitle(''); this.updatePending(); return;
        }
        const spec = this.specs.getSpec(item.id), wav = spec && this.sound.getWavFile(spec.sound);
        if (!wav) { this.error(`Campaign speech resource missing: ${item.id}`); this.advance(); return; }
        if (this.sound.audioSystem.setDucking) this.sound.audioSystem.setDucking(this, ChannelType.Music, .3);
        else if (this.savedMusicVolume === undefined) {
            this.savedMusicVolume = this.mixer.getVolume(ChannelType.Music);
            this.mixer.setVolume(ChannelType.Music, this.savedMusicVolume * .3);
        }
        const key = `HD:Speech:${item.id}`;
        const originalKey = `VOX:${spec.sound}`;
        this.subtitle(this.strings.has(key) ? this.strings.get(key)
            : this.strings.has(originalKey) ? this.strings.get(originalKey) : spec.text ?? '');
        const handle = this.sound.audioSystem.playWavFile(wav, ChannelType.Voice);
        this.current = { ...item, handle }; this.updatePending();
        handle.completed.then((reason: string) => {
            this.outcomes.push({ id: item.id, reason });
            if (reason === 'error') this.error(`Campaign speech decoding failed: ${item.id}`);
            if (this.current?.handle === handle) this.current = undefined;
            this.advance(); this.updatePending();
        });
    }
    dispose(): void {
        this.disposed = true; this.cancel();
    }
}
