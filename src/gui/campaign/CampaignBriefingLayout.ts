export interface CampaignBriefingFlow { width: number; height: number; shape: string }

// Follow the original projection's left edge so short upper lines can use the
// free space above its locator without painting over the tactical image.
export function campaignBriefingFlow(projection: unknown, originX = 20, originY = 20): CampaignBriefingFlow | undefined {
    if (typeof projection !== 'string') return;
    const match = /^M([\d.]+) ([\d.]+)L([\d.]+) ([\d.]+)V([\d.]+)L([\d.]+) ([\d.]+)M/.exec(projection);
    if (!match) return;
    const [right, top, left, upper, lower, endRight, bottom] = match.slice(1).map(Number);
    if (right !== endRight || !(originX < left && left < right && right <= 800
        && originY < top && top < upper && upper < lower && lower <= bottom && bottom <= 520)) return;
    const width = right - originX - 8, height = bottom - originY;
    const points = [[width, 0], [width, top - originY], [left - originX - 8, upper - originY],
        [left - originX - 8, lower - originY], [width, height]];
    return { width, height, shape: `polygon(${points.map(p => `${p[0]}px ${p[1]}px`).join(', ')})` };
}
