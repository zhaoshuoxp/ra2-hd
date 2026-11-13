import { expect, test } from 'bun:test';
import contract from '../../docs/campaign-art/yr-v1/terrain-newurban-natural-ramp-rock-contour-contract-r1.json';
import { Palette } from '../../src/data/Palette';
import { admitTerrainRockContours, checkTerrainCoverage } from '../../src/engine/renderable/entity/map/terrainHdContract';
import { retailMember } from '../test-support/resources';

const sources = Object.entries(contract.members).map(([member, sha256]) => ({ member, sha256 }));
const declaration = () => ({ policy: structuredClone(contract.policy), members: { ...contract.rockMembers } });
const reconstruction = { schema: 'hd-extra-contours-v1', maximumNativeDistance: 1, protectMainBlock: true };

test('natural ramp rock admission requires the exact complete YR NewUrban source family', () => {
    const admitted = admitTerrainRockContours(declaration(), sources, 'NEWURBAN', 'yr')!;
    expect([...admitted.keys()].sort()).toEqual(Object.keys(contract.rockMembers).sort());
    expect(admitTerrainRockContours(undefined, [], 'SNOW', 'ra2')).toBeUndefined();
    for (const changed of [sources.slice(1), [...sources, sources[0]],
        sources.map((source, index) => index ? source : { ...source, sha256: '0'.repeat(64) })])
        expect(() => admitTerrainRockContours(declaration(), changed, 'NEWURBAN', 'yr')).toThrow('source policy');
    for (const [theater, edition] of [['SNOW', 'yr'], ['NEWURBAN', 'ra2']])
        expect(() => admitTerrainRockContours(declaration(), sources, theater, edition)).toThrow('source policy');
});

test('rock admission rejects changed policy, member pins and expanded native boundary allowances', () => {
    for (const change of [
        (value: any) => { value.policy.maximumNativeDistance = 2; },
        (value: any) => { value.policy.protectGroundContacts = false; },
        (value: any) => { value.members['rampx05.ubn'] = '0'.repeat(64); },
        (value: any) => { value.members['other.ubn'] = '0'.repeat(64); },
    ]) {
        const value = declaration(); change(value);
        expect(() => admitTerrainRockContours(value, sources, 'NEWURBAN', 'yr')).toThrow('source policy');
    }
});

test('rock palette indices identify only the original pinned material colors', () => {
    const source = retailMember('yr', contract.palette.member, contract.palette.sha256);
    const palette = Palette.fromVirtualFile(source.file);
    const expected = palette.colors.flatMap((color, index) => color.r-color.g > 20 && color.r-color.b > 35 ? [index] : []);
    expect(contract.rockIndices).toEqual(expected);
});

for (const density of [2, 4]) test(`rock contours retain ground coverage and the one-pixel envelope at ${density}X`, () => {
    const indices = admitTerrainRockContours(declaration(), sources, 'NEWURBAN', 'yr')!.get('rampx05.ubn')!;
    const logical = [9, 9], width = logical[0]*density+4;
    const rect = [2, 2, logical[0]*density, logical[1]*density];
    const metadata = { hasExtraData: false, offset: [0, 0], block: logical };
    const fixture = (index: number, x: number, y: number) => {
        const native = new Uint8Array(81), rgba = new Uint8Array(width*width*4);
        for (let yy = 2; yy <= 6; yy++) for (let xx = 2; xx <= 6; xx++) native[yy*9+xx] = index;
        for (let yy = 0; yy < rect[3]; yy++) for (let xx = 0; xx < rect[2]; xx++)
            rgba[((yy+2)*width+xx+2)*4+3] = native[Math.floor(yy/density)*9+Math.floor(xx/density)] ? 255 : 0;
        rgba[((y*density+2)*width+x*density+2)*4+3] = 128;
        return { native, rgba };
    };
    const validate = ({ native, rgba }: ReturnType<typeof fixture>, allowed = indices) =>
        checkTerrainCoverage(rgba, width, rect, native, logical, density, reconstruction, metadata, allowed);
    const edge = fixture(contract.rockIndices[0], 2, 4);
    expect(() => validate(edge)).not.toThrow();
    expect(() => validate(edge, new Set())).toThrow('coverage mismatch');
    expect(() => validate(fixture(1, 2, 4))).toThrow('coverage mismatch');
    expect(() => validate(fixture(contract.rockIndices[0], 1, 4))).not.toThrow();
    expect(() => validate(fixture(contract.rockIndices[0], 4, 4))).toThrow('boundary envelope');
    expect(() => validate(fixture(contract.rockIndices[0], 0, 4))).toThrow('coverage mismatch');
});
