export interface MovieTimePoint { original: number; media: number }

// Saves, captions and source actions always use the original movie clock.
export function movieTime(time: number, points: readonly MovieTimePoint[] | undefined, reverse = false): number {
    if (!points || points.length < 2 || !Number.isFinite(time)) return time;
    const from = reverse ? 'media' : 'original', to = reverse ? 'original' : 'media';
    let index = points.findIndex(point => point[from] >= time);
    if (index < 1) index = index === 0 ? 1 : points.length - 1;
    const a = points[index - 1], b = points[index];
    return Math.max(0, a[to] + (time - a[from]) * (b[to] - a[to]) / (b[from] - a[from]));
}
