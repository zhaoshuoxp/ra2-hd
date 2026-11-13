import { activeEdition } from '../editions/activeEdition';
import { editionStorageKey } from '../editions/GameEdition';
import type { CampaignFileIdentity, PreparedCampaign } from './campaign';
import { verifiedCampaignFile } from './campaign';
import type { CampaignMovieBinding } from '../gui/campaign/CampaignMovieOverride';
import type { MovieTimePoint } from '../gui/campaign/MovieTimeline';
import type { CampaignMediaSource } from '../gui/campaign/CampaignMediaPlayer';
import { campaignSubtitleTimings } from '../gui/campaign/CampaignSubtitleTracks';

export const hdMoviePreferenceKey = 'ra2hd.hdMovies.v1';
export function hdMoviesEnabled(edition = activeEdition): boolean {
    try { return localStorage.getItem(editionStorageKey(edition, hdMoviePreferenceKey)) !== '0'; }
    catch { return true; }
}
export function setHdMoviesEnabled(enabled: boolean, edition = activeEdition): void {
    try { localStorage.setItem(editionStorageKey(edition, hdMoviePreferenceKey), enabled ? '1' : '0'); }
    catch (error) { console.warn('Movie preference could not be saved:', error); }
}
export interface MovieIdentity {
    edition: 'ra2' | 'yr'; id: string; original: { sha256: string }; file: CampaignFileIdentity;
    durationSeconds?: number;
}
interface HdMovieEntry {
    edition: 'ra2' | 'yr'; id: string; original: { sha256: string; language: string; durationSeconds: number };
    file: CampaignFileIdentity & { mime: string };
    timeline: MovieTimePoint[];
    subtitles: { strategy: 'game' | 'none' | 'burned-in'; timelineSha256: string };
}
let catalogPromise: Promise<HdMovieEntry[]> | undefined;
function catalog(): Promise<HdMovieEntry[]> {
    return catalogPromise ??= (async () => {
        try {
            const response = await fetch('/local-hd-movies/catalog.json', { signal: AbortSignal.timeout(5000) });
            if (!response.ok) return [];
            const value = await response.json();
            if (value.schema !== 'registered-hd-movies-v1' || !Array.isArray(value.entries) || value.entries.length > 512) return [];
            return value.entries;
        } catch { return []; }
    })();
}
async function registeredMovie(file: CampaignFileIdentity): Promise<boolean> {
    if (!Number.isSafeInteger(file.bytes) || file.bytes <= 0 || !/^[a-f0-9]{64}$/.test(file.sha256)
        || !/^\/local-(?:hd-movies|movies|campaign)\/[a-zA-Z0-9_./-]+\.(?:webm|mp4)$/.test(file.route)
        || file.route.split('/').some(part => part === '..' || part === '.')
        || file.route.split('/').at(-1) !== file.name) throw Error('Unsafe movie identity');
    const response = await fetch(file.route, { method: 'HEAD', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw Error('Movie payload is unavailable');
    if (Number(response.headers.get('Content-Length')) !== file.bytes) throw Error('Movie payload size differs');
    // This attestation comes from the local streaming server after its bounded-memory hash check.
    return response.headers.get('X-RA2-Movie-Sha256') === file.sha256;
}
export async function prepareMovieSource(movie: MovieIdentity,
    legacyOriginal?: () => Promise<string>): Promise<CampaignMediaSource> {
    const original = async (): Promise<CampaignMediaSource> => {
        if (await registeredMovie(movie.file)) return { url: movie.file.route, kind: 'original' };
        if (legacyOriginal) return { url: await legacyOriginal(), kind: 'original' };
        throw Error('Original movie integrity could not be verified');
    };
    if (hdMoviesEnabled(movie.edition)) {
        const candidates = (await catalog()).filter(entry => entry.edition === movie.edition && entry.id === movie.id
            && entry.original?.sha256 === movie.original.sha256);
        if (candidates.length === 1) {
            const candidate = candidates[0];
            try {
                const timings = campaignSubtitleTimings[(movie.edition === 'yr' ? 'yr_' : '') + movie.id] ?? [];
                const bytes = new TextEncoder().encode(JSON.stringify(timings));
                const timelineHash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
                    .map(byte => byte.toString(16).padStart(2, '0')).join('');
                if (!/^\/local-hd-movies\/[a-z0-9-]+\/[a-z0-9_.-]+\.(?:webm|mp4)$/.test(candidate.file.route)
                    || !['video/webm; codecs="vp9,opus"', 'video/mp4; codecs="avc1.640028,mp4a.40.2"',
                        'video/mp4; codecs="avc1.64002a,mp4a.40.2"'].includes(candidate.file.mime)
                    || !document.createElement('video').canPlayType(candidate.file.mime)
                    || candidate.subtitles.timelineSha256 !== timelineHash
                    || timings.length > 0 && candidate.subtitles.strategy !== 'game'
                    || !await registeredMovie(candidate.file)) throw Error('HD movie is unavailable or unsupported');
                return { url: candidate.file.route, kind: 'hd', timeline: candidate.timeline,
                    subtitleStrategy: candidate.subtitles.strategy, fallback: original };
            } catch (error) { console.warn('HD movie retains original:', movie.edition, movie.id, String(error)); }
        }
    }
    return original();
}
export function campaignMovieSource(manifest: PreparedCampaign, movie: CampaignMovieBinding): {
    url: string; source: () => Promise<CampaignMediaSource>; dispose(): void;
} {
    const file = manifest.files.find(entry => entry.name === movie.file);
    if (!file || !movie.sha256) throw Error('Campaign movie fallback identity is unavailable');
    let legacyUrl: string | undefined, disposed = false;
    return { url: file.route, source: () => prepareMovieSource({ edition: manifest.edition, id: movie.name.toLowerCase(),
        original: { sha256: movie.sha256! }, file, durationSeconds: movie.durationSeconds }, async () => {
            if (legacyUrl) return legacyUrl;
            const bytes = await verifiedCampaignFile(file);
            if (disposed) throw Error('Movie request was cancelled');
            legacyUrl = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'video/webm' }));
            return legacyUrl;
        }), dispose() { disposed = true; if (legacyUrl) URL.revokeObjectURL(legacyUrl); legacyUrl = undefined; } };
}
