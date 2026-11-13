import { expect, test } from 'bun:test';
import { ConstructionWorker } from '../../src/game/ConstructionWorker';
import { MapBounds } from '../../src/game/map/MapBounds';

test('YR32 checks the complete player construction footprint while retaining physical source and AI space', () => {
    const bounds = new MapBounds(true).fromMapFile({ fullSize: { width: 100, height: 100 },
        localSize: { x: 2, y: 2, width: 50, height: 50 } }, { getCutoffTileHeight: () => 0 });
    const tile = (x: number, y: number) => ({ rx: x, ry: y, dx: x, dy: y, z: 0, rampType: 0, landType: 0 });
    const edge = Array.from({ length: 190 }, (_, x) => x).filter(x => bounds.isWithinPlayerBounds(tile(x, 50))).at(-1)!;
    const local = {}, ai = {}, rule = { constructionYard: false, adjacent: 2, waterBound: false };
    const worker: any = Object.create(ConstructionWorker.prototype);
    Object.assign(worker, { player: local, rules: { getBuilding: () => rule, getLandRules: () => ({ buildable: true }) },
        art: { getObject: () => ({ foundation: { width: 2, height: 2 } }) },
        game: { localPlayer: local, gameOpts: { campaign: { edition: 'yr', semanticsVersion: 32 } },
            mapShroudTrait: { getPlayerShroud: () => ({ isShrouded: () => false }) } },
        map: { mapBounds: bounds, isWithinBounds: (cell: any) => bounds.isWithinBounds(cell),
            tiles: { getByMapCoords: tile }, getGroundObjectsOnTile: () => [] } });
    const options = { normalizedTile: true, ignoreAdjacent: true };
    expect(bounds.isWithinBounds(tile(edge + 1, 50))).toBe(true);
    expect(bounds.isWithinPlayerBounds(tile(edge, 50))).toBe(true);
    expect(worker.canPlaceAt('FACTORY', tile(edge, 50), options)).toBe(false);
    expect(worker.canPlaceAt('FACTORY', tile(edge - 1, 50), options)).toBe(true);
    expect(worker.getPlacementPreview('FACTORY', tile(edge, 50), options).filter((cell: any) => cell.buildable)).toHaveLength(2);
    expect(worker.canPlaceAt('FACTORY', tile(edge, 50), { ...options, ignoreShroud: true })).toBe(true);
    worker.player = ai;
    expect(worker.canPlaceAt('FACTORY', tile(edge, 50), options)).toBe(true);
    worker.player = local; worker.game.gameOpts.campaign.semanticsVersion = 31;
    expect(worker.canPlaceAt('FACTORY', tile(edge, 50), options)).toBe(true);
    worker.game.gameOpts.campaign.edition = 'ra2'; worker.game.gameOpts.campaign.semanticsVersion = 32;
    expect(worker.canPlaceAt('FACTORY', tile(edge, 50), options)).toBe(true);
});
