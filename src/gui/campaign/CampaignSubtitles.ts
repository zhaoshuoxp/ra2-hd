export interface CampaignSubtitleCue { start: number; end: number; text: string }
export interface CampaignSubtitleTiming { start: number; end: number; key: string }

export function currentCampaignSubtitle(cues: readonly CampaignSubtitleCue[], time: number): string {
    if (!Number.isFinite(time)) return '';
    return cues.find(cue => cue.start <= time && time < cue.end)?.text ?? '';
}

export function localizeCampaignSubtitles(timings: readonly CampaignSubtitleTiming[], strings: any): CampaignSubtitleCue[] {
    return timings.map(cue => ({ start: cue.start, end: cue.end, text: strings.get(cue.key) }));
}
