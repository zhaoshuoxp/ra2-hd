const seen = new Set<string>();
const key = (edition: string) => 'ra2hd-campaign-introduction:' + edition;

export function campaignIntroductionSeen(edition: string): boolean {
    if (seen.has(edition)) return true;
    try { return sessionStorage.getItem(key(edition)) === '1'; } catch { return false; }
}
export function rememberCampaignIntroduction(edition: string): void {
    seen.add(edition);
    try { sessionStorage.setItem(key(edition), '1'); } catch { /* The current window still retains its completion. */ }
}
