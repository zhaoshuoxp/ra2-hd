import { EventType } from './EventType';

export interface CampaignSparkVisual {
    position: any;
    color: [number, number, number];
    active: boolean;
}
export interface CampaignSparkSystemVisual {
    active: boolean;
    position: any;
    sparks: CampaignSparkVisual[];
    flash: boolean;
    lightSize: number;
    readonly particleCap: number;
    readonly oneFrameLight: boolean;
}
export class TriggerParticleEvent {
    readonly type = EventType.TriggerParticle;
    constructor(readonly name: string, readonly visual: CampaignSparkSystemVisual) {}
}
