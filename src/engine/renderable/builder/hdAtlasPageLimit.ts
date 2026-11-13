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
    // All 87 original castle-collapse states retain their native geometry.
    // The complete family still passes the existing world-memory admission.
    if (source.member === 'cttr03dm.shp' && source.theater === 'TEMPERATE'
        && source.sha256 === '5ee66ed709ace84da29643d01f4bf279fce9c75253e50f85c01a27532aa62283'
        && source.canvas.length === 2 && source.canvas[0] === 260 && source.canvas[1] === 238
        && source.frames.length === 87) return 17;
    return 8;
}
