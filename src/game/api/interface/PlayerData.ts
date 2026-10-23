import type { AiPacing } from '../../ai/AiPacing';
export interface PlayerData {
    name: string;
    country: any;
    startLocation: any;
    isObserver: boolean;
    isAi: boolean;
    teamDelay?: number;
    aiPacing?: AiPacing;
    repairDelay?: number;
    isCombatant: boolean;
    credits: number;
    power: {
        total: number;
        drain: number;
        isLowPower: boolean;
    };
    radarDisabled: boolean;
}
