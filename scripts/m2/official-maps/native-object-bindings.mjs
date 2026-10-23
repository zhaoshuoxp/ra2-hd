// Use the same read-only object observation in HD and Original validation sessions.
export async function installNativeObjectBindings(page) {
    await page.evaluate(() => {
        window.__m23Binding = object => {
            const d = window.__ra2debug, r = d.renderableManager.getRenderableByGameObject(object);
            const sprite = r?.mainObj ?? r?.mainRenderable ?? r?.shpRenderable;
            const builder = sprite?.builder, map = d.mapRenderable;
            const batch = [map.terrainLayer, map.overlayLayer, map.smudgeLayer]
                .map(layer => layer?.getObjectHdBinding?.(object)).find(Boolean);
            return { id: object.id, name: object.name, type: object.type,
                tile: [object.tile.rx, object.tile.ry, object.tile.z],
                spawned: object.isSpawned, destroyed: object.isDestroyed,
                health: object.healthTrait?.health, owner: object.owner?.color,
                member: builder?.image?.filename, hd: batch?.identity ?? builder?.hdOverride?.identity,
                mainMember: r?.mainShpFile?.filename,
                sourceMembers: [...(r?.aggregatedImageData?.imageIndexes?.keys() ?? [])].map(file => file.filename),
                frame: batch?.frame ?? builder?.getFrame(), batchedHd: !!batch,
                occupants: object.garrisonTrait?.units.length,
                paletteType: r?.objectArt?.paletteType, customPaletteName: r?.objectArt?.customPaletteName,
                rubble: r?.rubbleObj && { hd: r.rubbleObj.builder?.hdOverride?.identity,
                    frame: r.rubbleObj.builder?.getFrame(), visible: r.rubbleObj.get3DObject()?.visible } };
        };
    });
}
