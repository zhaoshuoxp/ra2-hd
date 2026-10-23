import { matchesBuildingCoverage, buildingCoverageMemberCounts } from './sovietBuildingCoverage';
import { isAlliedBuildingHdFamily, type AlliedBuildingHdFamily } from './alliedBuildingHdFamilies';
import { isYuriBuildingHdFamily, type YuriBuildingHdFamily } from './yuriBuildingHdFamilies';
import type * as THREE from 'three';
import type { BuildingTurretHd } from '../building/BuildingTurretHd';
import { matchesNapowrHdSources } from './napowrHdFamily';
import { isSovietBuildingHdFamily, matchesSovietBuildingHdSources, sovietBuildingHdFamilies, type SovietBuildingHdFamily } from './sovietBuildingHdFamilies';
import { stabilizePowerPlantAnimation, stablePowerPlantManifest } from './stabilizePowerPlantAnimation';
import type { HdSpriteOverride } from './HdSpriteOverride';
import { disposeHdSprite, resolveHdSprite, type HdPageReader, type HdSource } from './resolveHdSprite';

// Native active-animation frames 16..31 are retained original shadow-shaped data.
// The current art caller has Shadow=no and loops only 0..7 or 8..15.
export const powerPlantMembers = new Map([
    ['ggpowr.shp', 3], ['ggpowr_a.shp', 16], ['gtpowrmk.shp', 25],
]);
export interface PowerPlantHdEntry {
    image: object;
    source: HdSource;
    manifest: any;
    manifestHash: string;
    read: HdPageReader;
}
export interface LoadedPowerPlantHd {
    turret?: BuildingTurretHd;
    overrides: Map<object, HdSpriteOverride>;
    report: { density: number; gpuBytes: number; animation?: { policy: string; effectPixels: number[] }; attempts: { density: number; member?: string; reason: string }[] };
}
export type BuildingHdFamily = 'GAPOWR' | 'NAPOWR' | SovietBuildingHdFamily | AlliedBuildingHdFamily | YuriBuildingHdFamily;

export function disposePowerPlantHd(loaded?: LoadedPowerPlantHd) {
    loaded?.turret?.dispose();
    loaded?.overrides.forEach(disposeHdSprite);
    loaded?.overrides.clear();
}

export async function resolvePowerPlantHd(entries: PowerPlantHdEntry[], requestedDensity: number,
    maxTextureSize: number, upload: (textures: THREE.Texture[]) => void | Promise<void> = () => {},
    family: BuildingHdFamily = 'GAPOWR', remainingBudget = 64 * 1024 * 1024, losslessTiles = false, stopped = () => false): Promise<LoadedPowerPlantHd> {
    const attempts: LoadedPowerPlantHd['report']['attempts'] = [];
    const original = (): LoadedPowerPlantHd => ({ overrides: new Map(), report: { density: 1, gpuBytes: 0, attempts } });
    if (requestedDensity === 1) return original();
    const batch = isSovietBuildingHdFamily(family);
    const coverageMatch = matchesBuildingCoverage(family, entries.map(e => e.source));
    const memberCount = coverageMatch ? entries.length : batch ? sovietBuildingHdFamilies[family].members.length : powerPlantMembers.size;
    const sourcesMatch = coverageMatch || (!isAlliedBuildingHdFamily(family) && (!isYuriBuildingHdFamily(family) || batch) && (batch ? matchesSovietBuildingHdSources(family, entries.map(e => e.source))
        : family === 'NAPOWR' ? matchesNapowrHdSources(entries.map(e => e.source))
        : entries.length === powerPlantMembers.size
        && entries.every(e => e.source.theater === 'TEMPERATE'
            && powerPlantMembers.get(e.source.member) === e.source.frames.length
            && e.source.canvas[0] === 142 && e.source.canvas[1] === 110)));
    if (![2, 4].includes(requestedDensity) || !sourcesMatch
        || new Set(entries.map(e => e.source.member)).size !== memberCount
        || new Set(entries.map(e => e.image)).size !== memberCount) {
        attempts.push({ density: requestedDensity, reason: 'building-family-mismatch' });
        return original();
    }
    for (const density of [4, 2].filter(d => d <= requestedDensity)) {
        if (stopped()) break;
        const familyLimit = family === 'NAYARD' && density === 4 && losslessTiles
            ? 128 * 1024 * 1024 : 64 * 1024 * 1024;
        if ((batch || remainingBudget < 64 * 1024 * 1024) && !losslessTiles) {
            // Reject over-budget densities before allocating even the first page.
            // The member resolver independently validates these untrusted sizes.
            const bytes = entries.reduce((sum, entry) => sum + (entry.manifest?.variants
                ?.find((v: any) => v.density === density)?.pages ?? [])
                .reduce((n: number, p: any) => n + Number(p.size?.[0]) * Number(p.size?.[1]) * 6, 0), 0);
            if (!Number.isFinite(bytes) || bytes > Math.min(64 * 1024 * 1024, remainingBudget)) {
                attempts.push({ density, reason: bytes > 64 * 1024 * 1024 ? 'building-family-memory-limit' : 'combined-hd-memory-limit' });
                continue;
            }
        }
        const overrides = new Map<object, HdSpriteOverride>();
        let gpuBytes = 0;
        try {
            for (const entry of entries) {
                if (stopped()) throw Error('cancelled');
                const result = await resolveHdSprite(entry.manifest, entry.manifestHash, entry.source,
                    density, maxTextureSize, entry.read, losslessTiles ? () => {} : upload, false, losslessTiles, stopped);
                if (!result.override) {
                    attempts.push(...result.attempts.map(attempt => ({ ...attempt, member: entry.source.member })));
                    throw new Error('member-rejected');
                }
                overrides.set(entry.image, result.override);
                gpuBytes += result.gpuBytes;
                if (gpuBytes > familyLimit) {
                    attempts.push({ density, reason: 'building-family-memory-limit' });
                    throw new Error('family-budget');
                }
                if (gpuBytes > remainingBudget) {
                    attempts.push({ density, reason: 'combined-hd-memory-limit' });
                    throw new Error('family-budget');
                }
            }
            // Tiled allocation is known only after validated decoding. Upload
            // atomically after the whole family's actual GPU budget has passed.
            if (losslessTiles) await upload([...overrides.values()].flatMap(o => o.pages.flatMap(p =>
                p.tiles ? [p.base, p.data, p.tiles.map, ...(p.tiles.dataMap ? [p.tiles.dataMap] : [])] : [p.base, p.data])));
            const active = entries.find(e => e.source.member === 'ggpowr_a.shp');
            let animation: LoadedPowerPlantHd['report']['animation'];
            if (active?.manifestHash === stablePowerPlantManifest) {
                const override = overrides.get(active.image)!;
                animation = stabilizePowerPlantAnimation(override, active.source, density);
                await upload(override.pages.flatMap(p => [p.base, p.data]));
            }
            return { overrides, report: { density, gpuBytes, attempts, animation } };
        } catch (error) {
            overrides.forEach(disposeHdSprite);
            if (!(error instanceof Error) || !['member-rejected', 'family-budget'].includes(error.message)) {
                attempts.push({ density, reason: 'building-family-load-failure' });
            }
        }
    }
    return original();
}

// This view owns no textures. Originals (including all shadow frames) remain in the
// aggregate; only validated constituent native frames receive HD page coordinates.
export function aggregatePowerPlantHd(aggregate: { imageIndexes: Map<object, number> },
    loaded?: LoadedPowerPlantHd, family: BuildingHdFamily = 'GAPOWR'): HdSpriteOverride | undefined {
    const memberCounts = buildingCoverageMemberCounts(family);
    if (!isAlliedBuildingHdFamily(family) && (!isYuriBuildingHdFamily(family) || isSovietBuildingHdFamily(family))) memberCounts.push(isSovietBuildingHdFamily(family)
        ? sovietBuildingHdFamilies[family].members.length : powerPlantMembers.size);
    if (!loaded?.overrides.size || !memberCounts.includes(loaded.overrides.size)
        || [...loaded.overrides.keys()].some(image => !aggregate.imageIndexes.has(image))) return;
    const frames: HdSpriteOverride['frames'] = [];
    const pages: HdSpriteOverride['pages'] = [];
    const identities: string[] = [];
    const completionFrames = new Map<number, number>();
    for (const [image, override] of loaded.overrides) {
        const offset = aggregate.imageIndexes.get(image)!;
        identities.push(`${offset}:${override.identity}`);
        if (override.constructionCompletionFrame !== undefined)
            completionFrames.set(offset, override.constructionCompletionFrame);
        const pageOffset = pages.length;
        for (let i = 0; i < override.frames.length; i++) {
            const frame = override.frames[i];
            frames[offset + i] = { ...frame, page: frame.page + pageOffset };
        }
        pages.push(...override.pages);
    }
    return { identity: `${family.toLowerCase()}/${identities.join('|')}`, frames, pages,
        ...(completionFrames.size ? { constructionCompletionFrames: completionFrames } : {}) };
}
