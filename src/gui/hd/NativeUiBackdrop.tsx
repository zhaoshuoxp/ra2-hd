import React, { useLayoutEffect, useRef } from 'react';
import { Engine } from '@/engine/Engine';
import { ImageUtils } from '@/engine/gfx/ImageUtils';
import { Palette } from '@/data/Palette';
import { ShpFile } from '@/data/ShpFile';
import sources from './nativeUiBackdrops.json';
import { uiArt } from './UiArt';
import { activeEdition } from '@/editions/activeEdition';

type Kind = 'dialog' | 'files';
type Faction = 'allied' | 'soviet' | 'yuri';

// One canvas owns the displayed surface. Temporary decode storage is returned
// immediately, avoiding the duplicate texture retained by the sprite cache.
export function mountNativeUiBackdrop(canvas: HTMLCanvasElement, kind: Kind, faction?: Faction,
    nativeSource?: { image: ShpFile; palette: Palette }, densityLimit = () => 2): (() => void) & { refresh(): void } {
    const source = kind === 'files' && faction ? sources.factions[faction] : sources[kind][activeEdition];
    const width = source.logicalWidth, height = source.logicalHeight;
    let cancel: (() => void) | undefined;
    const update = () => {
        cancel?.();
        uiArt.releaseSurface(canvas);
        canvas.hidden = true; canvas.width = canvas.height = 1;
        const density = [uiArt.enabled ? Math.min(2, densityLimit()) : 1, 1].find(value =>
            uiArt.reserveSurface(canvas, width * height * value ** 2 * 4, width * height * value ** 2 * 4, 'dom'));
        if (!density) return;
        canvas.width = width * density; canvas.height = height * density;
        canvas.dataset.nativeUiBackdrop = kind;
        canvas.dataset.backdropEdition = activeEdition;
        canvas.dataset.backdropTheme = faction ?? activeEdition;
        canvas.dataset.backdropDensity = String(density);
        const context = canvas.getContext('2d')!;
        const draw = (image: CanvasImageSource, name: string) => {
            context.clearRect(0, 0, canvas.width, canvas.height);
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            canvas.dataset.backdropSource = name; canvas.hidden = false;
        };
        try {
            const native = ImageUtils.convertShpToCanvas(nativeSource?.image ?? new ShpFile(Engine.vfs.openFile(source.original)),
                nativeSource?.palette ?? new Palette(Engine.vfs.openFile(source.palette)));
            draw(native, 'original'); native.width = native.height = 1;
        } catch { /* The original CSS backdrop remains available during resource initialization. */ }
        const decodeOwner = {}, abort = new AbortController();
        let live = true;
        cancel = () => { live = false; abort.abort(); uiArt.releaseSurface(decodeOwner); };
        if (!uiArt.enabled) return;
        uiArt.reserveSurface(decodeOwner, 0, source.width * source.height * 4, 'dom');
        void (async () => {
            let bitmap: ImageBitmap | undefined;
            try {
                const response = await fetch(`/res/ui/${source.file}`, { signal: abort.signal });
                if (!response.ok) return;
                const bytes = await response.arrayBuffer();
                const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
                    value => value.toString(16).padStart(2, '0')).join('');
                if (!live || hash !== source.sha256) return;
                bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
                if (!live || bitmap.width !== source.width || bitmap.height !== source.height) return;
                draw(bitmap, 'hd');
            } catch { /* Keep the source-backed native background if the HD export is unavailable. */ }
            finally { bitmap?.close(); uiArt.releaseSurface(decodeOwner); }
        })();
    };
    const unsubscribe = uiArt.subscribe(update);
    update();
    return Object.assign(() => {
        unsubscribe(); cancel?.(); uiArt.releaseSurface(canvas);
        canvas.width = canvas.height = 1;
    }, { refresh: update });
}

export function NativeUiBackdrop({ kind }: { kind: Kind }) {
    const ref = useRef<HTMLCanvasElement>(null);
    useLayoutEffect(() => mountNativeUiBackdrop(ref.current!, kind), [kind]);
    return <canvas ref={ref} aria-hidden="true" hidden data-native-ui-backdrop={kind}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />;
}
