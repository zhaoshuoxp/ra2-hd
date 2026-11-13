import { expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createGameErrorDiagnostic } from '../../src/game/gameErrorDiagnostic';
import { persistGameError } from '../../desktop/game-error-log.mjs';
import { World } from '../../src/game/World';

test('handled game errors retain their stack, map, tick and stored aircraft across application shutdown', () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'ra2-game-error-'));
    try {
        const error = new Error('Trying to remove non-existent object');
        const child: any = { name: 'ASW', id: 8, limboData: {}, isSpawned: false };
        const parent = { name: 'DEST', id: 7, isSpawned: true,
            airSpawnTrait: { availableSpawns: 1, spawns: [child] } };
        child.spawnLinkTrait = { getParent: () => parent };
        const diagnostic = createGameErrorDiagnostic(error, { gameOpts: { mapName: 'xbayopigs.map' }, currentTick: 900,
            getWorld: () => ({ getAllObjects: () => [parent] }) });
        expect(persistGameError('[Game error] ' + JSON.stringify(diagnostic), directory, { sourceHead: 'test-build' })).toBe(true);
        const saved = JSON.parse(readFileSync(path.join(directory, 'game-error-latest.json'), 'utf8'));
        expect(saved.error.stack).toBe(error.stack);
        expect(saved.map).toBe('xbayopigs.map');
        expect(saved.tick).toBe(900);
        expect(saved.airSpawns[0].children[0]).toMatchObject({ id: 8, parentId: 7, limbo: true });
        expect(saved.runtime.sourceHead).toBe('test-build');
        expect(readdirSync(directory)).toEqual(['game-error-latest.json']);
    } finally { rmSync(directory, { recursive: true }); }
});

test('unrelated or malformed console messages do not create or replace the latest error report', () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'ra2-game-error-'));
    try {
        for (const message of ['other message', '[Game error] {', '[Game error] null',
            '[Game error] {"schema":"unknown"}', '[Game error] ' + 'x'.repeat(65536)])
            expect(persistGameError(message, directory)).toBe(false);
        expect(readdirSync(directory)).toEqual([]);
    } finally { rmSync(directory, { recursive: true }); }
});

test('large aircraft fleets produce bounded diagnostics that the desktop can persist', () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'ra2-game-error-'));
    try {
        const parent = { name: 'CARRIER', airSpawnTrait: { spawns: Array(20).fill({ name: 'HORNET' }) } };
        const error = { name: 'Error', message: 'x'.repeat(10000), stack: 's'.repeat(100000) };
        const diagnostic = createGameErrorDiagnostic(error, { getWorld: () => ({ getAllObjects: () => Array(100).fill(parent) }) });
        expect(diagnostic.airSpawns).toHaveLength(16);
        expect(diagnostic.airSpawns[0].children).toHaveLength(4);
        expect(persistGameError('[Game error] ' + JSON.stringify(diagnostic), directory)).toBe(true);
    } finally { rmSync(directory, { recursive: true }); }
});

test('removal invariants still fail and identify the affected object', () => {
    const world = new World(), object: any = { name: 'ASW', id: 8, isSpawned: true, isDestroyed: false };
    expect(() => world.removeObject(object)).toThrow('ASW#8');
    world.spawnObject(object);
    world.removeObject(object);
    expect(() => world.removeObject(object)).toThrow('Trying to remove non-existent object');
});
