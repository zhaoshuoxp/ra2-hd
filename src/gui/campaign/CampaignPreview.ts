import { Engine } from '../../engine/Engine';
import { ShpFile } from '../../data/ShpFile';
import { Palette } from '../../data/Palette';
import { verifiedCampaignFile, type PreparedCampaign } from '../../offline/campaign';
import { IniFile } from '../../data/IniFile';
import type { CampaignEdition } from '../../data/campaign/CampaignDefinition';

export function campaignCatalogPreview(mission: string, edition: CampaignEdition): string | undefined {
    const metadata = new IniFile(Engine.vfs.openFile(edition === 'yr' ? 'missionmd.ini' : 'mission.ini').readAsString()).getSection(mission);
    const image = metadata?.getString('LS800BkgdName').toLowerCase();
    if (!image || !/^[a-z0-9]+\.shp$/.test(image)) return;
    return decodePreview(image, 'ldscrns.pal');
}

function decodePreview(image: string, colors: string): string {
    const shp = new ShpFile(Engine.vfs.openFile(image)), frame = shp.getImage(0), palette = new Palette(Engine.vfs.openFile(colors));
    if (shp.width > 1024 || shp.height > 768) throw new Error('Mission preview exceeds its surface limit');
    const canvas = document.createElement('canvas'); canvas.width = shp.width; canvas.height = shp.height;
    const rgba = new ImageData(frame.width, frame.height);
    frame.imageData.forEach((index, pixel) => {
        const color = palette.getColor(index); rgba.data.set([color.r, color.g, color.b, index ? 255 : 0], pixel * 4);
    });
    canvas.getContext('2d')!.putImageData(rgba, frame.x, frame.y);
    const result = canvas.toDataURL('image/png'); canvas.width = canvas.height = 0; return result;
}

export async function campaignPreview(manifest: PreparedCampaign): Promise<string> {
    const entry = manifest.files.find(file => file.name === 'presentation.json');
    if (!entry) throw new Error('Mission preview is unavailable');
    const contract = JSON.parse(new TextDecoder().decode(await verifiedCampaignFile(entry)));
    if (contract.mission !== manifest.mission) throw new Error('Mission preview identity mismatch');
    const spec = contract.sprites.mission;
    for (const name of [spec.image, spec.palette]) {
        const source = contract.sources.find((entry: any) => entry.name === name), bytes = Engine.vfs.openFile(name).getBytes();
        const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer))].map(byte => byte.toString(16).padStart(2, '0')).join('');
        if (!source || bytes.length !== source.bytes || hash !== source.sha256) throw new Error('Mission preview source mismatch');
    }
    return decodePreview(spec.image, spec.palette);
}
