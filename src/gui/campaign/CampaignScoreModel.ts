import type { CampaignDefinition, CampaignDifficulty } from '../../data/campaign/CampaignDefinition';

export function campaignSkipsScore(campaign: { launch: { semanticsVersion?: number }; definition: CampaignDefinition }): boolean {
    return (campaign.launch.semanticsVersion ?? 1) >= 26
        && !!campaign.definition.ini.getSection('Basic')?.getBool('SkipScore');
}

export function campaignRanking(definition: CampaignDefinition, difficulty: CampaignDifficulty, elapsedSeconds: number) {
    const ranking = definition.ini.getSection('Ranking');
    if (!ranking) throw new Error('Original campaign ranking is missing');
    const key = { easy: 'ParTimeEasy', normal: 'ParTimeMedium', hard: 'ParTimeHard' }[difficulty];
    const parts = ranking.getString(key).split(':').map(Number);
    if (parts.length !== 3 || parts.some(part => !Number.isInteger(part) || part < 0)) throw new Error('Invalid original par time');
    const parSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
    const prefix = elapsedSeconds < parSeconds ? 'UnderPar' : 'OverPar';
    return { parSeconds, title: ranking.getString(prefix + 'Title'), message: ranking.getString(prefix + 'Message') };
}

export function scoreTime(seconds: number): string {
    const total = Math.max(0, Math.floor(seconds));
    return [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60]
        .map(part => String(part).padStart(2, '0')).join(':');
}

export function scoreText(text: string, elapsedMs: number, startMs: number): string {
    return Array.from(text).slice(0, Math.max(0, Math.floor((elapsedMs - startMs) / 32))).join('');
}
