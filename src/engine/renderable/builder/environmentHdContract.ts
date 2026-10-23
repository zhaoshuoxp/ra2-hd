import contract from '../../../../desktop/environment-hd-contract.json';
import snowContract from '../../../../desktop/environment-snow-hd-contract.json';
import urbanContract from '../../../../desktop/environment-urban-hd-contract.json';
import newurbanContract from '../../../../desktop/environment-newurban-hd-contract.json';
import desertContract from '../../../../desktop/environment-desert-hd-contract.json';
import { theaterName } from '@/engine/theaterName';
import type { HdSource } from './resolveHdSprite';

export type EnvironmentMember = {
    sha256: string; canvas: number[]; totalFrames: number; bodyFrames: number;
    palette: { member: string; sha256: string }; hasShadow: boolean; remapable: boolean;
    framePalettes?: Record<string, { member: string; sha256: string; remapable: boolean;
        role: string; runtimeUsed: boolean }>;
};
export type EnvironmentFamily = {
    members: string[]; identities: string[]; editions: string[]; kinds: string[]; familyHash: string;
    sourceOverrides?: Record<string, EnvironmentMember>;
    sourceScope?: { officialMapSha256s: string[]; visualAdaptationStatus: string };
};
export type EnvironmentSourceContext = {
    officialSkirmishSourceSha256?: string | null; officialVisualAdaptations?: { status: string };
};
export function environmentFamilyScopeIssue(family: EnvironmentFamily,
    context: EnvironmentSourceContext): string | undefined {
    if (!family.sourceScope) return;
    if (!family.sourceScope.officialMapSha256s.includes(context.officialSkirmishSourceSha256 ?? ''))
        return 'official-map-source-scope-mismatch';
    if (context.officialVisualAdaptations?.status !== family.sourceScope.visualAdaptationStatus)
        return 'official-visual-adaptation-not-applied';
}
export const environmentHdContract = contract as typeof contract & {
    sources: Record<string, EnvironmentMember>;
    families: Record<string, EnvironmentFamily>;
    identities: Record<string, Record<string, string>>;
};
type EnvironmentContract = typeof environmentHdContract;
export function environmentMemberSource(selected: EnvironmentContract, identity: string,
    member: string): EnvironmentMember | undefined {
    const family = selected.families[identity];
    if (!family?.members.includes(member)) return;
    return family.sourceOverrides?.[member] ?? selected.sources[member];
}

export function environmentSourceDescriptor(selected: EnvironmentContract, source: HdSource): EnvironmentMember | undefined {
    const matches = (native?: EnvironmentMember) => native?.sha256 === source.sha256
        && native.bodyFrames === source.frames.length
        && JSON.stringify(native.canvas) === JSON.stringify(source.canvas);
    const native = selected.sources[source.member];
    if (!native) return;
    if (matches(native)) return native;
    for (const family of Object.values(selected.families) as EnvironmentFamily[]) {
        if (!family.members.includes(source.member)) continue;
        const variant = family.sourceOverrides?.[source.member];
        if (matches(variant)) return variant;
    }
}
export function environmentHdContractForTheater(type: number | string): EnvironmentContract | undefined {
    const name = theaterName(type);
    return name === 'TEMPERATE' ? environmentHdContract
        : name === 'SNOW' ? snowContract as unknown as EnvironmentContract
        : name === 'URBAN' ? urbanContract as unknown as EnvironmentContract
        : name === 'NEWURBAN' ? newurbanContract as unknown as EnvironmentContract
        : name === 'DESERT' ? desertContract as unknown as EnvironmentContract : undefined;
}

export function isEnvironmentHdSource(source: HdSource): boolean {
    const selected = environmentHdContractForTheater(source.theater);
    return !!selected && !!environmentSourceDescriptor(selected, source);
}

export function isEnvironmentWaterfallSource(source: HdSource): boolean {
    if (!isEnvironmentHdSource(source) || !/^w[abd]0[1-4]x\.(tem|sno|urb|ubn|des)$/.test(source.member)) return false;
    const selected = environmentHdContractForTheater(source.theater)!;
    const native = environmentSourceDescriptor(selected, source)!;
    return /^iso[a-z]+\.pal$/.test(native.palette.member) && !native.hasShadow && !native.remapable
        && Object.values(selected.families).some(family =>
            family.kinds.includes('animation') && family.members.includes(source.member));
}
