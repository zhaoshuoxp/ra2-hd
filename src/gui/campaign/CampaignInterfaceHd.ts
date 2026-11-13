import { verifiedCampaignFile, type PreparedCampaign } from '../../offline/campaign';
import { uiArt } from '../hd/UiArt';
import { campaignLoadingForeground } from './CampaignLoadingArtwork';
import { readCampaignWorldBackdrop, type CampaignWorldBackdrop } from './CampaignWorldBackdrop';
import { campaignBriefingFlow, type CampaignBriefingFlow } from './CampaignBriefingLayout';

export interface CampaignVectorPath { fill: string; d: string }
export interface CampaignInterfaceHd {
    frame: ImageData;
    density: 2;
    revision: string;
    arrows: Record<string, CampaignVectorPath[][]>;
    chrome: Record<string, CampaignVectorPath[][]>;
    housing?: string;
    world?: CampaignWorldBackdrop;
    reservedGpuBytes: number;
    briefingFlow?: CampaignBriefingFlow;
    dispose(): void;
}

export async function loadCampaignInterfaceHd(manifest: PreparedCampaign, screen: 'selection' | 'loading',
    sourceHash: string, composited = false): Promise<CampaignInterfaceHd | undefined> {
    if (!uiArt.enabled) return;
    const owner = {}, entry = manifest.files.find(file => file.name === 'interface-hd.json');
    if (!entry) return;
    let reserved = false, url: string | undefined;
    try {
        const spec = JSON.parse(new TextDecoder().decode(await verifiedCampaignFile(entry)));
        if (spec.schema !== 'campaign-interface-hd-v1' || spec.edition !== manifest.edition || spec.mission !== manifest.mission
            || spec.density !== 2 || spec.originalPresentationSha256 !== sourceHash) throw Error('campaign-interface-contract');
        if (screen === 'selection' && spec.loadingOnly === true) return;
        for (const [name, count] of [['allied', 8], ['tutorial', 8], ['soviet', 8],
            ['title', 1], ['progressHousing', 1], ['progressFill', 1]] as const) {
            const frames = spec.arrows[name] ?? spec.chrome[name];
            if (!Array.isArray(frames) || frames.length !== count) throw Error('campaign-interface-frame-closure');
            for (const frame of frames) for (const path of frame) {
                if (!/^#[0-9a-f]{6}$/.test(path.fill) || typeof path.d !== 'string' || path.d.length > 300000
                    || !/^[MLQZ0-9 .,-]+$/.test(path.d)) throw Error('campaign-interface-vector');
            }
        }
        const asset = spec[screen], logical = screen === 'selection' ? [632, 568] : [800, 520];
        if (JSON.stringify(asset.logical) !== JSON.stringify(logical) || asset.width !== logical[0]*2
            || asset.height !== logical[1]*2) throw Error('campaign-interface-geometry');
        const world = screen === 'loading' && asset.world !== undefined ? readCampaignWorldBackdrop(asset.world) : undefined;
        if (world && !manifest.files.some(file => file.name === world.file)) throw Error('campaign-world-backdrop-file');
        const bytes = asset.width * asset.height * 4, housingBytes = screen === 'loading' ? 1774 * 887 * 4 : 0;
        const gpuBytes = (composited ? 0 : bytes) + housingBytes + 256 * 1024;
        reserved = uiArt.reserveSurface(owner, gpuBytes, bytes * 2 + housingBytes, 'dom');
        if (!reserved) return;
        let housing: string | undefined;
        if (screen === 'loading') {
            housing = '/res/presentation/campaign-loading-housing-r2.png';
            const response = await fetch(housing);
            if (!response.ok) throw Error('campaign-loading-metal-response');
            const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await response.arrayBuffer()))]
                .map(value => value.toString(16).padStart(2, '0')).join('');
            if (digest !== '2ee36a24f2aed4adbd60c9489d6404b420041ce433d14c798967f7865119e9ee') throw Error('campaign-loading-metal-identity');
            const metal = new Image(); metal.src = housing; await metal.decode();
            if (metal.naturalWidth !== 1774 || metal.naturalHeight !== 887) throw Error('campaign-loading-metal-size');
        }
        const file = manifest.files.find(file => file.name === asset.file);
        if (!file || !/^interface-[a-z0-9-]+\.(png|svg)$/.test(file.name)) throw Error('campaign-interface-file');
        const source = await verifiedCampaignFile(file);
        let renderedSource = source;
        if (file.name.endsWith('.svg')) {
            const svg = new TextDecoder().decode(source);
            if (/<script|foreignObject|<use\b|onload\s*=|https?:|file:|javascript:/i.test(svg.replace('http://www.w3.org/2000/svg', ''))) {
                throw Error('campaign-interface-svg-content');
            }
            if (composited && screen === 'loading' && !asset.foreground) renderedSource = new TextEncoder().encode(campaignLoadingForeground(svg));
        }
        url = URL.createObjectURL(new Blob([new Uint8Array(renderedSource).buffer], {
            type: file.name.endsWith('.svg') ? 'image/svg+xml' : 'image/png' }));
        const image = new Image(); image.src = url; await image.decode();
        if (image.naturalWidth !== asset.width || image.naturalHeight !== asset.height) throw Error('campaign-interface-size');
        const canvas = document.createElement('canvas'); canvas.width = asset.width; canvas.height = asset.height;
        const context = canvas.getContext('2d', { willReadFrequently: true })!;
        context.drawImage(image, 0, 0);
        const frame = context.getImageData(0, 0, canvas.width, canvas.height);
        canvas.width = canvas.height = 0;
        return { frame, density: 2, revision: spec.revision, arrows: spec.arrows, chrome: spec.chrome, housing, world,
            reservedGpuBytes: gpuBytes, briefingFlow: screen === 'loading' && manifest.edition === 'yr'
                ? campaignBriefingFlow(asset.layout?.projection) : undefined,
            dispose: () => uiArt.releaseSurface(owner) };
    } catch (error) {
        console.warn('Campaign interface retains Original:', error instanceof Error ? error.message : String(error));
        if (reserved) uiArt.releaseSurface(owner);
    } finally { if (url) URL.revokeObjectURL(url); }
}

export function campaignHdSlider(): Record<'grip' | 'left' | 'right' | 'middle', string> {
    const svg = (width: number, content: string) => 'data:image/svg+xml,' + encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="24" viewBox="0 0 ${width} 24">`
        + '<defs><linearGradient id="r"><stop stop-color="#200000"/><stop offset=".5" stop-color="#f00"/><stop offset="1" stop-color="#200000"/></linearGradient></defs>' + content + '</svg>');
    const track = (edge = '') => svg(8, `<rect width="8" height="24" fill="#160000"/><path d="M0 .5H8M0 23.5H8${edge}" stroke="#e00000"/>`);
    return { grip: svg(14, '<rect x=".5" y=".5" width="13" height="23" fill="url(#r)" stroke="#ff2626"/><path d="M4 2v20M10 2v20" stroke="#690000"/>'),
        left: track('M.5 0V24'), right: track('M7.5 0V24'), middle: track() };
}
