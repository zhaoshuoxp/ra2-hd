import { ChannelType } from "./ChannelType";
interface EvaSpec {
    sound: string;
    priority: number;
    queue?: boolean;
    discrete?: boolean;
}
interface EvaSpecs {
    getSpec(name: string): EvaSpec | undefined;
}
interface Sound {
    getWavFile(name: string): any;
    audioSystem: {
        playWavFile(file: any, channel: ChannelType): any;
    };
}
interface Renderer {
    onFrame: {
        subscribe(handler: (time: number) => void): void;
        unsubscribe(handler: (time: number) => void): void;
    };
}
export class Eva {
    private evaSpecs: EvaSpecs;
    private sound: Sound;
    private renderer: Renderer;
    private evaWaitingList: EvaSpec[] = [];
    private lastEvaEventBySpec = new Map<EvaSpec, number>();
    private currentEvaPlaying?: any;
    constructor(evaSpecs: EvaSpecs, sound: Sound, renderer: Renderer) {
        this.evaSpecs = evaSpecs;
        this.sound = sound;
        this.renderer = renderer;
    }
    private handleFrame = (time: number): void => {
        if (this.currentEvaPlaying?.isPlaying()) {
            this.evaWaitingList = this.evaWaitingList.filter((eva) => eva.queue);
        }
        else {
            this.currentEvaPlaying = undefined;
            this.evaWaitingList.sort((a, b) => b.priority - a.priority);
            this.evaWaitingList = this.evaWaitingList.filter((eva) => eva.discrete ||
                time - (this.lastEvaEventBySpec.get(eva) ?? -Infinity) >= 5000);
            if (this.evaWaitingList.length) {
                const nextEva = this.evaWaitingList.shift()!;
                const wavFile = this.sound.getWavFile(nextEva.sound);
                if (wavFile) {
                    this.currentEvaPlaying = this.sound.audioSystem.playWavFile(wavFile, ChannelType.Voice);
                    if (!nextEva.discrete) this.lastEvaEventBySpec.set(nextEva, time);
                    this.evaWaitingList = this.evaWaitingList.filter((eva, index) => eva.queue || index === 0);
                }
            }
        }
    };
    init(): void {
        this.renderer.onFrame.subscribe(this.handleFrame);
    }
    isIdle(): boolean {
        return !this.evaWaitingList.length && !this.currentEvaPlaying?.isPlaying();
    }
    dispose(): void {
        this.renderer.onFrame.unsubscribe(this.handleFrame);
        this.currentEvaPlaying?.stop();
        this.evaWaitingList.length = 0;
        this.lastEvaEventBySpec.clear();
    }
    play(name: string, queue: boolean = false): void {
        let spec = this.evaSpecs.getSpec(name);
        if (spec) {
            if (queue) {
                spec = { ...spec, queue: true, discrete: true };
            }
            this.evaWaitingList.push(spec);
        }
        else {
            console.warn(`No EVA with name ${name} was found. Skipping.`);
        }
    }
}
