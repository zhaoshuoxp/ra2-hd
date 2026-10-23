import catalog from '../../../../desktop/yuri-unit-contracts.json';
import type { HdSource } from './resolveHdSprite';

// Only exact native member/hash contracts may use the existing pooled unit path.
export function isYuriUnitHdSource(source: HdSource) {
    return source.theater === 'TEMPERATE' && Object.values(catalog.shp).some(family =>
        family.members.some(member => member.member === source.member && member.sourceHash === source.sha256
            && member.frames === source.frames.length && JSON.stringify(member.canvas) === JSON.stringify(source.canvas)));
}
