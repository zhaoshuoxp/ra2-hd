import React, { useLayoutEffect, useRef } from 'react';
import { uiArt } from '@/gui/hd/UiArt';
import family from '@/gui/hd/resultBannerSources.json';
import { ResultBannerLettering } from './ResultBannerLettering';

export function LocalizedGameResultBanner({ victory, text, rasterScale, mission = false }: {
    victory: boolean;
    text: string;
    rasterScale: number;
    mission?: boolean;
}) {
    const ref = useRef<HTMLCanvasElement>(null);
    const outcome = victory ? 'victory' : 'defeat';
    useLayoutEffect(() => {
        const canvas = ref.current!;
        let cancel: (() => void) | undefined;
        const update = () => {
            cancel?.(); cancel = undefined;
            canvas.hidden = true; canvas.width = canvas.height = 1;
            canvas.dataset.resultSource = 'localized-vector-fallback';
            canvas.dataset.resultState = 'original';
            const owner = canvas, decodeOwner = {}, abort = new AbortController();
            // Result art ships with the application, independently of the optional
            // world/UI pack. A busy sidebar can leave room for 2X but not 4X.
            const densities = uiArt.enabled && rasterScale > 2 ? [4, 2] : [2];
            const selected = densities.map(density => family.assets.find(asset => asset.outcome === outcome && asset.density === density)!)
                .find(asset => uiArt.reserveSurface(owner, asset.width * asset.height * 4, asset.width * asset.height * 4, 'result'));
            if (!selected) { canvas.dataset.resultState = 'budget'; return; }
            const bytes = selected.width * selected.height * 4;
            canvas.dataset.resultState = 'pending';
            uiArt.reserveSurface(decodeOwner, 0, bytes, 'result');
            let live = true;
            cancel = () => {
                live = false; abort.abort();
                uiArt.releaseSurface(owner); uiArt.releaseSurface(decodeOwner);
            };
            void (async () => {
                let bitmap: ImageBitmap | undefined;
                try {
                    // Verify every state/density member before publishing any family member.
                    const checked = await Promise.all(family.assets.map(async asset => {
                        const response = await fetch(`/res/ui/${asset.file}`, { signal: abort.signal });
                        if (!response.ok) throw Error('Incomplete result banner family');
                        const encoded = await response.arrayBuffer();
                        const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoded)),
                            byte => byte.toString(16).padStart(2, '0')).join('');
                        if (hash !== asset.sha256) throw Error('Result banner identity mismatch');
                        return { asset, encoded };
                    }));
                    const source = checked.find(item => item.asset === selected)!;
                    if (!live) return;
                    bitmap = await createImageBitmap(new Blob([source.encoded], { type: 'image/png' }));
                    if (!live || bitmap.width !== selected.width || bitmap.height !== selected.height) return;
                    canvas.width = selected.width; canvas.height = selected.height;
                    canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
                    canvas.dataset.resultSource = selected.file;
                    canvas.dataset.resultState = 'ready';
                    canvas.hidden = false;
                } catch { /* The complete family falls back to the localized vector panel. */ }
                finally {
                    bitmap?.close(); uiArt.releaseSurface(decodeOwner);
                    if (live && canvas.hidden) {
                        canvas.dataset.resultState = 'unavailable';
                        uiArt.releaseSurface(owner);
                    }
                }
            })();
        };
        const unsubscribe = uiArt.subscribe(update); update();
        return () => { unsubscribe(); cancel?.(); canvas.width = canvas.height = 1; };
    }, [outcome, rasterScale]);
    return <div data-game-result-banner={outcome} data-result-purpose={mission ? 'campaign-standby' : 'skirmish'}
        role="status" aria-live="polite" aria-label={text}
        style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
        <div style={{ position: 'relative', width: 436, height: 112, maxWidth: '95%',
            borderRadius: 3, overflow: 'hidden', background: victory
                ? 'radial-gradient(ellipse at 38% 65%, #e5a82d, #6e4518 48%, #28231b 85%)'
                : 'linear-gradient(145deg, #78766b, #393a36 55%, #27241f)',
            boxShadow: 'inset 0 0 0 2px #bec2c7, inset 0 0 0 4px #343638' }}>
            <canvas ref={ref} hidden aria-hidden="true" data-ui-art="localized-result-banner"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}/>
            <ResultBannerLettering victory={victory} text={text} mission={mission}/>
        </div>
    </div>;
}
