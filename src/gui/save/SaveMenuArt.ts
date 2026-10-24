import { Engine } from '@/engine/Engine';
import { Palette } from '@/data/Palette';
import { ShpFile } from '@/data/ShpFile';
import { ImageUtils } from '@/engine/gfx/ImageUtils';
import { uiArt } from '@/gui/hd/UiArt';

export interface SaveMenuArt {
    faction: 'allied' | 'soviet' | 'yuri';
    background?: { image: ShpFile; palette: Palette };
}

// Keep the shell's colored panel and a thin ring of its original metal texture.
// Normal, hover, pressed and disabled states use the original frame order.
export function mountSaveMenuArt(root: HTMLElement): () => void {
    const frames = [2, 3, 4, 1];
    const crop = { x: 44 / 624, y: 32 / 168, width: 500 / 624, height: 104 / 168 };
    let original: string | undefined, nativeBytes = 0, cancel: (() => void) | undefined;
    const surface = {};
    try {
        const image = new ShpFile(Engine.vfs.openFile('sdbtnanm.shp'));
        const palette = new Palette(Engine.vfs.openFile('sdbtnanm.pal'));
        const canvas = ImageUtils.convertShpToCanvas(image, palette);
        const strip = document.createElement('canvas');
        const width = Math.round(image.width * crop.width), height = Math.round(image.height * crop.height);
        strip.width = width * frames.length; strip.height = height;
        const context = strip.getContext('2d')!, border = Math.max(1, Math.round(image.height / 42));
        frames.forEach((frame, index) => {
            context.drawImage(canvas, 2 * image.width, 0, image.width * 576 / 624, image.height,
                index * width, 0, width, height);
            context.drawImage(canvas, frame * image.width + image.width * crop.x, image.height * crop.y, width, height,
                index * width + border, border, width - border * 2, height - border * 2);
        });
        original = `url("${strip.toDataURL()}")`; nativeBytes = strip.width * strip.height * 4;
        canvas.width = canvas.height = strip.width = strip.height = 1;
    } catch { /* A visible beveled button remains available before side resources are loaded. */ }
    const update = () => {
        cancel?.(); uiArt.releaseSurface(surface);
        if (original) root.style.setProperty('--save-button-sheet', original);
        else root.style.removeProperty('--save-button-sheet');
        root.dataset.buttonArt = 'original';
        root.dataset.buttonFamily = 'menu-button-states';
        const source = uiArt.source('menu-button-states');
        const frameWidth = source ? source.width / 4 : 0, frameHeight = source ? source.height / 5 : 0;
        const width = Math.round(frameWidth * crop.width), height = Math.round(frameHeight * crop.height);
        if (!source || !uiArt.reserveSurface(surface, width * height * frames.length * 4, width * height * frames.length * 4, 'dom')) {
            uiArt.reserveSurface(surface, nativeBytes, nativeBytes, 'dom'); return;
        }
        const abort = new AbortController(), decodeOwner = {};
        let live = true, url: string | undefined;
        cancel = () => { live = false; abort.abort(); if (url) URL.revokeObjectURL(url); uiArt.releaseSurface(decodeOwner); };
        uiArt.reserveSurface(decodeOwner, 0, source.width * source.height * 4, 'dom');
        void (async () => {
            let bitmap: ImageBitmap | undefined, strip: HTMLCanvasElement | undefined;
            try {
                const response = await fetch(source.url, { signal: abort.signal });
                if (!response.ok) return;
                const bytes = await response.arrayBuffer();
                const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
                    byte => byte.toString(16).padStart(2, '0')).join('');
                if (!live || hash !== source.sha256) return;
                bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
                if (!live || bitmap.width !== source.width || bitmap.height !== source.height) return;
                strip = document.createElement('canvas'); strip.width = width * frames.length; strip.height = height;
                const context = strip.getContext('2d')!, border = Math.max(1, Math.round(frameHeight / 42));
                frames.forEach((frame, index) => {
                    context.drawImage(bitmap!, 2 * frameWidth, 0, frameWidth * 576 / 624, frameHeight,
                        index * width, 0, width, height);
                    context.drawImage(bitmap!, frame % 4 * frameWidth + frameWidth * crop.x,
                        Math.floor(frame / 4) * frameHeight + frameHeight * crop.y, width, height,
                        index * width + border, border, width - border * 2, height - border * 2);
                });
                const blob = await new Promise<Blob | null>(resolve => strip!.toBlob(resolve, 'image/png'));
                if (!live || !blob) return;
                url = URL.createObjectURL(blob);
                root.style.setProperty('--save-button-sheet', `url("${url}")`);
                root.dataset.buttonArt = 'hd';
            } catch { /* Keep the original main-menu button if optional HD decoding fails. */ }
            finally { bitmap?.close(); if (strip) strip.width = strip.height = 1; uiArt.releaseSurface(decodeOwner); }
        })();
    };
    const unsubscribe = uiArt.subscribe(update); update();
    return () => { unsubscribe(); cancel?.(); uiArt.releaseSurface(surface); root.style.removeProperty('--save-button-sheet'); };
}
