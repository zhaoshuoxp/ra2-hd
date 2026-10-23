import React, { useLayoutEffect, useRef } from 'react';
import { uiArt } from '@/gui/hd/UiArt';

const sources = {
    hd: { file: 'yuri-pause-emblem-hd-v2.png', width: 1322, height: 1190,
        sha256: 'cf0fc4171339d18b31211f253ff1b0375b3fe2be55182ba563fcf35267a7a052' },
    compact: { file: 'yuri-pause-emblem.png', width: 728, height: 656,
        sha256: 'cdf28341d5047c941d060714382a5dbd091abbb3ad2e0d99f9afec3c0fbaf6cc' },
    original: { file: 'yuri-pause-emblem-original.png', width: 182, height: 164,
        sha256: 'fd493ae7c7194bcddc8193e4064acfb730e4f866fdadb64e88a9802cf6e617fd' },
};

// The restored HD export keeps the accepted emblem; compact and Original exports remain fallbacks.
export function YuriPauseBackdrop({ active }: { active: boolean }) {
    const ref = useRef<HTMLCanvasElement>(null);
    useLayoutEffect(() => {
        const canvas = ref.current;
        if (!canvas) return;
        let cancel: (() => void) | undefined;
        const update = () => {
            cancel?.(); cancel = undefined;
            uiArt.releaseSurface(canvas);
            canvas.hidden = true; canvas.width = canvas.height = 1;
            if (!active) return;
            const candidates = uiArt.enabled ? [sources.hd, sources.compact, sources.original] : [sources.original];
            const source = candidates.find(s => uiArt.reserveSurface(canvas, s.width * s.height * 4, s.width * s.height * 4, 'dom'));
            if (!source) return;
            const bytes = source.width * source.height * 4;
            // A temporary bitmap is CPU storage; the canvas owns the GPU copy.
            const decodeOwner = {}, abort = new AbortController();
            uiArt.reserveSurface(decodeOwner, 0, bytes, 'dom');
            let live = true;
            cancel = () => { live = false; abort.abort(); uiArt.releaseSurface(decodeOwner); };
            void (async () => {
                let bitmap: ImageBitmap | undefined;
                try {
                    const response = await fetch(`/res/ui/${source.file}`, { signal: abort.signal });
                    if (!response.ok) throw Error('Missing Yuri pause emblem');
                    const encoded = await response.arrayBuffer();
                    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoded)),
                        b => b.toString(16).padStart(2, '0')).join('');
                    if (hash !== source.sha256 || !live) return;
                    bitmap = await createImageBitmap(new Blob([encoded], { type: 'image/png' }));
                    if (!live || bitmap.width !== source.width || bitmap.height !== source.height) return;
                    canvas.width = source.width; canvas.height = source.height;
                    canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
                    canvas.dataset.pauseSource = source.file; canvas.hidden = false;
                } catch { /* Keep the faction color if an optional decorative export is unavailable. */ }
                finally {
                    bitmap?.close(); uiArt.releaseSurface(decodeOwner);
                    if (live && canvas.hidden) uiArt.releaseSurface(canvas);
                }
            })();
        };
        const unsubscribe = uiArt.subscribe(update); update();
        return () => { unsubscribe(); cancel?.(); uiArt.releaseSurface(canvas); };
    }, [active]);
    return <div data-pause-faction="yuri" style={{ position: 'absolute', inset: 0,
        overflow: 'hidden', pointerEvents: 'none', background: '#150b22' }}>
        <canvas ref={ref} hidden aria-hidden="true" data-ui-art="pause-yuri" style={{ position: 'absolute', inset: 0,
            width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.5)' }} />
    </div>;
}
