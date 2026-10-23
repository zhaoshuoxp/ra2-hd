import { requestedHdDensity } from './hdOrigin';
import { Engine } from '@/engine/Engine';
import { disposeHdSprite, resolveHdSprite } from './resolveHdSprite';
import { withPreparedHdPages } from './preparedHdPage';
import type { HdSpriteOverride } from './HdSpriteOverride';

export interface LoadedConscriptHd {
    image: any;
    override?: HdSpriteOverride;
    report: { density: number; gpuBytes: number; attempts: { density: number; reason: string }[]; manifestHash?: string };
}
const digest = async (bytes: ArrayBuffer) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
const check = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };

// Resolve the optional local selection before any match renderables exist.
export async function loadConscriptHd(theater: any, renderer: any, enabled = false, preferredDensity: 2 | 4 = 4): Promise<LoadedConscriptHd | undefined> {
    const density = requestedHdDensity(enabled, 'conscript-hd', location.href, preferredDensity);
    if (!density) return;
    try {
        const selectionResponse = await fetch('/local-hd/selection.json', { signal: AbortSignal.timeout(15000) });
        check(selectionResponse.ok, 'missing-local-selection');
        const binding = await selectionResponse.json();
        check(/^[a-f0-9]{64}$/.test(binding.sha256), 'invalid-manifest-hash');
        const prefix = `/local-hd/${binding.sha256}/`;
        const response = await fetch(`${prefix}manifest.json`, { signal: AbortSignal.timeout(15000) });
        check(response.ok, 'missing-manifest');
        const bytes = await response.arrayBuffer();
        check(await digest(bytes) === binding.sha256, 'manifest-hash-mismatch');
        const manifest = JSON.parse(new TextDecoder().decode(bytes));
        const image = Engine.getImages().get('cons.shp');
        check(image && image.numImages === 602 && Engine.vfs, 'missing-original-conscript');
        const sourceBytes = Engine.vfs!.openFile('cons.shp').getBytes();
        const sha256 = await digest(Uint8Array.from(sourceBytes).buffer);
        const frames = Array.from({ length: 301 }, (_, nativeFrame) => {
            const f = image.getImage(nativeFrame);
            return { nativeFrame, trimOrigin: [f.x, f.y], trimSize: [f.width, f.height],
                legacyRenderSize: [f.width + f.width % 2, f.height + f.height % 2], empty: !f.imageData.some(Boolean) };
        });
        // The same complete cons.shp is shared across editions and theaters.
        const source = { member: 'cons.shp', sha256, theater: manifest.source?.theater,
            canvas: [image.width, image.height], frames };
        const glRenderer = renderer.renderer;
        const selected = await resolveHdSprite(manifest, binding.sha256, source, density,
            glRenderer.capabilities.maxTextureSize, withPreparedHdPages(async (filename, expectedHash, expectedBytes) => {
                const route = binding.files?.[filename];
                check(typeof route === 'string' && new RegExp(`^${prefix}[24]/[a-zA-Z0-9_-]+/(base|data)\\.png$`).test(route), 'undeclared-page');
                const response = await fetch(route, { signal: AbortSignal.timeout(15000) });
                check(response.ok, 'missing-page');
                const bytes = await response.arrayBuffer();
                check(bytes.byteLength === expectedBytes && await digest(bytes) === expectedHash, 'page-hash-or-size-mismatch');
                const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }),
                    { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = bitmap.width; canvas.height = bitmap.height;
                    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
                    ctx.drawImage(bitmap, 0, 0);
                    return { width: canvas.width, height: canvas.height,
                        rgba: new Uint8Array(ctx.getImageData(0, 0, canvas.width, canvas.height).data) };
                } finally { bitmap.close(); }
            }, binding.prepared), textures => {
                textures.forEach(texture => glRenderer.initTexture(texture));
                check(glRenderer.getContext().getError() === 0, 'texture-upload-failure');
            });
        const report = { density: selected.density, gpuBytes: selected.gpuBytes,
            attempts: selected.attempts, manifestHash: binding.sha256 };
        console.info('[Conscript HD selection]', report);
        return { image, override: selected.override, report };
    } catch (error) {
        const report = { density: 1, gpuBytes: 0, attempts: [{ density, reason: error instanceof Error ? error.message : 'load-failure' }] };
        console.info('[Conscript HD selection]', report);
        return { image: undefined, report };
    }
}

export function disposeConscriptHd(loaded?: LoadedConscriptHd) {
    disposeHdSprite(loaded?.override);
}
