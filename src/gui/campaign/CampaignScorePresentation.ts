import { Engine } from '../../engine/Engine';
import { ShpFile } from '../../data/ShpFile';
import { Palette } from '../../data/Palette';
import { VirtualFile } from '../../data/vfs/VirtualFile';
import { loadPreparedCampaign, verifiedCampaignFile } from '../../offline/campaign';
import { loadCampaignBackdrop, type CampaignBackdropArt } from './CampaignBackdrop';
import { scoreForegroundAlpha } from './CampaignScoreMatte';

export interface CampaignScorePresentation {
    sprites: Record<'background' | 'panel' | 'emblem', ShpFile>;
    palette: Palette;
    width: number;
    height: number;
    panel: { x: number; y: number; openingFrames: number[] };
    emblem: { x: number; y: number };
    framesPerSecond: number;
    backdrop?: CampaignBackdropArt;
    dispose(): void;
}

export async function loadCampaignScorePresentation(mission = 'sov01t.map', edition?: 'ra2' | 'yr'): Promise<CampaignScorePresentation> {
    const { manifest } = await loadPreparedCampaign(mission, edition);
    const entry = manifest.files.find(file => file.name === 'score-presentation.json');
    if (!entry) throw new Error('Campaign score is not prepared. Run bun scripts/m3-1/score-resources.ts.');
    const contract = JSON.parse(new TextDecoder().decode(await verifiedCampaignFile(entry)));
    if (contract.schemaVersion !== 1 || contract.edition !== manifest.edition || contract.mission !== manifest.mission
        || contract.sources.length !== 4 || contract.width !== 632 || contract.height !== 568
        || contract.framesPerSecond !== 15) throw new Error('Invalid original campaign score contract');
    const files = new Map<string, Uint8Array>();
    for (const source of contract.sources) {
        const bytes = new Uint8Array(Engine.vfs.openFile(source.name).getBytes());
        const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
            .map(byte => byte.toString(16).padStart(2, '0')).join('');
        if (bytes.length !== source.bytes || hash !== source.sha256) throw new Error(`Campaign score source mismatch: ${source.name}`);
        files.set(source.name, bytes);
    }
    const open = (name: string) => VirtualFile.fromBytes(files.get(name)!, name);
    const soviet = manifest.mission.startsWith('sov');
    if (contract.palette !== (soviet ? 'sscore.pal' : 'ascore.pal')) throw new Error('Campaign score side mismatch');
    const expected: Record<string, number[]> = { background: [632, 568, 1], panel: [472, 448, 6], emblem: [424, soviet ? 230 : 220, 44] };
    const sprites = Object.fromEntries(Object.entries(contract.sprites).map(([key, spec]: [string, any]) => {
        const sprite = new ShpFile(open(spec.image));
        if (JSON.stringify([sprite.width, sprite.height, sprite.numImages]) !== JSON.stringify(expected[key])) {
            throw new Error(`Campaign score geometry mismatch: ${spec.image}`);
        }
        return [key, sprite];
    })) as CampaignScorePresentation['sprites'];
    const backdrop = await loadCampaignBackdrop(soviet ? 'sovietScore' : 'alliedScore');
    return { ...contract, sprites, palette: new Palette(open(contract.palette)), backdrop, dispose: () => backdrop?.dispose() };
}

// Decode only the displayed frame; 44 pre-decoded RGBA frames alone exceed 16 MiB.
export function drawScoreSprite(context: CanvasRenderingContext2D, scratch: HTMLCanvasElement, sprite: ShpFile, palette: Palette,
    frame: number, left: number, top: number, foreground?: { panel: ShpFile; kind: 'panel' | 'emblem' }): void {
    const source = sprite.getImage(frame), rgba = new ImageData(source.width, source.height);
    const alpha = foreground && scoreForegroundAlpha(source, foreground.panel.getImage(5), palette, foreground.kind, frame);
    for (let pixel = 0; pixel < source.imageData.length; pixel++) {
        const index = source.imageData[pixel], color = palette.getColor(index), offset = pixel * 4;
        rgba.data[offset] = color.r; rgba.data[offset + 1] = color.g;
        rgba.data[offset + 2] = color.b; rgba.data[offset + 3] = alpha ? alpha[pixel] : index ? 255 : 0;
    }
    scratch.width = source.width; scratch.height = source.height;
    scratch.getContext('2d')!.putImageData(rgba, 0, 0);
    context.drawImage(scratch, left + source.x, top + source.y);
}
