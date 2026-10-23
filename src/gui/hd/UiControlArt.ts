import { uiArt, type UiCameoSource } from './UiArt';
import { SideType } from '@/game/SideType';
import type { ShpFile } from '@/data/ShpFile';
type UiImages = { get(name: string): ShpFile | undefined };
export const HD_CONTROL_NAMES = [
    'tab00', 'tab01', 'tab02', 'tab03', 'diplobtn', 'optbtn', 'repair', 'sell', 'r-up', 'r-dn', 'sidebttn',
    'credits', 'top', 'side1', 'side2', 'side2b', 'side3', 'addon', 'lendcap', 'bttnbkgd', 'rendcap',
    'button00', 'button01', 'button02', 'button03', 'button04', 'button06', 'button07', 'button08', 'button09', 'button10',
];
export function registerHudControlArt(images: UiImages, side: SideType) {
    const faction = side === SideType.GDI ? 'allied' : side === SideType.Nod ? 'soviet' : side === SideType.ThirdSide ? 'yuri' : undefined;
    if (!faction) return;
    registerUiSkin(images, faction);
}
// An explicit UI-only entry point also supports dormant Yuri artwork previews.
// No gameplay side or country is registered by this function.
export function registerUiSkin(images: UiImages, faction: 'allied' | 'soviet' | 'yuri') {
    for (const name of HD_CONTROL_NAMES) {
        const file = images.get(name + '.shp');
        if (!file) continue;
        uiArt.frames.set(file, Array.from({ length: file.numImages }, (_, frame) => ({
            id: faction + '-' + name, width: file.width, height: file.height,
            atlas: { width: file.width * file.numImages, height: file.height, x: frame * file.width, y: 0 },
        })));
    }
    const radar = images.get('radar.shp');
    if (radar) uiArt.frames.set(radar, Array.from({ length: radar.numImages }, () => ({
        id: faction + '-radar-base', width: radar.width, height: radar.height, transitionBase: 0,
    })));
    const clock = images.get('gclock2.shp');
    if (clock) uiArt.frames.set(clock, Array.from({ length: clock.numImages }, (_, frame) => ({
        id: `${faction}-gclock2-${frame}`, sequence: `${faction}-gclock2`, width: clock.width, height: clock.height,
    })));
}
export function registerMainMenuArt(images: { get(name: string): ShpFile | undefined }) {
    const file = images.get('sdbtnanm.shp');
    if (!file || file.numImages !== 17) return;
    uiArt.frames.set(file, Array.from({ length: 17 }, (_, frame) => ({
        id: 'menu-button-states', width: file.width, height: file.height,
        atlas: { width: file.width * 4, height: file.height * 5, x: (frame % 4) * file.width, y: Math.floor(frame / 4) * file.height },
    })));
}
export function registerAggregateControlArt(file: ShpFile, indexes: Map<ShpFile, number>) {
    const frames: UiCameoSource[] = [];
    for (const [source, start] of indexes) {
        const entries = uiArt.frames.get(source);
        if (entries) entries.forEach((entry, frame) => { frames[start + frame] = entry; });
    }
    if (frames.length) uiArt.frames.set(file, frames);
}
