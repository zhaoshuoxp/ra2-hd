import { test, expect } from 'bun:test';
import { GAME_EDITIONS, isGameEdition, editionStorageKey } from '../../src/editions/GameEdition';
test('edition identities isolate rule files, country/map preferences and archives', () => {
    expect(isGameEdition('ra2')).toBe(true); expect(isGameEdition('yr')).toBe(true);
    for (const value of ['', 'ra2md', '../yr', undefined]) expect(isGameEdition(value)).toBe(false);
    for (const key of ['rules', 'art', 'ai', 'strings', 'maps'] as const)
        expect(GAME_EDITIONS.ra2[key]).not.toBe(GAME_EDITIONS.yr[key]);
    expect(GAME_EDITIONS.ra2.archives).not.toContain('ra2md.mix');
    expect(GAME_EDITIONS.yr.archives).toContain('ra2md.mix');
    for (const key of ['country', 'map', 'bots', 'campaign'])
        expect(editionStorageKey('ra2', key)).not.toBe(editionStorageKey('yr', key));
    expect(GAME_EDITIONS.yr.campaigns).toEqual(['allied', 'soviet']);
});
