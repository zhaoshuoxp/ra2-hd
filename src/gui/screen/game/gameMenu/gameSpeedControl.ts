import { GameSpeed } from '@/game/GameSpeed';

export const SOLO_TICKS_PER_SECOND = [22.5, 45, 67.5, 90, 112.5] as const;
export const DEFAULT_SOLO_SPEED = 2;
export const SOLO_SPEED_KEY = 'soloSpeedTierV1';

export function savedSoloSpeed(value?: string): number {
    const tier = value === undefined || value === null || value.trim() === '' ? NaN : Number(value);
    return Number.isInteger(tier) && tier >= 0 && tier < SOLO_TICKS_PER_SECOND.length ? tier : DEFAULT_SOLO_SPEED;
}

export function selectedGameSpeed(value: number): number {
    if (!Number.isInteger(value) || value < 0 || value >= SOLO_TICKS_PER_SECOND.length) throw new Error('Invalid game speed');
    return SOLO_TICKS_PER_SECOND[value] / GameSpeed.BASE_TICKS_PER_SECOND;
}

export function nearestGameSpeed(speed: number): number {
    let selected = 0;
    for (let i = 1; i < SOLO_TICKS_PER_SECOND.length; i++) {
        if (Math.abs(selectedGameSpeed(i) - speed) < Math.abs(selectedGameSpeed(selected) - speed)) selected = i;
    }
    return selected;
}
