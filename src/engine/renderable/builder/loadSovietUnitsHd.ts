import { BufferGeometrySerializer } from '@/engine/gfx/geometry/BufferGeometrySerializer';
import { DataStream } from '@/data/DataStream';
import type { VxlGeometryPool } from './vxlGeometry/VxlGeometryPool';
import { activeEdition } from '@/editions/activeEdition';
import { resolveMixedUnitFamily, resolveSameDensityUnitFamily } from './resolveMixedUnitFamily';
import { UnitHdDemand } from './UnitHdDemand';
import type { DemandFamily } from './UnitHdDemand';
import type { AdditionalBuildingDemand } from './alliedBuildingDemand';
import type { LoadedPowerPlantHd } from './resolvePowerPlantHd';
import { Engine } from '@/engine/Engine';
import { TheaterType } from '@/engine/TheaterType';
import { requestedHdDensity } from './hdOrigin';
import { disposeHdSprite, resolveHdSprite, type HdSource, type HdPageReader } from './resolveHdSprite';
import { unitHdFamiliesForEdition } from './unitHdFamilies';
import type { HdSpriteOverride } from './HdSpriteOverride';
import type * as THREE from 'three';
import { loadVxlFamily, type VxlFamily } from '../unitVxl/loadVxlFamily';
import { vxlUnitAvailableInTheater, vxlUnitFamilies } from '../unitVxl/identities';
import { theaterName } from '@/engine/theaterName';
import { VxlPagePreparer } from '../unitVxl/VxlPagePreparer';
import { uploadHdTextures } from './uploadHdTextures';

type LoadedMember = { image: any; override: HdSpriteOverride };
export interface LoadedSovietUnitsHd {
    families: Map<string, { members: Map<string, LoadedMember> }>;
    report: { gpuBytes: number; budget: number; families: Record<string, any>; preparation?: { pages: number; workerMs: number } };
    bind?: (identity: string, image: any, apply: (override?: HdSpriteOverride) => void) => () => void;
    bindVxl?: (identity: string, apply: (family?: VxlFamily) => void) => () => void;
    bindBuilding?: (identity: string, apply: (family?: LoadedPowerPlantHd) => void) => () => void;
    prewarmBuilding?: (identity: string) => () => void;
    preview?: (identity: string) => () => void;
    prewarm?: (identity: string) => () => void;
    idle?: () => Promise<void>;
    dispose?: () => void;
}
interface PreparedMember {
    image: any; manifest: any; manifestHash: string; source: HdSource; read: HdPageReader;
}
const check = (value: unknown, reason: string) => { if (!value) throw Error(reason); };
const digest = async (bytes: ArrayBuffer) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
const disposeMembers = (members: Map<string, LoadedMember>) => members.forEach(member => disposeHdSprite(member.override));
const vxlParent = (identity: string) => ({ V3ROCKET: 'V3', DMISL: 'DRED', BPLN: 'BORIS',
    HORNET: 'CARRIER', ASW: 'DEST', CMON: 'CMIN', CMISL: 'BSUB', TRUCKA: 'DTRUCK' } as Record<string, string>)[identity] ?? identity;
const demandParent = (identity: string) => vxlParent(activeEdition === 'yr'
    ? ({ YDOG: 'DOG', YADOG: 'ADOG' } as Record<string, string>)[identity] ?? identity : identity);

// Transactional family loading: no live binding until every member is ready at one density.
export async function resolveSovietUnitMembers(inputs: PreparedMember[], requested: number, budget: number,
    maxTextureSize: number, upload: (textures: THREE.Texture[]) => void | Promise<void>, cancelled = () => false, losslessTiles = false) {
    const attempts: { density: number; reason: string }[] = [];
    for (const density of [4, 2].filter(value => value <= requested)) {
        if (cancelled()) break;
        const members = new Map<string, LoadedMember>();
        try {
            const bytesNeeded = inputs.reduce((sum, input) => {
                const variant = input.manifest.variants.find((value: any) => value.density === density)
                    ?? (density === 2 ? input.manifest.variants.find((value: any) => value.density === 4) : undefined);
                check(variant, 'missing-density');
                const scale = density / variant.density;
                return sum + variant.pages.reduce((total: number, page: any) => total
                    + Math.ceil(page.size[0] * scale) * Math.ceil(page.size[1] * scale) * 8, 0);
            }, 0);
            check(inputs.length > 0 && Number.isSafeInteger(bytesNeeded)
                && (losslessTiles || bytesNeeded <= budget), 'combined-budget');
            let gpuBytes = 0;
            for (const input of inputs) {
                check(!cancelled(), 'cancelled');
                const selected = await resolveHdSprite(input.manifest, input.manifestHash, input.source,
                    density, maxTextureSize, input.read, losslessTiles ? () => {} : upload, false, losslessTiles, cancelled);
                if (!selected.override) throw Error(`${input.source.member}:${selected.attempts.at(-1)?.reason ?? 'load-failure'}`);
                members.set(input.source.member, { image: input.image, override: selected.override });
                gpuBytes += selected.gpuBytes;
                check(gpuBytes <= budget, 'combined-budget');
            }
            check(!cancelled(), 'cancelled');
            check(losslessTiles || gpuBytes === bytesNeeded, 'allocation-accounting-mismatch');
            // Validate and pool the entire family on CPU before any upload.
            // The measured allocation, including lookup textures, must fit.
            if (losslessTiles) await upload([...members.values()].flatMap(member => member.override.pages.flatMap(page =>
                page.tiles ? [page.base, page.data, page.tiles.map] : [page.base, page.data])));
            check(!cancelled(), 'cancelled');
            return { density, members, gpuBytes, attempts };
        } catch (error) {
            disposeMembers(members);
            attempts.push({ density, reason: error instanceof Error ? error.message : 'load-failure' });
        }
    }
    return { density: 1, members: new Map<string, LoadedMember>(), gpuBytes: 0, attempts };
}

export async function loadSovietUnitsHd(theater: any, renderer: any, enabled: boolean,
    budget: number, cancelled: () => boolean, buildings?: AdditionalBuildingDemand, preferredDensity: 2 | 4 = 4, geometryPool?: VxlGeometryPool): Promise<LoadedSovietUnitsHd> {
    const result: LoadedSovietUnitsHd = { families: new Map(), report: { gpuBytes: 0, budget: Math.max(0, budget), families: {} } };
    const requested = requestedHdDensity(enabled, 'soviet-units-hd', location.href, preferredDensity);
    // Unit artwork is shared across theaters, including snow. Each SHP/VXL/HVA
    // must still match the accepted source before any complete family is bound.
    if ((!requested && !buildings?.identities.size) || theater.type === TheaterType.None) return result;
    const gl = renderer.renderer;
    const preparer = typeof Worker === 'function' && typeof OffscreenCanvas === 'function' ? new VxlPagePreparer() : undefined;
    const geometryPreparer = geometryPool && preparer ? new VxlPagePreparer() : undefined;
    const contracts = new Map(Object.values(unitHdFamiliesForEdition(activeEdition))
        .map(family => [family.identity as string, family]));
    const vxlContracts = new Set(Object.keys(vxlUnitFamilies).filter(identity =>
        (!vxlUnitFamilies[identity].edition || vxlUnitFamilies[identity].edition === activeEdition)
        && vxlUnitAvailableInTheater(vxlUnitFamilies[identity], theaterName(theater.type))));
    const loadShp = async (identity: string, remaining: number, disposed: () => boolean, density = requested) => {
            const family = contracts.get(identity)!;
            if (family.blockedReason) throw Error(family.blockedReason.split(':')[0]);
            const stopped = () => cancelled() || disposed();
            check(!stopped(), 'cancelled');
            const selection = family.selection ?? `unit-${family.identity.toLowerCase()}`;
            const response = await fetch(`/local-hd/${selection}-selection.json`, { signal: AbortSignal.timeout(15000) });
            check(response.ok, 'missing-family-selection');
            const binding = await response.json();
            check(binding.familyHash === family.familyHash && binding.rulesIdentity === family.identity, 'family-identity-mismatch');
            check(binding.members?.length === family.members.length, 'incomplete-family-selection');
            const inputs: PreparedMember[] = [];
            for (const member of family.members) {
                const entries = binding.members.filter((value: any) => value.member === member.member);
                check(entries.length === 1 && entries[0].sha256 === member.manifestHash, 'member-identity-mismatch');
                const entry = entries[0], prefix = `/local-hd/${entry.sha256}/`;
                const response = await fetch(`${prefix}manifest.json`, { signal: AbortSignal.timeout(15000) });
                check(response.ok, 'missing-manifest');
                const bytes = await response.arrayBuffer();
                check(await digest(bytes) === member.manifestHash, 'manifest-hash-mismatch');
                const manifest = JSON.parse(new TextDecoder().decode(bytes));
                check(JSON.stringify(manifest.rulesIdentities) === JSON.stringify([family.identity]), 'rules-identity-mismatch');
                const image = Engine.getImages().get(member.member);
                check(image && image.numImages === member.totalFrames && Engine.vfs, 'missing-original-member');
                const sourceHash = await digest(Uint8Array.from(Engine.vfs!.openFile(member.member).getBytes()).buffer);
                check(sourceHash === member.sourceHash, 'source-hash-mismatch');
                const source = { member: member.member, sha256: sourceHash, theater: 'TEMPERATE',
                    canvas: [image.width, image.height], frames: Array.from({ length: member.frames }, (_, nativeFrame) => {
                        const f = image.getImage(nativeFrame);
                        return { nativeFrame, trimOrigin: [f.x, f.y], trimSize: [f.width, f.height],
                            legacyRenderSize: [f.width + f.width % 2, f.height + f.height % 2], empty: !f.imageData.some(Boolean) };
                    }) };
                const read: HdPageReader = async (filename, hash, size) => {
                    const route = entry.files?.[filename];
                    check(typeof route === 'string' && new RegExp(`^${prefix}[24]/[a-zA-Z0-9_-]+/(base|data)\\.png$`).test(route), 'undeclared-page');
                    const response = await fetch(route, { signal: AbortSignal.timeout(15000) });
                    check(response.ok, 'missing-page');
                    const bytes = await response.arrayBuffer();
                    check(bytes.byteLength === size && await digest(bytes) === hash, 'page-hash-or-size-mismatch');
                    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
                    try {
                        const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
                        const context = canvas.getContext('2d', { willReadFrequently: true })!;
                        context.drawImage(bitmap, 0, 0);
                        return { width: canvas.width, height: canvas.height, rgba: new Uint8Array(context.getImageData(0, 0, canvas.width, canvas.height).data) };
                    } finally { bitmap.close(); }
                };
                inputs.push({ image, manifest, manifestHash: entry.sha256, source, read });
            }
            // Prefer complete families at the requested density within the shared allocation.
            // Missing variants fall back atomically; logical geometry is unchanged.
            return resolveSovietUnitMembers(inputs, density, remaining,
                gl.capabilities.maxTextureSize, async textures => {
                    await uploadHdTextures(gl, textures, stopped);
                    check(gl.getContext().getError() === 0, 'texture-upload-failure');
                }, stopped, true);
        };
    const release = (family: DemandFamily) => {
        if (family.building) buildings!.release(family.building);
        else { disposeMembers(family.members); family.vxl?.dispose(); }
    };
    const demand = new UnitHdDemand(new Set([...(requested ? [...contracts.keys(), ...vxlContracts] : []),
        ...(buildings?.identities ?? [])]), result.report.budget,
        async (identity, remaining, disposed) => {
            const stopped = () => cancelled() || disposed();
            const nativeReady = prepareNativeGeometry(identity, stopped).catch(error => {
                if (!stopped()) console.warn('[Native geometry preparation fallback]', identity, error);
            });
            // Geometry and checked HD pixels use separate owned workers so neither
            // preparation delays the other on short native production queues.
            const selected = await loadFamily(identity, remaining, disposed);
            await nativeReady;
            return selected;
        }, release);
    const loadFamily = async (identity: string, remaining: number, disposed: () => boolean) => {
        const stopped = () => cancelled() || disposed();
        if (buildings?.identities.has(identity)) return buildings.load(identity, remaining, stopped);
        if (vxlContracts.has(identity) && contracts.get(identity)?.sameDensity)
            return resolveSameDensityUnitFamily(requested as 2 | 4, remaining, stopped,
                (budget, density) => loadShp(identity, budget, disposed, density),
                (budget, density) => loadVxlFamily(identity, budget, gl, stopped, density, preparer), release);
        if (vxlContracts.has(identity) && contracts.has(identity))
            return resolveMixedUnitFamily(remaining, stopped,
                budget => loadShp(identity, budget, disposed),
                budget => loadVxlFamily(identity, budget, gl, stopped, requested as 2 | 4, preparer), release);
        if (vxlContracts.has(identity)) return loadVxlFamily(identity, remaining, gl, stopped, requested as 2 | 4, preparer);
        return loadShp(identity, remaining, disposed);
    };
    const prepareNativeGeometry = async (identity: string, stopped: () => boolean) => {
        if (geometryPool && geometryPreparer && vxlContracts.has(identity)) {
            for (const member of vxlUnitFamilies[identity].members) {
                const voxel = Engine.getVoxels().get(member);
                if (!voxel || voxel.sections.every(section => geometryPool.cache.get(section))) continue;
                const bytes = Uint8Array.from(Engine.vfs!.openFile(member).getBytes()).buffer;
                try {
                    const geometries = await geometryPreparer.prepareGeometry(bytes);
                    if (stopped()) throw Error('cancelled');
                    check(geometries.length === voxel.sections.length, 'native-geometry-sections');
                    for (const [index, section] of voxel.sections.entries()) {
                        // A native renderer may have won the race while the worker was busy.
                        if (!geometryPool.cache.get(section)) geometryPool.cache.set(section,
                            new BufferGeometrySerializer().unserialize(new DataStream(geometries[index])));
                    }
                } catch (error) {
                    if (stopped()) throw error;
                    console.warn('[Native geometry preparation fallback]', member, error);
                }
            }
        }
    };
    const report = Object.assign(demand.report, { preparation: preparer?.report, geometryPreparation: geometryPreparer?.report });
    return { families: demand.families, report,
        bind: demand.bind.bind(demand),
        bindBuilding: (identity, apply) => buildings?.identities.has(identity)
            ? demand.bindFamily(identity, family => apply(family?.building)) : () => {},
        prewarmBuilding: identity => buildings?.identities.has(identity) ? demand.prewarm(identity) : () => {},
        preview: identity => {
            const name = vxlParent(identity);
            return buildings?.identities.has(name) || vxlContracts.has(name) ? demand.preview(name) : () => {};
        },
        prewarm: identity => demand.prewarm(demandParent(identity)),
        idle: demand.idle.bind(demand),
        bindVxl: (identity, apply) => {
            const parent = vxlParent(identity);
            return vxlContracts.has(parent) ? demand.bindFamily(parent, family => apply(family?.vxl)) : () => {};
        },
        dispose: () => { demand.dispose(); preparer?.dispose(); geometryPreparer?.dispose(); } };
}

export function disposeSovietUnitsHd(loaded?: LoadedSovietUnitsHd) {
    if (loaded?.dispose) { loaded.dispose(); return; }
    loaded?.families.forEach(family => disposeMembers(family.members));
    loaded?.families.clear();
}
