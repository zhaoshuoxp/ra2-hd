export type CampaignMoviePlacement = 'fullscreen' | 'transmission' | 'transmission-paused';

export function campaignMoviePauses(placement: CampaignMoviePlacement): boolean {
    return placement === 'fullscreen' || placement === 'transmission-paused';
}
