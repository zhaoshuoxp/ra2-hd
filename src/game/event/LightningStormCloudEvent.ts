import { EventType } from "./EventType";
export class LightningStormCloudEvent {
    public readonly type: EventType;
    constructor(public readonly position: any, public readonly animationName?: string) {
        this.type = EventType.LightningStormCloud;
    }
}
