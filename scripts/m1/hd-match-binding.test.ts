import { test, expect } from 'bun:test';
import { ImageFinder } from '../../src/engine/ImageFinder';

test('match override binds only the validated decoded image object, never another file or match', () => {
    const conscript = { filename: 'cons.shp' }, other = { filename: 'e1.shp' };
    const images = new Map([['cons.shp', conscript], ['e1.shp', other]]);
    const override = { identity: 'verified', frames: [], pages: [] };
    const match = new ImageFinder(images, {}, {
        image: conscript, override, report: { density: 4, gpuBytes: 0, attempts: [] },
    });
    expect(match.getHdOverride(conscript)).toBe(override);
    expect(match.getHdOverride(other)).toBeUndefined();
    expect(match.getHdOverride({ filename: 'cons.shp' })).toBeUndefined();
    expect(new ImageFinder(images, {}).getHdOverride(conscript)).toBeUndefined();
});
