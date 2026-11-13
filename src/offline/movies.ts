import type { CampaignFileIdentity } from './campaign';
import { CampaignMediaPlayer, type CampaignMediaOutcome } from '../gui/campaign/CampaignMediaPlayer';
import { campaignMovieSubtitles } from '../gui/campaign/CampaignSubtitleTracks';
import { prepareMovieSource } from './hdMovies';

export interface OriginalMovie {
    id: string; edition: 'ra2' | 'yr'; role: string; faction?: string; titleKey?: string; mission?: string;
    file: CampaignFileIdentity; width: number; height: number; durationSeconds: number;
    original: { sha256: string }; fallback: 'converted-original';
}
export async function loadOriginalMovieLibrary(edition: 'ra2' | 'yr'): Promise<OriginalMovie[]> {
    const response = await fetch('/local-movies/catalog.json');
    if (!response.ok) throw Error('Original movie library is unavailable');
    const catalog = await response.json();
    if (catalog.schema !== 'original-movie-library-v1' || !Array.isArray(catalog.entries) || catalog.entries.length > 512) throw Error('Invalid original movie catalog');
    const entries = catalog.entries.filter((entry: OriginalMovie) => entry.edition === edition), seen = new Set<string>();
    for (const entry of entries) {
        if (!/^[a-z0-9_-]{1,80}$/.test(entry.id) || seen.has(entry.id) || !/^[a-f0-9]{64}$/.test(entry.original?.sha256)
            || !Number.isFinite(entry.durationSeconds) || entry.durationSeconds <= 0) throw Error('Invalid original movie identity');
        seen.add(entry.id);
    }
    return entries;
}
export async function playOriginalLibraryMovie(movie: OriginalMovie, player: CampaignMediaPlayer, strings: any,
    current: () => boolean = () => true): Promise<CampaignMediaOutcome> {
    const file = movie.file;
    if (!Number.isSafeInteger(file?.bytes) || file.bytes <= 0 || !/^[a-f0-9]{64}$/.test(file.sha256)
        || !(/^\/local-movies\/[a-z0-9_-]+\.webm$/.test(file.route)
            || /^\/local-campaign\/ra2\/(?:sov|all|trn)\d{2}[tsu]\/[a-z0-9_.-]+\.webm$/.test(file.route))
        || file.route.split('/').at(-1) !== file.name) throw Error('Invalid original movie route');
    if (!current()) return 'cancelled';
    let legacyUrl: string | undefined, disposed = false;
    try {
        // Equal RA2/YR filenames can contain different cuts. Expansion clips
        // require their own timeline; a base-game track cannot stand in.
        const subtitles = campaignMovieSubtitles(movie.edition === 'ra2' ? movie.id : 'yr_' + movie.id, strings);
        return await player.play({ id: movie.edition + (movie.role === 'introduction' ? '-introduction' : '-' + movie.id),
            url: file.route, source: () => prepareMovieSource(movie, async () => {
                const response = await fetch(file.route);
                if (!response.ok) throw Error('Original movie payload is unavailable');
                const bytes = await response.arrayBuffer();
                const sha = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
                if (bytes.byteLength !== file.bytes || sha !== file.sha256) throw Error('Original movie payload identity mismatch');
                if (disposed || !current()) throw Error('Movie request was cancelled');
                legacyUrl = URL.createObjectURL(new Blob([bytes], { type: 'video/webm' }));
                return legacyUrl;
            }), placement: 'fullscreen', subtitles, skipLabel: strings.get('HD:CampaignSkip') });
    } finally { disposed = true; if (legacyUrl) URL.revokeObjectURL(legacyUrl); }
}
