import { expect, test } from 'bun:test';
import { vxlUnitFamilies, vxlUnitAvailableInTheater } from '../../src/engine/renderable/unitVxl/identities';
import { vxlUnitIdentities } from '../../desktop/hd-profile.mjs';
import urban from '../../desktop/environment-urban-hd-contract.json';
import snow from '../../desktop/environment-snow-hd-contract.json';
import newurban from '../../desktop/environment-newurban-hd-contract.json';

test('six accepted Urban vehicles admit exact NewUrban sources and retain other boundaries', () => {
    for (const identity of ['JEEP', 'YCAB', 'BCAB', 'AMBU', 'FTRK', 'CIVP']) {
        const runtime = vxlUnitFamilies[identity], desktop = vxlUnitIdentities[identity];
        expect(runtime).toEqual(urban.vxl[identity]);
        expect(desktop).toEqual(runtime);
        expect(runtime.authoringTheater).toBe('URBAN');
        expect(runtime.variants!.map(v => v.density)).toEqual([2, 4]);
        expect(vxlUnitAvailableInTheater(runtime, 'URBAN')).toBe(true);
        expect(vxlUnitAvailableInTheater(runtime, 'NEWURBAN')).toBe(true);
        expect(newurban.vxl[identity]).toEqual(runtime);
        for (const theater of ['TEMPERATE', 'SNOW', 'DESERT', 'LUNAR', undefined])
            expect(vxlUnitAvailableInTheater(runtime, theater)).toBe(false);
    }
});

test('accepted neutral vehicle descriptors survive Urban registration unchanged', () => {
    for (const identity of ['WINI', 'TRUCKB']) {
        expect(vxlUnitFamilies[identity]).toEqual(snow.vxl[identity]);
        expect(vxlUnitIdentities[identity]).toEqual(snow.vxl[identity]);
    }
});
