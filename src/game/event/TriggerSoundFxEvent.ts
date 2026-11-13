import { EventType } from "./EventType";
export class TriggerSoundFxEvent {
    public readonly type: EventType;
    constructor(public readonly soundId: string, public readonly tile?: any, public readonly sourceIndex?: number) {
        this.type = EventType.TriggerSoundFx;
    }
}
