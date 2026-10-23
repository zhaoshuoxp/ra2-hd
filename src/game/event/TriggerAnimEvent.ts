import { EventType } from "./EventType";
export class TriggerAnimEvent {
    public readonly type: EventType;
    constructor(public readonly name: string, public readonly tile: any, public readonly reverse = false,
        public readonly artOverrides?: Record<string, string>,
        public readonly attachment?: { position: any; active: boolean },
        public readonly unitAppearance?: { identity: string; color: any }) {
        this.type = EventType.TriggerAnim;
    }
}
