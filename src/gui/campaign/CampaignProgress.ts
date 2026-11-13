import { isCampaignDifficulty, type CampaignDifficulty } from '../../data/campaign/CampaignDefinition';
import { campaignRouteFaction } from '../../data/campaign/CampaignMission';

interface Completion {
    edition?: 'ra2' | 'yr';
    faction?: string;
    mission: string;
    difficulty: CampaignDifficulty;
    sourceSha256: string;
    provenanceDigest: string;
    completedAt: string;
}

export function completeCampaignProgress(previous: string | null | undefined, launch: Omit<Completion, 'completedAt'>,
    completedAt = new Date().toISOString()) {
    if (!isCampaignDifficulty(launch.difficulty)) throw new Error('Unsupported campaign progress difficulty');
    let completed: Completion[] = [];
    try {
        const saved = JSON.parse(previous ?? 'null');
        if ([1, 2].includes(saved?.version) && Array.isArray(saved.completed)) {
            completed = saved.completed.filter((entry: Completion) => entry && typeof entry.mission === 'string')
                .map((entry: Completion) => ({ ...entry, edition: entry.edition ?? saved.edition ?? 'ra2',
                faction: entry.faction ?? (entry.mission.startsWith('sov') ? 'soviet' : entry.mission.startsWith('trn') ? 'tutorial' : 'allied') })).filter((entry: Completion) =>
                isCampaignDifficulty(entry.difficulty) && typeof entry.sourceSha256 === 'string'
                && typeof entry.provenanceDigest === 'string' && typeof entry.completedAt === 'string');
        }
    } catch { /* Invalid presentation-only progress must not prevent the result screen. */ }
    completed = completed.filter(entry => entry.mission !== launch.mission || entry.difficulty !== launch.difficulty || entry.edition !== (launch.edition ?? 'ra2'));
    completed.push({ edition: launch.edition ?? 'ra2', faction: launch.faction ?? campaignRouteFaction(launch.edition ?? 'ra2', launch.mission), mission: launch.mission, difficulty: launch.difficulty, sourceSha256: launch.sourceSha256,
        provenanceDigest: launch.provenanceDigest, completedAt });
    return { version: 2, completed, nextPlayable: false };
}
