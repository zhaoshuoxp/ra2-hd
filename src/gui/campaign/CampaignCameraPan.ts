import { validCampaignCameraMove, type CampaignCameraMove } from '../../game/campaign/CampaignCheckpoint';

// Installed RA2 table at 0x7f6914, applied once per simulation frame by 0x6a2dd0.
const speeds = [.0015, .003, .0075, .03, .06].map(Math.fround);
export class CampaignCameraPan {
    private move?: CampaignCameraMove;
    constructor(private readonly camera: { getPan(): { x: number; y: number }; setPan(pan: { x: number; y: number }): void }) {}
    center(to: { x: number; y: number }, speed: number, tick: number): void {
        const move = { from: this.camera.getPan(), to: { ...to }, speed, progress: 0, lastTick: tick };
        if (!validCampaignCameraMove(move)) throw new Error('Invalid original team camera request');
        this.move = move;
    }
    update(tick: number): void {
        const move = this.move;
        if (!move) return;
        if (!Number.isSafeInteger(tick) || tick < move.lastTick) throw new Error('Campaign camera tick moved backwards');
        while (move.lastTick < tick && move.progress < 1) {
            move.progress = Math.min(1, Math.fround(move.progress + speeds[move.speed]));
            move.lastTick++;
        }
        const progress = move.progress;
        this.camera.setPan({ x: Math.trunc(move.from.x + (move.to.x - move.from.x) * progress),
            y: Math.trunc(move.from.y + (move.to.y - move.from.y) * progress) });
        if (progress === 1) this.cancel();
    }
    snapshot(): CampaignCameraMove | undefined { return this.move && structuredClone(this.move); }
    restore(move?: CampaignCameraMove): void {
        if (move !== undefined && !validCampaignCameraMove(move)) throw new Error('Invalid saved campaign camera');
        this.move = move && structuredClone(move);
    }
    cancel(): void { this.move = undefined; }
}
