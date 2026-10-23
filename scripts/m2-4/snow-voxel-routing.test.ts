import { describe, expect, test } from 'bun:test';
import allied from '../../desktop/allied-unit-contracts.json';
import yuri from '../../desktop/yuri-unit-contracts.json';
import temperate from '../../desktop/environment-hd-contract.json';
import { vxlUnitAvailableInTheater, vxlUnitFamilies } from '../../src/engine/renderable/unitVxl/identities';

const theaters = ['TEMPERATE', 'SNOW', 'URBAN', 'DESERT', 'NEWURBAN'];
describe('accepted neutral voxel demand scope', () => {
    test('both complete families retain authored identities and admit only verified source/palette theaters', () => {
        for (const identity of ['WINI', 'TRUCKB']) {
            const family = vxlUnitFamilies[identity];
            expect(family.authoringTheater).toBe('SNOW');
            expect(family.theaters).toEqual(['SNOW', 'URBAN', 'NEWURBAN']);
            expect(family.variants?.map(variant => variant.density).sort()).toEqual([2, 4]);
            for (const theater of theaters) {
                expect(vxlUnitAvailableInTheater(family, theater)).toBe(['SNOW', 'URBAN', 'NEWURBAN'].includes(theater));
            }
            expect(vxlUnitAvailableInTheater(family, undefined)).toBe(false);
        }
    });
    test('accepted voxel declarations and shared-theater availability remain exact', () => {
        const accepted = { ...allied.vxl, ...yuri.vxl, ...temperate.vxl };
        for (const [identity, declaration] of Object.entries(accepted)) {
            expect(vxlUnitFamilies[identity]).toEqual(declaration);
            for (const theater of theaters) {
                expect(vxlUnitAvailableInTheater(vxlUnitFamilies[identity], theater)).toBe(true);
            }
        }
    });
});
