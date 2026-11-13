import { verifiedCampaignFile, type CampaignFileIdentity, type PreparedCampaign } from '../../offline/campaign';

export interface CampaignMovieBinding {
    name: string;
    file: string;
    original: string;
    sha256?: string;
    durationSeconds?: number;
    width?: number;
    height?: number;
    hdCandidate?: { file: string; verification: string } | null;
}

// A replacement is optional. Its hash-pinned audit must match the original cut,
// decoded audio, language and subtitle timeline before it can replace the fallback.
export function matchingCampaignMovieAudit(audit: any, movie: CampaignMovieBinding, entry: CampaignFileIdentity): boolean {
    const original = audit?.original, replacement = audit?.replacement;
    return audit?.schema === 'campaign-movie-match-v1' && audit.cut === 'frame-matched'
        && Number.isSafeInteger(audit.matchedFrames) && audit.matchedFrames > 0
        && original?.name === movie.original && original.sha256 === movie.sha256
        && replacement?.sha256 === entry.sha256 && typeof original.language === 'string' && !!original.language
        && replacement.language === original.language
        && /^[a-f0-9]{64}$/.test(original.audioPcmSha256) && replacement.audioPcmSha256 === original.audioPcmSha256
        && /^[a-f0-9]{64}$/.test(original.subtitleTimelineSha256)
        && replacement.subtitleTimelineSha256 === original.subtitleTimelineSha256
        && Number.isFinite(movie.durationSeconds) && Math.abs(original.durationSeconds - movie.durationSeconds!) < .05
        && Math.abs(replacement.durationSeconds - original.durationSeconds) < .05
        && replacement.width >= movie.width! && replacement.height >= movie.height!
        && Math.abs(replacement.width / replacement.height - movie.width! / movie.height!) < .001;
}

export async function loadCampaignMovieBytes(manifest: PreparedCampaign, movie: CampaignMovieBinding): Promise<Uint8Array> {
    const fallback = manifest.files.find(file => file.name === movie.file);
    if (!fallback) throw new Error(`Campaign movie fallback is unavailable: ${movie.name}`);
    const candidate = movie.hdCandidate;
    if (candidate) {
        try {
            const entry = manifest.files.find(file => file.name === candidate.file);
            const verification = manifest.files.find(file => file.name === candidate.verification);
            if (!entry || !verification) throw new Error('Missing movie replacement audit');
            const audit = JSON.parse(new TextDecoder().decode(await verifiedCampaignFile(verification)));
            if (!matchingCampaignMovieAudit(audit, movie, entry)) throw new Error('Movie replacement differs from original');
            return await verifiedCampaignFile(entry);
        } catch (error) { console.warn('Campaign movie retains original:', movie.name, String(error)); }
    }
    return verifiedCampaignFile(fallback);
}
