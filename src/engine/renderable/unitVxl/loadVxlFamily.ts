import * as THREE from 'three';
import { Engine } from '../../Engine';
import { createPooledHdPage } from '../builder/poolHdPage';
import { disposeHdSprite } from '../builder/resolveHdSprite';
import type { HdSpriteOverride } from '../builder/HdSpriteOverride';
import { vxlUnitFamilies, type VxlUnitContract } from './identities';
import { prepareVxlPixels } from './prepareVxlPixels';
import type { VxlPagePreparer } from './VxlPagePreparer';
import { uploadHdTextures } from '../builder/uploadHdTextures';
import { warmVxlShaders } from './VxlUnitRenderer';
import type { DecodedHdPage } from '../builder/resolveHdSprite';
import type { RotorMastSpec } from './RotorMast';

export interface VxlFrame {
    heading: number;
    rect: [number, number, number, number];
    logicalSize: [number, number];
    offset: [number, number];
    referenceLinear: number[];
    referenceOrigin?: [number, number, number];
    rotorAnchor?: [number, number];
    rotorMountOffset?: [number, number, number];
}
export interface VxlPart {
    key: string;
    actor: string;
    member: string;
    section: string;
    pageSize: [number, number];
    frames: VxlFrame[];
    override: HdSpriteOverride;
    depthBounds?: [number, number, number, number];
    rotorMast?: RotorMastSpec;
}
export interface VxlFamily {
    identity: string;
    parts: VxlPart[];
    dispose(): void;
}
const digest = async (bytes: ArrayBuffer) =>
    Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
const check = (condition: unknown, reason: string) => {
    if (!condition) throw Error(reason);
};

export async function loadVxlFamily(
    identity: string,
    budget: number,
    renderer: THREE.WebGLRenderer,
    stopped: () => boolean,
    requestedDensity: 2 | 4 = 4,
    preparer?: VxlPagePreparer,
) {
    const contract = vxlUnitFamilies[identity];
    if (!contract.variants) return loadVxlFamilyVariant(identity, budget, renderer, stopped, requestedDensity, contract, preparer);
    const attempts: { density: number; reason: string }[] = [];
    for (const density of [4, 2] as const) {
        if (density > requestedDensity) continue;
        if (stopped()) break;
        const variant = contract.variants.find(v => v.density === density);
        if (!variant) { attempts.push({ density, reason: 'missing-vxl-density' }); continue; }
        const result = await loadVxlFamilyVariant(identity, budget, renderer, stopped, density, { ...contract, ...variant }, preparer);
        if (result.vxl) return { ...result, attempts: [...attempts, ...result.attempts] };
        attempts.push(...result.attempts);
    }
    return { members: new Map(), density: 1, gpuBytes: 0, attempts };
}

async function loadVxlFamilyVariant(
    identity: string,
    budget: number,
    renderer: THREE.WebGLRenderer,
    stopped: () => boolean,
    requestedDensity: 2 | 4,
    contract: VxlUnitContract,
    preparer?: VxlPagePreparer,
) {
    const sourceDensity = contract.density ?? 4;
    const density = Math.min(sourceDensity, requestedDensity);
    const root = `/local-vxl/${contract.hash}/`;
    const parts: VxlPart[] = [];
    let releaseShaders: (() => void) | undefined;
    const dispose = () => { releaseShaders?.(); parts.forEach(p => disposeHdSprite(p.override)); };
    const read = async (name: string, hash: string, length?: number) => {
        check(!stopped() && /^[\w.-]+$/.test(name), 'cancelled-or-invalid-path');
        const response = await fetch(root + name, { signal: AbortSignal.timeout(15000) });
        check(response.ok, 'missing-vxl-resource');
        const bytes = await response.arrayBuffer();
        check(
            (length === undefined || bytes.byteLength === length) && (await digest(bytes)) === hash,
            'vxl-hash-mismatch',
        );
        return bytes;
    };
    try {
        const bytes = await read('manifest.json', contract.hash);
        const m = JSON.parse(new TextDecoder().decode(bytes));
        check(
            m.schema === 'unit-vxl-family-v1' &&
                m.identity === identity &&
                m.theater === (contract.authoringTheater ?? 'TEMPERATE') &&
                m.density === sourceDensity &&
                Array.isArray(m.parts) &&
                m.parts.length > 0,
            'vxl-contract',
        );
        check(
            JSON.stringify([...new Set(m.parts.map((p: any) => p.member))].sort()) ===
                JSON.stringify([...contract.members].sort()),
            'vxl-member-set',
        );
        for (const [member, hash] of Object.entries(m.sources)) {
            check(/^[a-z0-9]+\.(vxl|hva)$/.test(member), 'vxl-source-path');
            check(
                (await digest(Uint8Array.from(Engine.vfs!.openFile(member).getBytes()).buffer)) ===
                    hash,
                'vxl-source-identity',
            );
        }
        for (const member of contract.members)
            check(
                m.sources[member] && m.sources[member.replace('.vxl', '.hva')],
                'vxl-source-pair',
            );
        // One-page lookahead overlaps checked file reads with worker decode.
        // Catch immediately so cancellation or an unused next page cannot leave
        // an unhandled rejection. At most two page pairs are in flight.
        const readImages = async (part: any) => {
            try {
                const images = await Promise.all(['base', 'data'].map(role => {
                    const entry = part.files[role];
                    return read(entry.file, entry.sha256, entry.bytes);
                }));
                return { images, error: undefined };
            } catch (error) { return { images: undefined, error }; }
        };
        let gpuBytes = 0;
        let nextImages = readImages(m.parts[0]);
        for (const [index, part] of m.parts.entries()) {
            check(!part.rotorMast || (part.frames[0]?.rotorAnchor &&
                Number.isFinite(part.rotorMast.height) && part.rotorMast.height > 1.8 && part.rotorMast.height < 32 &&
                Number.isFinite(part.rotorMast.baseRadius) && part.rotorMast.baseRadius >= 1.1 && part.rotorMast.baseRadius < 8),
                'vxl-rotor-mast');
            check(
                part.frames.every((f: VxlFrame) => !f.rotorMountOffset ||
                    (Array.isArray(f.rotorMountOffset) && f.rotorMountOffset.length === 3 &&
                        f.rotorMountOffset.every(Number.isFinite) && part.frames[0]?.rotorAnchor)),
                'vxl-rotor-mount-registration',
            );
            check(
                !part.depthBounds ||
                    (part.depthBounds.length === 4 &&
                        part.depthBounds.every(Number.isFinite) &&
                        part.depthBounds[2] > part.depthBounds[0] &&
                        part.depthBounds[3] > part.depthBounds[1] &&
                        part.frames.every(
                            (f: VxlFrame) =>
                                f.referenceOrigin?.length === 3 &&
                                f.referenceOrigin.every(Number.isFinite),
                        )),
                'vxl-depth-registration',
            );
            check(
                part.frames.length === 8 &&
                    part.frames.every(
                        (f: VxlFrame, i: number) =>
                            f.heading === i * 45 &&
                            f.referenceLinear.length === 16 &&
                            (!f.rotorAnchor || (f.rotorAnchor.length === 2 &&
                                f.rotorAnchor.every(v => Number.isFinite(v) && v >= 0 && v <= 1))) &&
                            [...f.rect, ...f.offset, ...f.logicalSize, ...f.referenceLinear].every(
                                Number.isFinite,
                            ) &&
                            f.rect[0] >= 0 &&
                            f.rect[1] >= 0 &&
                            f.rect[2] > 0 &&
                            f.rect[3] > 0 &&
                            f.rect[0] + f.rect[2] <= part.pageSize[0] &&
                            f.rect[1] + f.rect[3] <= part.pageSize[1] &&
                            f.logicalSize.every((v) => v > 0 && v < 256),
                    ),
                'vxl-heading-registration',
            );
            const loaded = await nextImages;
            if (!loaded.images) throw loaded.error;
            const images = loaded.images;
            if (index + 1 < m.parts.length) nextImages = readImages(m.parts[index + 1]);
            const scale = density / sourceDensity;
            let pixels;
            if (preparer) pixels = await preparer.prepare(images, part.pageSize, scale, renderer.capabilities.maxTextureSize);
            else {
                const decoded: DecodedHdPage[] = [];
                for (const imageBytes of images) {
                    const bitmap = await createImageBitmap(
                        new Blob([imageBytes], { type: 'image/png' }),
                        { premultiplyAlpha: 'none', colorSpaceConversion: 'none' },
                    );
                    try {
                        check(
                            bitmap.width === part.pageSize[0] &&
                                bitmap.height === part.pageSize[1] &&
                                Math.ceil(bitmap.width * density / sourceDensity) <= renderer.capabilities.maxTextureSize &&
                                Math.ceil(bitmap.height * density / sourceDensity) <= renderer.capabilities.maxTextureSize,
                            'vxl-page-size',
                        );
                        const canvas = document.createElement('canvas');
                        canvas.width = bitmap.width;
                        canvas.height = bitmap.height;
                        const context = canvas.getContext('2d', { willReadFrequently: true })!;
                        context.drawImage(bitmap, 0, 0);
                        decoded.push({
                            width: bitmap.width,
                            height: bitmap.height,
                            rgba: new Uint8Array(
                                context.getImageData(0, 0, bitmap.width, bitmap.height).data,
                            ),
                        });
                    } finally {
                        bitmap.close();
                    }
                }
                pixels = prepareVxlPixels(decoded[0], decoded[1], scale, renderer.capabilities.maxTextureSize);
            }
            check(!stopped(), 'cancelled');
            const frames = part.frames.map((frame: VxlFrame) => ({ ...frame,
                rect: frame.rect.map(n => n * scale) as VxlFrame['rect'] }));
            const pageSize = pixels.virtualSize;
            const pooled = createPooledHdPage(pixels);
            const override: HdSpriteOverride = {
                identity: contract.hash + '/' + part.key,
                frames: frames.map((f: VxlFrame) => ({
                    page: 0,
                    sampleRect: { x: f.rect[0], y: f.rect[1], width: f.rect[2], height: f.rect[3] },
                })),
                pages: [{ base: pooled!.base, data: pooled!.data, tiles: pooled!.tiles }],
            };
            parts.push({ ...part, frames, pageSize, override });
            gpuBytes += pooled!.gpuBytes;
            check(gpuBytes <= budget, 'combined-budget');
        }
        check(!stopped(), 'cancelled');
        await uploadHdTextures(renderer, parts.flatMap(part => part.override.pages.flatMap(page =>
            [page.base, page.data, page.tiles!.map])), stopped);
        check(!stopped() && renderer.getContext().getError() === 0, 'vxl-upload');
        const family: VxlFamily = { identity, parts, dispose };
        releaseShaders = await warmVxlShaders(family, renderer);
        check(!stopped(), 'cancelled');
        return {
            members: new Map(),
            density,
            gpuBytes,
            attempts: [],
            vxl: family,
        };
    } catch (error) {
        dispose();
        return {
            members: new Map(),
            density: 1,
            gpuBytes: 0,
            attempts: [
                { density, reason: error instanceof Error ? error.message : String(error) },
            ],
        };
    }
}
