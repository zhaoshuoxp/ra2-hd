import { EventType } from "./EventType";
export class UnitRecycleEvent {
    public readonly type: EventType;
    constructor(public readonly target: any, public readonly recycler?: any) {
        this.type = EventType.UnitRecycle;
    }
}
