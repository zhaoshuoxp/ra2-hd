import { test, expect } from 'bun:test';
import { placementTileGeometry } from '../../src/gui/screen/game/worldInteraction/placementMode/PlacementGrid';
import { rampHeights } from '../../src/game/theater/rampHeights';
import { Coords } from '../../src/game/Coords';

test('placement footprint uses native tile corners and ramp heights with no textured grid', () => {
    for (let ramp = 0; ramp < rampHeights.length; ramp++) {
        const geometry = placementTileGeometry(ramp), points = geometry.getAttribute('position');
        expect(points.count).toBe(4);
        expect(geometry.getAttribute('uv')).toBeUndefined();
        expect(geometry.index!.count).toBe(6);
        for (let i = 0; i < 4; i++) expect(points.getY(i)).toBeCloseTo(Coords.tileHeightToWorld(rampHeights[ramp][i]), 4);
        // Two adjacent flat cells meet exactly; no dark stroke or overdraw strip.
        if (ramp === 0) {
            expect(points.getX(2)).toBe(points.getX(1) + Coords.getWorldTileSize());
            expect(points.getZ(2)).toBe(points.getZ(1));
            expect(points.getX(3)).toBe(points.getX(0) + Coords.getWorldTileSize());
            expect(points.getZ(3)).toBe(points.getZ(0));
        }
        geometry.dispose();
    }
});
