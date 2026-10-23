import { activeEdition } from '@/editions/activeEdition';
import { Engine } from '@/engine/Engine';
import { EnvironmentHd, resolveEnvironmentFamily } from './EnvironmentHd';
import { environmentHdContractForTheater, environmentFamilyScopeIssue,
    environmentMemberSource, type EnvironmentSourceContext } from './environmentHdContract';
import type { PowerPlantHdEntry } from './resolvePowerPlantHd';
import { uploadHdTextures } from './uploadHdTextures';

const check = (value: unknown, message: string) => { if (!value) throw Error(message); };
const digest = async (bytes: ArrayBuffer) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
    .map(value => value.toString(16).padStart(2, '0')).join('');

export async function loadEnvironmentHd(theater: any, renderer: any, enabled: boolean,
    density: 2 | 4, budget: number, identities: ReadonlySet<string>, stopped = () => false,
    sourceContext: EnvironmentSourceContext = {}) {
    const result = new EnvironmentHd();
    result.report.budget = Math.max(0, budget);
    const environmentHdContract = environmentHdContractForTheater(theater.type);
    if (!enabled || !environmentHdContract) return result;
    const name = environmentHdContract.theater;
    try {
        const selectionRoute = name === 'TEMPERATE' ? '/local-environment/selection.json'
            : `/local-environment/${name.toLowerCase()}/selection.json`;
        const response = await fetch(selectionRoute, { signal: AbortSignal.timeout(15000) });
        if (!response.ok) return result;
        const selection = await response.json();
        check(selection.schema === 'environment-shp-pack-v1' && selection.theater === name
            && selection.editions.includes(activeEdition), 'environment-selection-contract');
        const wanted = new Set([...identities].flatMap(identity => {
            const family = environmentHdContract.identities[activeEdition]?.[identity];
            return family ? [family] : [];
        }));
        const paletteHashes = new Map<string, string>();
        for (const identity of wanted) {
            if (stopped()) break;
            const declared = environmentHdContract.families[identity];
            if (!selection.families[identity]) {
                result.report.families[identity] = { density: 1, gpuBytes: 0, worldChargeBytes: 0,
                    status: 'ORIGINAL', reason: 'not-selected' };
                continue;
            }
            try {
                const scopeIssue = environmentFamilyScopeIssue(declared, sourceContext);
                check(!scopeIssue, scopeIssue ?? 'environment-source-scope');
                const binding = selection.families[identity];
                check(binding?.familyHash === declared.familyHash
                    && binding.members.length === declared.members.length, 'environment-family-identity');
                const entries: PowerPlantHdEntry[] = [];
                const aliases: { image: object; canonical: object }[] = [];
                for (const name of declared.members) {
                    check(!stopped(), 'cancelled');
                    const native = environmentMemberSource(environmentHdContract, identity, name);
                    if (!native) throw Error('environment-native-source-descriptor');
                    const matches = binding.members.filter((member: any) => member.member === name);
                    check(matches.length === 1 && /^[a-f0-9]{64}$/.test(matches[0].sha256), 'environment-member-identity');
                    const member = matches[0];
                    const image = Engine.getImages().get(name);
                    check(image && image.numImages === native.totalFrames && Engine.vfs, 'environment-native-member');
                    const sourceHash = await digest(Uint8Array.from(Engine.vfs!.openFile(name).getBytes()).buffer);
                    check(sourceHash === native.sha256, 'environment-source-hash');
                    for (const [alias, canonical] of Object.entries(environmentHdContract.aliases ?? {})) {
                        if (canonical !== name) continue;
                        const aliased = Engine.getImages().get(alias);
                        if (!aliased && !identities.has(alias.split('.')[0].toUpperCase())) continue;
                        check(aliased && aliased.numImages === native.totalFrames && aliased.width === image.width
                            && aliased.height === image.height, 'environment-native-alias');
                        check(await digest(Uint8Array.from(Engine.vfs!.openFile(alias).getBytes()).buffer) === sourceHash,
                            'environment-alias-source-hash');
                        aliases.push({ image: aliased, canonical: image });
                    }
                    for (const palette of [native.palette, ...Object.values(native.framePalettes ?? {})]) {
                        if (!paletteHashes.has(palette.member)) paletteHashes.set(palette.member,
                            await digest(Uint8Array.from(Engine.vfs!.openFile(palette.member).getBytes()).buffer));
                        check(paletteHashes.get(palette.member) === palette.sha256, 'environment-palette-hash');
                    }
                    const response = await fetch(member.manifest, { signal: AbortSignal.timeout(15000) });
                    check(response.ok, 'environment-missing-manifest');
                    const bytes = await response.arrayBuffer();
                    check(bytes.byteLength <= 2 * 1024 * 1024 && await digest(bytes) === member.sha256,
                        'environment-manifest-hash');
                    const manifest = JSON.parse(new TextDecoder().decode(bytes));
                    const source = { member: name, sha256: sourceHash, theater: environmentHdContract.theater,
                        canvas: [image.width, image.height], frames: Array.from({ length: native.bodyFrames }, (_, nativeFrame) => {
                            const frame = image.getImage(nativeFrame);
                            return { nativeFrame, trimOrigin: [frame.x, frame.y], trimSize: [frame.width, frame.height],
                                legacyRenderSize: [frame.width + frame.width % 2, frame.height + frame.height % 2],
                                empty: !frame.imageData.some(Boolean) };
                        }) };
                    entries.push({ image, manifest, manifestHash: member.sha256, source,
                        read: async (filename, hash, length) => {
                            const route = member.files[filename];
                            check(typeof route === 'string' && /^\/local-environment\/[a-f0-9]{64}\/[a-f0-9]{64}\/[24]\/[a-zA-Z0-9_-]+\/(base|data)\.png$/.test(route),
                                'environment-undeclared-page');
                            const response = await fetch(route, { signal: AbortSignal.timeout(15000) });
                            check(response.ok, 'environment-missing-page');
                            const bytes = await response.arrayBuffer();
                            check(bytes.byteLength === length && await digest(bytes) === hash, 'environment-page-hash');
                            const header = new DataView(bytes);
                            check(bytes.byteLength >= 24 && header.getUint32(0) === 0x89504e47
                                && header.getUint32(12) === 0x49484452 && header.getUint32(16) <= 2048
                                && header.getUint32(20) <= 2048, 'environment-png-size');
                            const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }),
                                { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
                            try {
                                const canvas = document.createElement('canvas');
                                canvas.width = bitmap.width; canvas.height = bitmap.height;
                                const context = canvas.getContext('2d', { willReadFrequently: true })!;
                                context.drawImage(bitmap, 0, 0);
                                return { width: canvas.width, height: canvas.height,
                                    rgba: new Uint8Array(context.getImageData(0, 0, canvas.width, canvas.height).data) };
                            } finally { bitmap.close(); }
                        } });
                }
                const loaded = await resolveEnvironmentFamily(identity, entries, density,
                    budget - result.report.worldChargeBytes, renderer.renderer.capabilities.maxTextureSize,
                    async textures => {
                        await uploadHdTextures(renderer.renderer, textures, stopped);
                        check(renderer.renderer.getContext().getError() === 0, 'environment-upload-failed');
                    }, stopped);
                result.report.families[identity] = { density: loaded.density,
                    worldChargeBytes: loaded.worldChargeBytes, gpuBytes: loaded.gpuBytes,
                    loadingPeakBytes: loaded.loadingPeakBytes,
                    restoreWorkingBytes: loaded.restoreWorkingBytes,
                    retainedCpuBytes: loaded.retainedCpuBytes, attempts: loaded.attempts,
                    members: entries.map(entry => entry.source.member),
                    status: loaded.overrides.size ? 'PUBLISHED_COMPLETE_FAMILY' : 'ORIGINAL' };
                if (loaded.overrides.size) {
                    result.families.set(identity, loaded.overrides);
                    loaded.overrides.forEach((override, image) => result.overrides.set(image, override));
                    for (const alias of aliases) result.overrides.set(alias.image, loaded.overrides.get(alias.canonical)!);
                    result.report.density = density;
                    result.report.loadingPeakBytes = Math.max(result.report.loadingPeakBytes,
                        result.report.worldChargeBytes + loaded.loadingPeakBytes);
                    result.report.gpuBytes += loaded.gpuBytes;
                    result.report.retainedCpuBytes += loaded.retainedCpuBytes;
                    result.report.worldChargeBytes += loaded.worldChargeBytes;
                    result.report.restoreWorkingBytes = Math.max(result.report.restoreWorkingBytes, loaded.restoreWorkingBytes);
                }
            } catch (error) {
                result.report.families[identity] = { density: 1, gpuBytes: 0, worldChargeBytes: 0,
                    status: 'ORIGINAL', reason: String(error) };
            }
        }
    } catch (error) {
        console.info('[Environment HD Original]', String(error));
    }
    if (stopped()) result.dispose();
    console.info('[Environment HD selection]', result.report);
    return result;
}
