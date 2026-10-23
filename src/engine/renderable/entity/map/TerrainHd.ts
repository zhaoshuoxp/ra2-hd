import * as THREE from 'three';
import { activeEdition } from '@/editions/activeEdition';
import { Engine } from '@/engine/Engine';
import { TmpDrawable } from '@/engine/gfx/drawable/TmpDrawable';
import { theaterName } from '@/engine/theaterName';
import { MAX_TERRAIN_HD_GROUPS, nativeTerrainMetadata, checkTerrainRect, checkTerrainCoverage } from './terrainHdContract';
import type { TmpFile } from '@/data/TmpFile';
import type { TmpImage } from '@/data/TmpImage';
import type { HdDensity } from '@/engine/gfx/HdDensity';
import { retainHdTextureSource } from '@/engine/gfx/retainedHdTextureSource';

export interface TerrainBinding {
    texture: THREE.DataTexture;
    rect: { x: number; y: number; width: number; height: number };
    logical: { width: number; height: number };
    group: string;
    source: { member: string; sha256: string; subTile: number };
}
export class TerrainHd {
    readonly bindings = new Map<TmpImage, TerrainBinding>();
    readonly textures: THREE.DataTexture[] = [];
    readonly report = { density: 1, gpuBytes: 0, retainedCpuBytes: 0, validationPeakBytes: 0,
        encodedSourceBytes: 0, uploadSourcePeakBytes: 0, restoreWorkingBytes: 0,
        worldChargeBytes: 0, budget: 0, groups: [] as any[], placedBindings: [] as any[], disposed: false };
    dispose() {
        this.textures.forEach(texture => texture.dispose());
        this.textures.length = 0;
        this.bindings.clear();
        Object.assign(this.report, { gpuBytes: 0, retainedCpuBytes: 0, worldChargeBytes: 0,
            restoreWorkingBytes: 0, disposed: true });
    }
}
const digest = async (bytes: Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as any)))
    .map(value => value.toString(16).padStart(2, '0')).join('');
const check = (value: unknown, reason: string) => { if (!value) throw Error(reason); };

export async function loadTerrainHd(map: any, theater: any, renderer: any, enabled: boolean,
    density: HdDensity, budget: number, cancelled: () => boolean): Promise<TerrainHd> {
    const result = new TerrainHd();
    result.report.budget = Math.max(0, budget);
    const name = theaterName(theater.type);
    if (!enabled || !name || !Engine.vfs) return result;
    try {
        const selectionRoute = name === 'TEMPERATE' ? '/local-terrain/selection.json'
            : `/local-terrain/${name.toLowerCase()}/selection.json`;
        const response = await fetch(selectionRoute, { signal: AbortSignal.timeout(15000) });
        if (!response.ok) return result;
        const manifest = await response.json();
        check(manifest.schema === 'tmp-terrain-hd-v1' && manifest.theater === name
            && manifest.editions.includes(activeEdition) && manifest.groups.length <= MAX_TERRAIN_HD_GROUPS, 'terrain-contract');
        // Only groups encountered on this map are resident. Resolve every variant and
        // subtile in a group's explicit closure before publishing any of its pieces.
        const encountered = new Set<TmpFile>();
        for (const tile of map.tiles.getAll()) for (const file of theater.tileSets.getTile(tile.tileNum)?.files ?? [])
            encountered.add(file);
        const nativeFiles = new Map<string, TmpFile>();
        for (let i = 0; i < theater.tileSets.readMaxTileNum(); i++)
            for (const file of theater.tileSets.getTile(i)?.files ?? []) nativeFiles.set(file.filename, file);
        const sourceHashes = new Map<TmpFile, string>();
        for (const group of manifest.groups) {
            const temporary: TerrainBinding[] = [];
            let texture: THREE.DataTexture | undefined;
            try {
                if (!group.members.some((member: any) => [...encountered].some(file => file.filename === member.member))) continue;
                check(!cancelled(), 'cancelled');
                const variant = group.variants.find((value: any) => value.density === density);
                check(variant && variant.size.every((n: number) => Number.isSafeInteger(n) && n > 0
                    && n <= renderer.renderer.capabilities.maxTextureSize), 'terrain-density-or-size');
                const bytes = variant.size[0] * variant.size[1] * 4;
                const validationBytes = Math.max(...group.members.flatMap((member: any) => member.images.map((image: any) =>
                    image.logical[0] * image.logical[1])));
                check(Number.isSafeInteger(bytes) && result.report.worldChargeBytes
                    + bytes + validationBytes <= budget,
                    'terrain-world-budget');
                const files: TmpFile[] = [];
                for (const member of group.members) {
                    const file = nativeFiles.get(member.member);
                    check(file?.sourceBytes && file.images.length === member.images.length, 'terrain-incomplete-native-member');
                    if (!sourceHashes.has(file!)) sourceHashes.set(file!, await digest(file!.sourceBytes!));
                    check(member.sourceHashes[activeEdition] === sourceHashes.get(file!), 'terrain-source-hash');
                    file!.images.forEach((_, index) => {
                        check(JSON.stringify(nativeTerrainMetadata(file!, index)) === JSON.stringify(member.images[index]),
                            'terrain-native-metadata');
                        check(!result.bindings.has(file!.images[index]), 'terrain-duplicate-source');
                    });
                    files.push(file!);
                }
                check(variant.rects.length === group.members.reduce((n: number, m: any) => n + m.images.length, 0),
                    'terrain-incomplete-rects');
                const response = await fetch(`/local-terrain/${manifest.revision}/${variant.file}`,
                    { signal: AbortSignal.timeout(15000) });
                check(response.ok, 'terrain-missing-atlas');
                const rgba = new Uint8Array(await response.arrayBuffer());
                check(rgba.byteLength === bytes && await digest(rgba) === variant.sha256, 'terrain-atlas-hash');
                for (let i = 0, frame = 0; i < files.length; i++) for (let index = 0; index < files[i].images.length; index++, frame++) {
                    const native = group.members[i].images[index], rect = variant.rects[frame];
                    checkTerrainRect(rect, native.logical, density, variant.size);
                    const bitmap = new TmpDrawable().draw(files[i].images[index] as any, files[i].blockWidth, files[i].blockHeight);
                    checkTerrainCoverage(rgba, variant.size[0], rect, bitmap.data, native.logical, density,
                        group.contourReconstruction, native);
                    temporary.push({ texture: undefined!, rect: { x: rect[0], y: rect[1], width: rect[2], height: rect[3] },
                        logical: { width: native.logical[0], height: native.logical[1] }, group: group.id,
                        source: { member: files[i].filename, sha256: sourceHashes.get(files[i])!, subTile: index } });
                }
                check(!cancelled(), 'cancelled');
                texture = new THREE.DataTexture(rgba, ...variant.size as [number, number], THREE.RGBAFormat);
                texture.flipY = true;
                texture.colorSpace = THREE.SRGBColorSpace;
                texture.minFilter = texture.magFilter = THREE.LinearFilter;
                texture.generateMipmaps = false;
                const backing = retainHdTextureSource(texture);
                // Include the decoded upload and its retained backing while both
                // coexist; compression never hides temporary source allocation.
                check(result.report.worldChargeBytes + bytes + backing.encodingWorkingBytes + validationBytes <= budget,
                    'terrain-upload-world-budget');
                texture.needsUpdate = true;
                renderer.renderer.initTexture(texture);
                backing.releaseDecoded();
                check(!cancelled(), 'cancelled');
                for (let i = 0, frame = 0; i < files.length; i++) for (const image of files[i].images)
                    result.bindings.set(image, { ...temporary[frame++], texture });
                result.textures.push(texture);
                result.report.density = density;
                result.report.gpuBytes += bytes;
                result.report.retainedCpuBytes += backing.retainedCpuBytes;
                result.report.encodedSourceBytes += backing.encodedBytes;
                result.report.restoreWorkingBytes = Math.max(result.report.restoreWorkingBytes, backing.decodedBytes);
                result.report.uploadSourcePeakBytes = Math.max(result.report.uploadSourcePeakBytes, backing.encodingWorkingBytes);
                result.report.validationPeakBytes = Math.max(result.report.validationPeakBytes, validationBytes);
                result.report.worldChargeBytes += bytes + backing.retainedCpuBytes + validationBytes;
                result.report.groups.push({ id: group.id, status: 'PUBLISHED', density, bytes, sha256: variant.sha256,
                    retainedCpuBytes: backing.retainedCpuBytes, sourceEncoding: backing.encodedBytes ? 'deflate-raw-v1' : 'raw-rgba8',
                    entries: temporary.map(binding => binding.source) });
                texture = undefined;
            } catch (error) {
                texture?.dispose();
                result.report.groups.push({ id: group.id, status: 'ORIGINAL', reason: String(error) });
            }
        }
        if (cancelled()) result.dispose();
    } catch (error) { result.report.groups.push({ status: 'ORIGINAL', reason: String(error) }); }
    return result;
}
