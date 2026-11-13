import { Engine } from '../../engine/Engine';
import { ShpFile } from '../../data/ShpFile';
import { PcxFile } from '../../data/PcxFile';
import { Palette } from '../../data/Palette';
import { VirtualFile } from '../../data/vfs/VirtualFile';
import { verifiedCampaignFile, type PreparedCampaign } from '../../offline/campaign';
import { loadCampaignInterfaceHd, campaignHdSlider, type CampaignInterfaceHd, type CampaignVectorPath } from './CampaignInterfaceHd';
import { loadCampaignBackdrop, loadCampaignMissionWorld, type CampaignBackdropArt } from './CampaignBackdrop';
import { originalLoadingForeground } from './CampaignLoadingArtwork';

export type CampaignFaction = 'allied' | 'tutorial' | 'soviet';
export interface CampaignSprite {
    image: string;
    width: number;
    height: number;
    frames: ImageData[];
    hdFrame?: ImageData;
    vectors?: CampaignVectorPath[][];
    hdHousing?: string;
}
export interface CampaignPresentation {
    edition: 'ra2' | 'yr';
    mission: string;
    sprites: Record<'background' | CampaignFaction | 'mission' | 'title' | 'progressHousing' | 'progressFill', CampaignSprite>;
    slider: Record<'grip' | 'left' | 'right' | 'middle', string>;
    anchors: Record<CampaignFaction, { x: number; y: number }>;
    animation: { idle: number; activeFrames: number[]; framesPerSecond: number };
    loading: { width: number; height: number; imageY: number; progressY: number; fillX: number; fillY: number;
        loadMessage: string; briefing: string; briefX: number; briefY: number };
    sources: { name: string; archive: string; sha256: string }[];
    hd?: CampaignInterfaceHd;
    backdrop?: CampaignBackdropArt;
    dispose(): void;
}

export async function loadCampaignPresentation(manifest: PreparedCampaign, screen: 'selection' | 'loading' = 'selection',
    originalSources?: PreparedCampaign): Promise<CampaignPresentation> {
    const entry = manifest.files.find(file => file.name === 'presentation.json');
    if (!entry) throw new Error('Original campaign presentation is not prepared. Run bun scripts/m3-1/presentation-resources.ts.');
    const contract = JSON.parse(new TextDecoder().decode(await verifiedCampaignFile(entry)));
    if (contract.schemaVersion !== 1 || contract.edition !== manifest.edition || contract.mission !== manifest.mission
        || contract.sources.length > 32) throw new Error('Invalid campaign presentation contract');
    const files = new Map<string, Uint8Array>();
    await Promise.all(contract.sources.map(async (source: any) => {
        const prepared = originalSources?.files.find(file => file.name === 'catalog-' + source.name
            && file.sha256 === source.sha256 && file.bytes === source.bytes);
        if (originalSources && !prepared) throw new Error(`Prepared catalog source is unavailable: ${source.name}`);
        const bytes = prepared ? await verifiedCampaignFile(prepared) : new Uint8Array(Engine.vfs.openFile(source.name).getBytes());
        const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer))].map(byte => byte.toString(16).padStart(2, '0')).join('');
        if (bytes.length !== source.bytes || digest !== source.sha256) throw new Error(`Original campaign UI identity mismatch: ${source.name}`);
        files.set(source.name, bytes);
    }));
    const open = (name: string) => VirtualFile.fromBytes(files.get(name)!, name);
    let backdrop = screen === 'loading' && manifest.mission !== 'sov01t.map' && !manifest.files.some(file => file.name === 'interface-hd.json') ? undefined
        : await loadCampaignBackdrop(screen === 'selection' ? 'topography' : 'world');
    let hd = screen === 'loading' && manifest.mission !== 'sov01t.map' && !backdrop ? undefined
        : await loadCampaignInterfaceHd(manifest, screen, entry.sha256, !!backdrop);
    if (screen === 'loading' && hd?.world) {
        backdrop?.dispose();
        backdrop = await loadCampaignMissionWorld(manifest, hd.world);
        if (!backdrop) { hd.dispose(); hd = undefined; }
    }
    if (screen === 'loading' && manifest.mission !== 'sov01t.map' && !hd) { backdrop?.dispose(); backdrop = undefined; }
    const sprites: Record<string, CampaignSprite> = {};
    const needed = screen === 'selection' ? ['background', 'allied', 'tutorial', 'soviet'] : ['mission', 'title', 'progressHousing', 'progressFill'];
    for (const [name, spec] of Object.entries(contract.sprites) as [string, any][]) {
        const image = new ShpFile(open(spec.image));
        const palette = new Palette(open(spec.palette));
        if (image.width !== spec.width || image.height !== spec.height || image.numImages !== spec.frames) {
            throw new Error(`Original campaign sprite geometry mismatch: ${spec.image}`);
        }
        const vectors = hd && (hd.arrows[name] ?? hd.chrome[name]);
        const hdFrame = hd && (screen === 'selection' && name === 'background' || screen === 'loading' && name === 'mission') ? hd.frame : undefined;
        sprites[name] = { image: spec.image, width: image.width, height: image.height, vectors, hdFrame,
            hdHousing: name === 'progressHousing' || name === 'progressFill' ? hd?.housing : undefined,
            frames: !needed.includes(name) || vectors || hdFrame ? [] : image.images.map(frame => {
                const rgba = new ImageData(image.width, image.height);
                for (let y = 0; y < frame.height; y++) for (let x = 0; x < frame.width; x++) {
                    const color = palette.getColor(frame.imageData[y * frame.width + x]);
                    const offset = ((y + frame.y) * image.width + x + frame.x) * 4;
                    rgba.data[offset] = color.r; rgba.data[offset + 1] = color.g;
                    rgba.data[offset + 2] = color.b;
                    rgba.data[offset + 3] = name === 'progressFill' && frame.imageData[y * frame.width + x] === 0 ? 0 : 255;
                }
                return rgba;
            }) };
    }
    if (backdrop && screen === 'loading' && !hd) {
        sprites.mission.frames[0] = originalLoadingForeground(sprites.mission.frames[0]);
    }
    const pcx = (name: string) => new PcxFile(open(name)).toDataUrl();
    return { ...contract, sprites, hd, backdrop, dispose: () => { hd?.dispose(); backdrop?.dispose(); }, slider: hd ? campaignHdSlider() : {
        grip: pcx('trakgrip.pcx'), left: pcx('trofl.pcx'), right: pcx('trofr.pcx'), middle: pcx('trofm.pcx') } };
}
