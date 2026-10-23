import { expect, test } from 'bun:test';
import { selectBuildingsToPrepare } from '../../src/gui/screen/game/buildingPreparation';

const buildings = new Map([
    ['GAPOWR', { techLevel: 1 }],
    ['GACNST', { techLevel: -1 }],
    ['NACNST', { techLevel: -1 }],
    ['CAHOSP', { techLevel: -1 }],
    ['CAOILD', { techLevel: -1 }],
    ['GAWALL', { techLevel: 2 }],
]);

test('construction yards reachable by deploying an MCV are prepared during loading', () => {
    const selected = selectBuildingsToPrepare(buildings, ['CAOILD'],
        [{ deploysInto: 'GACNST' }, { deploysInto: '' }, {}, { deploysInto: 'NACNST' }, { deploysInto: 'GACNST' }]);
    expect(selected).toEqual(['GAPOWR', 'GACNST', 'NACNST', 'CAOILD', 'GAWALL']);
});

test('the previous map and tech-level rule is unchanged and keeps rules order', () => {
    expect(selectBuildingsToPrepare(buildings, ['CAHOSP'], [])).toEqual(['GAPOWR', 'CAHOSP', 'GAWALL']);
    expect(selectBuildingsToPrepare(buildings, [], [{ deploysInto: 'UNKNOWN' }])).toEqual(['GAPOWR', 'GAWALL']);
});
