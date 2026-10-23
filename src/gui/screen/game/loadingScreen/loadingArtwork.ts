import type { GameEdition } from '@/editions/GameEdition';

export const loadingUnitArtwork = new Map([
    ['Americans', 'ustates'], ['French', 'france'], ['Germans', 'germany'],
    ['British', 'ukingdom'], ['Russians', 'russia'], ['Confederation', 'cuba'],
    ['Africans', 'libya'], ['Arabs', 'iraq'], ['Alliance', 'korea'],
]);

// Yuri's native illustration uses the whole background rather than the nine-country unit crop.
export const loadingBackgroundArtwork = new Map([['YuriCountry', 'loading-background-yuri']]);

export function getLoadingArtId(country: string): string | undefined {
    const background = loadingBackgroundArtwork.get(country);
    const unit = loadingUnitArtwork.get(country);
    return background ?? (unit ? `loading-unit-${unit}` : undefined);
}

// YR replaces the RA2 images and uses per-country palettes; RA2 uses mpls.pal.
export const loadingArtwork = {
    Americans: { image: 'ls800ustates', palette: 'mplsu.pal' },
    French: { image: 'ls800france', palette: 'mplsf.pal' },
    Germans: { image: 'ls800germany', palette: 'mplsg.pal' },
    British: { image: 'ls800ukingdom', palette: 'mplsuk.pal' },
    Russians: { image: 'ls800russia', palette: 'mplsr.pal' },
    Confederation: { image: 'ls800cuba', palette: 'mplsc.pal' },
    Africans: { image: 'ls800libya', palette: 'mplsl.pal' },
    Arabs: { image: 'ls800iraq', palette: 'mplsi.pal' },
    Alliance: { image: 'ls800korea', palette: 'mplsk.pal' },
    YuriCountry: { image: 'ls800yuri', palette: 'mpyls.pal' },
    Observer: { image: 'ls800obs', palette: 'mplsobs.pal' },
} as const;

export function getLoadingArtwork(country: string, edition: GameEdition) {
    const artwork = loadingArtwork[country as keyof typeof loadingArtwork];
    if (!artwork || (edition === 'ra2' && country === 'YuriCountry')) return undefined;
    return { ...artwork, palette: edition === 'ra2' && country !== 'Observer' ? 'mpls.pal' : artwork.palette };
}
