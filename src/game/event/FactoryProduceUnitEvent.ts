import { EventType } from "./EventType";
export class FactoryProduceUnitEvent {
    public readonly type: EventType;
    constructor(public readonly target: any, public readonly factory?: any) {
        this.type = EventType.FactoryProduceUnit;
    }
}
