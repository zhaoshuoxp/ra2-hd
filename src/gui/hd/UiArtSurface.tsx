import React, { useLayoutEffect, useRef } from 'react';
import { uiArt } from './UiArt';
// Decorative bitmap only. Text, controls and progress remain separate live layers.
export function UiArtSurface({ id, style }: { id: string; style?: React.CSSProperties }) {
    const ref = useRef<HTMLCanvasElement>(null);
    useLayoutEffect(() => {
        let release: (() => void) | undefined;
        const update = () => {
            release?.(); release = undefined;
            const canvas = ref.current;
            if (!canvas) return;
            canvas.hidden = true; canvas.width = canvas.height = 1;
            if (!uiArt.enabled) return;
            release = uiArt.acquire(id, asset => {
                if (!asset || !ref.current) return;
                canvas.width = asset.bitmap.width; canvas.height = asset.bitmap.height;
                canvas.getContext('2d')!.drawImage(asset.bitmap, 0, 0);
                canvas.hidden = false;
            }, true);
        };
        const unsubscribe = uiArt.subscribe(update); update();
        return () => { unsubscribe(); release?.(); };
    }, [id]);
    return <canvas ref={ref} hidden aria-hidden="true" data-ui-art={id} style={{ position: 'absolute', inset: 0,
        width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none', ...style }} />;
}
