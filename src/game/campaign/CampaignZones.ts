import { TerrainType } from '@/engine/type/TerrainType';
import { LandType } from '@/game/type/LandType';
import { SpeedType } from '@/game/type/SpeedType';
import { OccupationBits } from '@/game/rules/TerrainRules';
import type { Tile } from '@/game/map/TileCollection';

export interface CampaignZoneCell {
    rx: number;
    ry: number;
    z: number;
    // Installed RA2 classes: clear, crushable, wall, beach, water,
    // infantry-only terrain, subterranean-only, outside the playable area.
    kind: number;
}

// Action18 uses the source Crusher movement-zone table, not the live infantry
// path graph. Buildings and transient actors do not partition this table.
export function campaignCrusherZones(cells: readonly CampaignZoneCell[]): Map<string, number> {
    const ordered = [...cells].sort((a, b) => a.ry - b.ry || a.rx - b.rx);
    const byKey = new Map(ordered.map(cell => [`${cell.rx},${cell.ry}`, cell]));
    const assigned = new Map<CampaignZoneCell, number>(), parent = [0];
    const at = (x: number, y: number) => byKey.get(`${x},${y}`);
    const root = (id: number): number => {
        while (parent[id] !== id) { parent[id] = parent[parent[id]]; id = parent[id]; }
        return id;
    };
    const connect = (id: number, cell: CampaignZoneCell, neighbor: CampaignZoneCell | undefined) => {
        const other = neighbor && assigned.get(neighbor);
        if (other && Math.abs(cell.z - neighbor!.z) < 2) parent[root(other)] = root(id);
    };
    const flood = (seed: CampaignZoneCell, id: number): number => {
        let left = seed.rx, right = seed.rx, previous = seed;
        // Preserve the source scanline's different left/right height tests.
        // This operates on a detached cell table without touching navigation.
        for (let cell = seed; cell.kind === seed.kind && Math.abs(cell.z - previous.z) < 2;) {
            assigned.set(cell, id); left = cell.rx; previous = cell;
            const next = at(cell.rx - 1, cell.ry);
            if (!next || assigned.has(next)) { if (next) connect(id, cell, next); break; }
            if (next.kind !== seed.kind || Math.abs(next.z - cell.z) >= 2) { connect(id, cell, next); break; }
            cell = next;
        }
        previous = seed;
        for (let cell = seed; cell.kind === seed.kind && Math.abs(cell.z - previous.z) < 4;) {
            assigned.set(cell, id); right = cell.rx; previous = cell;
            const next = at(cell.rx + 1, cell.ry);
            if (!next || assigned.has(next)) { if (next) connect(id, cell, next); break; }
            if (next.kind !== seed.kind || Math.abs(next.z - cell.z) >= 4) { connect(id, cell, next); break; }
            cell = next;
        }
        for (const y of [seed.ry - 1, seed.ry + 1]) {
            for (let x = left - 1; x <= right + 1; x++) {
                const cell = at(x, y), neighbor = at(Math.max(left, Math.min(right, x)), seed.ry);
                if (!cell || !neighbor || Math.abs(cell.z - neighbor.z) >= 2 || cell.kind > 1) continue;
                if (assigned.has(cell)) connect(id, neighbor, cell);
                else if (cell.kind === seed.kind) x = Math.max(x, flood(cell, id));
            }
        }
        return right;
    };
    for (const cell of ordered) {
        if (cell.kind > 1 || assigned.has(cell)) continue;
        const id = parent.length; parent.push(id); flood(cell, id);
    }
    // Non-Crusher cells share the reserved zone1, even when separated.
    return new Map(ordered.map(cell => [`${cell.rx},${cell.ry}`, cell.kind > 1 ? 1 : root(assigned.get(cell)!) + 1]));
}

export function campaignZoneCellKind(game: any, tile: Tile): number {
    const bounds = game.map.mapBounds.getRawLocalSize(), width = game.map.mapBounds.getFullSize().width / 2;
    const sum = tile.rx + tile.ry;
    if (sum <= width + 2 * bounds.y || sum > width + 2 * (bounds.y + bounds.height) + 2
        || tile.rx - tile.ry >= 2 * (bounds.x + bounds.width) - width
        || tile.ry - tile.rx >= width - 2 * bounds.x) return 7;
    const objects = game.map.tileOccupation.getGroundObjectsOnTile(tile).filter((object: any) => !object.isDestroyed);
    const overlay = objects.find((object: any) => object.isOverlay());
    if (overlay?.rules.crushable) return 1;
    if (overlay?.rules.wall) return 2;
    if (tile.landType === LandType.Water) return 4;
    if (tile.landType === LandType.Beach) return 3;
    if (!game.rules.getLandRules(tile.landType).getSpeedModifier(SpeedType.Track)) return 6;
    const terrain = objects.find((object: any) => object.isTerrain());
    if (terrain) return terrain.rules.getOccupationBits(game.map.getTheaterType()) === OccupationBits.All ? 2 : 5;
    return 0;
}

export function revealCampaignZone(game: any, seed: Tile): void {
    const tiles: Tile[] = game.map.tiles.getAll();
    // Bridges/tubes add explicit source zone connections. Allied07 has neither;
    // keep other topologies blocking until their source edges are qualified.
    if (tiles.some(tile => tile.terrainType === TerrainType.Tunnel
        || game.map.tileOccupation.getBridgeOnTile(tile))) {
        throw new Error('Campaign zone reveal with bridge or tube connections requires source qualification');
    }
    const zones = campaignCrusherZones(tiles.map(tile => ({ ...tile, kind: campaignZoneCellKind(game, tile) })));
    const zone = zones.get(`${seed.rx},${seed.ry}`);
    if (zone === undefined) throw new Error('Missing campaign zone waypoint cell');
    const shroud = game.mapShroudTrait.getPlayerShroud(game.localPlayer);
    for (const tile of tiles) if (zones.get(`${tile.rx},${tile.ry}`) === zone) shroud.revealAround(tile, 2);
}
