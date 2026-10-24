import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { FountainSurface, fountainBandGeometry } from '../../src/engine/renderable/building/FountainSurface';
import { selectedGameSpeed } from '../../src/gui/screen/game/gameMenu/gameSpeedControl';
import { validateSave } from '../../src/gui/save/SkirmishSave';

test('the fixed basin and every trimmed water frame meet at one native row without moving source geometry', () => {
    const quad = (top: number, height: number) => {
        const geometry = new THREE.PlaneGeometry(56, height);
        geometry.translate(0, -top - height / 2, 0);
        return geometry;
    };
    const original = quad(36, 56), before = original.getAttribute('position').array.slice();
    const basin = fountainBandGeometry(original, 36, 56, true);
    expect(basin.boundingBox!.max.y).toBeCloseTo(-62);
    expect(basin.boundingBox!.min.y).toBeCloseTo(-92);
    for (const [top, height] of [[36, 56], [35, 58]]) {
        const water = fountainBandGeometry(quad(top, height), top, height, false);
        expect(water.boundingBox!.min.y).toBeCloseTo(-62);
        expect(water.boundingBox!.max.y).toBeCloseTo(-top);
        water.dispose();
    }
    expect(original.getAttribute('position').array).toEqual(before);
    original.dispose(); basin.dispose();
});

test('Original and unavailable HD fountains retain their native visible base', () => {
    const base = { visible: true }, active = { builder: {}, get3DObject: () => ({ visible: true }) };
    const surface = new FountainSurface({ gameObject: { name: 'CAWASH18' },
        mainObj: { get3DObject: () => base }, animObjects: new Map([[2, [active]]]) });
    surface.update(); expect(base.visible).toBe(true);
    surface.dispose(); expect(base.visible).toBe(true);
});

test('save validation accepts every supported solo speed tier', () => {
    for (let tier = 0; tier < 5; tier++) {
        const speed = selectedGameSpeed(tier);
        expect(() => validateSave({ version: 1, simulationVersion: 1, id: 'slot', name: 'Name', savedAt: 1,
            edition: 'ra2', engineVersion: 'test', modHash: '', gameId: '0', gameTimestamp: 1700000000000,
            gameOpts: { mapName: 'test.map', humanPlayers: [{ name: 'Player' }] }, mapData: 'dGVzdA==', playerName: 'Player',
            initialSpeed: speed, speed, tick: 1, hash: 0, actions: [], speeds: [{ tick: 0, value: speed }],
            checkpoints: [{ tick: 0, hash: 0 }] })).not.toThrow();
    }
});
