import React, { useLayoutEffect, useRef } from 'react';
import { uiArt } from '@/gui/hd/UiArt';
import { loadingFlagWindow } from './loadingFlag';
// Only the empty 430..440 corridor expands. Units, maps, flags and border corners
// retain their original dimensions. The same layout serves Original and HD.
export function LoadingBackdrop({ src, width, hdId, flagSrc }: {
    src?: string; width: number; hdId?: string; flagSrc?: string;
}) {
    const ref = useRef<HTMLCanvasElement>(null);
    useLayoutEffect(() => {
        const canvas = ref.current;
        if (!canvas || !src) return;
        let live = true, nativeReady = false, flagReady = false, generation = 0;
        let asset: { bitmap: ImageBitmap } | undefined, release: (() => void) | undefined;
        const image = new Image();
        const flag = new Image();
        const draw = () => {
            if (!live) return;
            const source = asset?.bitmap ?? (nativeReady ? image : undefined);
            if (!source) return;
            const density = 2;
            canvas.width = Math.ceil(width * density); canvas.height = 600 * density;
            const ctx = canvas.getContext('2d')!;
            ctx.scale(density, density); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
            const extra = width - 800, sx = source.width / 800, sy = source.height / 600;
            ctx.drawImage(source, 0, 0, 430 * sx, 600 * sy, 0, 0, 430, 600);
            ctx.drawImage(source, 430 * sx, 0, 10 * sx, 600 * sy, 430, 0, 10 + extra, 600);
            ctx.drawImage(source, 440 * sx, 0, 360 * sx, 600 * sy, 440 + extra, 0, 360, 600);
            if (flagReady) {
                const rect = loadingFlagWindow;
                const scale = Math.min(rect.width / flag.width, rect.height / flag.height);
                const fw = flag.width * scale, fh = flag.height * scale;
                ctx.drawImage(flag, rect.x + extra + (rect.width - fw) / 2, rect.y + (rect.height - fh) / 2, fw, fh);
            }
            canvas.dataset.loadingFlag = flagReady ? 'ready' : '';
            canvas.dataset.loadingSource = asset ? 'hd' : 'original';
            canvas.dataset.loadingArtId = asset ? hdId! : '';
        };
        const update = () => {
            const current = ++generation;
            release?.(); release = undefined; asset = undefined;
            if (hdId && uiArt.enabled) release = uiArt.acquire(hdId, ready => {
                if (!live || current !== generation) return;
                asset = ready; draw();
            }, true);
            draw();
        };
        image.onload = () => { nativeReady = true; draw(); };
        image.src = src;
        flag.onload = () => { flagReady = true; draw(); };
        if (flagSrc) flag.src = flagSrc;
        const unsubscribe = uiArt.subscribe(update); update();
        return () => {
            live = false; unsubscribe(); release?.(); image.onload = flag.onload = null;
            canvas.width = canvas.height = 1;
        };
    }, [src, width, hdId, flagSrc]);
    return <canvas ref={ref} aria-hidden="true" data-loading-backdrop
        style={{ position: 'absolute', inset: 0, width, height: 600, pointerEvents: 'none' }} />;
}
