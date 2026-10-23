import { expect, test } from 'bun:test';
import { hdAtlasPageLimit } from '../../src/engine/renderable/builder/hdAtlasPageLimit';
import type { HdSource } from '../../src/engine/renderable/builder/resolveHdSprite';

const source = (): HdSource => ({ member: 'dnoa.shp', theater: 'NEWURBAN', canvas: [236, 230],
    sha256: 'f2ae766af30316eb86135cc2ba87c890238f0f43526567f041e2d6a6cad6f7fe',
    frames: Array(424).fill({ nativeFrame: 0, trimOrigin: [0, 0], trimSize: [1, 1], legacyRenderSize: [2, 2], empty: false }) });

test('only the pinned complete 4X T-Rex receives ten bounded lossless pages', () => {
    expect(hdAtlasPageLimit(source(), 4, true, true)).toBe(10);
    for (const changed of [{ sha256: '0'.repeat(64) }, { theater: 'TEMPERATE' }, { canvas: [236, 231] },
        { canvas: [236, 230, 0] }, { frames: source().frames.slice(0, 212) }, { member: 'other.shp' }])
        expect(hdAtlasPageLimit({ ...source(), ...changed }, 4, true, true)).toBe(8);
    expect(hdAtlasPageLimit(source(), 2, true, true)).toBe(8);
    expect(hdAtlasPageLimit(source(), 4, false, true)).toBe(8);
    expect(hdAtlasPageLimit(source(), 4, true, false)).toBe(8);
    expect(hdAtlasPageLimit({ ...source(), member: 'ngyard_d.shp' }, 4, true, true)).toBe(16);
});
