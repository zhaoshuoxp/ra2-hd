import type * as THREE from 'three';
import type { HdSpriteOverride } from './HdSpriteOverride';
import { disposeHdSprite, resolveHdSprite } from './resolveHdSprite';
import type { PowerPlantHdEntry } from './resolvePowerPlantHd';
import { environmentHdContractForTheater, environmentMemberSource } from './environmentHdContract';
import { retainHdTextureSource } from '@/engine/gfx/retainedHdTextureSource';

export class EnvironmentHd {
    readonly overrides = new Map<object, HdSpriteOverride>();
    readonly families = new Map<string, Map<object, HdSpriteOverride>>();
    readonly report = { density: 1, gpuBytes: 0, retainedCpuBytes: 0, worldChargeBytes: 0, loadingPeakBytes: 0,
        restoreWorkingBytes: 0,
        budget: 0, disposed: false, families: {} as Record<string, any> };
    dispose() {
        new Set(this.overrides.values()).forEach(disposeHdSprite);
        this.overrides.clear();
        this.families.clear();
        Object.assign(this.report, { gpuBytes: 0, retainedCpuBytes: 0, worldChargeBytes: 0,
            restoreWorkingBytes: 0, disposed: true });
    }
}

export async function resolveEnvironmentFamily(identity: string, entries: PowerPlantHdEntry[],
    density: 2 | 4, budget: number, maxTextureSize: number,
    upload: (textures: THREE.Texture[]) => void | Promise<void>, stopped = () => false) {
    const overrides = new Map<object, HdSpriteOverride>();
    const attempts: { reason: string; member?: string }[] = [];
    let gpuBytes = 0, retainedCpuBytes = 0, loadingPeakBytes = 0;
    try {
        const selected = environmentHdContractForTheater(entries[0]?.source.theater);
        const declared = selected?.families[identity];
        const names = entries.map(entry => entry.source.member).sort();
        if (!declared || JSON.stringify(names) !== JSON.stringify(declared.members)
            || new Set(entries.map(entry => entry.image)).size !== names.length) throw Error('incomplete-environment-family');
        for (const entry of entries) {
            if (stopped()) throw Error('cancelled');
            const native = environmentMemberSource(selected!, identity, entry.source.member);
            if (!native || native.sha256 !== entry.source.sha256)
                throw Error('environment-family-source-hash');
            const result = await resolveHdSprite(entry.manifest, entry.manifestHash, entry.source,
                density, maxTextureSize, entry.read, () => {}, false, true, stopped);
            if (!result.override) throw Error(`${entry.source.member}:${result.attempts.at(-1)?.reason ?? 'member-failed'}`);
            overrides.set(entry.image, result.override);
            gpuBytes += result.gpuBytes;
            for (const page of result.override.pages) for (const texture of [page.base, page.data,
                page.tiles?.map, page.tiles?.dataMap]) {
                retainedCpuBytes += (texture?.image as { data?: ArrayBufferView } | undefined)?.data?.byteLength ?? 0;
            }
        }
        const textures = [...new Set([...overrides.values()].flatMap(override => override.pages.flatMap(page =>
            [page.base, page.data, page.tiles?.map, page.tiles?.dataMap].filter(Boolean) as THREE.DataTexture[])))];
        let rawBytes = retainedCpuBytes, encodedBytes = 0, decodePeak = 0;
        const reserve = (bytes: number) => {
            loadingPeakBytes = Math.max(loadingPeakBytes, bytes);
            if (bytes > budget) throw Error('environment-world-budget');
        };
        reserve(gpuBytes + rawBytes);
        for (const texture of textures) {
            if (stopped()) throw Error('cancelled');
            const bytes = texture.image.data.byteLength;
            const backing = retainHdTextureSource(texture);
            reserve(gpuBytes + rawBytes - bytes + encodedBytes + backing.encodingWorkingBytes);
            rawBytes -= bytes;
            encodedBytes += backing.retainedCpuBytes;
            decodePeak = Math.max(decodePeak, backing.decodedBytes);
            backing.releaseDecoded();
        }
        retainedCpuBytes = encodedBytes;
        reserve(gpuBytes + retainedCpuBytes + decodePeak);
        if (stopped()) throw Error('cancelled');
        await upload(textures);
        if (stopped()) throw Error('cancelled');
        return { overrides, density, gpuBytes, retainedCpuBytes, loadingPeakBytes, restoreWorkingBytes: decodePeak,
            worldChargeBytes: gpuBytes + retainedCpuBytes, attempts };
    } catch (error) {
        overrides.forEach(disposeHdSprite);
        overrides.clear();
        attempts.push({ reason: error instanceof Error ? error.message : 'environment-family-failed' });
        return { overrides, density: 1, gpuBytes: 0, retainedCpuBytes: 0, worldChargeBytes: 0,
            restoreWorkingBytes: 0, loadingPeakBytes, attempts };
    }
}

// Aggregate views borrow the validated pages; the match remains their owner.
export function aggregateEnvironmentHd(frames: { image: object; nativeFrame: number }[],
    overrides: ReadonlyMap<object, HdSpriteOverride>): HdSpriteOverride | undefined {
    if (!frames.length || frames.some(frame => !overrides.get(frame.image)?.frames[frame.nativeFrame])) return;
    const pages: HdSpriteOverride['pages'] = [];
    const pageOffsets = new Map<HdSpriteOverride, number>();
    const result = frames.map(frame => {
        const override = overrides.get(frame.image)!;
        if (!pageOffsets.has(override)) { pageOffsets.set(override, pages.length); pages.push(...override.pages); }
        const native = override.frames[frame.nativeFrame];
        return { ...native, page: native.page + pageOffsets.get(override)! };
    });
    return { identity: 'environment-aggregate/' + [...pageOffsets.keys()].map(o => o.identity).join('|'),
        frames: result, pages };
}
