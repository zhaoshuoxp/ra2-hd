export class InternalPlaybackHandle {
    private playing: boolean = true;
    private isLoop: boolean = false;
    public stopRequested: boolean = false;
    private sourceNode?: AudioBufferSourceNode;
    private gainNode?: GainNode;
    private panNode?: StereoPannerNode;
    private volumeRequested?: number;
    private panRequested?: number;
    private resolveCompletion?: (reason: 'ended' | 'stopped' | 'error') => void;
    private completionReason?: 'ended' | 'stopped' | 'error';
    private completionPromise?: Promise<'ended' | 'stopped' | 'error'>;
    get completed(): Promise<'ended' | 'stopped' | 'error'> {
        return this.completionPromise ??= this.completionReason ? Promise.resolve(this.completionReason)
            : new Promise(resolve => { this.resolveCompletion = resolve; });
    }
    finish(reason: 'ended' | 'stopped' | 'error'): void {
        if (!this.playing) return;
        this.playing = false;
        this.completionReason = reason;
        this.resolveCompletion?.(reason);
    }
    setNodes(sourceNode: AudioBufferSourceNode, gainNode: GainNode, panNode: StereoPannerNode): void {
        this.sourceNode = sourceNode;
        this.gainNode = gainNode;
        this.panNode = panNode;
        if (this.stopRequested) {
            this.stop();
        }
        else {
            if (this.volumeRequested !== undefined) {
                gainNode.gain.value = this.volumeRequested;
            }
            if (this.panRequested !== undefined) {
                panNode.pan.value = this.panRequested;
            }
        }
    }
    isPlaying(): boolean {
        return this.playing;
    }
    stop(): void {
        this.stopRequested = true;
        try {
            if (this.sourceNode) {
                this.sourceNode.stop();
            }
            else {
                this.stopRequested = true;
            }
            this.finish('stopped');
        }
        catch (error) {
            this.finish('error');
            console.error(error);
        }
    }
    setVolume(volume: number): void {
        if (this.gainNode) {
            this.gainNode.gain.value = volume;
        }
        else {
            this.volumeRequested = volume;
        }
    }
    setPan(pan: number): void {
        if (this.panNode) {
            this.panNode.pan.value = pan;
        }
        else {
            this.panRequested = pan;
        }
    }
}
