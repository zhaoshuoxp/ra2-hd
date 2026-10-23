import * as THREE from 'three';
import { Coords } from '@/game/Coords';
import { rampHeights } from '@/game/theater/rampHeights';
import { OverlayUtils } from '@/engine/gfx/OverlayUtils';
import { pointEquals } from '@/util/geometry';
export class PlacementGrid {
    private target?: THREE.Object3D;
    private tilesObject?: THREE.Object3D;
    private rangeObject?: THREE.Mesh;
    private readonly tileOverlays = new Map<number, THREE.Mesh>();
    private lastRangeCircle?: any;
    constructor(private readonly viewModel: any, private readonly camera: any, private readonly mapTiles: any) { }
    get3DObject(): THREE.Object3D | undefined {
        return this.target;
    }
    create3DObject(): void {
        const object = new THREE.Object3D();
        object.name = 'placement_grid';
        this.target = object;
        this.createTileOverlays();
    }
    update(): void {
        this.refreshRangeCircle();
        if (this.viewModel.visible || !this.tilesObject) {
            const tilesContainer = new THREE.Object3D();
            tilesContainer.visible = true;
            for (const tile of this.viewModel.tiles) {
                const mapTile = this.mapTiles.getByMapCoords(tile.rx, tile.ry);
                if (!mapTile) {
                    throw new Error(`Map tile not found for coords (${tile.rx}, ${tile.ry})`);
                }
                const overlay = this.tileOverlays.get(mapTile.rampType);
                if (!overlay) {
                    throw new Error(`Missing overlay mesh for rampType ${mapTile.rampType}`);
                }
                const mesh = overlay.clone();
                const material = (overlay.material as THREE.MeshBasicMaterial).clone();
                material.color.set(tile.buildable ? (this.viewModel.showBusy ? 0xffff00 : 0x00ff00) : 0xff0000);
                mesh.material = material;
                mesh.position.copy(this.getTilePosition(mapTile));
                tilesContainer.add(mesh);
            }
            const container = this.get3DObject();
            if (!container) {
                throw new Error('Placement grid 3D object was not created');
            }
            this.disposeTilesObject();
            this.tilesObject = tilesContainer;
            container.add(tilesContainer);
        }
        else {
            this.tilesObject.visible = false;
        }
    }
    private refreshRangeCircle(): void {
        if (!(this.viewModel.visible || !this.rangeObject)) {
            if (this.rangeObject) {
                this.rangeObject.visible = false;
            }
            return;
        }
        if (this.rangeObject) {
            this.rangeObject.visible = true;
        }
        const container = this.get3DObject();
        if (!container) {
            throw new Error('Placement grid 3D object was not created');
        }
        const rangeIndicator = this.viewModel.rangeIndicator;
        if (!rangeIndicator) {
            this.disposeRangeObject(container);
            this.lastRangeCircle = undefined;
            return;
        }
        let rebuilt = false;
        if (!this.lastRangeCircle || rangeIndicator.radius !== this.lastRangeCircle.radius || rangeIndicator.concentric !== this.lastRangeCircle.concentric || this.rangeObject?.userData.color !== this.viewModel.rangeIndicatorColor) {
            const rangeObject = (rangeIndicator.concentric ? OverlayUtils.createGroundTarget : OverlayUtils.createGroundCircle)
                .call(OverlayUtils, rangeIndicator.radius * Coords.getWorldTileSize(), this.viewModel.rangeIndicatorColor);
            this.disposeRangeObject(container);
            container.add(rangeObject);
            rebuilt = true;
            this.rangeObject = rangeObject;
            rangeObject.userData.color = this.viewModel.rangeIndicatorColor;
        }
        if (rebuilt || !this.lastRangeCircle || !pointEquals(rangeIndicator.center, this.lastRangeCircle.center)) {
            const tileX = Math.floor(rangeIndicator.center.x);
            const tileY = Math.floor(rangeIndicator.center.y);
            const mapTile = this.mapTiles.getByMapCoords(tileX, tileY);
            if (!mapTile) {
                console.warn(`[PlacementGrid] Map tile not found for coords (${tileX}, ${tileY})`);
                return;
            }
            const position = this.getTilePosition(mapTile);
            position.x += (rangeIndicator.center.x % 1) * Coords.getWorldTileSize();
            position.z += (rangeIndicator.center.y % 1) * Coords.getWorldTileSize();
            this.rangeObject?.position.copy(position);
        }
        this.lastRangeCircle = { ...rangeIndicator, center: { ...rangeIndicator.center } };
    }
    private createTileOverlays(): void {
        for (let rampType = 0; rampType < rampHeights.length; rampType++) {
            this.tileOverlays.set(rampType, this.createTileOverlay(rampType));
        }
    }
    private createTileOverlay(rampType: number): THREE.Mesh {
        // Adjacent cells share exact geometric edges. Raster tile borders caused
        // black grid lines and repeated alpha coverage at higher output densities.
        const geometry = placementTileGeometry(rampType);
        const material = new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: this.viewModel.tileOpacity ?? 0.7,
            side: THREE.DoubleSide,
            depthTest: false,
            depthWrite: false,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.renderOrder = 1000000;
        mesh.frustumCulled = false;
        return mesh;
    }
    private getTilePosition(tile: any): any {
        return Coords.tile3dToWorld(tile.rx, tile.ry, tile.z);
    }
    private disposeTilesObject(): void {
        const container = this.get3DObject();
        if (this.tilesObject && container) {
            container.remove(this.tilesObject);
            this.tilesObject.traverse((object: THREE.Object3D) => {
                const mesh = object as THREE.Mesh;
                if (mesh.material && 'dispose' in mesh.material) {
                    (mesh.material as THREE.Material).dispose();
                }
            });
        }
        this.tilesObject = undefined;
    }
    private disposeRangeObject(container: THREE.Object3D): void {
        if (!this.rangeObject) {
            return;
        }
        container.remove(this.rangeObject);
        this.rangeObject.geometry.dispose();
        (this.rangeObject.material as THREE.Material).dispose();
        this.rangeObject = undefined;
    }
    dispose(): void {
        this.disposeTilesObject();
        if (this.target) {
            this.disposeRangeObject(this.target);
        }
        this.tileOverlays.forEach((overlay) => {
            overlay.geometry.dispose();
            (overlay.material as THREE.Material).dispose();
        });
        this.tileOverlays.clear();
        this.lastRangeCircle = undefined;
    }
}

export function placementTileGeometry(rampType: number): THREE.BufferGeometry {
    const heights = rampHeights[rampType];
    if (!heights) throw new Error(`Unsupported placement ramp ${rampType}`);
    const corners = [[0, 1], [0, 0], [1, 0], [1, 1]];
    const vertices = corners.flatMap(([x, z], i) => [
        x * Coords.getWorldTileSize(), Coords.tileHeightToWorld(heights[i]), z * Coords.getWorldTileSize(),
    ]);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex([0, 2, 1, 0, 3, 2]);
    return geometry;
}
