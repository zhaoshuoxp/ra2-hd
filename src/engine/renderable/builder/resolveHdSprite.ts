import { isBuildingCoverageSource } from './sovietBuildingCoverage';
import * as THREE from 'three';
import type { HdSpriteOverride } from './HdSpriteOverride';
import { napowrHdFamily } from './napowrHdFamily';
import { isSovietBuildingHdSource } from './sovietBuildingHdFamilies';
import { isAlliedUnitHdSource } from './alliedUnitHdSources';
import { isYuriUnitHdSource } from './yuriUnitHdSources';
import { isSovietUnitHdSource } from './sovietUnitHdFamilies';
import { createPooledHdPage } from './poolHdPage';
import { HdTilePoolPreparer } from './HdTilePoolPreparer';
import { downsampleHdPage } from './downsampleHdPage';
import { serializedHdTiles, validateSerializedHdTilePage, resolveSerializedHdTilePage } from './resolveSerializedHdTiles';
import constructionStorageSources from '../../../../desktop/construction-storage-sources.json';
import type { PreparedHdPage } from './preparedHdPage';
import { isEnvironmentHdSource, isEnvironmentWaterfallSource } from './environmentHdContract';
import { poolSerializedHdRemap } from './poolSerializedHdRemap';
import { hdAtlasPageLimit } from './hdAtlasPageLimit';

export interface HdSource {
    member: string;
    sha256: string;
    theater: string;
    canvas: number[];
    frames: { nativeFrame: number; trimOrigin: number[]; trimSize: number[]; legacyRenderSize: number[]; empty: boolean }[];
}
export interface DecodedHdPage { width: number; height: number; rgba: Uint8Array; }
export interface HdPageReader {
    (filename: string, sha256: string, bytes: number): Promise<DecodedHdPage>;
    prefetch?: (density: number, page: string, limit: number, compactData: boolean, losslessTiles: boolean) => Promise<void>;
    prepared?: (density: number, page: string, limit: number, compactData: boolean, losslessTiles: boolean) => Promise<PreparedHdPage | undefined>;
}
const fail = (reason: string): never => { throw new Error(reason); };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const integer = (x: unknown, min = 0) => Number.isSafeInteger(x) && Number(x) >= min;
const hash = (x: unknown) => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x);
const overlaps = (a: number[], b: number[]) =>
    a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];

export async function resolveHdSprite(manifest: any, manifestHash: string, source: HdSource,
    requestedDensity: number, maxTextureSize: number, read: HdPageReader,
    upload: (textures: THREE.Texture[]) => void | Promise<void> = () => {}, allowFallback = true, losslessTiles = false, stopped = () => false) {
    const attempts: { density: number; reason: string }[] = [];
    const original = () => ({ density: 1, override: undefined as HdSpriteOverride | undefined, gpuBytes: 0, attempts });
    if (requestedDensity === 1) return original();
    // RG8 uploads are restricted to verified building sources and explicitly
    // pooled, pinned unit sources. Unpooled unit contracts retain RGBA8 storage.
    // The external contract remains RGBA8; unused B/A are validated before packing.
    const environmentSource = isEnvironmentHdSource(source);
    const visualOpacity = manifest?.color?.visualOpacity ?? 1;
    const opacityValid = Number.isFinite(visualOpacity) && visualOpacity > 0 && visualOpacity <= 1
        && (visualOpacity === 1 || isEnvironmentWaterfallSource(source));
    const completionPresentation = manifest?.paintedBuildup?.completionPresentation;
    const completionValid = completionPresentation === undefined
        || (completionPresentation === 'retained-idle-v1' && source.member.endsWith('mk.shp')
            && source.frames.length > 1);
    const batchSource = isSovietBuildingHdSource(source) || isBuildingCoverageSource(source) || environmentSource;
    const unitSource = isSovietUnitHdSource(source) || isAlliedUnitHdSource(source) || isYuriUnitHdSource(source);
    const compactData = (losslessTiles && unitSource) || batchSource || (source.theater === 'TEMPERATE' && napowrHdFamily.members.some(
        member => member.member === source.member && member.sha256 === source.sha256));
    const headerValid = manifest?.schemaVersion === 2 && hash(manifestHash)
        && /^[a-z0-9-]+$/.test(manifest.packId) && /^[a-zA-Z0-9.-]+$/.test(manifest.packRevision)
        && (compactData || unitSource || source.member === 'cons.shp' || (source.theater === 'TEMPERATE'
            && ['ggpowr.shp', 'ggpowr_a.shp', 'gtpowrmk.shp'].includes(source.member)))
        && manifest.source?.member === source.member
        && hash(source.sha256) && manifest.source?.sha256 === source.sha256
        && manifest.source?.theater === source.theater && manifest.source?.kind === 'resolved-shp-member'
        && same(manifest.logical?.canvas, source.canvas) && same(manifest.logical?.frames, source.frames)
        && manifest.color?.representation === 'authored-sRGB-RGBA8-plus-RGBA8-data'
        && opacityValid
        && completionValid
        && Array.isArray(manifest.variants) && [2, 4].includes(requestedDensity);
    if (!headerValid) { attempts.push({ density: requestedDensity, reason: 'source-or-contract-mismatch' }); return original(); }
    for (const density of [4, 2].filter(d => allowFallback ? d <= requestedDensity : d === requestedDensity)) {
        if (stopped()) break;
        const textures: THREE.Texture[] = [];
        const preparer = losslessTiles && compactData ? new HdTilePoolPreparer() : undefined;
        try {
            const derived = density === 2 && !manifest.variants.some((v: any) => v.density === 2);
            const sourceDensity = derived ? 4 : density;
            const variants = manifest.variants.filter((v: any) => v.density === sourceDensity);
            if (variants.length !== 1) fail(variants.length ? 'duplicate-density' : 'missing-density');
            const variant = variants[0];
            const serialized = variant.storage === serializedHdTiles;
            const constructionStorage = source.member.endsWith('mk.shp')
                && constructionStorageSources.entries.some(entry => entry.member === source.member
                    && entry.sha256 === source.sha256 && entry.theater === source.theater
                    && same(entry.canvas, source.canvas) && entry.frames === source.frames.length);
            if (variant.storage !== undefined && (!serialized || !losslessTiles || !compactData
                || (!(isBuildingCoverageSource(source) && manifest.packId?.startsWith('yuri-coverage-'))
                    && !constructionStorage) || derived)) fail('unsupported-hd-storage');
            const maxPages = hdAtlasPageLimit(source, sourceDensity, losslessTiles, compactData);
            if (!Array.isArray(variant.pages) || !variant.pages.length || variant.pages.length > maxPages) fail('page-limit');
            if (!Array.isArray(variant.frames) || variant.frames.length !== source.frames.length) fail('incomplete-animation');
            const ids = new Set<string>();
            let gpuBytes = 0;
            const limit = Math.min(2048, maxTextureSize);
            for (const page of variant.pages) {
                if (typeof page.id !== 'string' || ids.has(page.id)) fail('duplicate-page');
                ids.add(page.id);
                if (!Array.isArray(page.size) || page.size.length !== 2
                    || !page.size.every((n: unknown) => integer(n, 1) && Number(n) <= (derived ? 2048 : limit))) fail('page-size-limit');
                gpuBytes += page.size[0] * page.size[1] * (compactData ? 6 : 8);
                if (serialized) {
                    validateSerializedHdTilePage(page, limit);
                    gpuBytes += page.mapSize[0] * page.mapSize[1] * 4;
                }
                for (const role of serialized ? ['base', 'data', 'map'] : ['base', 'data']) {
                    if (typeof page[role] !== 'string' || !/^[a-zA-Z0-9_-]+\.png$/.test(page[role])
                        || !hash(page[`${role}Sha256`]) || !integer(page[`${role}Bytes`], 1)
                        || page[`${role}Bytes`] > 32 * 1024 * 1024) fail('invalid-file-entry');
                }
            }
            // Pooling reduces the GPU allocation after bounded page decoding.
            // Only the existing crane and pinned complete T-Rex exceed eight pages.
            const decodedLimit = losslessTiles && compactData ? maxPages * 24 : 64;
            if (gpuBytes > decodedLimit * 1024 * 1024) fail('memory-limit');
            const seen = new Set<number>();
            const rects = new Map<string, number[][]>();
            const canonicalFrames = new Map<number, any>();
            const frames: HdSpriteOverride['frames'] = [];
            for (const frame of variant.frames) {
                if (!integer(frame.nativeFrame) || seen.has(frame.nativeFrame)) fail('duplicate-frame');
                seen.add(frame.nativeFrame);
                const logical = source.frames[frame.nativeFrame];
                if (!logical || logical.nativeFrame !== frame.nativeFrame) fail('frame-metadata-mismatch');
                const pageIndex = variant.pages.findIndex((p: any) => p.id === frame.page);
                if (pageIndex < 0) fail('missing-page');
                const rect = frame.sampleRect, page = variant.pages[pageIndex];
                if (!Array.isArray(rect) || rect.length !== 4 || !rect.every((n: unknown) => integer(n))) fail('invalid-rectangle');
                if (!same(rect.slice(2), logical.legacyRenderSize.map(n => n * sourceDensity))
                    || !same(frame.contentRect, [...rect.slice(0, 2), ...logical.trimSize.map(n => n * sourceDensity)])) fail('frame-size-mismatch');
                const bounds = serialized ? page.virtualSize : page.size;
                if (rect[0] < 2 || rect[1] < 2 || rect[0] + rect[2] + 2 > bounds[0]
                    || rect[1] + rect[3] + 2 > bounds[1]) fail('rectangle-outside-page');
                const gutter = [rect[0] - 2, rect[1] - 2, rect[2] + 4, rect[3] + 4];
                const existing = rects.get(frame.page) ?? [];
                if (frame.sharedWith !== undefined) {
                    const canonical = canonicalFrames.get(frame.sharedWith);
                    const metadata = source.frames[frame.sharedWith];
                    if (!batchSource || !integer(frame.sharedWith) || !canonical || canonical.sharedWith !== undefined
                        || canonical.page !== frame.page || !same(canonical.sampleRect, rect)
                        || !same(canonical.contentRect, frame.contentRect) || metadata.empty !== logical.empty)
                        fail('invalid-shared-frame');
                } else {
                    if (existing.some(r => overlaps(r, gutter))) fail('overlapping-rectangles');
                    existing.push(gutter); rects.set(frame.page, existing);
                }
                canonicalFrames.set(frame.nativeFrame, frame);
                const scale = density / sourceDensity;
                frames[frame.nativeFrame] = { page: pageIndex,
                    sampleRect: { x: rect[0] * scale, y: rect[1] * scale, width: rect[2] * scale, height: rect[3] * scale } };
            }
            const pages: HdSpriteOverride['pages'] = [];
            gpuBytes = 0;
            for (const [pageIndex, page] of variant.pages.entries()) {
                if (stopped()) fail('cancelled');
                const next = variant.pages[pageIndex + 1];
                if (next) void read.prefetch?.(density, next.id, limit, compactData, losslessTiles)
                    .catch(() => {}); // Normal reads retain validation and PNG fallback.
                let prepared: PreparedHdPage | undefined;
                try {
                    prepared = await read.prepared?.(density, page.id, limit, compactData, losslessTiles);
                    if (prepared) {
                        const expected = serialized ? page.virtualSize : page.size.map((n: number) => derived ? Math.ceil(n / 2) : n);
                        const image = prepared.page.base.image as { width: number; height: number };
                        const actual = prepared.page.tiles?.virtualSize ?? [image.width, image.height];
                        if (!same(actual, expected)) {
                            [prepared.page.base, prepared.page.data, prepared.page.tiles?.map, prepared.page.tiles?.dataMap]
                                .forEach(texture => texture?.dispose());
                            prepared = undefined;
                            fail('prepared-page-size-mismatch');
                        }
                    }
                }
                catch (error) { console.warn('[HD prepared cache fallback]', source.member, page.id, error); }
                if (prepared) {
                    const allocation = [prepared.page.base, prepared.page.data, prepared.page.tiles?.map, prepared.page.tiles?.dataMap].filter(Boolean) as THREE.Texture[];
                    textures.push(...allocation);
                    pages.push(prepared.page);
                    gpuBytes += prepared.gpuBytes;
                    continue;
                }
                if (serialized) {
                    const result = await resolveSerializedHdTilePage(page,
                        variant.frames.filter((f: any) => f.page === page.id), source.frames, read);
                    pages.push(result.page);
                    textures.push(result.page.base, result.page.data, result.page.tiles!.map, result.page.tiles!.dataMap!);
                    gpuBytes += result.gpuBytes;
                    continue;
                }
                let decoded: DecodedHdPage[] = [];
                for (const role of ['base', 'data']) {
                    const value = await read(page[role], page[`${role}Sha256`], page[`${role}Bytes`]);
                    if (!same([value.width, value.height], page.size) || value.rgba.length !== value.width * value.height * 4) fail('decoded-size-mismatch');
                    decoded.push(value);
                }
                const data = decoded[1].rgba;
                const base = decoded[0].rgba;
                const content = new Uint8Array(page.size[0] * page.size[1]);
                for (const frame of variant.frames.filter((f: any) => f.page === page.id)) {
                    if (source.frames[frame.nativeFrame].empty) continue;
                    const [x, y, width, height] = frame.contentRect;
                    for (let row = y; row < y + height; row++) {
                        content.fill(1, row * page.size[0] + x, row * page.size[0] + x + width);
                    }
                }
                for (let i = 0; i < data.length; i += 4) {
                    if (data[i + 1] > 15 || data[i + 2] !== 0 || data[i + 3] !== 255) fail('invalid-remap-data');
                    if (!content[i / 4] && (base[i + 3] || data[i])) fail('nontransparent-padding');
                    if (!base[i + 3] && data[i]) fail('remap-outside-coverage');
                }
                if (derived) decoded = downsampleHdPage(decoded[0], decoded[1]);
                if (decoded.some(value => value.width > limit || value.height > limit)) fail('page-size-limit');
                const pixels = preparer ? await preparer.prepare(decoded[0], decoded[1], limit) : undefined;
                if (stopped()) fail('cancelled');
                const pooled = pixels && createPooledHdPage(pixels);
                if (pooled) {
                    if (environmentSource && !data.some((value, index) => index % 4 < 2 && value !== 0)) {
                        // A pinned non-remappable environment page has one uniform
                        // ownership value. Sampling it from 1x1 preserves every pixel.
                        const saved = (pooled.data.image as { data: Uint8Array }).data.byteLength - 2;
                        pooled.data.image = { data: new Uint8Array(2), width: 1, height: 1 };
                        pooled.data.needsUpdate = true;
                        pooled.gpuBytes -= saved;
                    } else if (environmentSource) {
                        const original = pooled.data.image as { data: Uint8Array; width: number; height: number };
                        const remap = poolSerializedHdRemap(original.data, original.width, original.height, 2);
                        if (remap.gpuBytes < original.data.byteLength) {
                            pooled.data.dispose();
                            pooled.data = remap.data;
                            pooled.tiles.dataMap = remap.map;
                            pooled.gpuBytes += remap.gpuBytes - original.data.byteLength;
                        } else {
                            remap.data.dispose();
                            remap.map.dispose();
                        }
                    }
                    pages.push(pooled);
                    textures.push(pooled.base, pooled.data, pooled.tiles.map);
                    if (pooled.tiles.dataMap) textures.push(pooled.tiles.dataMap);
                    gpuBytes += pooled.gpuBytes;
                    continue;
                }
                gpuBytes += decoded[0].width * decoded[0].height * (compactData ? 6 : 8);
                const uploaded = decoded.map((value, index) => {
                    const useRg = compactData && index === 1;
                    let pixels = value.rgba;
                    if (useRg) {
                        pixels = new Uint8Array(value.width * value.height * 2);
                        for (let i = 0; i < pixels.length; i += 2) {
                            pixels[i] = value.rgba[i * 2];
                            pixels[i + 1] = value.rgba[i * 2 + 1];
                        }
                    }
                    const uniform = environmentSource && index === 1 && !pixels.some(Boolean);
                    if (uniform) gpuBytes -= pixels.byteLength - 2;
                    const texture = new THREE.DataTexture(uniform ? new Uint8Array(2) : pixels,
                        uniform ? 1 : value.width, uniform ? 1 : value.height,
                        useRg ? THREE.RGFormat : THREE.RGBAFormat);
                    textures.push(texture);
                    texture.colorSpace = index === 0 ? THREE.SRGBColorSpace : THREE.NoColorSpace;
                    texture.flipY = true;
                    texture.generateMipmaps = false;
                    texture.minFilter = texture.magFilter = THREE.NearestFilter;
                    texture.needsUpdate = true;
                    return texture;
                });
                pages.push({ base: uploaded[0], data: uploaded[1] });
            }
            if (stopped()) fail('cancelled');
            await upload(textures);
            return { density, gpuBytes, attempts, override: { identity: `${manifestHash}/${source.sha256}/${source.theater}/${losslessTiles ? 'tiles/' : ''}${density}`,
                frames, pages, visualOpacity,
                ...(completionPresentation === 'retained-idle-v1'
                    ? { constructionCompletionFrame: source.frames.length - 1 } : {}) } as HdSpriteOverride };
        } catch (error) {
            textures.forEach(t => t.dispose());
            attempts.push({ density, reason: error instanceof Error ? error.message : 'decode-or-allocation-failure' });
        } finally {
            preparer?.dispose();
        }
    }
    return original();
}

export function disposeHdSprite(override?: HdSpriteOverride) {
    override?.pages.forEach(page => { page.base.dispose(); page.data.dispose(); page.tiles?.map.dispose(); page.tiles?.dataMap?.dispose(); });
}
