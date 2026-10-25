import type { GameEdition } from '@/editions/GameEdition';
import type { VirtualFileSystem } from '@/data/vfs/VirtualFileSystem';
import { MixFile } from '@/data/MixFile';
import { ShpFile } from '@/data/ShpFile';
import { Palette } from '@/data/Palette';
import { ImageUtils } from '@/engine/gfx/ImageUtils';
import { loadingArtwork, loadingUnitArtwork } from './loadingArtwork';

// YR reserves this window for a flag; RA2 already paints its flag into the backdrop.
export const loadingFlagWindow = { x: 500, y: 380, width: 216, height: 164 };

export function createLoadingFlag(country: string, edition: GameEdition, vfs: VirtualFileSystem): string | undefined {
    if (edition !== 'yr') return undefined;
    let source: HTMLCanvasElement;
    let rect: { x: number; y: number; width: number; height: number };
    if (country === 'YuriCountry') {
        const artwork = loadingArtwork.YuriCountry;
        source = ImageUtils.convertShpToCanvas(new ShpFile(vfs.openFile(artwork.image + '.shp')),
            new Palette(vfs.openFile(artwork.palette)));
        // The original large Yuri emblem is sharper than the tiny lobby flag icon.
        rect = { x: 100, y: 250, width: 250, height: 304 };
    } else {
        const unit = loadingUnitArtwork.get(country);
        if (!unit) return undefined;
        // Open the base archive explicitly: normal VFS lookup selects YR's empty flag window.
        const images = new MixFile(vfs.openFile('load.mix').stream);
        const palettes = new MixFile(vfs.openFile('cache.mix').stream);
        source = ImageUtils.convertShpToCanvas(new ShpFile(images.openFile(`ls800${unit}.shp`)),
            new Palette(palettes.openFile('mpls.pal')));
        rect = { x: 487, y: 400, width: 242, height: 121 };
    }
    const canvas = document.createElement('canvas');
    canvas.width = rect.width; canvas.height = rect.height;
    canvas.getContext('2d')!.drawImage(source, rect.x, rect.y, rect.width, rect.height,
        0, 0, rect.width, rect.height);
    return canvas.toDataURL();
}
