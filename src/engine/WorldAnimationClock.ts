// Keep world animation time still during simulation pauses while the UI and
// media renderer continue receiving the real presentation timestamp.
export class WorldAnimationClock {
    private previous?: number;
    private time?: number;
    update(timestamp: number, paused: boolean): number {
        this.time ??= timestamp;
        if (this.previous !== undefined && !paused) this.time += Math.max(0, timestamp - this.previous);
        this.previous = timestamp;
        return this.time;
    }
}
