// Controlled lunar renderer probe. The ordinary map runs exercise the actual
// game loader; this probe borrows their live VFS, decoded image cache and GL.
import { Engine } from '../../../src/engine/Engine';
import { loadPowerPlantHd } from '../../../src/engine/renderable/builder/loadPowerPlantHd';
import { disposePowerPlantHd, type BuildingHdFamily } from '../../../src/engine/renderable/builder/resolvePowerPlantHd';

(window as any).__coverageProbe = async (ids: BuildingHdFamily[], remainingBudget: number) => {
    const d = (window as any).__ra2debug;
    const unit = d.localPlayer.getOwnedObjects().find((u: any) => u.isUnit());
    const finder = d.renderableManager.getRenderableByGameObject(unit).pipOverlay.imageFinder;
    Engine.images = finder.images;
    Engine.vfs = finder.images.vfs;
    const theater = { type: 8, settings: { ...finder.theater.settings, newTheaterChar: 'L', extension: '.lun' } };
    const results = [];
    for (const id of ids) {
        const loaded = await loadPowerPlantHd(theater, d.renderer, true, id, remainingBudget);
        const sources = [...(loaded?.overrides.keys() ?? [])].map((im: any) => ({ member: im.filename, canvas: [im.width, im.height] }));
        results.push({ id, report: loaded?.report, sources });
        disposePowerPlantHd(loaded);
    }
    return { boundary: 'Controlled lunar VFS/ImageFinder/GL load and disposal; no retail lunar skirmish map exists',
        results, glError: d.renderer.renderer.getContext().getError() };
};
