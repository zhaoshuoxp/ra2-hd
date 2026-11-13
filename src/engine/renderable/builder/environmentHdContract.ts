import contract from '../../../../desktop/environment-hd-contract.json';
import snowContract from '../../../../desktop/environment-snow-hd-contract.json';
import urbanContract from '../../../../desktop/environment-urban-hd-contract.json';
import newurbanContract from '../../../../desktop/environment-newurban-hd-contract.json';
import desertContract from '../../../../desktop/environment-desert-hd-contract.json';
import lunarContract from '../../../../desktop/environment-lunar-hd-contract.json';
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
    requiredTurret?: boolean;
    sourceOverrides?: Record<string, EnvironmentMember>;
    sourceScope?: { officialMapSha256s: string[]; visualAdaptationStatus: string } | { campaignSourceSha256s: string[] }
        | { campaignSources: { edition?: 'ra2' | 'yr'; mission: string; sha256: string }[] };
};
export type EnvironmentTurretAttachment = {
    family: string;
    sources: Record<string, string>;
    palette: { member: string; sha256: string };
    variants: Record<'2' | '4', { sha256: string; workingBytes: number }>;
    sourceScope: NonNullable<EnvironmentFamily['sourceScope']>;
};
export type EnvironmentSourceContext = {
    officialSkirmishSourceSha256?: string | null; officialVisualAdaptations?: { status: string };
    campaign?: { launch: { edition: string; mission: string; sourceSha256: string; semanticsVersion?: number } };
};
export function environmentFamilyScopeIssue(family: Pick<EnvironmentFamily, 'sourceScope'>,
    context: EnvironmentSourceContext): string | undefined {
    if (!family.sourceScope) return;
    if ('campaignSources' in family.sourceScope) {
        const launch = context.campaign?.launch;
        if (!launch || !family.sourceScope.campaignSources.some(source => (source.edition ?? 'ra2') === launch.edition
            && source.mission === launch.mission && source.sha256 === launch.sourceSha256)) return 'campaign-map-source-scope-mismatch';
        return;
    }
    if ('campaignSourceSha256s' in family.sourceScope) {
        const launch = context.campaign?.launch;
        // Legacy lists were qualified only for Soviet 01. Later families use
        // explicit mission/source pairs rather than broadening that approval.
        if (!launch || launch.edition !== 'ra2' || launch.mission !== 'sov01t.map'
            || !family.sourceScope.campaignSourceSha256s.includes(launch.sourceSha256)) return 'campaign-map-source-scope-mismatch';
        return;
    }
    if (!family.sourceScope.officialMapSha256s.includes(context.officialSkirmishSourceSha256 ?? ''))
        return 'official-map-source-scope-mismatch';
    if (context.officialVisualAdaptations?.status !== family.sourceScope.visualAdaptationStatus)
        return 'official-visual-adaptation-not-applied';
}
export const environmentHdContract = contract as typeof contract & {
    sources: Record<string, EnvironmentMember>;
    families: Record<string, EnvironmentFamily>;
    identities: Record<string, Record<string, string>>;
    turretAttachments?: Record<string, EnvironmentTurretAttachment>;
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
        : name === 'DESERT' ? desertContract as unknown as EnvironmentContract
        : name === 'LUNAR' ? lunarContract as unknown as EnvironmentContract : undefined;
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
