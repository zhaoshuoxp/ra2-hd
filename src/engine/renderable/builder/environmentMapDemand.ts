import { ObjectType } from '@/engine/type/ObjectType';

// Placed resources plus native states that ordinary play can create on this map.
export function environmentMapDemand(game: any, theater: any): Set<string> {
    const identities = new Set<string>(game.getWorld().getAllObjects().map((object: any) => object.name));
    for (const tile of game.map.tiles.getAll()) {
        const animation = theater.tileSets.getTile(tile.tileNum)?.getAnimation();
        if (animation?.subTile === tile.subTile) identities.add(animation.name);
    }
    const smudges = game.rules.getIni().getSection('SmudgeTypes');
    for (const value of smudges?.entries.values() ?? []) {
        const name = String(Array.isArray(value) ? value[0] : value);
        if (!game.rules.hasObject(name, ObjectType.Smudge)) continue;
        const rule = game.rules.getObject(name, ObjectType.Smudge);
        if (rule.crater || rule.burn) identities.add(name);
    }
    if (game.gameOpts?.cratesAppear) {
        for (const name of [game.rules.crateRules.crateImg, game.rules.crateRules.waterCrateImg]) {
            if (name && game.rules.hasObject(name, ObjectType.Overlay)) identities.add(name);
        }
    }
    return identities;
}
