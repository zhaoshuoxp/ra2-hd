import { TheaterType } from './TheaterType';

const names: Record<number, string> = { [TheaterType.Temperate]: 'TEMPERATE', [TheaterType.Snow]: 'SNOW',
    [TheaterType.Urban]: 'URBAN', [TheaterType.Desert]: 'DESERT', [TheaterType.NewUrban]: 'NEWURBAN' };
export function theaterName(type: number | string): string | undefined {
    return typeof type === 'string' ? Object.values(names).find(name => name === type) : names[type];
}
