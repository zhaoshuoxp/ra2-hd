// Active wall time is presentation state, separate from deterministic ticks and
// RNG. Loading, pauses and checkpoint reconstruction do not advance this clock.
export class PhysicalPlayTime {
    private accumulated = 0;
    private started?: number;
    constructor(private readonly now: () => number = () => performance.now()) {}
    get elapsedMs(): number { return this.accumulated + (this.started === undefined ? 0 : Math.max(0, this.now() - this.started)); }
    setRunning(running: boolean): void {
        if (running === (this.started !== undefined)) return;
        const time = this.now();
        if (running) this.started = time;
        else { this.accumulated += Math.max(0, time - this.started!); this.started = undefined; }
    }
    restore(elapsedMs: number): void {
        if (!Number.isFinite(elapsedMs) || elapsedMs < 0) throw Error('Invalid saved physical play time');
        this.accumulated = elapsedMs; this.started = undefined;
    }
}
