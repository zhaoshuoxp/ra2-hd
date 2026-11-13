import dispositions from '../../docs/campaign-art/yr-v1/original-animation-absences-r1.json';

export { dispositions as originalAnimationAbsences };
export interface OriginalAnimationContext {
    edition: string; theater: string; identity: string; mission: string; missionSha256: string;
    family: string; bodySha256: string; buildup: string;
}

export function originalAnimationAbsence(context: OriginalAnimationContext, dependency: any,
    hasOriginal: (member: string) => boolean): string | undefined {
    const record = dispositions.records.find(record => record.edition === context.edition
        && record.theater === context.theater && record.identity === context.identity
        && record.mission === context.mission && record.missionSha256 === context.missionSha256
        && record.family === context.family && record.bodySha256 === context.bodySha256
        && record.requestedImage === context.buildup);
    if (!record || dependency.animation !== record.requestedImage
        || dependency.source?.member !== record.resolvedMember
        || dependency.source?.status !== 'ORIGINAL_MEMBER_ABSENT' || dependency.source?.sha256
        || dependency.palette?.sha256 !== record.paletteSha256) return;
    const declaration = record.declarations.find(declaration => declaration.role === dependency.role);
    if (!declaration || JSON.stringify(dependency.extraOffset) !== JSON.stringify(declaration.extraOffset)) return;
    const keys = Object.keys(declaration.nativeArt);
    if (Object.keys(dependency.nativeArt ?? {}).length !== keys.length
        || keys.some(key => dependency.nativeArt[key] !== (declaration.nativeArt as any)[key])) return;
    if (record.originalLookupCandidates.some(hasOriginal)) return;
    return record.id;
}
