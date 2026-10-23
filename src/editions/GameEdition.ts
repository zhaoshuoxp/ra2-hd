export type GameEdition = 'ra2' | 'yr';
export const GAME_EDITIONS = {
    ra2: {
        id: 'ra2', title: 'Red Alert 2', subtitle: 'Original game',
        rules: 'rules.ini', art: 'art.ini', ai: 'ai.ini', strings: 'ra2.csf', maps: 'missions.pkt',
        archives: ['language.mix', 'ra2.mix', 'multi.mix'],
        campaigns: ['allied', 'soviet'],
    },
    yr: {
        id: 'yr', title: "Yuri’s Revenge", subtitle: 'Expansion',
        rules: 'rulesmd.ini', art: 'artmd.ini', ai: 'aimd.ini', strings: 'ra2md.csf', maps: 'missionsmd.pkt',
        archives: ['expandmd01.mix', 'langmd.mix', 'ra2md.mix', 'multimd.mix', 'language.mix', 'ra2.mix', 'multi.mix'],
        campaigns: ['allied', 'soviet'],
    },
} as const;
export function isGameEdition(value: unknown): value is GameEdition {
    return value === 'ra2' || value === 'yr';
}
export function editionStorageKey(edition: GameEdition, key: string): string {
    return `_edition:${edition}:${key}`;
}
