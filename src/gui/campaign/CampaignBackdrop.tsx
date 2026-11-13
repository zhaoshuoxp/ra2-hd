import React, { useEffect, useRef } from 'react';
import { uiArt } from '../hd/UiArt';
import { verifiedCampaignFile, type PreparedCampaign } from '../../offline/campaign';
import { readCampaignWorldBackdrop, type CampaignWorldBackdrop } from './CampaignWorldBackdrop';

// One composited surface replaces the old inset background and its outer duplicate.
export const CAMPAIGN_BACKDROP_PIXELS = 1_700_000;
export interface CampaignBackdropArt {
    image: HTMLImageElement;
    revision: string;
    inset?: number;
    world?: CampaignWorldBackdrop;
    dispose(): void;
}
const assets = {
    topography: { file: 'campaign-backdrop-topography-r2a.png', width: 1898, height: 829,
        sha256: '436e6b45cd468949ec00ff6541bb0d31e2e8a72a62c70ab0348796cc7343935b' },
    world: { file: 'campaign-backdrop-world-r2a.png', width: 1915, height: 821,
        sha256: 'cac525710da77cac0c9be65917bf60c195f4934c1ca22f3701d42f857f0059f8' },
    sovietScore: { file: 'campaign-backdrop-soviet-score-original-r4.png', width: 632, height: 568, inset: 12,
        sha256: 'a803b4683d5907ee0e367e0c6be0a883dfc008e158e74cb49bd5ff0efe9cb5f2' },
    alliedScore: { file: 'campaign-backdrop-allied-score-original-v50-r1.png', width: 632, height: 568, inset: 12,
        sha256: 'e03916c15d8bf7b7b9d361a7755d7322136ccbb1185d74bf845b3ccbb0b15d95' },
};

export async function loadCampaignBackdrop(kind: keyof typeof assets): Promise<CampaignBackdropArt | undefined> {
    const asset = assets[kind], owner = {};
    if (!uiArt.reserveSurface(owner, CAMPAIGN_BACKDROP_PIXELS * 4,
        (CAMPAIGN_BACKDROP_PIXELS + asset.width * asset.height + 1600 * 1136) * 4, 'dom')) return;
    let image: HTMLImageElement | undefined;
    try {
        const route = '/res/presentation/' + asset.file, response = await fetch(route);
        if (!response.ok) throw Error('campaign-backdrop-response');
        const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await response.arrayBuffer()))]
            .map(byte => byte.toString(16).padStart(2, '0')).join('');
        if (digest !== asset.sha256) throw Error('campaign-backdrop-identity');
        image = new Image(); image.src = route; await image.decode();
        if (image.naturalWidth !== asset.width || image.naturalHeight !== asset.height) throw Error('campaign-backdrop-size');
        const source = image;
        return { image, revision: asset.file, inset: 'inset' in asset ? asset.inset : undefined,
            dispose: () => { source.src = ''; uiArt.releaseSurface(owner); } };
    } catch (error) {
        if (image) image.src = '';
        uiArt.releaseSurface(owner);
        console.warn('Campaign backdrop retains Original:', error instanceof Error ? error.message : String(error));
    }
}

export async function loadCampaignMissionWorld(manifest: PreparedCampaign,
    declaration: CampaignWorldBackdrop): Promise<CampaignBackdropArt | undefined> {
    const owner = {};
    let reserved = false, image: HTMLImageElement | undefined, url: string | undefined;
    try {
        const world = readCampaignWorldBackdrop(declaration), file = manifest.files.find(file => file.name === world.file);
        if (!file) throw Error('campaign-world-backdrop-file');
        reserved = uiArt.reserveSurface(owner, CAMPAIGN_BACKDROP_PIXELS * 4,
            (CAMPAIGN_BACKDROP_PIXELS + world.width * world.height + 1600 * 1136) * 4, 'dom');
        if (!reserved) return;
        const bytes = await verifiedCampaignFile(file);
        url = URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer], { type: 'image/png' }));
        image = new Image(); image.src = url; await image.decode();
        if (image.naturalWidth !== world.width || image.naturalHeight !== world.height) throw Error('campaign-world-backdrop-size');
        const source = image;
        return { image, revision: world.file, world,
            dispose: () => { source.src = ''; uiArt.releaseSurface(owner); } };
    } catch (error) {
        if (image) image.src = '';
        if (reserved) uiArt.releaseSurface(owner);
        console.warn('Campaign world retains Original:', error instanceof Error ? error.message : String(error));
    } finally { if (url) URL.revokeObjectURL(url); }
}

export function sizeCampaignBackdrop(canvas: HTMLCanvasElement, width: number, height: number): number {
    const density = Math.min(2, Math.sqrt(CAMPAIGN_BACKDROP_PIXELS / (width * height)));
    canvas.width = Math.max(1, Math.floor(width * density)); canvas.height = Math.max(1, Math.floor(height * density));
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    context.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
    return density;
}

export function paintCampaignBackdrop(context: CanvasRenderingContext2D, art: CampaignBackdropArt,
    width: number, height: number): void {
    if (art.world || art.revision === assets.world.file) {
        // Keep one proportional world registered to the original mission plane.
        const map = campaignWorldRegistration(width, height, art.world);
        context.fillStyle = '#000'; context.fillRect(0, 0, width, height);
        // Extend empty ocean/grid into extra viewport space, never a second continent.
        const extendGrid = (positions: number[], origin: number, limit: number) => {
            const lines = positions.map(at => origin + at * map.scale), step = 190 * map.scale;
            const first = lines[0], last = lines[lines.length - 1];
            for (let at = first - step; at > 0; at -= step) lines.push(at);
            for (let at = last + step; at < limit; at += step) lines.push(at);
            return lines.filter(at => at >= 0 && at <= limit);
        };
        // Match the sheet's actual, uneven grid spacing at its four edges.
        if (!art.world) {
            context.strokeStyle = '#450004'; context.lineWidth = 1.6; context.beginPath();
            for (const x of extendGrid([119.5, 305, 467, 648, 804.5, 957, 1110, 1266.5, 1433.5, 1606.5, 1796], map.x, width)) {
                context.moveTo(x, 0); context.lineTo(x, height);
            }
            for (const y of extendGrid([40, 227, 413.5, 604, 732.5], map.y, height)) {
                context.moveTo(0, y); context.lineTo(width, y);
            }
            context.stroke();
        }
        if (art.world) {
            // Centre one complete longitude cycle around the viewport. The atlas's
            // existing eastward continuation fills the date-line edge; split only
            // the remaining arc, never repeat an entire planet or stretch it.
            const start = art.world.width - map.sourceWidth;
            const left = (width - map.width) / 2, raw = (left - map.x) / map.scale;
            const source = start + ((raw - start) % map.sourceWidth + map.sourceWidth) % map.sourceWidth;
            const first = Math.min(map.sourceWidth, art.world.width - source);
            context.drawImage(art.image, source, 0, first, 821,
                left, map.y, first * map.scale, map.height);
            const remaining = map.sourceWidth - first;
            if (remaining > 0) context.drawImage(art.image, start, 0, remaining, 821,
                left + first * map.scale, map.y, remaining * map.scale, map.height);
        } else {
            // Retain the accepted legacy crop, including its original registration.
            context.drawImage(art.image, 0, 0, map.sourceWidth, 821, map.x, map.y, map.width, map.height);
        }
        if (art.world) {
            // The source mission's grid is independent of the world-atlas scale.
            const { gridOrigin, gridStep, gridInk } = art.world;
            const first = (value: number, step: number) => ((value % step) + step) % step;
            context.strokeStyle = gridInk; context.lineWidth = 1.6; context.beginPath();
            for (let x = first((width - 800) / 2 + gridOrigin[0], gridStep[0]); x < width; x += gridStep[0]) {
                context.moveTo(x, 0); context.lineTo(x, height);
            }
            for (let y = first((height - 520) / 2 + gridOrigin[1], gridStep[1]); y < height; y += gridStep[1]) {
                context.moveTo(0, y); context.lineTo(width, y);
            }
            context.stroke();
        }
        return;
    }
    const image = art.image, inset = art.inset ?? 0;
    const sourceWidth = image.naturalWidth - inset * 2, sourceHeight = image.naturalHeight - inset * 2;
    if ([assets.sovietScore.file, assets.alliedScore.file].includes(art.revision)) {
        // Retain the retail insignia's proportions. Only the empty outer rays stretch
        // across wider viewports while generated HD replacement art is unavailable.
        const centerWidth = sourceWidth * height / sourceHeight, left = (width - centerWidth) / 2, edge = 16;
        context.drawImage(image, inset, inset, sourceWidth, sourceHeight, left, 0, centerWidth, height);
        if (left > 0) {
            context.save(); context.translate(left, 0); context.scale(-1, 1);
            context.drawImage(image, inset, inset, edge, sourceHeight, 0, 0, left, height); context.restore();
            context.save(); context.translate(width, 0); context.scale(-1, 1);
            context.drawImage(image, image.naturalWidth - inset - edge, inset, edge, sourceHeight,
                0, 0, left, height); context.restore();
        }
        return;
    }
    const scale = Math.max(width / sourceWidth, height / sourceHeight), w = sourceWidth * scale, h = sourceHeight * scale;
    context.drawImage(image, inset, inset, sourceWidth, sourceHeight, (width - w) / 2, (height - h) / 2, w, h);
}

export function campaignWorldRegistration(width: number, height: number, world?: CampaignWorldBackdrop) {
    // Source Washington (520, 248) registers to the retail locator (264, 160).
    const scale = world?.scale ?? .8, sourceWidth = 1760;
    const [sourceX, sourceY] = world?.sourceLocator ?? [520, 248], [nativeX, nativeY] = world?.nativeLocator ?? [264, 160];
    return { x: (width - 800) / 2 + nativeX - sourceX * scale,
        y: (height - 520) / 2 + nativeY - sourceY * scale, width: sourceWidth * scale, height: 821 * scale,
        scale, sourceWidth,
        locatorX: (width - 800) / 2 + nativeX, locatorY: (height - 520) / 2 + nativeY };
}

// Preserve the accepted center pixels; remove its silver border and soften only the background edges.
function centerLayer(frame: ImageData, logicalWidth: number, logicalHeight: number, foreground: boolean): HTMLCanvasElement {
    const canvas = document.createElement('canvas'); canvas.width = frame.width; canvas.height = frame.height;
    const context = canvas.getContext('2d', { willReadFrequently: true })!;
    context.putImageData(frame, 0, 0);
    if (foreground) return canvas;
    const sx = frame.width / logicalWidth, sy = frame.height / logicalHeight;
    const inset = 8, fadeX = 40, fadeY = 16;
    context.globalCompositeOperation = 'destination-in';
    for (const vertical of [false, true]) {
        const size = vertical ? frame.height : frame.width, factor = vertical ? sy : sx;
        const fade = (vertical ? fadeY : fadeX) * factor, edge = inset * factor;
        const gradient = context.createLinearGradient(0, 0, vertical ? 0 : size, vertical ? size : 0);
        for (const [at, alpha] of [[0, 0], [edge / size, 0], [(edge + fade) / size, 1],
            [1 - (edge + fade) / size, 1], [1 - edge / size, 0], [1, 0]]) {
            gradient.addColorStop(at, `rgba(0,0,0,${alpha})`);
        }
        context.fillStyle = gradient; context.fillRect(0, 0, canvas.width, canvas.height);
    }
    return canvas;
}

export function CampaignBackdrop({ art, frame, logicalWidth, logicalHeight, sourceSprite, foreground = false, style }: {
    art: CampaignBackdropArt; frame?: ImageData; logicalWidth?: number; logicalHeight?: number;
    sourceSprite?: string; foreground?: boolean; style?: React.CSSProperties;
}) {
    const ref = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        const canvas = ref.current!, layer = frame && centerLayer(frame, logicalWidth!, logicalHeight!, foreground);
        const draw = () => {
            const { width, height } = canvas.getBoundingClientRect(), parent = canvas.parentElement!;
            // CSS menu scaling changes the physical bounds, so use the layout dimensions.
            const w = canvas.clientWidth || parent.clientWidth || width, h = canvas.clientHeight || parent.clientHeight || height;
            if (!w || !h) return;
            canvas.dataset.artDensity = String(sizeCampaignBackdrop(canvas, w, h));
            const context = canvas.getContext('2d')!;
            paintCampaignBackdrop(context, art, w, h);
            if (layer) context.drawImage(layer, (w - logicalWidth!) / 2, (h - logicalHeight!) / 2, logicalWidth!, logicalHeight!);
            canvas.dataset.frame = '0';
        };
        const observer = new ResizeObserver(draw); observer.observe(canvas); draw();
        return () => { observer.disconnect(); if (layer) layer.width = layer.height = 0; canvas.width = canvas.height = 0; };
    }, [art, frame, logicalWidth, logicalHeight, foreground]);
    return <canvas ref={ref} data-campaign-backdrop={art.revision} data-campaign-sprite={sourceSprite}
        data-campaign-source-size={frame ? `${frame.width},${frame.height}` : undefined} aria-hidden="true"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', ...style }}/>;
}
