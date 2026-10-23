import { expect, test } from 'bun:test';
import { getLoadingArtwork, loadingArtwork } from '../../src/gui/screen/game/loadingScreen/loadingArtwork';

test('RA2 keeps its shared palette while YR replacement images use country palettes', () => {
    for (const country of Object.keys(loadingArtwork).filter(c => !['Observer', 'YuriCountry'].includes(c))) {
        expect(getLoadingArtwork(country, 'ra2')?.palette).toBe('mpls.pal');
        expect(getLoadingArtwork(country, 'yr')?.palette).not.toBe('mpls.pal');
        expect(getLoadingArtwork(country, 'yr')?.image).toBe(getLoadingArtwork(country, 'ra2')?.image);
    }
    expect(getLoadingArtwork('Africans', 'yr')).toEqual({ image: 'ls800libya', palette: 'mplsl.pal' });
    expect(getLoadingArtwork('YuriCountry', 'yr')).toEqual({ image: 'ls800yuri', palette: 'mpyls.pal' });
    expect(getLoadingArtwork('YuriCountry', 'ra2')).toBeUndefined();
    for (const edition of ['ra2', 'yr'] as const) {
        expect(getLoadingArtwork('Observer', edition)?.palette).toBe('mplsobs.pal');
        expect(getLoadingArtwork('unknown', edition)).toBeUndefined();
    }
});
