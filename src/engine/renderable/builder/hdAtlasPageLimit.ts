import type { HdSource } from './resolveHdSprite';

export function hdAtlasPageLimit(source: HdSource, density: number, losslessTiles: boolean, compactData: boolean): number {
    if (density !== 4 || !losslessTiles || !compactData) return 8;
    if (source.member === 'ngyard_d.shp') return 16;
    // The complete native T-Rex has 424 physical slots. Preserve their indices,
    // including unused compatibility slots, within the existing world budget.
    if (source.member === 'dnoa.shp' && source.theater === 'NEWURBAN'
        && source.sha256 === 'f2ae766af30316eb86135cc2ba87c890238f0f43526567f041e2d6a6cad6f7fe'
        && source.canvas[0] === 236 && source.canvas[1] === 230 && source.canvas.length === 2
        && source.frames.length === 424) return 10;
    return 8;
}
